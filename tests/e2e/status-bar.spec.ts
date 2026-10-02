/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot, ITrackPieceSnapshot } from "../../src/core/types/general.js";
import { beijaFlorImportPath, expectImportedPolyrhythmSong, routeApi } from "./e2e-test-helpers.js";

const meter = { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] };

/**
 * @param number The 1-based measure number.
 *
 * @returns The bar of a whole rest.
 */
const restPiece = (number: number): ITrackPieceSnapshot => {
    return {
        number,
        meter,
        events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
        subdivisions: [],
    };
};

/**
 * @returns The snapshot of three bars of whole rests at 120 bpm, the second of them repeated once.
 */
const repeatedSnapshot = (): IArrangementSnapshot => {
    return {
        version: arrangementSnapshotVersion,
        title: "E2E status bar repeat",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 3, pulse: "1/4", stepResolution: 16 },
        tracks: [{ id: 300, instrumentId: "0", measures: [restPiece(1), restPiece(2), restPiece(3)] }],
        extensions: { repeatBars: { 2: { start: true, end: true } } },
    };
};

/**
 * Loads a score into the app through the session settings the app restores on start.
 *
 * @param page The page under test.
 * @param score The score to load.
 */
const seedScore = async (page: Page, score: IArrangementSnapshot): Promise<void> => {
    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-status-bar-repeat";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: packed,
        }));
    }, stringifyPackedArrangement(score));

    await page.goto("/");
    await expect(page.locator("#scoreStats")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("Status bar", () => {
    test("is rendered with primary background color", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        const statusbar = page.locator(".statusbar");

        await expect(statusbar).toBeVisible();

        // Verify the status bar uses the primary color as background.
        const bgColor = await statusbar.evaluate((el) => {
            return getComputedStyle(el).backgroundColor;
        });

        // The primary color in the Light+ theme is oklch(0.49 0.22 261.13) which
        // the browser resolves to an sRGB value. Just verify it's not transparent.
        expect(bgColor).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("shows left and right sections", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        const leftSection = page.locator(".statusbar-left");
        const rightSection = page.locator(".statusbar-right");

        await expect(leftSection).toBeVisible();
        await expect(rightSection).toBeVisible();
    });

    test("shows arrangement stats on the right side", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        const rightItems = page.locator(".statusbar-right .statusbar-item");

        // The stats item should be the rightmost item.
        await expect(rightItems.first()).toBeVisible();

        const statsText = await rightItems.first().textContent();

        // Expected format: "4/4 • 14 bars • X s"
        expect(statsText).toMatch(/4\/4\s*•\s*14\s+bars\s*•\s*[\d.]+\s*s/);
    });

    test("stats item has no button role (not clickable)", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        const statsItem = page.locator("#scoreStats");

        await expect(statsItem).toBeVisible();
        await expect(statsItem).not.toHaveAttribute("role", "button");
        await expect(statsItem).not.toHaveClass(/statusbar-item-clickable/);
    });

    test("counts the bars a repeat plays in the stats", async ({ page }) => {
        await seedScore(page, repeatedSnapshot());

        // The second bar is played twice, so the performance is one bar longer than the score.
        await expect(page.locator("#scoreStats")).toHaveText(/4\/4\s*•\s*4\s+bars/);

        // Four bars of two seconds each, twice as long as the three written bars would take.
        await expect(page.locator("#scoreStats")).toHaveText(/•\s*8(\.0+)?\s*s/);
    });

});
