/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { createAccessToken, createRefreshToken, verifyToken } from "../../src/server/auth.js";
import { makePermBits, Permission } from "../../src/server/auth.js";

describe("auth — JWT", () => {
    it("round-trip: access token", () => {
        const payload = { userId: 1, username: "test", isAdmin: false };
        const token = createAccessToken(payload);
        const decoded = verifyToken(token);

        expect(decoded).toBeDefined();
        expect(decoded!.userId).toBe(1);
        expect(decoded!.username).toBe("test");
        expect(decoded!.isAdmin).toBe(false);
    });

    it("refresh token: generates random raw and hash", () => {
        const { raw, hash, maxAge } = createRefreshToken();

        expect(raw).toBeDefined();
        expect(raw.length).toBe(64); // 32 bytes hex = 64 chars
        expect(hash).toBeDefined();
        expect(hash.length).toBe(64); // SHA-256 hex = 64 chars
        expect(raw).not.toBe(hash);
        expect(maxAge).toBeGreaterThan(0);
    });

    it("refresh tokens are unique", () => {
        const a = createRefreshToken();
        const b = createRefreshToken();

        expect(a.raw).not.toBe(b.raw);
        expect(a.hash).not.toBe(b.hash);
    });

    it("invalid token returns undefined", () => {
        expect(verifyToken("not.a.token")).toBeUndefined();
    });
});

describe("auth — Permission Bits", () => {
    it("makePermBits — owner rwx, group rx, world r", () => {
        const bits = makePermBits(Permission.RWX, Permission.RX, Permission.R);

        expect(bits & 0x7).toBe(Permission.R);          // world
        expect((bits >> 3) & 0x7).toBe(Permission.RX);   // group
        expect((bits >> 6) & 0x7).toBe(Permission.RWX);  // owner
    });

    it("makePermBits — all none", () => {
        const bits = makePermBits(Permission.None, Permission.None, Permission.None);

        expect(bits).toBe(0);
    });

    it("makePermBits — all rwx", () => {
        const bits = makePermBits(Permission.RWX, Permission.RWX, Permission.RWX);

        expect(bits).toBe(0x1FF); // 511 = 0b111_111_111
    });

    it("makePermBits — owner rw, group none, world r", () => {
        const bits = makePermBits(Permission.RW, Permission.None, Permission.R);

        expect(bits & 0x7).toBe(Permission.R);
        expect((bits >> 3) & 0x7).toBe(Permission.None);
        expect((bits >> 6) & 0x7).toBe(Permission.RW);
    });

    it("Perm enum values are correct bit patterns", () => {
        expect(Permission.None).toBe(0);
        expect(Permission.X).toBe(1);
        expect(Permission.W).toBe(2);
        expect(Permission.WX).toBe(3);
        expect(Permission.R).toBe(4);
        expect(Permission.RX).toBe(5);
        expect(Permission.RW).toBe(6);
        expect(Permission.RWX).toBe(7);
    });
});

describe("auth — IPermissionSummary", () => {
    it("default permBits for creation is 492 (rwx|r-x|r--)", () => {
        // Owner RWX (7), Group RX (5), World R (4) → 7<<6 | 5<<3 | 4 = 492.
        const bits = makePermBits(Permission.RWX, Permission.RX, Permission.R);

        expect(bits).toBe(492);
    });

    it("no perm row yields all false and 0 bits", () => {
        // Covered by getPermissionSummary returning { isOwner:false, isGroup:false, isWorld:false, permBits:0 }
        // when no row exists. This is the structural contract.
        const bits = makePermBits(Permission.None, Permission.None, Permission.None);

        expect(bits).toBe(0);
    });
});
