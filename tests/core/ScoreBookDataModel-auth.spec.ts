/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe.sequential("ScoreBookDataModel — Auth State", () => {
    let model: ScoreBookDataModel;
    let authChangedCalls: number;
    let authChangedHandler: () => Promise<boolean>;

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        authChangedCalls = 0;
        authChangedHandler = () => {
            authChangedCalls++;

            return Promise.resolve(true);
        };
        requisitions.register("authChanged", authChangedHandler);
    });

    afterEach(() => {
        requisitions.unregister("authChanged", authChangedHandler);
    });

    it("starts unauthenticated with no capabilities", () => {
        expect(model.authenticated).toBe(false);
        expect(model.user).toBeUndefined();
        expect(model.canWriteScores).toBe(false);
        expect(model.capabilities.canEditScores).toBe(false);
    });

    it("login success sets auth state and fires authChanged", async () => {
        const loginResponse = {
            token: "test-token",
            user: { id: 1, username: "admin", displayName: "Admin", isAdmin: true },
            capabilities: {
                canEditScores: true, canManageUsers: true,
                canManageInstruments: true, canExportMP3: true,
            },
        };

        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => {
                return Promise.resolve(loginResponse);
            },
        } as Response);

        const result = await model.login("admin", "admin");

        expect(result).toBe(true);
        expect(model.authenticated).toBe(true);
        expect(model.user?.username).toBe("admin");
        expect(model.canWriteScores).toBe(true);
        expect(authChangedCalls).toBe(1);
    });

    it("login failure keeps unauthenticated state", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
        } as Response);

        const result = await model.login("bad", "wrong");

        expect(result).toBe(false);
        expect(model.authenticated).toBe(false);
        expect(model.canWriteScores).toBe(false);
        expect(authChangedCalls).toBe(0);
    });

    it("logout clears auth state and fires authChanged", async () => {
        // First log in.
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => {
                return Promise.resolve({
                    token: "t", user: { id: 1, username: "u", displayName: "U", isAdmin: false },
                    capabilities: {
                        canEditScores: true, canManageUsers: false,
                        canManageInstruments: false, canExportMP3: false
                    },
                });
            },
        } as Response);

        await model.login("u", "p");
        authChangedCalls = 0; // Reset after login.

        // Mock logout request.
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
        } as Response);

        await model.logout();

        expect(model.authenticated).toBe(false);
        expect(model.user).toBeUndefined();
        expect(model.canWriteScores).toBe(false);
        expect(authChangedCalls).toBe(1);
    });

    it("network error during login returns false", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

        const result = await model.login("admin", "admin");

        expect(result).toBe(false);
        expect(model.authenticated).toBe(false);
    });

    it("fetchApi attaches authorization header when authenticated", async () => {
        // Log in first.
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => {
                return Promise.resolve({
                    token: "my-access-token", user: {
                        id: 1, username: "u",
                        displayName: "U", isAdmin: false
                    },
                    capabilities: {
                        canEditScores: true, canManageUsers: false,
                        canManageInstruments: false, canExportMP3: false
                    },
                });
            },
        } as Response);

        await model.login("u", "p");

        // Now the model has an access token. Spy on fetch again and call a
        // method that goes through fetchApi internally (addScoreFolder).
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => {
                return Promise.resolve({ success: true, id: 42 });
            },
        } as Response);

        await model.addScoreFolder("test");

        // The last fetch call should have the Authorization header.
        const lastCall = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
        const requestInit = lastCall[1];
        const headers = requestInit.headers as Record<string, string>;

        expect(headers.Authorization).toBe("Bearer my-access-token");
    });

    it("canWriteScores getter returns false for anonymous", () => {
        expect(model.canWriteScores).toBe(false);
    });

    it("capabilities getter returns defaults for anonymous", () => {
        const caps = model.capabilities;

        expect(caps.canEditScores).toBe(false);
        expect(caps.canManageUsers).toBe(false);
        expect(caps.canManageInstruments).toBe(false);
        expect(caps.canExportMP3).toBe(false);
    });
});
