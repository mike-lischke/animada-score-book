/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Auth, AccessLevel, EntityType, LoginAuditEvent } from "../../src/server/Auth.js";

describe("auth — JWT", () => {
    it("round-trip: access token", () => {
        const payload = { userId: 1, username: "test", isAdmin: false };
        const token = Auth.createAccessToken(payload);
        const decoded = Auth.verifyToken(token);

        expect(decoded).toBeDefined();
        expect(decoded!.userId).toBe(1);
        expect(decoded!.username).toBe("test");
        expect(decoded!.isAdmin).toBe(false);
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
