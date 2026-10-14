/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { openSeededStaffScore, routeApi } from "./e2e-test-helpers.js";

/** Tracks of the seeded score. The first row carries the trigger the tests use. */
const seededTracks = 3;

/** Measures of the seeded score. */
const seededMeasures = 2;

/**
 * Enters edit mode, so the track sidebar and its action toolbars appear.
 *
 * @param page The page under test.
 */
const enterEditMode = async (page: Page): Promise<void> => {
    await page.locator("#editModeButton").click({ force: true });
    await expect(page.locator(".trackEditSidebar")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("opens the track toolbar left of the trigger and names the instrument", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);
    await enterEditMode(page);

    const trigger = page.locator(".trackEditTrigger").first();
    const instrumentName = await page.locator(".trackInstrumentName").first().textContent();

    await trigger.click({ force: true });

    const popup = page.locator(".track-toolbar");
    await expect(popup).toBeVisible();
    await expect(popup.locator(".trackToolbarTitle")).toHaveText(instrumentName!.trim());
    await expect(popup.locator(".trackToolbarAction")).toHaveCount(4);

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();

    // The toolbar slides in from the left of its trigger, so it never covers the score. The slide-in animates,
    // hence the edge is polled until it has settled.
    await expect.poll(async () => {
        const popupBox = await popup.boundingBox();

        return Math.round((popupBox!.x + popupBox!.width) - triggerBox!.x);
    }).toBeLessThanOrEqual(0);
});

test("closes the track toolbar on Escape and on a click outside", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);
    await enterEditMode(page);

    const trigger = page.locator(".trackEditTrigger").first();
    const popup = page.locator(".track-toolbar");

    await trigger.click({ force: true });
    await expect(popup).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();

    await trigger.click({ force: true });
    await expect(popup).toBeVisible();

    await page.locator("#titleLogo").click({ force: true });
    await expect(popup).toBeHidden();
});

test("duplicates a track through the toolbar and closes it", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);
    await enterEditMode(page);

    const rows = page.locator(".trackEditRow");
    await expect(rows).toHaveCount(seededTracks);

    const popup = page.locator(".track-toolbar");

    await page.locator(".trackEditTrigger").first().click({ force: true });
    await expect(popup).toBeVisible();

    // The action row is add, duplicate, clear, delete — the second button duplicates.
    await popup.locator(".trackToolbarAction").nth(1).click({ force: true });

    await expect(rows).toHaveCount(seededTracks + 1);
    await expect(page.locator(".trackControls")).toHaveCount(seededTracks + 1);
    await expect(popup).toBeHidden();
});
