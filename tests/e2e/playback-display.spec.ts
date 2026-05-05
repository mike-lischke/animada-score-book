/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { expectPlaybackToMove, routeApi } from "./helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("renders arrangement UI and note grid", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#appRoot")).toBeVisible();
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".bar-track-row .note-viewer").first()).toBeVisible();
});

test("playback button starts and stops playback", async ({ page }) => {
    await page.goto("/");

    const playbackToggle = page.locator("#playbackButton");
    await expect(playbackToggle).toBeVisible();

    await playbackToggle.check({ force: true });
    await expect(playbackToggle).toBeChecked();

    await playbackToggle.uncheck({ force: true });
    await expect(playbackToggle).not.toBeChecked();
});

test("play beam moves while playback is running", async ({ page }) => {
    await page.goto("/");

    await expectPlaybackToMove(page);
});
