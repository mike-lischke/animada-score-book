/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

interface IScoreLibraryMockOptions {
    /** The status the score request answers with; 200 serves the arrangement the app stored for the session. */
    getScoreStatus?: number;
}

interface IScoreLibraryMock {
    /**
     * Sets the content the score request answers with.
     *
     * @param content The packed arrangement a load should receive.
     */
    setScoreContent: (content: string) => void;
}

/**
 * Sets up the backend for the score library: one score, one filterable tag and a signed-in administrator.
 *
 * @param page The Playwright page to set up routes on.
 * @param options Overrides for the score request.
 *
 * @returns The handles the tests need to steer the mocked backend.
 */
const setupLibraryApi = async (page: Page, options: IScoreLibraryMockOptions = {}): Promise<IScoreLibraryMock> => {
    let scoreContent = "";

    await page.route("**/api**", async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");

        if (action === "health") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    status: "ok", initialized: true, engine: "mysql", hasData: true, hasUsers: true,
                    configLoaded: true, host: "127.0.0.1", port: 3306, database: "animada_score_book",
                }),
            });

            return;
        }

        if (action === "whoami") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    authenticated: true,
                    user: { id: 1, email: "admin@example.com", displayName: "Administrator", isAdmin: true },
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
                status: 200, contentType: "application/json", body: JSON.stringify({ token: "test-token" }),
            });

            return;
        }

        if (action === "listSoundLib") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });

            return;
        }

        if (action === "listTags") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    tags: [
                        {
                            id: 7, name: "Caixa", colorIndex: 2, editable: false, assignable: true, usageCount: 1,
                            systemKind: "instrument", instrumentTypeId: "5",
                        },
                        {
                            id: 11, name: "Wettkampf", colorIndex: 4, editable: false, assignable: true,
                            usageCount: 1,
                        },
                    ],
                }),
            });

            return;
        }

        if (action === "listScores") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    scores: [{
                        id: 42, name: "Test Score", tagIds: [7, 11],
                        perm: { isOwner: true, canRead: true, canWrite: true, isWorld: true, groupIds: [] },
                    }],
                }),
            });

            return;
        }

        if (action === "listSetLists") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    setLists: [
                        {
                            id: 4, name: "Auftritt", tagId: 40, revision: 1, memberCount: 1, groups: [],
                            editable: true, managesAccess: true,
                        },
                    ],
                    readableScoreCount: 2,
                    canCreate: true,
                }),
            });

            return;
        }

        if (action === "getSetList") {
            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    id: 4, name: "Auftritt", tagId: 40, revision: 1, memberCount: 1, groups: [],
                    editable: true, managesAccess: true,
                    scores: [{
                        id: 43, name: "Set Score", tagIds: [40],
                        perm: { isOwner: true, canRead: true, canWrite: true, isWorld: false, groupIds: [] },
                    }],
                }),
            });

            return;
        }

        if (action === "getScore") {
            const status = options.getScoreStatus ?? 200;

            if (status !== 200) {
                await route.fulfill({
                    status, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }),
                });

                return;
            }

            await route.fulfill({
                status: 200, contentType: "application/json",
                body: JSON.stringify({
                    id: 42, name: "Test Score", content: scoreContent, tagIds: [7],
                    perm: { isOwner: true, canRead: true, canWrite: true, isWorld: true, groupIds: [] },
                }),
            });

            return;
        }

        await route.fulfill({
            status: 200, contentType: "application/json", body: JSON.stringify({ success: true, id: 42 }),
        });
    });

    return {
        setScoreContent: (content: string) => {
            scoreContent = content;
        },
    };
};

/** The localStorage prefix of the settings record a browser tab keeps; the current score is stored in one. */
const sessionSettingsPrefix = "asb-ui-settings-session-";

/**
 * @param page The Playwright page.
 *
 * @returns The arrangement the app stored for the session, which is readable score content. Waits until the app
 * saved it, which happens once the startup arrangement is in place.
 */
const currentScore = async (page: Page): Promise<string> => {
    const readStoredScore = (prefix: string): string => {
        const keys = Object.keys(localStorage).filter((key) => {
            return key.startsWith(prefix);
        });

        for (const key of keys) {
            const raw = localStorage.getItem(key);
            const settings = raw ? JSON.parse(raw) as { currentScore?: string; } : {};
            const score = settings.currentScore ?? "";

            if (score.length > 0) {
                return score;
            }
        }

        return "";
    };

    await page.waitForFunction(readStoredScore, sessionSettingsPrefix, { timeout: 10_000 });

    return await page.evaluate(readStoredScore, sessionSettingsPrefix);
};

test.describe("Score library modal", () => {
    test("opens as a dialog and shows the list", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();

        const dialog = page.locator("#scoreLibraryDialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute("role", "dialog");
        await expect(dialog).toHaveAttribute("aria-modal", "true");
        await expect(page.locator(".du-drawer")).toHaveCount(0);
        await expect(page.locator("#scoreCardsHost .score-card")).toHaveCount(1);
    });

    test("selects a set list pill and shows its saved order", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreLibraryDialog")).toBeVisible();

        const pills = page.locator(".set-list-pill");
        await expect(pills).toHaveCount(2);
        await expect(pills.nth(0)).toContainText("All Scores");
        await expect(pills.nth(0)).toHaveAttribute("aria-selected", "true");
        await expect(pills.nth(1)).toContainText("Auftritt");

        await page.locator("#set-list-tab-4").click();

        await expect(page.locator("#set-list-tab-4")).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#scoreCardsHost .score-card")).toHaveCount(1);
        await expect(page.locator("#scoreCardsHost .score-card")).toContainText("Set Score");

        // The sort selector keeps its place in the toolbar while a set list is active.
        await expect(page.locator(".set-list-bar")).toContainText("Sort:");
        await expect(page.locator("#scoreListSortOrder")).toBeVisible();

        await page.locator("#set-list-tab-all").click();

        await expect(page.locator("#scoreCardsHost .score-card")).toContainText("Test Score");
    });

    test("closes on Escape and gives the focus back to the library button", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreLibraryDialog")).toBeVisible();

        await page.keyboard.press("Escape");

        await expect(page.locator("#scoreLibraryDialog")).toHaveCount(0);
        await expect(page.locator("#scoreLibraryButton")).toBeFocused();
    });

    test("closes on a click beside the dialog", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreLibraryDialog")).toBeVisible();

        await page.mouse.click(4, 4);

        await expect(page.locator("#scoreLibraryDialog")).toHaveCount(0);
    });

    test("keeps Tab inside the dialog", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();
        const dialog = page.locator("#scoreLibraryDialog");
        await expect(dialog).toBeVisible();

        for (let index = 0; index < 25; index++) {
            await page.keyboard.press("Tab");
        }

        const focusStaysInside = await dialog.evaluate((element) => {
            return element.contains(document.activeElement);
        });

        expect(focusStaysInside).toBe(true);
    });

    test("keeps the tag filter when the library is reopened", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();

        const input = page.locator("#scoreFilterGroup input");
        await input.fill("Caixa");
        await input.press("Enter");
        await expect(page.locator("#scoreFilterGroup")).toContainText("Caixa");

        // The first Escape closes the tag picker the focused field shows, the second one the library.
        await page.keyboard.press("Escape");
        await expect(page.locator(".tag-input-picker")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(page.locator("#scoreLibraryDialog")).toHaveCount(0);

        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreFilterGroup")).toContainText("Caixa");
    });

    test("filters by an instrument tag and counts the scores", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator(".score-filter-count")).toHaveText("1 score");

        const input = page.locator("#scoreFilterGroup input");
        await input.fill("Caixa");
        await input.press("Enter");

        await expect(page.locator("#scoreFilterGroup .tag-input-tag")).toHaveText("Caixa");
        await expect(page.locator(".score-filter-count")).toHaveText("1 score");
        // The instrument tag filters, but a card does not repeat it as a chip.
        await expect(page.locator(".score-card-tags")).toContainText("Wettkampf");
        await expect(page.locator(".score-card-tags")).not.toContainText("Caixa");
    });

    test("offers every tag as a pill when the filter field takes the focus", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();

        await page.locator("#scoreFilterGroup input").click();
        await expect(page.locator(".tag-input-picker-pill")).toHaveCount(2);

        // Picking a pill filters the list without typing anything.
        await page.locator(".tag-input-picker-pill").filter({ hasText: "Caixa" }).click();
        await expect(page.locator("#scoreFilterGroup .tag-input-tag")).toHaveText("Caixa");
    });

    test("offers a further tag group below a row and resets the filter", async ({ page }) => {
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();

        const first = page.locator("#scoreFilterGroup input");
        await first.fill("Caixa");
        await first.press("Enter");

        await page.locator(".score-filter-group-add").first().click();
        await expect(page.locator("#scoreFilterGroup-1")).toBeVisible();

        const second = page.locator("#scoreFilterGroup-1 input");
        await second.fill("Wettkampf");
        await second.press("Enter");

        await expect(page.locator("#scoreFilterGroup .tag-input-tag")).toHaveText("Caixa");
        await expect(page.locator("#scoreFilterGroup-1 .tag-input-tag")).toHaveText("Wettkampf");

        await page.locator("#scoreFilterReset").click();
        await expect(page.locator("#scoreFilterGroup-1")).toHaveCount(0);
        await expect(page.locator("#scoreFilterGroup .tag-input-tag")).toHaveCount(0);
        await expect(page.locator("#scoreFilterReset")).toHaveCount(0);
    });

    test("closes after loading a score", async ({ page }) => {
        const api = await setupLibraryApi(page);
        await page.goto("/");

        api.setScoreContent(await currentScore(page));

        await page.locator("#scoreLibraryButton").click();
        const entry = page.locator("#scoreCardsHost .score-card").first();
        await expect(entry).toBeVisible();

        await entry.locator(".score-card-open").click();

        await expect(page.locator("#scoreLibraryDialog")).toHaveCount(0);
    });

    test("stays open when the score cannot be read", async ({ page }) => {
        await setupLibraryApi(page, { getScoreStatus: 403 });
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();
        const entry = page.locator("#scoreCardsHost .score-card").first();
        await expect(entry).toBeVisible();

        await entry.locator(".score-card-open").click();

        await expect(page.locator("#scoreLibraryDialog")).toBeVisible();
    });

    test("fills nearly the whole small viewport and stays operable", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 720 });
        await setupLibraryApi(page);
        await page.goto("/");

        await page.locator("#scoreLibraryButton").click();
        await expect(page.locator("#scoreLibraryDialog")).toBeVisible();

        const box = await page.locator("#scoreLibraryDialog").boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(370);
        expect(box!.height).toBeGreaterThan(690);

        await expect(page.locator("#scoreListNewScore")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#scoreLibraryDialog")).toHaveCount(0);
    });
});
