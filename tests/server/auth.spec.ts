/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Auth, AccessLevel, EntityType, LoginAuditEvent, type ITokenPayload } from "../../src/server/Auth.js";
import type { DbRow, IDatabaseAdapter, IDbExecuteResult, ITestConnectionResult } from "../../src/server/database.js";

const adminsGroupId = 1;
const worldGroupId = 2;

/** In-memory stand-in for the adapter, covering the queries `Auth` runs for permissions. */
class FakeDatabaseAdapter implements IDatabaseAdapter {
    /** Group id → group name. */
    public readonly groups = new Map<number, string>([
        [adminsGroupId, Auth.adminGroupName],
        [worldGroupId, Auth.worldGroupName],
    ]);

    /** `entityType:entityId` → group id → writable. */
    public readonly entityGroups = new Map<string, Map<number, boolean>>();

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
        if (sql.includes("FROM `groups` WHERE name = ?")) {
            const name = String(params[0]);
            const match = Array.from(this.groups.entries()).find(([, groupName]) => {
                return groupName === name;
            });

            return Promise.resolve((match ? [{ id: match[0] }] : []) as unknown as T[]);
        }

        if (sql.includes("FROM entity_groups")) {
            const key = `${String(params[0])}:${String(params[1])}`;
            const rows = Array.from((this.entityGroups.get(key) ?? new Map<number, boolean>()).entries())
                .map(([groupId, writable]) => {
                    return { group_id: groupId, writable: writable ? 1 : 0 };
                });

            return Promise.resolve(rows as unknown as T[]);
        }

        if (sql.includes("FROM scores")) {
            return Promise.resolve([{ folderid: null }] as unknown as T[]);
        }

        return Promise.resolve([] as T[]);
    }

    public execute(sql: string, params: unknown[] = []): Promise<IDbExecuteResult> {
        const key = `${String(params[0])}:${String(params[1])}`;
        const groupId = Number(params[2]);
        const groupRows = this.entityGroups.get(key) ?? new Map<number, boolean>();

        this.entityGroups.set(key, groupRows);

        // The World branch writes a constant 0, the other branch only upgrades with GREATEST.
        const writable = sql.includes("GREATEST")
            && (groupRows.get(groupId) === true || Number(params[3]) === 1);

        groupRows.set(groupId, writable);

        return Promise.resolve({ affectedRows: 1, insertId: 0 });
    }

    public insertReturningId(): Promise<IDbExecuteResult> {
        return Promise.resolve({ affectedRows: 1, insertId: 0 });
    }

    public executeMultiple(): Promise<void> {
        return Promise.resolve();
    }

    public shutdown(): Promise<void> {
        return Promise.resolve();
    }
}

describe("auth — JWT", () => {
    it("round-trip: access token", () => {
        const payload = { userId: 1, email: "test@example.com", isAdmin: false };
        const token = Auth.createAccessToken(payload);
        const decoded = Auth.verifyToken(token);

        expect(decoded).toBeDefined();
        expect(decoded!.userId).toBe(1);
        expect(decoded!.email).toBe("test@example.com");
        expect(decoded!.isAdmin).toBe(false);
    });

    it("rejects a token that names the account by its former field", () => {
        const legacy = Auth.createAccessToken(
            { userId: 1, username: "test", isAdmin: false } as unknown as ITokenPayload,
        );

        expect(Auth.verifyToken(legacy)).toBeUndefined();
    });

    it("refresh token: generates random raw and hash", () => {
        const { raw, hash, maxAge } = Auth.createRefreshToken();

        expect(raw).toBeDefined();
        expect(raw.length).toBe(64); // 32 bytes hex = 64 chars
        expect(hash).toBeDefined();
        expect(hash.length).toBe(64); // SHA-256 hex = 64 chars
        expect(raw).not.toBe(hash);
        expect(maxAge).toBeGreaterThan(0);
    });

    it("refresh tokens are unique", () => {
        const a = Auth.createRefreshToken();
        const b = Auth.createRefreshToken();

        expect(a.raw).not.toBe(b.raw);
        expect(a.hash).not.toBe(b.hash);
    });

    it("invalid token returns undefined", () => {
        expect(Auth.verifyToken("not.a.token")).toBeUndefined();
    });
});

describe("auth — e-mail addresses", () => {
    it("stores an address trimmed and in lower case", () => {
        expect(Auth.normalizeEmail("  Someone@Example.COM ")).toBe("someone@example.com");
    });

    it("accepts an ordinary address", () => {
        expect(Auth.isValidEmail("someone@example.com")).toBe(true);
        expect(Auth.isValidEmail("first.last+tag@sub.example.org")).toBe(true);
    });

    it("refuses what is not an address", () => {
        expect(Auth.isValidEmail("someone")).toBe(false);
        expect(Auth.isValidEmail("someone@example")).toBe(false);
        expect(Auth.isValidEmail("@example.com")).toBe(false);
        expect(Auth.isValidEmail("someone@example.com ")).toBe(false);
        expect(Auth.isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
    });

    it("never names the anonymous system account with a deliverable address", () => {
        expect(Auth.isValidEmail(Auth.anonymousEmail)).toBe(true);
        expect(Auth.anonymousEmail.endsWith(".invalid")).toBe(true);
    });

    it("stores only the hash of a confirmation token", () => {
        const first = Auth.createEmailVerificationToken();
        const second = Auth.createEmailVerificationToken();

        expect(first.raw).not.toBe(second.raw);
        expect(first.hash).toHaveLength(64);
        expect(first.raw).not.toBe(first.hash);
        expect(Auth.hashVerificationToken(first.raw)).toBe(first.hash);
    });
});

describe("auth — AccessLevel", () => {
    it("Read and Write are distinct", () => {
        expect(AccessLevel.Read).not.toBe(AccessLevel.Write);
    });
});

describe("auth — Constants", () => {
    it("adminGroupName is 'Admins'", () => {
        expect(Auth.adminGroupName).toBe("Admins");
    });

    it("worldGroupName is 'World'", () => {
        expect(Auth.worldGroupName).toBe("World");
    });

    it("EntityType has expected values", () => {
        expect(EntityType.Score).toBe("score");
        expect(EntityType.Folder).toBe("folder");
        expect(EntityType.Feature).toBe("feature");
    });
});

describe("auth — LoginAuditEvent", () => {
    it("has four event types with correct string values", () => {
        expect(LoginAuditEvent.Login).toBe("login");
        expect(LoginAuditEvent.GroupLogin).toBe("group_login");
        expect(LoginAuditEvent.Refresh).toBe("refresh");
        expect(LoginAuditEvent.Logout).toBe("logout");
    });

    it("all enum values are unique", () => {
        const values = Object.values(LoginAuditEvent);

        expect(new Set(values).size).toBe(values.length);
    });
});

describe("auth — World group is read-only", () => {
    it("stores a write grant for World as read", async () => {
        const adapter = new FakeDatabaseAdapter();

        await new Auth(adapter).addEntityGroup(EntityType.Score, 7, worldGroupId, true);

        expect(adapter.entityGroups.get("score:7")?.get(worldGroupId)).toBe(false);
    });

    it("downgrades an existing write grant for World", async () => {
        const adapter = new FakeDatabaseAdapter();

        adapter.entityGroups.set("score:7", new Map([[worldGroupId, true]]));

        await new Auth(adapter).addEntityGroup(EntityType.Score, 7, worldGroupId, true);

        expect(adapter.entityGroups.get("score:7")?.get(worldGroupId)).toBe(false);
    });

    it("keeps write grants for other groups", async () => {
        const adapter = new FakeDatabaseAdapter();

        await new Auth(adapter).addEntityGroup(EntityType.Score, 7, adminsGroupId, true);

        expect(adapter.entityGroups.get("score:7")?.get(adminsGroupId)).toBe(true);
    });

    it("ignores a stale World write grant when access is checked", async () => {
        const adapter = new FakeDatabaseAdapter();

        adapter.entityGroups.set("score:7", new Map([[worldGroupId, true]]));

        const auth = new Auth(adapter);
        const canWrite = await auth.checkPermission(undefined, EntityType.Score, 7, AccessLevel.Write);
        const canRead = await auth.checkPermission(undefined, EntityType.Score, 7, AccessLevel.Read);
        const summary = await auth.getPermissionSummary(undefined, EntityType.Score, 7);

        expect(canWrite).toBe(false);
        expect(canRead).toBe(true);
        expect(summary.canWrite).toBe(false);
    });
});
