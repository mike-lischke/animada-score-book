/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

/** The number of fonts the catalogue ships. */
const shippedFontCount = 7;

/**
 * Opens the app on a one-bar score in the staff view.
 *
 * @param page The page to drive.
 * @param sessionId The session the score is seeded into.
 */
const openScore = async (page: Page, sessionId: string): Promise<void> => {
    const stepResolution = 16;
    const snapshot = {
        version: arrangementSnapshotVersion,
        title: "E2E music font",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution },
        tracks: [{
            id: 100,
            instrumentId: "1",
            measures: [{
                number: 1,
                meter: {
                    beats: 4,
                    beatUnits: 4,
                    stepResolution,
                    beatGroups: new Array<number>(4).fill(stepResolution / 4),
                },
                events: [
                    {
                        start: { numerator: 0, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    },
                    { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
                ],
                subdivisions: [],
            }],
        }],
    };

    await page.addInitScript(({ packed, id }: { packed: string; id: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: id }, "");
        window.sessionStorage.setItem("asb-session-id", id);
        window.localStorage.setItem(`asb-ui-settings-session-${id}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), id: sessionId });

    await page.goto("/");
    await expect(page.locator(".staff-prefix-time-signature")).toBeVisible();
};

/**
 * @param page The page to read from.
 *
 * @returns The font family the score's time signature is drawn with.
 */
const timeSignatureFontFamily = (page: Page): Promise<string> => {
    return page.evaluate(() => {
        const glyph = document.querySelector(".staff-prefix-time-signature .smufl-glyph-view");

        return glyph === null ? "" : getComputedStyle(glyph).fontFamily;
    });
};

test.describe("SMuFL music font", () => {
    test("offers every shipped font with a sample and a licence", async ({ page }) => {
        await openScore(page, "e2e-smufl-font-picker");

        await page.locator('[data-tutorial="display-options"]').click();
        await expect(page.locator("#settingsDialog")).toBeVisible();

        await page.locator("#settingsDialog .music-font-dropdown button").click();

        const items = page.locator("#settingsDialog .music-font-dropdown .dropdown-popup li");
        await expect(items).toHaveCount(shippedFontCount);

        // Every entry shows its name and a sample that draws the font's own glyphs on two staff lines.
        await expect(items.first()).toContainText("Bravura");
        await expect(items.first().locator(".music-font-sample .smufl-glyph-view")).toHaveCount(6);
        await expect(items.first().locator(".music-font-sample-staff line")).toHaveCount(2);

        // The picker has to be closed again, because its popover covers the info button.
        await page.locator("#settingsDialog .music-font-dropdown button").click();
        await expect(page.locator("#settingsDialog .music-font-dropdown .dropdown-popup")).toBeHidden();

        await page.locator(".music-font-info-button").hover();
        await expect(page.locator("#musicFontInfo")).toBeVisible();
        await expect(page.locator("#musicFontInfo")).toContainText("OFL-1.1");
    });

    test("draws the score with the picked font, also after a reload", async ({ page }) => {
        await openScore(page, "e2e-smufl-font-choice");

        expect(await timeSignatureFontFamily(page)).toContain("Bravura");

        await page.locator('[data-tutorial="display-options"]').click();
        await page.locator("#settingsDialog .music-font-dropdown button").click();
        await page.locator("#settingsDialog .music-font-dropdown .dropdown-popup li")
            .filter({ hasText: "Leipzig" }).click();

        // The font is previewed while the dialog is open.
        await expect.poll(() => {
            return timeSignatureFontFamily(page);
        }).toContain("Leipzig");

        await page.locator("#settings-button-save").click();
        await expect(page.locator("#settingsDialog")).toBeHidden();

        // Waiting for the reload proves that the choice survives a restart, not just the session.
        await page.reload();
        await expect(page.locator(".staff-prefix-time-signature")).toBeVisible();

        expect(await timeSignatureFontFamily(page)).toContain("Leipzig");
    });
});
