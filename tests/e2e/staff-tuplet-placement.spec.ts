/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

/** One inner slot of the nested triplet, a 36th of the bar. */
const innerSlot = { numerator: 1, denominator: 36 };

/** One outer slot of the triplet over the first quarter. */
const outerSlot = { numerator: 1, denominator: 12 };

/** How far the resize drag widens the measure. */
const dragPx = 150;

/**
 * Builds a one-bar arrangement whose first quarter holds a triplet with another triplet in its first
 * slot, on the four-line instrument. Every note sits on the lowest line, so a marker drawn below the
 * notation is placed right outside the deepest noteheads.
 *
 * @returns The snapshot to seed.
 */
const nestedTupletSnapshot = () => {
    return {
        version: arrangementSnapshotVersion,
        title: "E2E Below Tuplet Marker",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: [{
            id: 300,
            instrumentId: "a",
            measures: [{
                number: 1,
                meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                events: [
                    { start: { numerator: 0, denominator: 1 }, duration: innerSlot, noteStyleId: "1" },
                    { start: { numerator: 1, denominator: 36 }, duration: innerSlot, noteStyleId: "1" },
                    { start: { numerator: 2, denominator: 36 }, duration: innerSlot, noteStyleId: "1" },
                    { start: { numerator: 1, denominator: 12 }, duration: outerSlot, noteStyleId: "1" },
                    { start: { numerator: 1, denominator: 9 }, duration: outerSlot, noteStyleId: "1" },
                    { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
                ],
                subdivisions: [
                    { startIndex: 0, actual: 3, normal: 4, isTuplet: true },
                    { startIndex: 0, actual: 3, normal: 1, isTuplet: true },
                ],
            }],
        }],
    };
};

/**
 * Opens the staff view on the nested tuplet score.
 *
 * @param page The page to seed.
 * @param sessionId The session to seed the arrangement under.
 */
const openNestedTuplets = async (page: Page, sessionId: string): Promise<void> => {
    const packed = stringifyPackedArrangement(nestedTupletSnapshot());

    await page.addInitScript((data: { packed: string; sessionId: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: data.sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", data.sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${data.sessionId}`, JSON.stringify({
            currentScore: data.packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed, sessionId });

    await page.goto("/");
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
};

/**
 * @param page The page to inspect.
 *
 * @returns The distance the below tuplet marker keeps from the lowest notehead's ink, in viewport px.
 */
const belowMarkerClearance = async (page: Page): Promise<number> => {
    return page.evaluate(() => {
        const markers = [...document.querySelectorAll<HTMLElement>(".staff-note-viewer-tuplet-below")];
        const heads = [...document.querySelectorAll<HTMLElement>(".staff-note-viewer-note-run .staff-note-head")];
        if (markers.length === 0 || heads.length === 0) {
            return Number.NaN;
        }

        const lowest = Math.max(...heads.map((head) => {
            return head.getBoundingClientRect().bottom;
        }));
        const highest = Math.min(...markers.map((marker) => {
            return marker.getBoundingClientRect().top;
        }));

        return highest - lowest;
    });
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("keeps a below tuplet marker clear of the notes on the lowest staff line", async ({ page }) => {
    await openNestedTuplets(page, "e2e-below-tuplet-marker");

    // The row reserves the room the below marker needs, so the marker stays clear of the row that follows.
    const reserve = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>(".staff-note-viewer");

        return getComputedStyle(row!).getPropertyValue("--staff-below-reserve").trim();
    });
    expect(parseFloat(reserve)).toBeGreaterThan(0);

    // The marker hangs below the deepest noteheads instead of crossing them.
    const clearance = await belowMarkerClearance(page);
    expect(Number.isFinite(clearance)).toBe(true);
    expect(clearance).toBeGreaterThan(8);
});

test("keeps the below marker clear of the notes when the measure is widened", async ({ page }) => {
    await openNestedTuplets(page, "e2e-below-tuplet-wide");

    const before = await belowMarkerClearance(page);
    const widthBefore = (await page.locator(".staff-measure-viewer").first().boundingBox())?.width ?? 0;

    await page.locator("#editModeButton").click({ force: true });
    const handle = page.locator(".staff-measure-resize-handle").first();
    await expect(handle).toBeVisible();

    // The barline closes a measure wider than the viewport, so it has to be scrolled into view first.
    await page.evaluate(() => {
        document.querySelector<HTMLElement>("#trackViewerHost")!.scrollLeft = 400;
    });

    const box = await handle.boundingBox();
    if (!box) {
        throw new Error("The resize handle has no bounding box.");
    }

    const y = box.y + 100;
    await page.mouse.move(box.x + (box.width / 2), y);
    await page.mouse.down();
    await page.mouse.move(box.x + (box.width / 2) + dragPx, y, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => {
        return (await page.locator(".staff-measure-viewer").first().boundingBox())?.width ?? 0;
    }).toBeGreaterThan(widthBefore + 100);

    // The placement follows the notation's own height, which a wider measure does not change.
    expect(Number.isFinite(before)).toBe(true);
    expect(await belowMarkerClearance(page)).toBeCloseTo(before, 0);
});
