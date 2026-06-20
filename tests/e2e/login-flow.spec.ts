/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";
import { routeApi, setupAnonymousSession } from "./helpers.js";

test.describe("Login Flow", () => {
    test.beforeEach(async ({ page }) => {
        await routeApi(page);
        // Override with anonymous session so the login dialog appears.
        await setupAnonymousSession(page);
    });

    test("login dialog appears on first visit", async ({ page }) => {
        await page.goto("/");

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();
        await expect(loginDialog.locator("#username")).toBeVisible();
        await expect(loginDialog.locator("#password")).toBeVisible();
        await expect(loginDialog.locator("#accept")).toBeVisible();
        await expect(loginDialog.locator("#cancel")).toBeVisible();
        await expect(loginDialog.locator("#accept")).toHaveText("Log In");
        await expect(loginDialog.locator("#cancel")).toHaveText("Continue Anonymously");
    });

    test("continue anonymously hides the login dialog", async ({ page }) => {
        await page.goto("/");

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();
        await loginDialog.locator("#cancel").click();
        await expect(page.locator("#appRoot")).toBeVisible();
    });

    test("successful login closes dialog and shows app", async ({ page }) => {
        await page.route("**/api?action=login", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    token: "e2e-test-token",
                    user: { id: 1, username: "admin", displayName: "Administrator", isAdmin: true },
                    capabilities: {
                        canEditScores: true, canManageUsers: true,
                        canManageInstruments: true, canExportMP3: true,
                    },
                }),
            });
        });

        await page.goto("/");

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();
        await loginDialog.locator("#username").fill("admin");
        await loginDialog.locator("#password").fill("admin");
        await loginDialog.locator("#accept").click();

        await expect(page.locator("#loginDialog")).not.toBeVisible();
        await expect(page.locator("#appRoot")).toBeVisible();
    });

    test("failed login shows error message", async ({ page }) => {
        await page.route("**/api?action=login", async (route) => {
            await route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({ error: "Invalid username or password" }),
            });
        });

        await page.goto("/");

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();
        await loginDialog.locator("#username").fill("bad");
        await loginDialog.locator("#password").fill("wrong");
        await loginDialog.locator("#accept").click();

        await expect(page.locator("#loginDialog")).toBeVisible();
        await expect(loginDialog.locator(".text-error")).toBeVisible();
    });
});
