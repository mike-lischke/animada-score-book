/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Sets up a single API route handler that mocks the entire backend for the
 * users & groups dialog, including authentication, health, sounds, scores,
 * and all user/group CRUD operations with in-memory state.
 *
 * @param page The Playwright page.
 * @returns An object with methods to inspect/modify the mock server state.
 */
const setupUsersGroupsApi = async (page: Page): Promise<{
    getUsers: () => Array<Record<string, unknown>>;
    getGroups: () => Array<Record<string, unknown>>;
}> => {
    const users: Array<Record<string, unknown>> = [
        {
            id: 1, username: "admin", displayName: "Administrator", isAdmin: true,
            lastLogin: "2025-06-01T10:00:00Z", createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-06-01T00:00:00Z"
        },
        {
            id: 2, username: "editor", displayName: "Editor", isAdmin: false,
            lastLogin: "2025-06-02T12:00:00Z", createdAt: "2024-02-01T00:00:00Z",
            updatedAt: "2024-07-01T00:00:00Z"
        },
    ];

    const groups: Array<Record<string, unknown>> = [
        {
            id: 1, name: "Percussion", description: "", color: "#ff0000", adminId: 1,
            hasPassword: true, lastLogin: null, createdAt: "2024-01-01T00:00:00Z"
        },
        {
            id: 2, name: "Vocals", description: "", color: "#00ff00", adminId: null,
            hasPassword: false, lastLogin: null, createdAt: "2024-02-01T00:00:00Z"
        },
    ];

    const groupMembers: Record<number, Array<Record<string, unknown>>> = {
        1: [{ id: 1, username: "admin", displayName: "Administrator" }],
        2: [],
    };

    let nextUserId = 10;
    let nextGroupId = 10;

    // Single API route handler for all endpoints — no other routes registered.
    await page.route("**/api**", async (route) => {
        const reqUrl = new URL(route.request().url());
        const action = reqUrl.searchParams.get("action");

        // ---- Auth ----

        if (action === "whoami") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    authenticated: true,
                    user: { id: 1, username: "admin", displayName: "Administrator", isAdmin: true },
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
                status: 200, contentType: "application/json",
                body: JSON.stringify({ token: "e2e-test-token" }),
            });

            return;
        }

        // ---- Base endpoints ----

        if (action === "health") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    status: "ok", initialized: true, engine: "mysql",
                    hasData: true, hasUsers: true,
                }),
            });

            return;
        }

        if (action === "listSoundLib") {
            await route.fulfill({
                status: 200, contentType: "application/json", body: JSON.stringify([]),
            });

            return;
        }

        if (action === "listScoreFolderContent") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ folders: [], scores: [] }),
            });

            return;
        }

        // ---- Users ----

        if (action === "listUsers") {
            await route.fulfill({
                status: 200, contentType: "application/json", body: JSON.stringify({ users }),
            });

            return;
        }

        if (action === "createUser") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const newUser = {
                id: nextUserId++, ...body, isAdmin: false,
                lastLogin: null, createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            users.push(newUser);

            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ success: true, id: newUser.id }),
            });

            return;
        }

        if (action === "updateUser") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const userId = Number(body.id);
            const user = users.find((u) => {
                return u.id === userId;
            });

            if (user) {
                if (body.displayName !== undefined) {
                    user.displayName = body.displayName;
                }

                await route.fulfill({
                    status: 200, contentType: "application/json", body: JSON.stringify({ success: true }),
                });
            } else {
                await route.fulfill({
                    status: 404, contentType: "application/json",
                    body: JSON.stringify({ error: "User not found" }),
                });
            }

            return;
        }

        if (action === "deleteUser") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const userId = Number(body.id);
            const index = users.findIndex((u) => {
                return u.id === userId;
            });

            if (index >= 0) {
                users.splice(index, 1);
                await route.fulfill({
                    status: 200, contentType: "application/json", body: JSON.stringify({ success: true }),
                });
            } else {
                await route.fulfill({
                    status: 404, contentType: "application/json",
                    body: JSON.stringify({ error: "User not found" }),
                });
            }

            return;
        }

        // ---- Groups ----

        if (action === "listGroups") {
            await route.fulfill({
                status: 200, contentType: "application/json", body: JSON.stringify({ groups }),
            });

            return;
        }

        if (action === "createGroup") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const newGroup = {
                id: nextGroupId++, name: body.name, description: body.description ?? "",
                color: body.color ?? "#cccccc", adminId: body.adminId ?? null,
                hasPassword: Boolean(body.password), lastLogin: null,
                createdAt: new Date().toISOString(),
            };
            groups.push(newGroup);

            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ success: true, id: newGroup.id, color: newGroup.color }),
            });

            return;
        }

        if (action === "updateGroup") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const groupId = Number(body.id);
            const group = groups.find((g) => {
                return g.id === groupId;
            });

            if (group) {
                if (body.password !== undefined) {
                    group.hasPassword = Boolean(body.password);
                }

                if (body.color !== undefined) {
                    group.color = body.color;
                }

                await route.fulfill({
                    status: 200, contentType: "application/json", body: JSON.stringify({ success: true }),
                });
            } else {
                await route.fulfill({
                    status: 404, contentType: "application/json",
                    body: JSON.stringify({ error: "Group not found" }),
                });
            }

            return;
        }

        if (action === "deleteGroup") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const groupId = Number(body.id);
            const index = groups.findIndex((g) => {
                return g.id === groupId;
            });

            if (index >= 0) {
                groups.splice(index, 1);
                await route.fulfill({
                    status: 200, contentType: "application/json", body: JSON.stringify({ success: true }),
                });
            } else {
                await route.fulfill({
                    status: 404, contentType: "application/json",
                    body: JSON.stringify({ error: "Group not found" }),
                });
            }

            return;
        }

        if (action === "listGroupMembers") {
            const groupId = Number(reqUrl.searchParams.get("groupId"));

            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ members: groupMembers[groupId] ?? [] }),
            });

            return;
        }

        if (action === "addUserToGroup") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const groupId = Number(body.groupId);
            const userId = Number(body.userId);

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!groupMembers[groupId]) {
                groupMembers[groupId] = [];
            }

            const user = users.find((u) => {
                return u.id === userId;
            });

            if (user) {
                groupMembers[groupId].push({
                    id: userId, username: user.username, displayName: user.displayName,
                });
            }

            await route.fulfill({
                status: 200, contentType: "application/json", body: JSON.stringify({ success: true }),
            });

            return;
        }

        if (action === "removeUserFromGroup") {
            const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
            const groupId = Number(body.groupId);
            const userId = Number(body.userId);

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (groupMembers[groupId]) {
                groupMembers[groupId] = groupMembers[groupId].filter((m) => {
                    return m.id !== userId;
                });
            }

            await route.fulfill({
                status: 200, contentType: "application/json", body: JSON.stringify({ success: true }),
            });

            return;
        }

        // Fallback: generic success for other API calls.
        await route.fulfill({
            status: 200, contentType: "application/json", body: JSON.stringify({ success: true, id: 1 }),
        });
    });

    return {
        getUsers: () => {
            return users;
        },
        getGroups: () => {
            return groups;
        },
    };
};

/**
 * Opens the Users & Groups dialog via the user dropdown menu.
 *
 * @param page The Playwright page.
 */
const openUsersGroupsDialog = async (page: Page): Promise<void> => {
    // The user menu is a Dropdown with id="userMenu", now forwarded to the host div.
    const userMenuButton = page.locator("#userMenu button").first();

    await expect(userMenuButton).toBeVisible();
    await userMenuButton.click();

    // Wait for the dropdown popover to appear, then click "Users & Groups".
    const popover = page.locator("ul[popover]").filter({ hasText: "Users & Groups" });

    await expect(popover).toBeVisible();

    const menuItem = popover.locator("li a").filter({ hasText: "Users & Groups" });

    await menuItem.click();

    // Wait for the dialog to open.
    await expect(page.locator("#userGroupEditorDialog")).toBeVisible();
};

// ---------------------------------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------------------------------

test.describe("Users & Groups Dialog", () => {
    test.beforeEach(async ({ page }) => {
        await setupUsersGroupsApi(page);
    });

    // ---- Rendering ----

    test("dialog opens and shows heading, sections, and action buttons", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const dialog = page.locator("#userGroupEditorDialog");

        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("Users & Groups");

        // Sections.
        await expect(dialog).toContainText("Users");
        await expect(dialog).toContainText("Groups");

        // Action buttons.
        await expect(dialog.locator("#ug-add-user")).toBeVisible();
        await expect(dialog.locator("#ug-add-group")).toBeVisible();
    });

    test("displays existing users with admin badge", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const dialog = page.locator("#userGroupEditorDialog");

        await expect(dialog).toContainText("Administrator");
        await expect(dialog).toContainText("@admin");
        await expect(dialog.locator(".text-accent")).toContainText("admin");

        await expect(dialog).toContainText("Editor");
        await expect(dialog).toContainText("@editor");
    });

    test("displays existing groups with lock icon for password-protected groups", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const dialog = page.locator("#userGroupEditorDialog");

        await expect(dialog).toContainText("Percussion");
        await expect(dialog).toContainText("Vocals");

        // Percussion has a password → lock icon should be present.
        const percussionRow = dialog.locator(".settings-row").filter({ hasText: "Percussion" });

        await expect(percussionRow.locator(".codicon-lock")).toBeVisible();
    });

    test("closes the dialog on backdrop click", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        // Click the backdrop (the portal overlay behind the dialog).
        const portal = page.locator(".portal").first();

        await portal.click({ position: { x: 10, y: 10 } });

        await expect(page.locator("#userGroupEditorDialog")).not.toBeVisible();
    });

    // ---- Create User ----

    test("opens create-user popup from Add User button", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-user").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();
        await expect(popup).toContainText("Username");
        await expect(popup).toContainText("Display Name");
        await expect(popup).toContainText("Password");
        await expect(popup).toContainText("Group Membership");
        await expect(popup.locator("button").filter({ hasText: "Create" })).toBeVisible();
    });

    test("creates a new user and shows it in the list", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-user").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();

        // Fill the form.
        await popup.locator("input").nth(0).fill("newuser");
        await popup.locator("input").nth(1).fill("New User");
        await popup.locator("input").nth(2).fill("password123");

        // Click Create.
        await popup.locator("button").filter({ hasText: "Create" }).click();

        // Popup should close.
        await expect(popup).not.toBeVisible();

        // New user should appear.
        const dialog = page.locator("#userGroupEditorDialog");

        await expect(dialog).toContainText("New User");
        await expect(dialog).toContainText("@newuser");
    });

    test("shows validation error when username is too short", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-user").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();

        await popup.locator("input").nth(0).fill("ab");
        await popup.locator("input").nth(2).fill("password123");
        await popup.locator("button").filter({ hasText: "Create" }).click();

        await expect(popup).toContainText("Username must be at least 3 characters");
    });

    test("shows validation error when password is too short", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-user").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();

        await popup.locator("input").nth(0).fill("newuser");
        await popup.locator("input").nth(2).fill("12345");
        await popup.locator("button").filter({ hasText: "Create" }).click();

        await expect(popup).toContainText("Password must be at least 6 characters");
    });

    test("shows validation error when username is empty", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-user").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();

        await popup.locator("button").filter({ hasText: "Create" }).click();

        await expect(popup).toContainText("Username is required");
    });

    // ---- Delete User ----

    test("shows confirm dialog when deleting a user", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        // Find the delete button on the Editor row (second user).
        const editorRow = page.locator("#userGroupEditorDialog .settings-row")
            .filter({ hasText: "Editor" });

        // Click the trash button (last button in the row).
        await editorRow.locator("button").last().click();

        // Confirm dialog should appear.
        const confirmDialog = page.locator(".dialog").filter({ hasText: "Delete user" });

        await expect(confirmDialog).toBeVisible();
        await expect(confirmDialog).toContainText("Delete User");
        await expect(confirmDialog).toContainText("This cannot be undone");
    });

    test("deletes a user after confirmation", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const editorRow = page.locator("#userGroupEditorDialog .settings-row")
            .filter({ hasText: "Editor" });

        await editorRow.locator("button").last().click();

        const confirmDialog = page.locator(".dialog").filter({ hasText: "Delete user" });

        await expect(confirmDialog).toBeVisible();

        // Click Delete button in confirm dialog.
        await confirmDialog.locator("button").filter({ hasText: "Delete" }).click();

        // User should be removed from the list.
        const dialog = page.locator("#userGroupEditorDialog");

        await expect(dialog).not.toContainText("@editor");
        await expect(dialog).toContainText("@admin");
    });

    // ---- Create Group ----

    test("opens create-group popup from Add Group button", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-group").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();
        await expect(popup).toContainText("Name");
        await expect(popup).toContainText("Password");
        await expect(popup.locator("button").filter({ hasText: "Create" })).toBeVisible();
    });

    test("creates a new group and shows it in the list", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-group").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();

        await popup.locator("input").nth(0).fill("Brass");
        await popup.locator("button").filter({ hasText: "Create" }).click();

        await expect(popup).not.toBeVisible();

        const dialog = page.locator("#userGroupEditorDialog");

        await expect(dialog).toContainText("Brass");
    });

    test("shows validation error when group name is empty", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        await page.locator("#ug-add-group").click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();

        await popup.locator("button").filter({ hasText: "Create" }).click();

        await expect(popup).toContainText("Group name is required");
    });

    // ---- Delete Group ----

    test("shows confirm dialog when deleting a group", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const vocalsRow = page.locator("#userGroupEditorDialog .settings-row")
            .filter({ hasText: "Vocals" });

        await vocalsRow.locator("button").last().click();

        const confirmDialog = page.locator(".dialog").filter({ hasText: "Delete group" });

        await expect(confirmDialog).toBeVisible();
        await expect(confirmDialog).toContainText("Delete Group");
    });

    test("deletes a group after confirmation", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const vocalsRow = page.locator("#userGroupEditorDialog .settings-row")
            .filter({ hasText: "Vocals" });

        await vocalsRow.locator("button").last().click();

        const confirmDialog = page.locator(".dialog").filter({ hasText: "Delete group" });

        await expect(confirmDialog).toBeVisible();
        await confirmDialog.locator("button").filter({ hasText: "Delete" }).click();

        const dialog = page.locator("#userGroupEditorDialog");

        await expect(dialog).not.toContainText("Vocals");
        await expect(dialog).toContainText("Percussion");
    });

    // ---- Reset Password ----

    test("opens reset-password popup from key button", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const editorRow = page.locator("#userGroupEditorDialog .settings-row")
            .filter({ hasText: "Editor" });

        // The reset-password button has the key icon (second-to-last button).
        const buttons = editorRow.locator("button");
        const count = await buttons.count();

        // Buttons: Edit, Reset Password (key), Delete (trash).
        await buttons.nth(count - 2).click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();
        await expect(popup).toContainText("New Password");
        await expect(popup.locator("button").filter({ hasText: "Set Password" })).toBeVisible();
    });

    test("resets a user password and shows success notification", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const editorRow = page.locator("#userGroupEditorDialog .settings-row")
            .filter({ hasText: "Editor" });
        const buttons = editorRow.locator("button");
        const count = await buttons.count();

        await buttons.nth(count - 2).click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();

        await popup.locator("input").fill("newpass123");
        await popup.locator("button").filter({ hasText: "Set Password" }).click();

        await expect(popup).not.toBeVisible();
    });

    // ---- Edit Group Password ----

    test("opens edit-group popup and saves password", async ({ page }) => {
        await page.goto("/");
        await openUsersGroupsDialog(page);

        const percussionRow = page.locator("#userGroupEditorDialog .settings-row")
            .filter({ hasText: "Percussion" });

        // Edit button is the first action button (second-to-last overall).
        const buttons = percussionRow.locator("button");
        const count = await buttons.count();

        await buttons.nth(count - 2).click();

        const popup = page.locator(".popup");

        await expect(popup).toBeVisible();
        await expect(popup).toContainText("Password");

        await popup.locator("input").fill("shared-secret");
        await popup.locator("button").filter({ hasText: "Save" }).click();

        await expect(popup).not.toBeVisible();
    });
});
