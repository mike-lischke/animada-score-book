/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { beijaFlorImportPath, expectImportedPolyrhythmSong, routeApi } from "./helpers.js";

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
});
