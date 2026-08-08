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

    test("login dialog appears on first visit with splash screen visible", async ({ page }) => {
        await page.goto("/");

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
        await expect(loginDialog.locator("#login-username")).toBeVisible();
        await expect(loginDialog.locator("#login-password")).toBeVisible();
        await expect(loginDialog.locator("#login-button-anonymous")).toBeVisible();
        await expect(loginDialog.locator("#login-button-login")).toBeVisible();
        await expect(loginDialog.locator("#login-button-anonymous")).toHaveText("Continue Anonymously");
        await expect(loginDialog.locator("#login-button-login")).toHaveText("Log In");
    });

    test("splash screen fades out after continuing anonymously", async ({ page }) => {
        await page.goto("/");

        const splash = page.locator("#splashScreen");
        await expect(splash).toBeVisible();
        await expect(splash).toHaveClass(/splash-visible/);

        await page.locator("#login-button-anonymous").click();

        // Splash should fade out — class removed, opacity animating to 0.
        await expect(splash).not.toHaveClass(/splash-visible/);
        await expect(page.locator("#appRoot")).toBeVisible();
    });

    test("typing into username and password fields updates input values", async ({ page }) => {
        const jsErrors: string[] = [];
        page.on("pageerror", (error) => {
            jsErrors.push(error.message);
        });

        await page.goto("/");

        const loginDialog = page.locator("#loginDialog");
        await expect(loginDialog).toBeVisible();

        const usernameInput = loginDialog.locator("#login-username");
        const passwordInput = loginDialog.locator("#login-password");

        // Verify no JS exceptions occurred during page load and dialog render.
        expect(jsErrors).toEqual([]);

        // Type character by character (simulates real user input, not .fill()).
        await usernameInput.click();
        await page.keyboard.type("testuser");
        await expect(usernameInput).toHaveValue("testuser");

        await passwordInput.click();
        await page.keyboard.type("secret123");
        await expect(passwordInput).toHaveValue("secret123");

        // Verify no errors during typing.
        expect(jsErrors).toEqual([]);
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
        await loginDialog.locator("#login-username").fill("admin");
        await loginDialog.locator("#login-password").fill("admin");
        await loginDialog.locator("#login-button-login").click();

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
        await loginDialog.locator("#login-username").fill("bad");
        await loginDialog.locator("#login-password").fill("wrong");
        await loginDialog.locator("#login-button-login").click();

        // Dialog stays open with error visible.
        await expect(page.locator("#loginDialog")).toBeVisible();
        await expect(loginDialog).toContainText("Invalid username or password");
    });
});
