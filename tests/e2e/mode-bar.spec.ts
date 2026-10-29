/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import {
    entryModeSegment, openSeededStaffScore, routeApi, showTrackView, trackViewSegment,
} from "./e2e-test-helpers.js";

const seededTracks = 4;
const seededMeasures = 2;

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("names both switches and offers the entry switch only while the staff view is edited", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    // Nothing can be entered outside edit mode, so the bar carries the view switch alone.
    await expect(page.locator("#arrangementModeBar .mode-bar-heading")).toHaveText(["View"]);
    await expect(trackViewSegment(page, "staff")).toHaveAttribute("aria-pressed", "true");
    await expect(entryModeSegment(page, "insert")).toHaveCount(0);

    await page.locator("#editModeButton").click({ force: true });
    await expect(page.locator("#arrangementModeBar .mode-bar-heading")).toHaveText(["View", "Entry"]);
    await expect(trackViewSegment(page, "staff")).toHaveAttribute("aria-pressed", "true");
    await expect(entryModeSegment(page, "insert")).toHaveAttribute("aria-pressed", "true");

    // The grid view enters notes through its values alone, so the entry switch goes away with it.
    await showTrackView(page, "grid");
    await expect(page.locator("#arrangementModeBar .mode-bar-heading")).toHaveText(["View"]);
    await expect(entryModeSegment(page, "insert")).toHaveCount(0);
});

test("switches the view through the segments and stores the choice", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    await showTrackView(page, "grid");
    await expect(page.locator(".grid-measure-row").first()).toBeVisible();
    await expect(page.locator(".staff-measure-viewer")).toHaveCount(0);

    await showTrackView(page, "staff");
    await expect(page.locator(".staff-measure-viewer")).toHaveCount(seededMeasures);

    await showTrackView(page, "grid");

    // The choice is a UI setting, so it outlives the session's score.
    const storedMode = await page.evaluate(() => {
        const state = window.history.state as { sessionId?: string; } | null;
        const sessionId = state?.sessionId ?? window.sessionStorage.getItem("asb-session-id");
        const settings = window.localStorage.getItem(`asb-ui-settings-session-${sessionId}`);
        const displayMode = (JSON.parse(settings ?? "{}") as {
            viewSettings?: { arrangementViewSettings?: { displayMode?: string; }; };
        }).viewSettings?.arrangementViewSettings?.displayMode;

        return displayMode ?? "";
    });

    expect(storedMode).toBe("grid");
});

test("switches the view with the G and S keys the segments name", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);
    await expect(trackViewSegment(page, "staff")).toHaveAttribute("aria-pressed", "true");

    await page.locator("body").press("g");
    await expect(trackViewSegment(page, "grid")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".grid-measure-row").first()).toBeVisible();

    await page.locator("body").press("s");
    await expect(trackViewSegment(page, "staff")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".staff-measure-viewer")).toHaveCount(seededMeasures);
});

test("drags the bar by its heading and keeps the place over a reload", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    const bar = page.locator("#arrangementModeBar");
    const before = await bar.boundingBox();
    const heading = await page.locator("#arrangementModeBar .mode-bar-heading").first().boundingBox();

    const grabX = heading!.x + 4;
    const grabY = heading!.y + (heading!.height / 2);
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 200, grabY + 40, { steps: 10 });
    await page.mouse.up();

    const dragged = await bar.boundingBox();
    expect(dragged!.x).toBeGreaterThan(before!.x);

    // A pointer down on a segment switches, it does not take the bar along.
    await showTrackView(page, "grid");
    const afterSwitch = await bar.boundingBox();
    expect(Math.round(afterSwitch!.x)).toBe(Math.round(dragged!.x));
    expect(Math.round(afterSwitch!.y)).toBe(Math.round(dragged!.y));

    await page.reload();
    await expect(page.locator("#arrangementModeBar")).toBeVisible();
    const restored = await bar.boundingBox();
    expect(Math.round(restored!.x)).toBe(Math.round(dragged!.x));
    expect(Math.round(restored!.y)).toBe(Math.round(dragged!.y));
});
