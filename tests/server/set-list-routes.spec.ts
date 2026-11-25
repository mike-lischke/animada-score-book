/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Readable } from "node:stream";
import { type IncomingMessage, type ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import { Auth, EntityType } from "../../src/server/Auth.js";
import { AdminRoutes } from "../../src/server/AdminRoutes.js";
import { RequestContext } from "../../src/server/RequestContext.js";
import type { IServerConfig } from "../../src/server/config.js";
import { DatabaseEngine } from "../../src/server/database.js";
import { SetListRoutes } from "../../src/server/SetListRoutes.js";
import { TagActions } from "../../src/server/TagActions.js";
import {
    FakeSetListDatabase, adminUserId, foreignGroupId, foreignUserId, foreignTagId, memberGroupId, memberTagId,
    memberUserId, otherGroupId, otherScoreId, ownerUserId, scoreId, unknownTagId, worldGroupId,
} from "./set-list-fake-database.js";

const config: IServerConfig = {
    host: "127.0.0.1",
    port: 3100,
    database: { engine: DatabaseEngine.MySQL, host: "", port: 0, database: "", user: "", password: "" },
    soundLibPath: "",
    registration: { enabled: false },
    mail: { host: "", port: 587, secure: false, user: "", password: "", from: "" },
};

interface ICapturedResponse {
    status: number;
    body: unknown;
}

interface IRoutes {
    database: FakeSetListDatabase;
    routes: SetListRoutes;
    tags: TagActions;
    admin: AdminRoutes;
}

/**
 * @param body The request body.
 * @param userId The caller, or undefined for a visitor.
 *
 * @returns A request that carries the caller's token.
 */
const createRequest = (body: unknown, userId?: number): IncomingMessage => {
    const headers: Record<string, string> = { host: "localhost" };
    if (userId !== undefined) {
        const token = Auth.createAccessToken({
            userId, email: `user${userId}@example.com`, isAdmin: false,
        });
        headers.authorization = `Bearer ${token}`;
    }

    return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
        url: "/api?action=x",
        method: "POST",
        headers,
    }) as unknown as IncomingMessage;
};

/**
 * @param url The full request URL, including its query.
 * @param userId The caller, or undefined for a visitor.
 *
 * @returns A request without a body that carries the caller's token.
 */
const createGetRequest = (url: string, userId?: number): IncomingMessage => {
    const headers: Record<string, string> = { host: "localhost" };
    if (userId !== undefined) {
        const token = Auth.createAccessToken({
            userId, email: `user${userId}@example.com`, isAdmin: false,
        });
        headers.authorization = `Bearer ${token}`;
    }

    return Object.assign(Readable.from([]), {
        url,
        method: "GET",
        headers,
    }) as unknown as IncomingMessage;
};

const createResponse = (): { res: ServerResponse; captured: ICapturedResponse; } => {
    const captured: ICapturedResponse = { status: 200, body: undefined };

    const res = {
        writeHead: (status: number) => {
            captured.status = status;

            return res;
        },
        end: (payload?: string) => {
            captured.body = payload === undefined ? undefined : JSON.parse(payload) as unknown;
        },
    } as unknown as ServerResponse;

    return { res, captured };
};

const setup = (): IRoutes => {
    const database = new FakeSetListDatabase();
    database.seedGrants(EntityType.Score, scoreId, null, [memberGroupId]);
    database.seedGrants(EntityType.Score, otherScoreId, null, [memberGroupId]);

    const context = new RequestContext(new Auth(database), config);

    return {
        database,
        routes: new SetListRoutes(context),
        tags: new TagActions(context),
        admin: new AdminRoutes(context),
    };
};

/** The permissions a seeded list carries: its owner and the group grants. */
interface IListAccessFixture {
    ownerId?: number | null;
    groups?: Array<number | { groupId: number; writable: boolean; }>;
}

/**
 * @param database The fake the test works with.
 * @param name The name of the list and its tag.
 * @param groupId The tag's owner scope; undefined for the administrators.
 * @param memberScoreIds The scores that carry the tag.
 * @param access The list's permissions.
 *
 * @returns The ids of the list and its tag.
 */
const seedList = (database: FakeSetListDatabase, name: string, groupId: number | undefined,
    memberScoreIds: number[] = [], access: IListAccessFixture = {}): { id: number; tagId: number; } => {
    const seeded = database.seedSetList(name, groupId);

    memberScoreIds.forEach((score, index) => {
        database.scoreTags.push({ scoreId: score, tagId: seeded.tagId });
        database.setListScores.push({ setListId: seeded.id, scoreId: score, position: index + 1 });
    });

    database.seedGrants(EntityType.SetList, seeded.id,
        access.ownerId === undefined ? ownerUserId : access.ownerId, access.groups ?? []);

    return seeded;
};

/**
 * @param database The fake the test works with.
 * @param listId The list whose order is read.
 *
 * @returns The stored score ids of the list, in their stored order.
 */
const storedOrder = (database: FakeSetListDatabase, listId: number): number[] => {
    return database.setListScores.filter((entry) => {
        return entry.setListId === listId;
    }).sort((left, right) => {
        return left.position - right.position;
    }).map((entry) => {
        return entry.scoreId;
    });
};

describe("set list routes — creating", () => {
    it("lets an administrator create a list in the global scope with its tag", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Auftritt" }, adminUserId), res);

        expect(captured.status).toBe(200);
        const tag = database.tags.find((entry) => {
            return entry.name === "Auftritt";
        });
        expect(tag?.groupId).toBeNull();
        const list = database.setLists.find((entry) => {
            return entry.tagId === tag?.id;
        });
        expect(list).toBeDefined();

        // The creator owns the list, exactly as a new score belongs to the one who created it.
        expect(database.owners.get(`setlist:${list?.id}`)).toBe(adminUserId);
    });

    it("lets a group administrator create a list for the group they administer", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Bateria Set", groupId: memberGroupId }, ownerUserId),
            res);

        expect(captured.status).toBe(200);
        expect(database.tags.find((entry) => {
            return entry.name === "Bateria Set";
        })?.groupId).toBe(memberGroupId);
    });

    it("refuses a group a group administrator does not administer", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Fremd Set", groupId: otherGroupId }, ownerUserId), res);

        expect(captured.status).toBe(403);
    });

    it("refuses a member who administers no group", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Meins", groupId: memberGroupId }, memberUserId), res);

        expect(captured.status).toBe(403);
    });

    it("refuses a request without a session", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Anonym" }), res);

        expect(captured.status).toBe(403);
    });

    it("refuses a name an existing tag of the same owner already uses", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Bateria Internal", groupId: memberGroupId },
            ownerUserId), res);

        expect(captured.status).toBe(409);
    });

    it("allows a name another owner scope already uses", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Groovy", groupId: memberGroupId }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.tags.filter((entry) => {
            return entry.name === "Groovy";
        })).toHaveLength(2);
    });
});

describe("set list routes — listing", () => {
    it("shows a granted group's members the list and their readable member count", async () => {
        const { database, routes } = setup();
        seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId], { groups: [memberGroupId] });
        database.seedGrants(EntityType.Score, otherScoreId, foreignUserId);
        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}, memberUserId), res);

        expect(captured.status).toBe(200);
        const body = captured.body as { setLists: Array<{ name: string; memberCount: number; editable: boolean; }>; };
        expect(body.setLists).toHaveLength(1);
        expect(body.setLists[0]).toMatchObject({ name: "Auftritt", memberCount: 1, editable: false });
    });

    it("shows a list granted to the caller's group, read-only", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId], { groups: [foreignGroupId] });
        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}, foreignUserId), res);

        const body = captured.body as { setLists: Array<{ id: number; editable: boolean; }>; };
        expect(body.setLists.map((list) => {
            return list.id;
        })).toEqual([seeded.id]);
        expect(body.setLists[0].editable).toBe(false);
    });

    it("hides the list from a group it is not shared with", async () => {
        const { database, routes } = setup();
        seedList(database, "Auftritt", memberGroupId, [scoreId]);
        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}, foreignUserId), res);

        expect((captured.body as { setLists: unknown[]; }).setLists).toEqual([]);
    });

    it("shows nothing to a visitor, not even a list granted to a group", async () => {
        const { database, routes } = setup();
        seedList(database, "Auftritt", memberGroupId, [scoreId], { groups: [foreignGroupId] });
        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}), res);

        expect((captured.body as { setLists: unknown[]; }).setLists).toEqual([]);
    });

    it("shows every list to an administrator and marks the editable ones", async () => {
        const { database, routes } = setup();
        seedList(database, "Admin Set", undefined);
        seedList(database, "Gruppen Set", memberGroupId);
        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}, adminUserId), res);

        const body = captured.body as { setLists: Array<{ editable: boolean; }>; };
        expect(body.setLists).toHaveLength(2);
        expect(body.setLists.every((list) => {
            return list.editable;
        })).toBe(true);
    });
});

describe("set list routes — reading", () => {
    it("returns the members in the saved order, with their tags and access", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [otherScoreId, scoreId],
            { groups: [memberGroupId] });
        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({ id: seeded.id }, memberUserId), res);

        expect(captured.status).toBe(200);
        const body = captured.body as {
            name: string; memberCount: number; scores: Array<{ id: number; tagIds: number[]; }>;
        };
        expect(body.name).toBe("Auftritt");
        expect(body.memberCount).toBe(2);
        expect(body.scores.map((entry) => {
            return entry.id;
        })).toEqual([otherScoreId, scoreId]);
        expect(body.scores[1].tagIds).toContain(seeded.tagId);
    });

    it("returns the intersection with the manual filter and keeps the unfiltered count", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [otherScoreId, scoreId],
            { groups: [memberGroupId] });
        database.scoreTags.push({ scoreId, tagId: memberTagId });
        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({ id: seeded.id, groups: [[memberTagId]] }, memberUserId), res);

        const body = captured.body as { memberCount: number; scores: Array<{ id: number; }>; };
        expect(body.scores.map((entry) => {
            return entry.id;
        })).toEqual([scoreId]);
        expect(body.memberCount).toBe(2);
    });

    it("leaves out a member the caller cannot read", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [otherScoreId, scoreId],
            { groups: [memberGroupId] });
        database.seedGrants(EntityType.Score, otherScoreId, foreignUserId);
        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({ id: seeded.id }, memberUserId), res);

        const body = captured.body as { scores: Array<{ id: number; }>; };
        expect(body.scores.map((entry) => {
            return entry.id;
        })).toEqual([scoreId]);
    });

    it("answers a list the caller cannot select as not found", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId]);
        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({ id: seeded.id }, foreignUserId), res);

        expect(captured.status).toBe(404);
    });

    it("rejects a manual filter that names a tag no longer known", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId], { groups: [memberGroupId] });
        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({ id: seeded.id, groups: [[unknownTagId]] }, memberUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { filterProblem: string; }).filterProblem).toBe("unavailable-tag");
    });

    it("rejects a manual filter that names a tag the caller cannot use", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId], { groups: [memberGroupId] });
        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({ id: seeded.id, groups: [[foreignTagId]] }, memberUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { filterProblem: string; }).filterProblem).toBe("not-usable");
    });
});

describe("set list routes — renaming", () => {
    it("renames the tag with the list and bumps the revision", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(createRequest({ id: seeded.id, revision: 1, name: "Konzert" },
            ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.tags.find((entry) => {
            return entry.id === seeded.tagId;
        })?.name).toBe("Konzert");
        expect(database.setLists[0].revision).toBe(2);
    });

    it("refuses a rename by a member", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(createRequest({ id: seeded.id, revision: 1, name: "Konzert" },
            memberUserId), res);

        expect(captured.status).toBe(403);
    });

    it("refuses an edit that builds on an outdated revision", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        database.setLists[0].revision = 3;
        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(createRequest({ id: seeded.id, revision: 1, name: "Konzert" },
            ownerUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { conflict: boolean; }).conflict).toBe(true);
    });

    it("refuses a name the owner scope already holds", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(createRequest({
            id: seeded.id, revision: 1, name: "Bateria Internal",
        }, ownerUserId), res);

        expect(captured.status).toBe(409);
    });
});

describe("set list routes — deleting", () => {
    it("removes the tag, its assignments, the list, its order and its access rows", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId], { groups: [foreignGroupId] });
        const { res, captured } = createResponse();

        await routes.handleDeleteSetList(createRequest({ id: seeded.id }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.tags.some((entry) => {
            return entry.id === seeded.tagId;
        })).toBe(false);
        expect(database.setLists).toHaveLength(0);
        expect(database.scoreTags.some((entry) => {
            return entry.tagId === seeded.tagId;
        })).toBe(false);
        expect(database.setListScores).toHaveLength(0);
        expect(database.grants.get(`setlist:${seeded.id}`)).toBeUndefined();
    });

    it("refuses a delete by a member", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await routes.handleDeleteSetList(createRequest({ id: seeded.id }, memberUserId), res);

        expect(captured.status).toBe(403);
        expect(database.setLists).toHaveLength(1);
    });
});

describe("set list routes — membership through the tag", () => {
    it("appends a newly tagged score and bumps the revision", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId]);
        const { res, captured } = createResponse();

        await tags.handleAssignTag(createRequest({ scoreId: otherScoreId, tagId: seeded.tagId }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(storedOrder(database, seeded.id)).toEqual([scoreId, otherScoreId]);
        expect(database.setLists[0].revision).toBe(2);
    });

    it("keeps the position when the tag is assigned twice", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        const { res, captured } = createResponse();

        await tags.handleAssignTag(createRequest({ scoreId, tagId: seeded.tagId }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(storedOrder(database, seeded.id)).toEqual([scoreId, otherScoreId]);
        expect(database.setLists[0].revision).toBe(1);
    });

    it("drops the position when the tag comes off", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        const { res, captured } = createResponse();

        await tags.handleUnassignTag(createRequest({ scoreId, tagId: seeded.tagId }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(storedOrder(database, seeded.id)).toEqual([otherScoreId]);
        expect(database.scoreTags.some((entry) => {
            return entry.scoreId === scoreId && entry.tagId === seeded.tagId;
        })).toBe(false);
    });

    it("appends a score again after it lost the tag", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        await tags.handleUnassignTag(createRequest({ scoreId, tagId: seeded.tagId }, ownerUserId),
            createResponse().res);
        const { res, captured } = createResponse();

        await tags.handleAssignTag(createRequest({ scoreId, tagId: seeded.tagId }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(storedOrder(database, seeded.id)).toEqual([otherScoreId, scoreId]);
    });

    it("refuses an assignment by a member who may only select the list", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId]);
        const { res, captured } = createResponse();

        await tags.handleAssignTag(createRequest({ scoreId: otherScoreId, tagId: seeded.tagId }, memberUserId), res);

        expect(captured.status).toBe(403);
        expect(storedOrder(database, seeded.id)).toEqual([scoreId]);
    });

    it("deletes the list when its tag is deleted", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId]);
        const { res, captured } = createResponse();

        await tags.handleDeleteTag(createRequest({ id: seeded.tagId }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.setLists).toHaveLength(0);
        expect(database.scoreTags.some((entry) => {
            return entry.tagId === seeded.tagId;
        })).toBe(false);
    });

    it("renames the list when its tag is renamed", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId]);
        const { res, captured } = createResponse();

        await tags.handleUpdateTag(createRequest({ id: seeded.tagId, name: "Konzert" }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.setLists[0].revision).toBe(2);
        expect(database.tags.find((entry) => {
            return entry.id === seeded.tagId;
        })?.name).toBe("Konzert");
    });

    it("marks the tag as a set-list tag in the tag catalogue", async () => {
        const { database, tags } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await tags.handleListTags(createRequest({}, memberUserId), res);

        const body = captured.body as { tags: Array<{ id: number; setListId?: number; }>; };
        expect(body.tags.find((tag) => {
            return tag.id === seeded.tagId;
        })?.setListId).toBe(seeded.id);
        expect(database.tags).toBeDefined();
    });
});

describe("set list routes — ordering", () => {
    it("stores the order the caller submits and bumps the revision", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        const { res, captured } = createResponse();

        await routes.handleReorderSetList(createRequest({
            id: seeded.id, revision: 1, order: [otherScoreId, scoreId],
        }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(storedOrder(database, seeded.id)).toEqual([otherScoreId, scoreId]);
        expect(database.setLists[0].revision).toBe(2);
    });

    it("keeps the place of a member the caller cannot read", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        database.seedGrants(EntityType.Score, otherScoreId, foreignUserId);
        const { res, captured } = createResponse();

        await routes.handleReorderSetList(createRequest({ id: seeded.id, revision: 1, order: [scoreId] },
            ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(storedOrder(database, seeded.id)).toEqual([scoreId, otherScoreId]);
    });

    it("refuses an order that leaves out a visible member", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        const { res, captured } = createResponse();

        await routes.handleReorderSetList(createRequest({ id: seeded.id, revision: 1, order: [scoreId] },
            ownerUserId), res);

        expect(captured.status).toBe(409);
        expect(storedOrder(database, seeded.id)).toEqual([scoreId, otherScoreId]);
    });

    it("refuses an order by a member who may only select the list", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        const { res, captured } = createResponse();

        await routes.handleReorderSetList(createRequest({
            id: seeded.id, revision: 1, order: [otherScoreId, scoreId],
        }, memberUserId), res);

        expect(captured.status).toBe(403);
    });

    it("refuses an order that builds on an outdated revision", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId, otherScoreId]);
        database.setLists[0].revision = 4;
        const { res, captured } = createResponse();

        await routes.handleReorderSetList(createRequest({
            id: seeded.id, revision: 1, order: [otherScoreId, scoreId],
        }, ownerUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { conflict: boolean; }).conflict).toBe(true);
    });
});

describe("set list sharing", () => {
    it("grants a group write access and bumps the revision", async () => {
        const { database, admin } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: "setlist",
            entityId: seeded.id,
            revision: 1,
            addGroups: [{ groupId: foreignGroupId, writable: true }],
        }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.grants.get(`setlist:${seeded.id}`)?.get(foreignGroupId)).toBe(true);
        expect(database.setLists[0].revision).toBe(2);
    });

    it("never shares with the World group", async () => {
        const { database, admin } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: "setlist",
            entityId: seeded.id,
            revision: 1,
            addGroups: [{ groupId: worldGroupId, writable: false }],
        }, ownerUserId), res);

        expect(captured.status).toBe(400);
        expect(database.grants.get(`setlist:${seeded.id}`)?.size).toBe(0);
        expect(database.setLists[0].revision).toBe(1);
    });

    it("refuses a share change by a member of the owning group", async () => {
        const { database, admin } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: "setlist",
            entityId: seeded.id,
            addGroups: [{ groupId: foreignGroupId, writable: false }],
        }, memberUserId), res);

        expect(captured.status).toBe(403);
    });

    it("refuses a stale share change", async () => {
        const { database, admin } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId);
        database.setLists[0].revision = 5;
        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: "setlist",
            entityId: seeded.id,
            revision: 1,
            addGroups: [{ groupId: foreignGroupId, writable: false }],
        }, ownerUserId), res);

        expect(captured.status).toBe(409);
    });

    it("reports the group grants to somebody who may edit the list", async () => {
        const { database, admin } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [],
            { groups: [{ groupId: foreignGroupId, writable: false }] });
        const { res, captured } = createResponse();

        await admin.handleGetPermissions(createGetRequest(
            `/api?action=getPermissions&entityType=setlist&entityId=${seeded.id}`, ownerUserId), res);

        const body = captured.body as { permission: { groups: Array<{ groupId: number; writable: boolean; }>; }; };
        expect(body.permission.groups).toEqual([{ groupId: foreignGroupId, writable: false }]);
    });

    it("lets a group with read access select the list but not change it", async () => {
        const { database, routes } = setup();
        const seeded = seedList(database, "Auftritt", memberGroupId, [scoreId], { groups: [foreignGroupId] });
        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({ id: seeded.id }, foreignUserId), res);

        expect(captured.status).toBe(200);
        expect((captured.body as { editable: boolean; }).editable).toBe(false);
    });
});
