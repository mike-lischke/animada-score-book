/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

/** Four quarter notes, so the dot has a value on the current grid to stretch. */
const snapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Dotted Notes",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: Array.from({ length: 4 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 4 },
                    duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "1",
                };
            }),
            subdivisions: [],
        }],
    }],
};

/**
 * Reads the share of the measure a run occupies, as the renderer lays it out.
 *
 * @param page The page holding the staff view.
 * @param index The index of the run within its row.
 *
 * @returns The run's flex-grow value.
 */
const growOf = (page: Page, index: number): Promise<string> => {
    return page.evaluate((runIndex) => {
        const row = document.querySelector(".staff-measure-track-row");
        const run = row?.querySelectorAll<HTMLElement>(".staff-note-viewer-run")[runIndex];

        return run?.style.flex.split(" ")[0] ?? "";
    }, index);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-dotted-notes";
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
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .noteLengthToolbar")).toBeVisible();
});

test("dots the selected note and takes the dot away again", async ({ page }) => {
    const dot = page.locator(".noteDotButton");

    await page.locator(".staff-measure-track-row .staff-note-viewer-note-symbol").first().click();
    await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(1);
    await expect(page.locator(".noteLengthButton.du-btn-primary")).toHaveCount(1);
    await expect(dot).not.toHaveClass(/du-btn-primary/);

    // The dot turns the quarter note into a dotted quarter, which takes three steps from the notes
    // behind it instead of two.
    await dot.click({ force: true });
    await expect.poll(() => {
        return growOf(page, 0);
    }).toBe("0.375");
    await expect(dot).toHaveClass(/du-btn-primary/);

    await dot.click({ force: true });
    await expect.poll(() => {
        return growOf(page, 0);
    }).toBe("0.25");
    await expect(dot).not.toHaveClass(/du-btn-primary/);
});
