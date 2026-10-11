/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { openSeededStaffScore, routeApi } from "./e2e-test-helpers.js";

/** Tracks of the seeded score. They drive the vertical extent, so the viewer has something to scroll. */
const seededTracks = 10;

/** Measures of the seeded score. */
const seededMeasures = 2;

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("scrolls the score vertically with the wheel", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    const viewer = page.locator("#viewerScrollHost");

    /**
     * @returns The vertical scroll position of the viewer.
     */
    const scrollTop = (): Promise<number> => {
        return viewer.evaluate((element) => {
            return element.scrollTop;
        });
    };

    const scrollable = await viewer.evaluate((element) => {
        return element.scrollHeight > element.clientHeight;
    });

    // A score that fits the viewport would make the wheel assertions below pass without proving anything.
    expect(scrollable).toBe(true);

    // The score is taller than the window, so the wheel goes to the first row instead of the host's centre.
    const row = (await page.locator(".staff-measure-track-row").first().boundingBox())!;
    await page.mouse.move(Math.round(row.x + (row.width / 2)), Math.round(row.y + (row.height / 2)));

    await page.mouse.wheel(0, 300);
    await expect.poll(scrollTop).toBeGreaterThan(0);

    await page.mouse.wheel(0, -300);
    await expect.poll(scrollTop).toBe(0);
});

test("blocks the overscroll on the viewer's outer scroll port only", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    // An inner scroll container must keep passing the wheel on, or the score cannot be scrolled at all.
    await expect(page.locator("#trackViewerHost")).toHaveCSS("overscroll-behavior-y", "auto");
    await expect(page.locator("#viewerScrollHost")).toHaveCSS("overscroll-behavior-y", "none");
});
