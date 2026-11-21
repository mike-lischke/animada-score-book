/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Readable } from "node:stream";
import { type IncomingMessage, type ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import { Auth } from "../../src/server/Auth.js";
import { RequestContext } from "../../src/server/RequestContext.js";
import { TagPalette } from "../../src/core/TagPalette.js";
import type { IServerConfig } from "../../src/server/config.js";
import { DatabaseEngine } from "../../src/server/database.js";
import { TagActions } from "../../src/server/TagActions.js";
import { TagAccess, type ITagRow } from "../../src/server/TagAccess.js";
import type {
    DbRow, IDatabaseAdapter, IDbExecuteResult, ITestConnectionResult,
} from "../../src/server/database.js";

const adminsGroupId = 1;
const worldGroupId = 2;
const memberGroupId = 10;
const foreignGroupId = 20;

const memberUserId = 3;
const scoreId = 7;

const config: IServerConfig = {
    host: "127.0.0.1",
    port: 3100,
    database: { engine: DatabaseEngine.MySQL, host: "", port: 0, database: "", user: "", password: "" },
    soundLibPath: "",
    registration: { enabled: false },
    mail: { host: "", port: 587, secure: false, user: "", password: "", from: "" },
};

/** Answers the handful of statements the tag routes and the permission checks issue. */
class FakeDatabase implements IDatabaseAdapter {
    public readonly tags: ITagRow[] = [
        { id: 1, name: "Demo Score", colorIndex: 1, groupId: null, systemKey: "demo" },
        { id: 2, name: "Caixa", colorIndex: 2, groupId: null, systemKey: "instrument:5" },
        { id: 3, name: "Internal", colorIndex: 5, groupId: foreignGroupId, systemKey: null },
        { id: 4, name: "Set list", colorIndex: 4, groupId: memberGroupId, systemKey: null },
    ];

    public readonly scores = [{ id: scoreId, name: "Samba", content: "{\"k\":[[1,\"5\",[]]]}" }];

    public readonly assignments = new Set<string>();

    public readonly locks = new Map<number, { userId: number; lockedAt: Date; }>();

    public readonly permissions = new Map<number, number>();

    public readonly groups = [
        { id: adminsGroupId, name: Auth.adminGroupName, adminId: null },
        { id: worldGroupId, name: Auth.worldGroupName, adminId: null },
        { id: memberGroupId, name: "Bateria", adminId: memberUserId },
        { id: foreignGroupId, name: "Fremd", adminId: 4 },
    ];

    public readonly userGroups = [{ userId: memberUserId, groupId: memberGroupId }];

    public testConnection(): Promise<ITestConnectionResult> {
        return Promise.resolve({ success: true });
    }

    public initialize(): Promise<void> {
        return Promise.resolve();
    }

    public dropAllTables(): Promise<void> {
        return Promise.resolve();
    }

    public isInitialized(): boolean {
        return true;
    }

    public ping(): Promise<boolean> {
        return Promise.resolve(true);
    }

    public query<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
        const rows = this.rows(sql, params);

        return Promise.resolve(rows as unknown as T[]);
    }

    public execute(sql: string, params: unknown[] = []): Promise<IDbExecuteResult> {
        if (sql.startsWith("INSERT IGNORE INTO score_tags")) {
            this.assignments.add(`${String(params[0])}:${String(params[1])}`);
        }

        if (sql.startsWith("DELETE FROM score_tags")) {
            this.assignments.delete(`${String(params[0])}:${String(params[1])}`);
        }

        if (sql.startsWith("UPDATE tags SET color_index")) {
            const tag = this.tags.find((entry) => {
                return entry.id === Number(params[1]);
            });

            if (tag !== undefined) {
                tag.colorIndex = Number(params[0]);
            }
        }

        if (sql.startsWith("UPDATE tags SET name")) {
            const tag = this.tags.find((entry) => {
                return entry.id === Number(params[2]);
            });

            if (tag !== undefined) {
                tag.name = String(params[0]);
                tag.colorIndex = Number(params[1]);
            }
        }

        return Promise.resolve({ affectedRows: 1, insertId: 0 });
    }

    public insertReturningId(sql: string, params: unknown[] = []): Promise<IDbExecuteResult> {
        if (sql.startsWith("INSERT INTO tags")) {
            const id = 100 + this.tags.length;
            this.tags.push({
                id,
                name: String(params[0]),
                colorIndex: Number(params[1]),
                groupId: params[2] === null ? null : Number(params[2]),
                systemKey: null,
            });

            return Promise.resolve({ affectedRows: 1, insertId: id });
        }

        return Promise.resolve({ affectedRows: 1, insertId: 0 });
    }

    public executeMultiple(): Promise<void> {
        return Promise.resolve();
    }

    public executeTransaction(): Promise<void> {
        return Promise.resolve();
    }

    public shutdown(): Promise<void> {
        return Promise.resolve();
    }

    private rows(sql: string, params: unknown[]): DbRow[] {
        if (sql.includes("ug JOIN `groups` g")) {
            const groupName = String(params[1]);
            const group = this.groups.find((entry) => {
                return entry.name === groupName;
            });
            const member = this.userGroups.some((entry) => {
                return entry.userId === Number(params[0]) && entry.groupId === group?.id;
            });

            return [{ cnt: member ? 1 : 0 }];
        }

        if (sql.includes("FROM user_groups WHERE user_id = ?")) {
            return this.userGroups.filter((entry) => {
                return entry.userId === Number(params[0]);
            }).map((entry) => {
                return { groupId: entry.groupId };
            });
        }

        if (sql.includes("WHERE admin_id = ?")) {
            return this.groups.filter((entry) => {
                return entry.adminId === Number(params[0]);
            }).map((entry) => {
                return { id: entry.id };
            });
        }

        if (sql.includes("FROM `groups` WHERE name = ?")) {
            return this.groups.filter((entry) => {
                return entry.name === String(params[0]);
            }).map((entry) => {
                return { id: entry.id };
            });
        }

        if (sql.includes("FROM `groups`")) {
            return this.groups.map((entry) => {
                return { id: entry.id, name: entry.name };
            });
        }

        if (sql.includes("FROM tags WHERE id = ?")) {
            return this.tags.filter((tag) => {
                return tag.id === Number(params[0]);
            });
        }

        if (sql.includes("FROM permissions")) {
            const entityIds = params.slice(1).map((value) => {
                return Number(value);
            });

            return entityIds.filter((entityId) => {
                return this.permissions.has(entityId);
            }).map((entityId) => {
                return { entityId, ownerId: this.permissions.get(entityId) };
            });
        }

        if (sql.includes("FROM entity_groups")) {
            return [];
        }

        if (sql.includes("FROM score_locks")) {
            const lock = this.locks.get(Number(params[0]));

            return lock === undefined ? [] : [{ userId: lock.userId, lockedAt: lock.lockedAt }];
        }

        if (sql.includes("JOIN tags t") && sql.includes("system_key = ?")) {
            const tag = this.tags.find((entry) => {
                return entry.systemKey === String(params[1]);
            });
            const assigned = tag !== undefined && this.assignments.has(`${String(params[0])}:${tag.id}`);

            return [{ cnt: assigned ? 1 : 0 }];
        }

        if (sql.includes("SELECT id, content FROM scores")) {
            const ids = params.map((value) => {
                return Number(value);
            });

            return this.scores.filter((score) => {
                return ids.includes(score.id);
            }).map((score) => {
                return { id: score.id, content: score.content };
            });
        }

        if (sql.includes("FROM scores s")) {
            return this.scores.map((score) => {
                return { id: score.id, name: score.name };
            });
        }

        if (sql.includes("FROM score_tags")) {
            return Array.from(this.assignments).map((entry) => {
                const [assignedScore, assignedTag] = entry.split(":");

                return { scoreId: Number(assignedScore), tagId: Number(assignedTag) };
            });
        }

        if (sql.includes("SELECT content FROM scores")) {
            return this.scores.filter((score) => {
                return score.id === Number(params[0]);
            }).map((score) => {
                return { content: score.content };
            });
        }

        if (sql.includes("SELECT id FROM scores WHERE id = ?")) {
            return this.scores.filter((score) => {
                return score.id === Number(params[0]);
            }).map((score) => {
                return { id: score.id };
            });
        }

        return [];
    }
}

interface ICapturedResponse {
    status: number;
    body: unknown;
}

const createRequest = (body: unknown, userId?: number): IncomingMessage => {
    const token = userId === undefined
        ? undefined
        : Auth.createAccessToken({ userId, email: `user${userId}@example.com`, isAdmin: false });

    const headers: Record<string, string> = { host: "localhost" };

    if (token !== undefined) {
        headers.authorization = `Bearer ${token}`;
    }

    return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
        url: "/api?action=x",
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

const setup = (): { database: FakeDatabase; routes: TagActions; } => {
    const database = new FakeDatabase();
    database.permissions.set(scoreId, memberUserId);

    const context = new RequestContext(new Auth(database), config);

    return { database, routes: new TagActions(context) };
};

describe("tag actions — assigning", () => {
    it("assigns a usable tag of the caller's group", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleAssignTag(createRequest({ scoreId, tagId: 2 }, memberUserId), res);

        expect(captured.status).toBe(200);
        expect(Array.from(database.assignments)).toEqual([`${scoreId}:2`]);
    });

    it("answers 404 for a tag of a foreign group, so its existence does not leak", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleAssignTag(createRequest({ scoreId, tagId: 3 }, memberUserId), res);

        expect(captured.status).toBe(404);
        expect(database.assignments.size).toBe(0);
    });

    it("keeps the demo tag with the administrators, whatever the write permission says", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleAssignTag(createRequest({ scoreId, tagId: 1 }, memberUserId), res);

        expect(captured.status).toBe(403);
        expect(database.assignments.size).toBe(0);
    });

    it("refuses to change a score another user holds the lock for", async () => {
        const { database, routes } = setup();
        database.locks.set(scoreId, { userId: 9, lockedAt: new Date() });

        const { res, captured } = createResponse();

        await routes.handleAssignTag(createRequest({ scoreId, tagId: 2 }, memberUserId), res);

        expect(captured.status).toBe(409);
        expect(database.assignments.size).toBe(0);
    });

    it("answers 401 without a session", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleAssignTag(createRequest({ scoreId, tagId: 2 }), res);

        expect(captured.status).toBe(401);
    });
});

describe("tag actions — score list", () => {
    it("returns the lineup of every listed score, keeping repeated instruments apart", async () => {
        const secondScoreId = scoreId + 1;

        const { database, routes } = setup();
        database.scores.push({
            id: secondScoreId,
            name: "Samba Reggae",
            content: "{\"v\":7,\"p\":[\"4/4\",110,1,\"q\"],\"k\":[[1,\"5\",[]],[2,\"5\",[]],[3,\"7\",[]]]}",
        });
        database.permissions.set(secondScoreId, memberUserId);

        const { res, captured } = createResponse();

        await routes.handleListScores(createRequest({ groups: [] }, memberUserId), res);

        const body = captured.body as { scores: Array<{ id: number; lineup: unknown; }> };
        const listed = body.scores.find((entry) => {
            return entry.id === secondScoreId;
        });

        expect(listed?.lineup).toEqual({
            status: "ok",
            tracks: [
                { trackId: 1, instrumentTypeId: "5" },
                { trackId: 2, instrumentTypeId: "5" },
                { trackId: 3, instrumentTypeId: "7" },
            ],
        });
    });

    it("lists a score whose content it cannot read instead of dropping it", async () => {
        const { routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleListScores(createRequest({ groups: [] }, memberUserId), res);

        const body = captured.body as { scores: Array<{ id: number; lineup: unknown; }> };
        const listed = body.scores.find((entry) => {
            return entry.id === scoreId;
        });

        expect(listed).toBeDefined();
        expect(listed?.lineup).toEqual({ status: "unreadable", tracks: [] });
    });
});

describe("tag actions — unassigning", () => {
    it("keeps an instrument tag the score still uses", async () => {
        const { database, routes } = setup();
        database.assignments.add(`${scoreId}:2`);

        const { res, captured } = createResponse();

        await routes.handleUnassignTag(createRequest({ scoreId, tagId: 2 }, memberUserId), res);

        expect(captured.status).toBe(409);
        expect(database.assignments.has(`${scoreId}:2`)).toBe(true);
    });

    it("removes an instrument tag once the track is gone", async () => {
        const { database, routes } = setup();
        database.assignments.add(`${scoreId}:2`);
        database.scores[0].content = "{\"k\":[]}";

        const { res, captured } = createResponse();

        await routes.handleUnassignTag(createRequest({ scoreId, tagId: 2 }, memberUserId), res);

        expect(captured.status).toBe(200);
        expect(database.assignments.size).toBe(0);
    });
});

describe("tag actions — colour", () => {
    it("picks a palette colour for a new tag when the caller names none", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateTag(createRequest({ name: "Ensaio", groupId: memberGroupId }, memberUserId), res);

        expect(captured.status).toBe(200);
        expect(database.tags[4].colorIndex).toBe(104 % TagPalette.count);
    });

    it("keeps the palette colour the caller picked", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateTag(
            createRequest({ name: "Ensaio", groupId: memberGroupId, colorIndex: 7 }, memberUserId),
            res,
        );

        expect(captured.status).toBe(200);
        expect(database.tags[4].colorIndex).toBe(7);

        const body = captured.body as { tag: { colorIndex: number; }; };
        expect(body.tag.colorIndex).toBe(7);
    });

    it("refuses an index the palette does not hold", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateTag(
            createRequest({ name: "Ensaio", groupId: memberGroupId, colorIndex: TagPalette.count }, memberUserId),
            res,
        );

        expect(captured.status).toBe(400);
        expect(database.tags).toHaveLength(4);
    });

    it("changes the colour of an owned tag", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleUpdateTag(createRequest({ id: 4, colorIndex: 0 }, memberUserId), res);

        expect(captured.status).toBe(200);
        expect(database.tags[3].colorIndex).toBe(0);
    });

    it("refuses a colour index below the palette", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleUpdateTag(createRequest({ id: 4, colorIndex: -1 }, memberUserId), res);

        expect(captured.status).toBe(400);
        expect(database.tags[3].colorIndex).toBe(4);
    });
});

describe("tag actions — name length", () => {
    it("refuses a new tag whose name is longer than the column holds", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateTag(
            createRequest({ name: "x".repeat(TagAccess.maxNameLength + 1), groupId: memberGroupId }, memberUserId),
            res,
        );

        expect(captured.status).toBe(400);
        expect(database.tags).toHaveLength(4);
    });

    it("accepts a new tag whose name fills the column exactly", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();
        const name = "x".repeat(TagAccess.maxNameLength);

        await routes.handleCreateTag(createRequest({ name, groupId: memberGroupId }, memberUserId), res);

        expect(captured.status).toBe(200);
        expect(database.tags.some((tag) => {
            return tag.name === name;
        })).toBe(true);
    });

    it("refuses to rename a tag past the column width", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleUpdateTag(
            createRequest({ id: 4, name: "x".repeat(TagAccess.maxNameLength + 1) }, memberUserId),
            res,
        );

        expect(captured.status).toBe(400);
        expect(database.tags[3].name).toBe("Set list");
    });

    it("counts characters, not UTF-16 units", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        // A character outside the basic plane needs two UTF-16 units, so String#length would reject this name
        // even though the column holds exactly the allowed number of characters.
        const name = "𝄞".repeat(TagAccess.maxNameLength);

        expect(name.length).toBeGreaterThan(TagAccess.maxNameLength);

        await routes.handleCreateTag(createRequest({ name, groupId: memberGroupId }, memberUserId), res);

        expect(captured.status).toBe(200);
        expect(database.tags.some((tag) => {
            return tag.name === name;
        })).toBe(true);
    });

    it("refuses one character too many even when every character is a surrogate pair", async () => {
        const { database, routes } = setup();
        const { res, captured } = createResponse();

        await routes.handleCreateTag(
            createRequest({ name: "𝄞".repeat(TagAccess.maxNameLength + 1), groupId: memberGroupId }, memberUserId),
            res,
        );

        expect(captured.status).toBe(400);
        expect(database.tags).toHaveLength(4);
    });
});
