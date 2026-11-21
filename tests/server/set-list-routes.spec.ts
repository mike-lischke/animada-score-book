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
import {
    FakeSetListDatabase, foreignGroupId, foreignUserId, globalTagId, memberGroupId, memberTagId, ownerUserId,
    scoreId, unknownTagId, worldGroupId,
} from "./set-list-fake-database.js";

const memberUserId = 8;
const otherScoreId = 9;

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

const createRequest = (body: unknown, userId?: number, url = "/api?action=x"): IncomingMessage => {
    const token = userId === undefined
        ? undefined
        : Auth.createAccessToken({ userId, email: `user${userId}@example.com`, isAdmin: false });

    const headers: Record<string, string> = { host: "localhost" };
    if (token !== undefined) {
        headers.authorization = `Bearer ${token}`;
    }

    return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
        url,
        method: "POST",
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

const setup = (): { database: FakeSetListDatabase; routes: SetListRoutes; admin: AdminRoutes; } => {
    const database = new FakeSetListDatabase();
    database.userGroups.push({ userId: memberUserId, groupId: memberGroupId });
    database.seedGrants(EntityType.Score, scoreId, ownerUserId);
    database.seedGrants(EntityType.Score, otherScoreId, ownerUserId);

    const context = new RequestContext(new Auth(database), config);

    return { database, routes: new SetListRoutes(context), admin: new AdminRoutes(context) };
};

/**
 * @param database The fake the test works with.
 * @param filters The combination the list holds, as JSON.
 * @param grants The groups the list is shared with.
 * @param owner The owner of the list.
 *
 * @returns The id of the stored list.
 */
const seedList = (database: FakeSetListDatabase, filters: number[][],
    grants: Array<number | { groupId: number; writable: boolean; }> = [], owner = ownerUserId): number => {
    const id = 500 + database.setLists.length;

    database.setLists.push({ id, name: "Samba", filters: JSON.stringify(filters), revision: 1 });
    database.seedGrants(EntityType.SetList, id, owner, grants);

    return id;
};

describe("set list routes — creating", () => {
    it("creates a private list that belongs to the caller", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Samba", groups: [[globalTagId]] }, ownerUserId), res);

        const body = captured.body as { success: boolean; id: number; revision: number; };

        expect(captured.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.revision).toBe(1);
        expect(database.setLists[0].filters).toBe(JSON.stringify([[globalTagId]]));
        expect(database.owners.get(`${EntityType.SetList}:${body.id}`)).toBe(ownerUserId);
        expect(database.grants.has(`${EntityType.SetList}:${body.id}`)).toBe(false);
    });

    it("keeps the owner's own group tag usable in a private list", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Samba", groups: [[memberTagId]] }, ownerUserId), res);

        expect(captured.status).toBe(200);
    });

    it("refuses a combination that names a tag no longer known", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Samba", groups: [[unknownTagId]] }, ownerUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { filterProblem: string; }).filterProblem).toBe("unavailable-tag");
    });

    it("refuses a group tag the owner cannot use", async () => {
        const { database, routes } = setup();
        database.tags.push({ id: 50, name: "Fremd", colorIndex: 3, groupId: foreignGroupId, systemKey: null });

        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Samba", groups: [[50]] }, ownerUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { filterProblem: string; }).filterProblem).toBe("tag-scope");
    });

    it("refuses a combination that is not one", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Samba", groups: ["Caixa"] }, ownerUserId), res);

        expect(captured.status).toBe(400);
    });

    it("refuses an empty name", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "  ", groups: [] }, ownerUserId), res);

        expect(captured.status).toBe(400);
    });

    it("answers 403 without a session", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateSetList(createRequest({ name: "Samba", groups: [] }), res);

        expect(captured.status).toBe(403);
    });
});

describe("set list routes — listing and reading", () => {
    it("lists the caller's own list and the one shared with their group, but no other", async () => {
        const { database, routes } = setup();
        const own = seedList(database, [[globalTagId]]);
        const shared = seedList(database, [[globalTagId]], [memberGroupId]);
        seedList(database, [[globalTagId]], [foreignGroupId], foreignUserId);

        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}, ownerUserId, "/api?action=listSetLists"), res);

        const ids = (captured.body as { setLists: Array<{ id: number; }>; }).setLists.map((entry) => {
            return entry.id;
        });

        expect(captured.status).toBe(200);
        expect(ids).toEqual([own, shared]);
    });

    it("shows a World list to a visitor", async () => {
        const { database, routes } = setup();
        const isWorld = seedList(database, [[globalTagId]], [worldGroupId]);
        seedList(database, [[globalTagId]]);

        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}, undefined, "/api?action=listSetLists"), res);

        const ids = (captured.body as { setLists: Array<{ id: number; }>; }).setLists.map((entry) => {
            return entry.id;
        });

        expect(ids).toEqual([isWorld]);
    });

    it("reads a list with the score ids the caller may read, in the list's order", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]]);
        database.setListScores.push(
            { setListId: listId, scoreId: otherScoreId, position: 1 },
            { setListId: listId, scoreId: scoreId, position: 2 },
            { setListId: listId, scoreId: 77, position: 3 },
        );

        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({}, ownerUserId, `/api?action=getSetList&id=${listId}`), res);

        const body = captured.body as { id: number; groups: number[][]; scores: number[]; };

        expect(captured.status).toBe(200);
        expect(body.groups).toEqual([[globalTagId]]);
        expect(body.scores).toEqual([otherScoreId, scoreId]);
    });

    it("lets a visitor read a World list without any score details", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]], [worldGroupId]);
        database.setListScores.push({ setListId: listId, scoreId, position: 1 });

        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({}, undefined, `/api?action=getSetList&id=${listId}`), res);

        const body = captured.body as { groups: number[][]; scores: number[]; };

        expect(captured.status).toBe(200);
        expect(body.groups).toEqual([[globalTagId]]);
        expect(body.scores).toEqual([]);
    });

    it("answers 403 for a list the caller cannot read", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]]);

        const { res, captured } = createResponse();

        await routes.handleGetSetList(createRequest({}, memberUserId, `/api?action=getSetList&id=${listId}`), res);

        expect(captured.status).toBe(403);
    });

    it("reports a deleted tag instead of a narrowed combination", async () => {
        const { database, routes } = setup();
        seedList(database, [[memberTagId]]);
        database.tags.splice(database.tags.findIndex((tag) => {
            return tag.id === memberTagId;
        }), 1);

        const { res, captured } = createResponse();

        await routes.handleListSetLists(createRequest({}, ownerUserId, "/api?action=listSetLists"), res);

        const entry = (captured.body as {
            setLists: Array<{ groups: number[][]; filterProblem?: string; }>;
        }).setLists[0];

        expect(entry.groups).toEqual([[memberTagId]]);
        expect(entry.filterProblem).toBe("unavailable-tag");
    });
});

describe("set list routes — updating", () => {
    it("renames a list and bumps its revision", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]]);

        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(
            createRequest({ id: listId, revision: 1, name: "Bateria" }, ownerUserId), res,
        );

        expect(captured.status).toBe(200);
        expect((captured.body as { revision: number; }).revision).toBe(2);
        expect(database.setLists[0].name).toBe("Bateria");
    });

    it("refuses an edit that builds on an outdated revision", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]]);

        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(
            createRequest({ id: listId, revision: 7, name: "Bateria" }, ownerUserId), res,
        );

        expect(captured.status).toBe(409);
        expect((captured.body as { revision: number; }).revision).toBe(1);
        expect(database.setLists[0].name).toBe("Samba");
    });

    it("refuses a change by a member who may only read the list", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]], [memberGroupId]);

        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(
            createRequest({ id: listId, revision: 1, name: "Bateria" }, memberUserId), res,
        );

        expect(captured.status).toBe(403);
    });

    it("lets a group with write access change the list", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]], [{ groupId: memberGroupId, writable: true }]);

        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(
            createRequest({ id: listId, revision: 1, name: "Bateria" }, memberUserId), res,
        );

        expect(captured.status).toBe(200);
    });

    it("refuses a combination that would no longer fit the list's sharing", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]], [worldGroupId]);

        const { res, captured } = createResponse();

        await routes.handleUpdateSetList(
            createRequest({ id: listId, revision: 1, groups: [[memberTagId]] }, ownerUserId), res,
        );

        expect(captured.status).toBe(409);
        expect((captured.body as { filterProblem: string; }).filterProblem).toBe("tag-scope");
    });
});

describe("set list routes — deleting", () => {
    it("deletes the list with its permission rows", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]], [memberGroupId]);

        const { res, captured } = createResponse();

        await routes.handleDeleteSetList(createRequest({ id: listId }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.setLists.length).toBe(0);
        expect(database.owners.has(`${EntityType.SetList}:${listId}`)).toBe(false);
        expect(database.grants.has(`${EntityType.SetList}:${listId}`)).toBe(false);
    });

    it("refuses a delete by someone who may only read the list", async () => {
        const { database, routes } = setup();
        const listId = seedList(database, [[globalTagId]], [memberGroupId]);

        const { res, captured } = createResponse();

        await routes.handleDeleteSetList(createRequest({ id: listId }, memberUserId), res);

        expect(captured.status).toBe(403);
        expect(database.setLists.length).toBe(1);
    });
});

describe("set list permissions", () => {
    it("refuses to share a list with World while it uses a group tag", async () => {
        const { database, admin } = setup();
        const listId = seedList(database, [[memberTagId]]);

        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: EntityType.SetList, entityId: listId,
            addGroups: [{ groupId: worldGroupId, writable: false }],
        }, ownerUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { filterProblem: string; }).filterProblem).toBe("tag-scope");
        expect(database.grants.get(`${EntityType.SetList}:${listId}`)?.size).toBe(0);
    });

    it("refuses to share a list with a second group while it uses a group tag", async () => {
        const { database, admin } = setup();
        const listId = seedList(database, [[memberTagId]], [memberGroupId]);

        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: EntityType.SetList, entityId: listId,
            addGroups: [{ groupId: foreignGroupId, writable: false }],
        }, ownerUserId), res);

        expect(captured.status).toBe(409);
        expect(database.grants.get(`${EntityType.SetList}:${listId}`)?.has(foreignGroupId)).toBe(false);
    });

    it("shares a list that uses global tags with World and bumps its revision", async () => {
        const { database, admin } = setup();
        const listId = seedList(database, [[globalTagId]]);

        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: EntityType.SetList, entityId: listId,
            addGroups: [{ groupId: worldGroupId, writable: false }],
        }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect((captured.body as { revision: number; }).revision).toBe(2);
        expect(database.grants.get(`${EntityType.SetList}:${listId}`)?.has(worldGroupId)).toBe(true);
    });

    it("refuses a permission change that builds on an outdated revision", async () => {
        const { database, admin } = setup();
        const listId = seedList(database, [[globalTagId]]);
        database.setLists[0].revision = 4;

        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: EntityType.SetList, entityId: listId, revision: 1,
            addGroups: [{ groupId: worldGroupId, writable: false }],
        }, ownerUserId), res);

        expect(captured.status).toBe(409);
        expect((captured.body as { revision: number; }).revision).toBe(4);
    });

    it("stores a World grant as read-only, whatever the request asks for", async () => {
        const { database, admin } = setup();
        const listId = seedList(database, [[globalTagId]]);

        const { res, captured } = createResponse();

        await admin.handleSetPermissions(createRequest({
            entityType: EntityType.SetList, entityId: listId,
            addGroups: [{ groupId: worldGroupId, writable: true }],
        }, ownerUserId), res);

        expect(captured.status).toBe(200);
        expect(database.grants.get(`${EntityType.SetList}:${listId}`)?.get(worldGroupId)).toBe(false);
    });
});
