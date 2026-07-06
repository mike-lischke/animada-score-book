/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

interface IApiState {
    initialized: boolean;
    hasData: boolean;
    engine: string;
}

/**
 * Creates a mock route for the backend API with a given initial state.
 *
 * @param page The Playwright page to install the route on.
 * @param state Initial API state (initialized, hasData, engine).
 */
const routeApiWithState = async (page: Page, state: IApiState): Promise<void> => {
    let { initialized, hasData } = state;

    await page.route("**/api**", async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");

        if (action === "health") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    status: "ok", initialized, engine: state.engine, hasData,
                    configLoaded: true, host: "127.0.0.1", port: 3306, database: "animada_score_book",
                }),
            });

            return;
        }

        if (action === "setup") {
            initialized = true;
            hasData = true;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true }),
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

        if (action === "listSoundLib") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });

            return;
        }

        await route.fulfill({
            status: 200, contentType: "application/json", body: JSON.stringify({
                success: true,
                id: 1
            })
        });
    });
};

// ── Rendering ──

test.describe("Setup Dialog rendering", () => {
    test.beforeEach(async ({ page }) => {
        await routeApiWithState(page, { initialized: false, hasData: false, engine: "mysql" });
    });

    test("renders the setup form correctly", async ({ page }) => {
        await page.goto("/");
        await page.waitForSelector("#backendSetupDialog", { state: "visible", timeout: 5000 });

        await expect(page.locator("#backendSetupDialog")).toBeVisible();
        await expect(page.locator("#backendSetupDialog")).toContainText("Backend Setup");
        await expect(page.locator("#backendSetupDialog")).toContainText("Engine");
        await expect(page.locator("#backendSetupDialog")).toContainText("Host");
        await expect(page.locator("#backendSetupDialog")).toContainText("Port");
        await expect(page.locator("#backendSetupDialog")).toContainText("Database");
        await expect(page.locator("#backend-setup-init")).toBeVisible();
    });
});

// ── Scenario: No DB ──

test.describe("Setup: no database", () => {
    test.beforeEach(async ({ page }) => {
        await routeApiWithState(page, { initialized: false, hasData: false, engine: "mysql" });
    });

    test("shows setup form when backend is not initialised", async ({ page }) => {
        await page.goto("/");
        await page.waitForSelector("#backendSetupDialog", { state: "visible", timeout: 5000 });

        await expect(page.locator("#backendSetupDialog")).toBeVisible();
        await expect(page.locator("#backendSetupDialog")).toContainText("Backend Setup");
    });

    test("initialize completes setup flow", async ({ page }) => {
        await page.goto("/");
        await page.waitForSelector("#backendSetupDialog", { state: "visible", timeout: 5000 });

        await page.click("#backend-setup-init");
        await page.waitForTimeout(1500);

        await expect(page.locator("#backendSetupDialog")).toContainText("Database setup complete");

        await page.click("#backend-setup-close");
        await page.waitForTimeout(2000);

        // After setup with no users, the AdminSetup dialog appears on the splash screen.
        await expect(page.locator("#adminSetupDialog")).toBeVisible({ timeout: 10000 });
    });
});

// ── Scenario: DB exists, empty (fresh start → Initialize → setup completes) ──

test.describe("Setup: fresh start, database exists but empty", () => {
    test("initializes without overwrite prompt when DB is empty", async ({ page }) => {
        let healthCalls = 0;

        await page.route("**/api**", async (route) => {
            const url = new URL(route.request().url());
            const action = url.searchParams.get("action");

            if (action === "health") {
                healthCalls++;
                const initialized = healthCalls >= 3;

                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({
                        status: "ok", initialized, engine: "mysql",
                        hasData: false, hasUsers: false,
                        configLoaded: true, host: "127.0.0.1", port: 3306,
                        database: "animada_score_book",
                    }),
                });

                return;
            }

            if (action === "listScoreFolderContent") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({ folders: [], scores: [] })
                });

                return;
            }

            if (action === "listSoundLib") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify([])
                });

                return;
            }

            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ success: true, id: 1 })
            });
        });

        await page.goto("/");
        await page.waitForSelector("#backendSetupDialog", { state: "visible", timeout: 5000 });
        await expect(page.locator("#backendSetupDialog")).toContainText("Engine");

        // Click Initialize → health says initialized but empty → no overwrite → Done.
        await page.click("#backend-setup-init");
        await page.waitForTimeout(1500);
        await expect(page.locator("#backendSetupDialog")).toContainText("Database setup complete");

        await page.click("#backend-setup-close");
        await page.waitForTimeout(2000);
        await expect(page.locator("#adminSetupDialog")).toBeVisible({ timeout: 10000 });
    });
});

// ── Scenario: DB exists, has data (initial mode — Initialize works directly) ──

test.describe("Setup: fresh start, database has data", () => {
    test("initializes without overwrite prompt in initial mode", async ({ page }) => {
        let healthCalls = 0;

        await page.route("**/api**", async (route) => {
            const url = new URL(route.request().url());
            const action = url.searchParams.get("action");

            if (action === "health") {
                healthCalls++;
                const initialized = healthCalls >= 3;

                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({
                        status: "ok", initialized, engine: "mysql",
                        hasData: initialized, hasUsers: initialized,
                        configLoaded: true, host: "127.0.0.1", port: 3306,
                        database: "animada_score_book",
                    }),
                });

                return;
            }

            if (action === "listScoreFolderContent") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({ folders: [], scores: [] })
                });

                return;
            }

            if (action === "listSoundLib") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify([])
                });

                return;
            }

            // No session cookie — refresh returns 401, whoami returns anonymous.
            if (action === "refresh") {
                await route.fulfill({
                    status: 401, contentType: "application/json",
                    body: JSON.stringify({ error: "No refresh token" })
                });

                return;
            }

            if (action === "whoami") {
                await route.fulfill({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({
                        authenticated: false,
                        capabilities: {
                            canEditScores: false, canManageUsers: false,
                            canManageInstruments: false, canExportMP3: false
                        }
                    })
                });

                return;
            }

            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({ success: true, id: 1 })
            });
        });

        await page.goto("/");
        await page.waitForSelector("#backendSetupDialog", { state: "visible", timeout: 5000 });
        await expect(page.locator("#backendSetupDialog")).toContainText("Engine");

        // Click Initialize — in initial mode this goes directly to setup without overwrite prompt.
        await page.click("#backend-setup-init");
        await page.waitForTimeout(1500);
        await expect(page.locator("#backendSetupDialog")).toContainText("Database setup complete");

        await page.click("#backend-setup-close");
        await page.waitForTimeout(2000);

        // After setup with existing users but no session, the login dialog appears.
        await expect(page.locator("#loginDialog")).toBeVisible({ timeout: 10000 });
    });
});

// ── Unreachable ──

test.describe("Setup: backend unreachable", () => {
    test("shows progress indicator when backend is unreachable", async ({ page }) => {
        await page.route("**/api**", async (route) => {
            await route.fulfill({ status: 502, contentType: "text/plain", body: "Bad Gateway" });
        });

        await page.goto("/");

        // The app stays on the splash screen with a progress indicator.
        await expect(page.locator(".progressIndicatorCard")).toBeVisible({ timeout: 5000 });
    });
});
