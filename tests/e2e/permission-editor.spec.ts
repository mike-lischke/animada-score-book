/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

/**
 * Sets up API route handlers for the permission editor tests.
 * Mocks authentication, health, scores, and permission CRUD.
 *
 * @param page The Playwright page to set up routes on.
 *
 * @returns An object with access to the captured setPermission calls.
 */
const setupPermissionApi = async (page: Page): Promise<{
    getPermissionCalls: () => Array<Record<string, unknown>>;
}> => {
    const permissionCalls: Array<Record<string, unknown>> = [];

    // In-memory permission state.
    const permissions: Record<string, {
        ownerId: number | null; groups: Array<{ groupId: number; writable: boolean; }>;
    }> = {
        "score-42": {
            ownerId: 1,
            groups: [{ groupId: 1, writable: false }],
        },
    };

    await page.route("**/api**", async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");

        if (action === "health") {
            const body = JSON.stringify({
                status: "ok", initialized: true, engine: "mysql", hasData: true, hasUsers: true,
                configLoaded: true, host: "127.0.0.1", port: 3306, database: "animada_score_book",
            });

            await route.fulfill({ status: 200, contentType: "application/json", body });

            return;
        }

        if (action === "whoami") {
            const body = JSON.stringify({
                authenticated: true,
                user: { id: 1, username: "admin", displayName: "Administrator", isAdmin: true },
                capabilities: {
                    canEditScores: true, canManageUsers: true,
                    canManageInstruments: true, canExportMP3: true,
                },
            });

            await route.fulfill({ status: 200, contentType: "application/json", body });

            return;
        }

        if (action === "refresh") {
            const body = JSON.stringify({ token: "test-token" });

            await route.fulfill({ status: 200, contentType: "application/json", body });

            return;
        }

        if (action === "listSoundLib") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });

            return;
        }

        if (action === "listScoreFolderContent") {
            const body = JSON.stringify({
                folders: [],
                scores: [{
                    id: 42, name: "Test Score", content: "{}",
                    perm: {
                        isOwner: true, canRead: true, canWrite: true, isWorld: true, groupIds: [1],
                    },
                }],
            });

            await route.fulfill({ status: 200, contentType: "application/json", body });

            return;
        }

        if (action === "loadScore") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });

            return;
        }

        if (action === "listUsers") {
            const body = JSON.stringify({
                users: [{
                    id: 1, username: "admin", displayName: "Administrator", isAdmin: true,
                    lastLogin: null, createdAt: "", updatedAt: "",
                }],
            });

            await route.fulfill({ status: 200, contentType: "application/json", body });

            return;
        }

        if (action === "listGroups") {
            const body = JSON.stringify({
                groups: [
                    {
                        id: 1, name: "World", description: "Public", color: "#808080",
                        adminId: null, hasPassword: false, lastLogin: null, createdAt: "",
                    },
                    {
                        id: 2, name: "Admins", description: "Admins", color: "#ff0000",
                        adminId: 1, hasPassword: true, lastLogin: null, createdAt: "",
                    },
                    {
                        id: 3, name: "Percussion", description: "", color: "#00ff00",
                        adminId: 1, hasPassword: false, lastLogin: null, createdAt: "",
                    },
                ],
            });

            await route.fulfill({ status: 200, contentType: "application/json", body });

            return;
        }

        if (action === "getPermissions") {
            const entityType = url.searchParams.get("entityType") ?? "";
            const entityId = url.searchParams.get("entityId") ?? "";
            const key = `${entityType}-${entityId}`;
            const perm = permissions[key] ?? { ownerId: null, groups: [] };

            const body = JSON.stringify({ permission: perm });

            await route.fulfill({ status: 200, contentType: "application/json", body });

            return;
        }

        if (action === "setPermissions") {
            const body = await route.request().postDataJSON() as Record<string, unknown>;
            const entityType = body.entityType as string;
            const entityId = body.entityId as number;
            const key = `${entityType}-${entityId}`;

            // Update in-memory state.
            const existing = permissions[key] ?? { ownerId: null, groups: [] };

            if (Array.isArray(body.addGroups)) {
                for (const g of body.addGroups as Array<{ groupId: number; writable: boolean; }>) {
                    const idx = existing.groups.findIndex((eg) => {
                        return eg.groupId === g.groupId;
                    });

                    if (idx >= 0) {
                        existing.groups[idx] = g;
                    } else {
                        existing.groups.push(g);
                    }
                }
            }

            if (Array.isArray(body.removeGroups)) {
                for (const g of body.removeGroups as Array<{ groupId: number; }>) {
                    existing.groups = existing.groups.filter((eg) => {
                        return eg.groupId !== g.groupId;
                    });
                }
            }

            permissions[key] = existing;
            permissionCalls.push(body);

            const successBody = JSON.stringify({ success: true });

            await route.fulfill({ status: 200, contentType: "application/json", body: successBody });

            return;
        }

        if (action === "listInstruments") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });

            return;
        }

        // Fallback — log unhandled actions so we can see what's missing.
        const unhandledAction = url.searchParams.get("action") ?? "(none)";

        console.log(`[e2e] Unhandled API: ${unhandledAction} ${route.request().method()} ${url.pathname}`);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    return {
        getPermissionCalls: () => {
            return permissionCalls;
        },
    };
};

/**
 * Opens the score library sidebar and the Group Access popup for the first score entry.
 *
 * @param page The Playwright page.
 */
const openGroupAccess = async (page: Page): Promise<void> => {
    await page.goto("/");
    await page.click("#scoreLibraryButton");
    await page.waitForSelector("#scoreTreeHost .scoreTreeEntry", { timeout: 10000 });

    const entry = page.locator("#scoreTreeHost .scoreTreeEntry").first();

    await entry.hover();

    const kebab = entry.locator(".actionBox button").first();

    await kebab.click();

    const menuItem = page.locator(".menuItem").filter({ hasText: "Group Access" });

    await menuItem.click();
    await expect(page.locator("#permissionEditor")).toBeVisible({ timeout: 5000 });
};

test.describe("Permission Editor", () => {
    test("opens via Group Access menu item on a score", async ({ page }) => {
        await setupPermissionApi(page);
        await openGroupAccess(page);

        const header = page.locator("#permissionEditorHeader");

        await expect(header).toContainText("Administrator");
    });

    test("shows Read, Write, and Groups zones", async ({ page }) => {
        await setupPermissionApi(page);
        await openGroupAccess(page);

        await expect(page.locator(".perm-drop-zone")).toHaveCount(2);
        await expect(page.locator(".perm-group-pool")).toBeVisible();
    });

    test("drop hints are shown in empty zones", async ({ page }) => {
        await setupPermissionApi(page);
        await openGroupAccess(page);

        const writeHints = page.locator(".perm-drop-zone").nth(1).locator(".perm-drop-hint");

        await expect(writeHints).toBeVisible();
    });

    test("World group chip appears in the editor", async ({ page }) => {
        await setupPermissionApi(page);
        await openGroupAccess(page);

        const worldChip = page.locator(".perm-chip").filter({ hasText: "World" });

        await expect(worldChip).toBeVisible();
    });

    test("Admins group is excluded from the editor", async ({ page }) => {
        await setupPermissionApi(page);
        await openGroupAccess(page);

        const adminChip = page.locator(".perm-chip").filter({ hasText: "Admins" });

        await expect(adminChip).not.toBeVisible();
    });

    test("dragging a group to Read zone triggers save", async ({ page }) => {
        const { getPermissionCalls } = await setupPermissionApi(page);

        await openGroupAccess(page);

        const percussionChip = page.locator(".perm-chip").filter({ hasText: "Percussion" });
        const readZone = page.locator(".perm-drop-zone").first();

        await percussionChip.dragTo(readZone);

        await expect.poll(() => {
            return getPermissionCalls().length;
        }).toBeGreaterThan(0);
        await expect(readZone.locator(".perm-chip").filter({ hasText: "Percussion" })).toBeVisible();
    });
});
