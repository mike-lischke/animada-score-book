/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("keyboard navigation scrolls the staff viewer to keep the cursor visible", async ({ page }) => {
    await page.goto("/?a2=4-4.100.4.1-4.16.ancT9sB~3cD5eiVZCPtZ8-g0q8s2zbqX1uH.1wkTlpVed1IXUvNs1E");
    await expect(page.locator("#trackViewerHost")).toBeVisible();

    // Switch to staff mode.
    const trackViewToggle = page.locator("input.trackViewModeToggle").first();
    await expect(trackViewToggle).toBeVisible();
    if (!await trackViewToggle.isChecked()) {
        await trackViewToggle.check({ force: true });
    }

    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

    // Select the first note of the first measure so arrow navigation has a starting point.
    const firstNote = page.locator(".staff-measure-track-row .staff-note-viewer-note-symbol").first();
    await firstNote.click();
    await expect(page.locator(".staff-note-viewer-run.note-selected").first()).toBeVisible();

    // Start from the left edge of the score.
    await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>("#trackViewerHost");
        if (host) {
            host.scrollLeft = 0;
        }
    });

    // Navigate right across enough notes/rests to reach a later measure. Extra presses past
    // the last note are harmless — they simply do not move the cursor further.
    for (let i = 0; i < 80; i++) {
        await page.keyboard.press("ArrowRight");
    }

    const scrollLeft = await page.evaluate(() => {
        return document.querySelector<HTMLElement>("#trackViewerHost")?.scrollLeft ?? 0;
    });

    expect(scrollLeft).toBeGreaterThan(0);
});
