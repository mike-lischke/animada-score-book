/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { routeApi } from "./e2e-test-helpers.js";

/** Four beamed sixteenths, a quarter rest, then two blocks of sixteenths. */
const snapshot = {
    version: 4,
    title: "E2E Staff Deletion",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: [
                ...Array.from({ length: 4 }, (_, index) => {
                    return {
                        start: { numerator: index, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    };
                }),
                { start: { numerator: 4, denominator: 16 }, duration: { numerator: 4, denominator: 16 } },
                ...Array.from({ length: 8 }, (_, index) => {
                    return {
                        start: { numerator: 8 + index, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    };
                }),
            ],
            subdivisions: [],
        }],
    }],
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-staff-deletion";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, stringifyPackedArrangement(snapshot));

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

    // Deletion is an edit, so the editor only reacts in edit mode.
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .articulationToolbar")).toBeVisible();
});

test("backspace removes the event before the cursor and pulls the rest left", async ({ page }) => {
    const row = page.locator(".staff-measure-track-row").first();
    const runs = row.locator(".staff-note-viewer-run");
    await expect(runs).toHaveCount(13);

    // Start on the first sixteenth behind the quarter rest.
    const afterRest = runs.nth(5);
    const before = await afterRest.boundingBox();
    await afterRest.click();
    await expect(row.locator(".staff-note-viewer-run.note-selected")).toHaveCount(1);

    await page.keyboard.press("Backspace");

    // The rest is gone as a whole and everything behind it moved one quarter (four steps) to the left.
    await expect(runs.nth(4).locator(".staff-note-viewer-note-symbol")).toHaveCount(1);
    const after = await runs.nth(4).boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.x).toBeLessThan(before!.x - 40);
    await expect(row.locator(".staff-note-viewer-rest-symbol")).toHaveCount(1);
});

test("backspace does nothing when several elements are selected", async ({ page }) => {
    const row = page.locator(".staff-measure-track-row").first();
    const runs = row.locator(".staff-note-viewer-run");
    await expect(runs).toHaveCount(13);

    const secondNote = await runs.nth(1).boundingBox();
    await runs.nth(5).click({ modifiers: ["Shift"] });
    await runs.nth(1).click({ modifiers: ["Shift"] });

    // The drag/click selection covers more than one element, so Backspace has no target of its own.
    await expect(row.locator(".staff-note-viewer-run.note-selected").first()).toBeVisible();
    await page.keyboard.press("Backspace");

    await expect(runs).toHaveCount(13);
    const fourthNote = await runs.nth(1).boundingBox();
    expect(secondNote).not.toBeNull();
    expect(fourthNote).not.toBeNull();
    expect(fourthNote!.x).toBeCloseTo(secondNote!.x, 0);
});
