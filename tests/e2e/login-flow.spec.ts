/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";
import { routeApi, setupAnonymousSession } from "./e2e-test-helpers.js";

test.describe("Login Flow", () => {
    test.beforeEach(async ({ page }) => {
        await routeApi(page);
        // Override with an anonymous session, which starts the app as a demo.
        await setupAnonymousSession(page);
    });

    test("opens a demo on the first visit instead of asking for a login", async ({ page }) => {
        await page.goto("/");

        await expect(page.locator("#appRoot")).toBeVisible();
        await expect(page.locator("#demoScoresButton")).toBeVisible();
        await expect(page.locator("#signInButton")).toBeVisible();
        await expect(page.locator("#loginDialog")).not.toBeVisible();
    });

    test("signing in opens the login dialog over the splash screen", async ({ page }) => {
        await page.goto("/");
        await page.locator("#signInButton").click();

        const splash = page.locator("#splashScreen");
        await expect(splash).toBeVisible();
        await expect(splash).toHaveClass(/splash-visible/);

        // Verify the splash ::before (background SVG) and ::after (logo) are present.
        const beforeStyle = await splash.evaluate((el) => {
            return getComputedStyle(el, "::before").maskImage;
        });
        expect(beforeStyle).toContain("percussion-background.svg");

        const afterStyle = await splash.evaluate((el) => {
            return getComputedStyle(el, "::after").backgroundImage;
        });
        expect(afterStyle).toContain("logo.svg");

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();
        await expect(loginDialog.locator("#login-email")).toBeVisible();
        await expect(loginDialog.locator("#login-password")).toBeVisible();
        await expect(loginDialog.locator("#login-button-demo")).toBeVisible();
        await expect(loginDialog.locator("#login-button-login")).toBeVisible();
        await expect(loginDialog.locator("#login-button-demo")).toHaveText("Demo");
        await expect(loginDialog.locator("#login-button-login")).toHaveText("Log In");
    });

    test("cancelling the login keeps the demo running", async ({ page }) => {
        await page.goto("/");
        await page.locator("#signInButton").click();
        await page.locator("#login-button-demo").click();

        await expect(page.locator("#loginDialog")).not.toBeVisible();
        await expect(page.locator("#splashScreen")).not.toHaveClass(/splash-visible/);
        await expect(page.locator("#demoScoresButton")).toBeVisible();
    });

    test("successful login closes dialog and shows app", async ({ page }) => {
        await page.route("**/api?action=login", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    token: "e2e-test-token",
                    user: { id: 1, email: "admin@example.com", displayName: "Administrator", isAdmin: true },
                    capabilities: {
                        canEditScores: true, canManageUsers: true,
                        canManageInstruments: true, canExportMP3: true,
                    },
                }),
            });
        });

        await page.goto("/");
        await page.locator("#signInButton").click();

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();
        await loginDialog.locator("#login-email").fill("admin@example.com");
        await loginDialog.locator("#login-password").fill("admin");
        await loginDialog.locator("#login-button-login").click();

        await expect(page.locator("#loginDialog")).not.toBeVisible();
        await expect(page.locator("#appRoot")).toBeVisible();
        await expect(page.locator("#userMenu")).toBeVisible();
        await expect(page.locator("#signInButton")).toHaveCount(0);
    });

    test("failed login shows error message", async ({ page }) => {
        await page.route("**/api?action=login", async (route) => {
            await route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({ error: "Invalid email address or password" }),
            });
        });

        await page.goto("/");
        await page.locator("#signInButton").click();

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();
        await loginDialog.locator("#login-email").fill("bad@example.com");
        await loginDialog.locator("#login-password").fill("wrong");
        await loginDialog.locator("#login-button-login").click();

        // Dialog stays open with error visible.
        await expect(page.locator("#loginDialog")).toBeVisible();
        await expect(loginDialog).toContainText("Invalid email address or password");
    });
});
