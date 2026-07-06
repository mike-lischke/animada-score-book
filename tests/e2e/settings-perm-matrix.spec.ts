/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

test.describe("Settings — Permission Matrix Toggle", () => {
    test("toggling 'Show permission matrix' shows/hides the dot matrix", async ({ page }) => {
        // Single API handler — more specific routes override the wildcard.
        await page.route("**/api**", async (route) => {
            const url = new URL(route.request().url());
            const action = url.searchParams.get("action");

            if (action === "health") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({
                        status: "ok", initialized: true, engine: "mysql",
                        hasData: true, hasUsers: true,
                        configLoaded: true, host: "127.0.0.1", port: 3306,
                        database: "animada_score_book",
                    }),
                });

                return;
            }

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
                    body: JSON.stringify({ token: "test-token" }),
                });

                return;
            }

            if (action === "listSoundLib") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify([]),
                });

                return;
            }

            if (action === "listScoreFolderContent") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({
                        folders: [{
                            id: 1, parentid: -1, name: "My Folder", hasChildren: false,
                            perm: { isOwner: true, isGroup: false, isWorld: true, permBits: 492 },
                        }],
                        scores: [],
                    }),
                });

                return;
            }

            if (action === "listInstruments") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify([]),
                });

                return;
            }

            // Default fallback for unhandled actions.
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ success: true, id: 1 }),
            });
        });

        await page.goto("/");

        // Open the Score Library drawer.
        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreTreeHost")).toBeVisible({ timeout: 5000 });

        // The perm indicator should be visible by default (showPermMatrix defaults to true).
        const permIndicator = page.locator("#scoreTreeHost .permIndicator");
        await expect(permIndicator).toBeVisible({ timeout: 5000 });

        // Close the drawer via Escape so it doesn't intercept toolbar clicks.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // Open the Settings dialog.
        const gearButton = page.locator("[data-tooltip='Display Options']");
        await gearButton.click();
        await page.waitForSelector("#settingsDialog", { timeout: 5000 });

        // Uncheck "Show permission matrix".
        const checkbox = page.locator("#settingsDialog #showPermMatrix");
        await checkbox.uncheck();

        // Save and close.
        await page.locator("#settings-button-save").click();
        await page.waitForTimeout(300);

        // Reopen the drawer to verify the matrix is hidden.
        await page.locator("#scoreLibraryButton").click();
        await page.waitForTimeout(500);
        await expect(page.locator("#scoreTreeHost")).toBeVisible({ timeout: 5000 });

        // The perm indicator should now be hidden.
        await expect(permIndicator).not.toBeVisible({ timeout: 5000 });

        // Close drawer via Escape, reopen settings, re-enable.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        await gearButton.click();
        await page.waitForSelector("#settingsDialog", { timeout: 5000 });

        const checkbox2 = page.locator("#settingsDialog #showPermMatrix");
        await checkbox2.check();

        await page.locator("#settings-button-save").click();
        await page.waitForTimeout(300);

        // Reopen drawer to verify.
        await page.locator("#scoreLibraryButton").click();
        await page.waitForTimeout(500);
        await expect(page.locator("#scoreTreeHost")).toBeVisible({ timeout: 5000 });

        // The perm indicator should be visible again.
        await expect(permIndicator).toBeVisible({ timeout: 5000 });
    });
});
