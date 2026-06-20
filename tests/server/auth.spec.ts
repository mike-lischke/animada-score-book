/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { createAccessToken, createRefreshToken, verifyRefreshToken, verifyToken } from "../../src/server/auth.js";
import { makePermBits, Perm } from "../../src/server/auth.js";

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

    it("round-trip: refresh token", () => {
        const payload = { userId: 2, username: "admin", isAdmin: true };
        const { token } = createRefreshToken(payload);
        const decoded = verifyRefreshToken(token);

        expect(decoded).toBeDefined();
        expect(decoded!.userId).toBe(2);
        expect(decoded!.isAdmin).toBe(true);
    });

    it("refresh token is rejected as access token", () => {
        const payload = { userId: 3, username: "x", isAdmin: false };
        const { token } = createRefreshToken(payload);
        const decoded = verifyToken(token);

        expect(decoded).toBeUndefined();
    });

    it("access token is rejected as refresh token", () => {
        const payload = { userId: 4, username: "y", isAdmin: false };
        const token = createAccessToken(payload);
        const decoded = verifyRefreshToken(token);

        expect(decoded).toBeUndefined();
    });

    it("invalid token returns undefined", () => {
        expect(verifyToken("not.a.token")).toBeUndefined();
        expect(verifyRefreshToken("garbage")).toBeUndefined();
    });
});

describe("auth — Permission Bits", () => {
    it("makePermBits — owner rwx, group rx, world r", () => {
        const bits = makePermBits(Perm.RWX, Perm.RX, Perm.R);

        expect(bits & 0x7).toBe(Perm.R);          // world
        expect((bits >> 3) & 0x7).toBe(Perm.RX);   // group
        expect((bits >> 6) & 0x7).toBe(Perm.RWX);  // owner
    });

    it("makePermBits — all none", () => {
        const bits = makePermBits(Perm.None, Perm.None, Perm.None);

        expect(bits).toBe(0);
    });

    it("makePermBits — all rwx", () => {
        const bits = makePermBits(Perm.RWX, Perm.RWX, Perm.RWX);

        expect(bits).toBe(0x1FF); // 511 = 0b111_111_111
    });

    it("makePermBits — owner rw, group none, world r", () => {
        const bits = makePermBits(Perm.RW, Perm.None, Perm.R);

        expect(bits & 0x7).toBe(Perm.R);
        expect((bits >> 3) & 0x7).toBe(Perm.None);
        expect((bits >> 6) & 0x7).toBe(Perm.RW);
    });

    it("Perm enum values are correct bit patterns", () => {
        expect(Perm.None).toBe(0);
        expect(Perm.X).toBe(1);
        expect(Perm.W).toBe(2);
        expect(Perm.WX).toBe(3);
        expect(Perm.R).toBe(4);
        expect(Perm.RX).toBe(5);
        expect(Perm.RW).toBe(6);
        expect(Perm.RWX).toBe(7);
    });
});
