/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";
import { setupAuthenticatedSession } from "./helpers.js";

/**
 * Sets up a dynamic API route mock that can be toggled between "connected" and "disconnected"
 * states at runtime.
 *
 * @param page The Playwright page to install the route on.
 * @returns An object with `disconnect()` and `reconnect()` methods.
 */
const routeApiToggleable = async (page: Page): Promise<{ disconnect: () => void; reconnect: () => void; }> => {
    let connected = true;

    await setupAuthenticatedSession(page);

    await page.route("**/api**", async (route) => {
        if (!connected) {
            await route.abort("connectionrefused");

            return;
        }

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
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([]),
            });

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

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, id: 1 }),
        });
    });

    return {
        disconnect: () => {
            connected = false;
        },
        reconnect: () => {
            connected = true;
        },
    };
};

test.describe("Backend disconnect handling", () => {
    let toggle: { disconnect: () => void; reconnect: () => void; };

    test.beforeEach(async ({ page }) => {
        toggle = await routeApiToggleable(page);
    });

    test("shows disconnect dialog when backend becomes unreachable", async ({ page }) => {
        await page.goto("/");

        // App should render normally with healthy backend.
        await expect(page.locator("#appRoot")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("#backendDisconnectedDialog")).not.toBeVisible();

        // Simulate backend going down.
        toggle.disconnect();

        // Open the score library sidebar.
        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreTreeHost")).toBeVisible({ timeout: 5000 });

        // Click "Add New Folder" — this opens the ValueDialog first.
        await page.locator("button[title='Add New Folder']").click();
        await expect(page.locator("#addFolderDialog")).toBeVisible({ timeout: 5000 });

        // Fill in a folder name.
        const nameInput = page.locator("#addFolderDialog input[type='text']").first();
        await nameInput.fill("Test Folder");

        // Click the accept button to trigger addScoreFolder → fetchApi → disconnect.
        await page.locator("#addFolderDialog #accept").click();

        // The disconnect dialog should appear.
        await expect(page.locator("#backendDisconnectedDialog")).toBeVisible({ timeout: 5000 });
        await expect(page.locator("#backendDisconnectedDialog")).toContainText("Backend Connection Lost");
    });

    test("auto-reconnects and dismisses the dialog when backend returns", async ({ page }) => {
        await page.goto("/");

        await expect(page.locator("#appRoot")).toBeVisible({ timeout: 10000 });

        // Trigger disconnect.
        toggle.disconnect();

        // Open score library and try to add a folder to trigger the error.
        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreTreeHost")).toBeVisible({ timeout: 5000 });

        await page.locator("button[title='Add New Folder']").click();
        await expect(page.locator("#addFolderDialog")).toBeVisible({ timeout: 5000 });

        const nameInput = page.locator("#addFolderDialog input[type='text']").first();
        await nameInput.fill("Test Folder");
        await page.locator("#addFolderDialog #accept").click();

        // Wait for the disconnect dialog.
        await expect(page.locator("#backendDisconnectedDialog")).toBeVisible({ timeout: 5000 });
        await expect(page.locator("#backendDisconnectedDialog")).toContainText("Backend Connection Lost");
        await expect(page.locator("#backendDisconnectedDialog")).toContainText("Reconnecting…");

        // Simulate backend coming back.
        toggle.reconnect();

        // The dialog should auto-dismiss after the reconnect polling succeeds.
        // The dialog polls every 3 seconds, then shows success for 1.5 seconds before closing.
        await expect(page.locator("#backendDisconnectedDialog")).not.toBeVisible({ timeout: 15000 });

        // The app should still be functional.
        await expect(page.locator("#appRoot")).toBeVisible();
    });

    test("recovers after disconnect and allows retrying the failed action", async ({ page }) => {
        await page.goto("/");

        await expect(page.locator("#appRoot")).toBeVisible({ timeout: 10000 });

        // Trigger disconnect.
        toggle.disconnect();

        // Open score library and try to add a folder.
        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreTreeHost")).toBeVisible({ timeout: 5000 });

        await page.locator("button[title='Add New Folder']").click();
        await expect(page.locator("#addFolderDialog")).toBeVisible({ timeout: 5000 });

        const nameInput = page.locator("#addFolderDialog input[type='text']").first();
        await nameInput.fill("Test Folder");
        await page.locator("#addFolderDialog #accept").click();

        // Disconnect dialog appears.
        await expect(page.locator("#backendDisconnectedDialog")).toBeVisible({ timeout: 5000 });

        // Reconnect.
        toggle.reconnect();

        // Wait for the dialog to dismiss.
        await expect(page.locator("#backendDisconnectedDialog")).not.toBeVisible({ timeout: 15000 });

        // Now retry adding a folder — it should work this time.
        await page.locator("button[title='Add New Folder']").click();
        await expect(page.locator("#addFolderDialog")).toBeVisible({ timeout: 5000 });

        const retryInput = page.locator("#addFolderDialog input[type='text']").first();
        await retryInput.fill("Recovered Folder");
        await page.locator("#addFolderDialog #accept").click();

        // The dialog should close (accept was clicked) and no disconnect dialog should appear.
        await expect(page.locator("#addFolderDialog")).not.toBeVisible({ timeout: 3000 });
        await expect(page.locator("#backendDisconnectedDialog")).not.toBeVisible();

        // App should still be running.
        await expect(page.locator("#appRoot")).toBeVisible();
    });
});
