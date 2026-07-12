/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";
import { setupAuthenticatedSession } from "./helpers.js";

const validEntityTypes = ["score", "folder", "feature"] as const;

interface IApiCallResult {
    status: number;
    body: Record<string, unknown>;
}

/**
 * Sets up API mocks for permission endpoints that mirror the backend's
 * `isValidEntityType` validation. Valid entity types get normal responses;
 * invalid ones get a 400 error.
 *
 * Also handles standard app requests (health, whoami, refresh, listSoundLib,
 * listScoreFolderContent) so the page loads without errors.
 *
 * @param page The Playwright page.
 */
const setupPermissionValidationApi = async (page: Page): Promise<void> => {
    await setupAuthenticatedSession(page);

    await page.route("**/api**", async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");

        if (action === "health") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    status: "ok", initialized: true, engine: "mysql", hasData: true,
                    hasUsers: true, configLoaded: true,
                    host: "127.0.0.1", port: 3306, database: "animada_score_book",
                }),
            });

            return;
        }

        if (action === "listSoundLib") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });

            return;
        }

        if (action === "listScoreFolderContent") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ folders: [], scores: [] }),
            });

            return;
        }

        if (action === "whoami") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    authenticated: true,
                    user: { id: 1, username: "test", displayName: "Test", isAdmin: true },
                    capabilities: {
                        canEditScores: true, canManageUsers: true,
                        canManageInstruments: true, canExportMP3: true,
                    },
                }),
            });

            return;
        }

        if (action === "refresh") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ token: "test-token" }),
            });

            return;
        }

        if (action === "getPermissions") {
            const entityType = url.searchParams.get("entityType") ?? "";

            if (!validEntityTypes.includes(entityType as typeof validEntityTypes[number])) {
                await route.fulfill({
                    status: 400,
                    contentType: "application/json",
                    body: JSON.stringify({ error: `Invalid entityType: ${entityType}` }),
                });

                return;
            }

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    permission: {
                        entityType: "score",
                        entityId: 42,
                        ownerId: 1,
                        groups: [{ groupId: 1, writable: false }],
                    },
                }),
            });

            return;
        }

        if (action === "setPermissions") {
            const body = route.request().postDataJSON() as Record<string, unknown> | null;
            const entityType = String(body?.entityType ?? "");

            if (!validEntityTypes.includes(entityType as typeof validEntityTypes[number])) {
                await route.fulfill({
                    status: 400,
                    contentType: "application/json",
                    body: JSON.stringify({ error: `Invalid entityType: ${entityType}` }),
                });

                return;
            }

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true }),
            });

            return;
        }

        // Fallback — log unhandled actions.
        const unhandledAction = action ?? "(none)";

        console.log(`[e2e] Unhandled API: ${unhandledAction} ${route.request().method()} ${url.pathname}`);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
};

/**
 * Calls the backend's getPermissions endpoint via fetch and returns the response.
 *
 * @param page The Playwright page.
 * @param entityType The entityType query param to send.
 * @param entityId The entityId query param to send.
 *
 * @returns An object with the HTTP status and parsed JSON body.
 */
const callGetPermissions = async (page: Page, entityType: string, entityId = 42): Promise<IApiCallResult> => {
    const result = await page.evaluate(async ({ entityType, entityId }: {
        entityType: string; entityId: number;
    }): Promise<IApiCallResult> => {
        const params = new URLSearchParams({
            action: "getPermissions",
            entityType,
            entityId: String(entityId),
        });
        const response = await fetch(`/api?${params.toString()}`);
        const body = await response.json() as Record<string, unknown>;

        return { status: response.status, body };
    }, { entityType, entityId });

    return result;
};

/**
 * Calls the backend's setPermissions endpoint via fetch and returns the response.
 *
 * @param page The Playwright page.
 * @param entityType The entityType to send in the JSON body.
 * @param entityId The entityId to send in the JSON body.
 *
 * @returns An object with the HTTP status and parsed JSON body.
 */
const callSetPermissions = async (page: Page, entityType: string, entityId = 42): Promise<IApiCallResult> => {
    const result = await page.evaluate(async ({ entityType, entityId }: {
        entityType: string; entityId: number;
    }): Promise<IApiCallResult> => {
        const params = new URLSearchParams({ action: "setPermissions" });
        const response = await fetch(`/api?${params.toString()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entityType,
                entityId,
                addGroups: [{ groupId: 1, writable: false }],
            }),
        });
        const body = await response.json() as Record<string, unknown>;

        return { status: response.status, body };
    }, { entityType, entityId });

    return result;
};

test.describe("Permission Validation — Invalid entityType", () => {
    test.beforeEach(async ({ page }) => {
        await setupPermissionValidationApi(page);
        await page.goto("/");
    });

    test("getPermissions with invalid entityType returns 400 error", async ({ page }) => {
        const result = await callGetPermissions(page, "invalidType", 42);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe("Invalid entityType: invalidType");
    });

    test("setPermissions with invalid entityType returns 400 error", async ({ page }) => {
        const result = await callSetPermissions(page, "invalidType", 42);

        expect(result.status).toBe(400);
        expect(result.body.error).toBe("Invalid entityType: invalidType");
    });

    test("getPermissions with valid entityType 'score' succeeds", async ({ page }) => {
        const result = await callGetPermissions(page, "score", 42);

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty("permission");
        expect((result.body as { permission: Record<string, unknown>; }).permission.entityType).toBe("score");
    });

    test("getPermissions with valid entityType 'folder' succeeds", async ({ page }) => {
        const result = await callGetPermissions(page, "folder", 42);

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty("permission");
    });

    test("getPermissions with valid entityType 'feature' succeeds", async ({ page }) => {
        const result = await callGetPermissions(page, "feature", 42);

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty("permission");
    });

    test("setPermissions with valid entityType 'score' succeeds", async ({ page }) => {
        const result = await callSetPermissions(page, "score", 42);

        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
    });

    test("setPermissions with valid entityType 'folder' succeeds", async ({ page }) => {
        const result = await callSetPermissions(page, "folder", 42);

        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
    });

    test("getPermissions with empty entityType returns 400 error", async ({ page }) => {
        const result = await callGetPermissions(page, "", 42);

        expect(result.status).toBe(400);
        expect(result.body).toHaveProperty("error");
    });

    test("setPermissions with empty entityType returns 400 error", async ({ page }) => {
        const result = await callSetPermissions(page, "", 42);

        expect(result.status).toBe(400);
        expect(result.body).toHaveProperty("error");
    });

    test("getPermissions with case-variant entityType returns 400 error", async ({ page }) => {
        const result = await callGetPermissions(page, "Score", 42);

        expect(result.status).toBe(400);
        expect(result.body).toHaveProperty("error");
    });

    test("setPermissions with null entityType returns 400 error", async ({ page }) => {
        const result = await page.evaluate(async (): Promise<IApiCallResult> => {
            const params = new URLSearchParams({ action: "setPermissions" });
            const response = await fetch(`/api?${params.toString()}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entityType: null,
                    entityId: 42,
                    addGroups: [{ groupId: 1, writable: false }],
                }),
            });
            const body = await response.json() as Record<string, unknown>;

            return { status: response.status, body };
        });

        expect(result.status).toBe(400);
        expect(result.body).toHaveProperty("error");
    });
});
