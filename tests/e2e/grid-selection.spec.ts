/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { clickScoreElement, routeApi } from "./e2e-test-helpers.js";

/** A one-bar arrangement with a note spanning two steps, so cells inside one note are distinguishable. */
const twoStepSnapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Grid Two-Step Note",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: [
                { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 } },
                {
                    start: { numerator: 1, denominator: 16 },
                    duration: { numerator: 2, denominator: 16 },
                    noteStyleId: "1",
                },
                { start: { numerator: 3, denominator: 16 }, duration: { numerator: 13, denominator: 16 } },
            ],
            subdivisions: [],
        }],
    }],
};

/**
 * Opens the grid view on the seeded arrangement.
 *
 * @param page The page to seed.
 * @param zoomLevel The zoom level of the viewer, in percent.
 */
const openSeededGrid = async (page: Page, zoomLevel = 100): Promise<void> => {
    await page.addInitScript((data: { packed: string; zoomLevel: number; }) => {
        const sessionId = `e2e-grid-two-step-note-${data.zoomLevel}`;
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            viewSettings: { arrangementViewSettings: { zoomLevel: data.zoomLevel } },
        }));
    }, { packed: stringifyPackedArrangement(twoStepSnapshot), zoomLevel });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".grid-measure-row .note-viewer").first()).toBeVisible();
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    await openSeededGrid(page);
});

test("clicking a trailing cell of a spanning note selects that cell", async ({ page }) => {
    const trailingCell = page.locator(".grid-measure-row .note-viewer").nth(2);
    await trailingCell.click();

    const cellBox = await trailingCell.boundingBox();
    const overlayBox = await page.locator(".selection-overlay").boundingBox();

    expect(cellBox).not.toBeNull();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox!.x).toBeLessThanOrEqual(cellBox!.x);
    expect(overlayBox!.x + overlayBox!.width).toBeGreaterThanOrEqual(cellBox!.x + cellBox!.width);
    await expect(page.locator("#selectionEditPopup")).toBeHidden();
});

test("selects the clicked cell at a zoom other than 100 percent", async ({ page }) => {
    for (const zoomLevel of [50, 150]) {
        await openSeededGrid(page, zoomLevel);

        const targetCell = page.locator(".grid-measure-row .note-viewer").nth(2);
        const cellBox = await targetCell.boundingBox();
        if (!cellBox) {
            throw new Error("The target cell has no bounding box.");
        }

        // A plain locator click cannot reach the cell here: it would use the rect the element reports, which
        // the viewer divides by its zoom, and land beside the cell.
        await clickScoreElement(page, targetCell);

        const overlayBox = await page.locator(".selection-overlay").boundingBox();
        if (!overlayBox) {
            throw new Error(`No selection overlay at ${zoomLevel} percent zoom.`);
        }

        // The overlay covers the cell it was drawn for, and cell and overlay report their rects in the same
        // space, so the comparison holds at every zoom level.
        expect(overlayBox.x, `overlay left at ${zoomLevel} percent`).toBeLessThanOrEqual(cellBox.x + 1);
        expect(overlayBox.x + overlayBox.width, `overlay right at ${zoomLevel} percent`)
            .toBeGreaterThanOrEqual(cellBox.x + cellBox.width - 1);
    }
});
