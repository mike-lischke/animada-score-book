/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

/** A quarter note and a rest in the first bar, then a bar holding nothing but a whole rest. */
const snapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Whole Rest Selection",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [
            {
                number: 1,
                meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                events: [
                    {
                        start: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 4 },
                        noteStyleId: "1",
                    },
                    { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
                ],
                subdivisions: [],
            },
            {
                number: 2,
                meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
                subdivisions: [],
            },
        ],
    }],
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    await page.addInitScript((data: { packed: string; entryMode: number; }) => {
        const sessionId = "e2e-whole-rest-selection";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            entryMode: data.entryMode,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), entryMode: EditEntryMode.Overwrite });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
});

/**
 * Selects the whole-measure rest of the silent second bar.
 *
 * @param page The page holding the staff view.
 *
 * @returns The run holding the whole-measure rest.
 */
const selectWholeRest = async (page: Page): Promise<Locator> => {
    const wholeRest = page.locator(".staff-measure-viewer").nth(1)
        .locator(".staff-note-viewer-run")
        .filter({ has: page.locator(".staff-note-viewer-rest-symbol") });

    await expect(wholeRest).toHaveCount(1);
    await wholeRest.locator(".staff-note-viewer-rest-symbol").click();
    await expect(wholeRest).toHaveClass(/note-selected/);

    return wholeRest;
};

test("selects the whole-measure rest of a silent bar", async ({ page }) => {
    await selectWholeRest(page);
});

test("subdivides the whole-measure rest into visible slots", async ({ page }) => {
    await page.locator("#editModeButton").click({ force: true });

    await selectWholeRest(page);
    await expect(page.locator("#selectionEditPopup .noteLengthToolbar")).toBeVisible();

    await page.locator(".subdivisionToolbar button").first().click();
    await page.locator(".subdivisionToolbar").getByText("Triplet", { exact: true }).click();

    // The bar keeps its subdivision instead of collapsing into one whole rest, so the three slots
    // the user just created are there to be filled.
    const bar = page.locator(".staff-measure-viewer").nth(1);
    await expect(bar.locator(".staff-note-viewer-run")).toHaveCount(3);
    await expect(bar.locator(".staff-note-viewer-tuplet-text")).toHaveText("3");
});

test("splits the whole-measure rest into two half rests with the length toolbar", async ({ page }) => {
    await page.locator("#editModeButton").click({ force: true });

    await selectWholeRest(page);
    await expect(page.locator("#selectionEditPopup .noteLengthToolbar")).toBeVisible();

    // The second length button is the half note: the addressed rest takes that length and the space
    // behind it becomes the second half rest.
    await page.locator(".noteLengthToolbar .noteLengthButton").nth(1).click({ force: true });

    const bar = page.locator(".staff-measure-viewer").nth(1);
    const rests = bar.locator(".staff-note-viewer-run");
    await expect(rests).toHaveCount(2);
    await expect(bar.locator(".staff-note-viewer-rest-symbol")).toHaveCount(2);

    // Each part is a run of its own, so a note can be entered in the second half of the bar.
    await rests.nth(1).locator(".staff-note-viewer-rest-symbol").click();
    await expect(rests.nth(1)).toHaveClass(/note-selected/);

    // The split is score content: undo restores the whole rest, redo brings the parts back.
    await page.keyboard.press("Control+z");
    await expect(bar.locator(".staff-note-viewer-run")).toHaveCount(1);

    await page.keyboard.press("Control+Shift+z");
    await expect(bar.locator(".staff-note-viewer-run")).toHaveCount(2);
});
