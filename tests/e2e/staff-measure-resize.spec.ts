/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import {
    MeasureLayout, barActionStripWidth, minEventGap, minEventWidth, staffMeasureInsets, staffPrefixWidth,
} from "../../src/core/MeasureLayout.js";
import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

const barCount = 2;

/** Column width of a measure at 100% zoom, as `MeasureLayout` reports it. */
const measureWidthPx = MeasureLayout.defaultWidth();

/** Column offset of measure 1, which is preceded by the staff prefix. */
const prefixWidthPx = staffPrefixWidth;

/** Scroll position that brings the barline closing measure 1 into the viewport. */
const barlineScrollPx = 400;

/** How far the drag moves the barline, and therefore how much wider measure 1 becomes. */
const dragPx = 150;

const measures = Array.from({ length: barCount }, (_, index) => {
    return {
        number: index + 1,
        meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
        events: Array.from({ length: 4 }, (_, beat) => {
            return {
                start: { numerator: beat, denominator: 4 },
                duration: { numerator: 1, denominator: 4 },
                noteStyleId: "1",
            };
        }),
        subdivisions: [],
    };
});

const snapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Staff Measure Resize",
    timeParams: { timeSignature: "4/4", tempo: 120, length: barCount, pulse: "1/4", stepResolution: 16 },
    tracks: [{ id: 220, instrumentId: "0", measures }],
};

/**
 * Opens the view on the two-measure score, in staff mode.
 *
 * @param page The page to open the score in.
 * @param entryMode The entry mode to start in. Insert mode ignores a click in edit mode, so tests that
 *                  select with a click ask for overwrite mode.
 */
const openScore = async (page: Page, entryMode?: EditEntryMode): Promise<void> => {
    await page.addInitScript((data: { packed: string; entryMode?: number; }) => {
        const sessionId = "e2e-staff-measure-resize";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            entryMode: data.entryMode,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), entryMode });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-viewer")).toHaveCount(barCount);
};

/**
 * @param page The page under test.
 *
 * @returns The current transform of the play beam.
 */
const playBeamTransform = (page: Page): Promise<string> => {
    return page.evaluate(() => {
        return document.querySelector<HTMLElement>("#playBeam")!.style.transform;
    });
};

/** The centre of a bar's action strip and of the measure column it belongs to, in viewport px. */
interface IBarToolbarCentres {
    /** Centre of the bar action strip. */
    toolbar: number;

    /** Centre of the measure column. */
    measure: number;
}

/**
 * @param page The page under test.
 *
 * @returns The horizontal centre of the first bar's action strip and of its measure column.
 */
const toolbarAndMeasureCentres = (page: Page): Promise<IBarToolbarCentres> => {
    return page.evaluate(() => {
        const group = document.querySelector<HTMLElement>(".bar-action-group")!;
        const measure = document.querySelector<HTMLElement>(".staff-measure-viewer")!;
        const groupBox = group.getBoundingClientRect();
        const measureBox = measure.getBoundingClientRect();

        return {
            toolbar: groupBox.left + (groupBox.width / 2),
            measure: measureBox.left + (measureBox.width / 2),
        };
    });
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("opens bar actions at each measure and duplicates the selected measure", async ({ page }) => {
    await openScore(page);
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });

    const triggers = page.locator(".bar-action-menu button");
    await expect(triggers).toHaveCount(barCount);
    await triggers.nth(1).click({ force: true });

    const menu = page.locator(".bar-action-menu ul[popover]").nth(1);
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Clear bar");
    await menu.getByText("Duplicate bar", { exact: true }).click();

    await expect(page.locator(".staff-measure-viewer")).toHaveCount(barCount + 1);
});

test("opens the barline as a resize handle in edit mode only", async ({ page }) => {
    await openScore(page);

    await expect(page.locator(".staff-measure-resize-handle")).toHaveCount(0);

    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator(".staff-measure-resize-handle")).toHaveCount(barCount);
    await expect(page.locator(".staff-measure-resize-handle").first()).toHaveCSS("cursor", "col-resize");

    // The grid view has no resizing, so it has no handles either.
    await page.locator("input.trackViewModeToggle").first().click({ force: true });
    await expect(page.locator(".grid-measure-viewer").first()).toBeVisible();
    await expect(page.locator(".staff-measure-resize-handle")).toHaveCount(0);
});

test("dragging the barline widens its measure, and one undo step restores it", async ({ page }) => {
    await openScore(page);
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });

    const measure = page.locator(".staff-measure-viewer").first();
    expect((await measure.boundingBox())!.width).toBe(measureWidthPx);

    await page.evaluate((scroll) => {
        document.querySelector<HTMLElement>("#trackViewerHost")!.scrollLeft = scroll;
    }, barlineScrollPx);

    const handle = page.locator(".staff-measure-resize-handle").first();
    const box = (await handle.boundingBox())!;
    const y = box.y + 100;
    await page.mouse.move(box.x + (box.width / 2), y);
    await page.mouse.down();
    await page.mouse.move(box.x + (box.width / 2) + dragPx, y, { steps: 8 });
    await page.mouse.up();

    // The dragged distance is the width the measure gains; the neighbour starts where it ends.
    await expect.poll(async () => {
        return (await measure.boundingBox())!.width;
    }).toBe(measureWidthPx + dragPx);

    // The whole drag is a single edit.
    await page.locator("button.undoRedoButton").first().click({ force: true });
    await expect.poll(async () => {
        return (await measure.boundingBox())!.width;
    }).toBe(measureWidthPx);
});

test("resets the measure width with a double click on its barline", async ({ page }) => {
    await openScore(page);
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });

    const measure = page.locator(".staff-measure-viewer").first();
    const handle = page.locator(".staff-measure-resize-handle").first();

    await page.evaluate((scroll) => {
        document.querySelector<HTMLElement>("#trackViewerHost")!.scrollLeft = scroll;
    }, barlineScrollPx);

    const box = (await handle.boundingBox())!;
    const y = box.y + 100;
    await page.mouse.move(box.x + (box.width / 2), y);
    await page.mouse.down();
    await page.mouse.move(box.x + (box.width / 2) + dragPx, y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => {
        return (await measure.boundingBox())!.width;
    }).toBe(measureWidthPx + dragPx);

    // Keep the barline inside the viewport while the measure shrinks back under it.
    const doubleClick = async (modifier?: "Shift"): Promise<void> => {
        await page.evaluate(() => {
            const host = document.querySelector<HTMLElement>("#trackViewerHost")!;
            const barline = document.querySelector<HTMLElement>(".staff-measure-resize-handle")!;
            const hostBox = host.getBoundingClientRect();
            const barlineBox = barline.getBoundingClientRect();
            const zoom = barline.currentCSSZoom || 1;
            host.scrollLeft += (barlineBox.left - (hostBox.left + (host.clientWidth / 2))) / zoom;
        });

        const target = (await handle.boundingBox())!;
        if (modifier !== undefined) {
            await page.keyboard.down(modifier);
        }

        await page.mouse.dblclick(target.x + (target.width / 2), target.y + 100);

        if (modifier !== undefined) {
            await page.keyboard.up(modifier);
        }
    };

    // Without a modifier the measure shrinks to the floor its content and controls set.
    await doubleClick();
    await expect.poll(async () => {
        return (await measure.boundingBox())!.width;
    }).toBe(barActionStripWidth);

    // The bar action strip is centred on its measure, so it follows the width change.
    const centres = await toolbarAndMeasureCentres(page);
    expect(Math.abs(centres.toolbar - centres.measure)).toBeLessThan(2);

    // Any modifier restores the default width.
    await doubleClick("Shift");
    await expect.poll(async () => {
        return (await measure.boundingBox())!.width;
    }).toBe(measureWidthPx);
});

test("widens a shrunk measure when an entry packs it tighter", async ({ page }) => {
    await openScore(page);
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });

    const measure = page.locator(".staff-measure-viewer").first();

    // Shrink the measure to the floor its content and controls set.
    await page.evaluate((scroll) => {
        document.querySelector<HTMLElement>("#trackViewerHost")!.scrollLeft = scroll;
    }, barlineScrollPx);

    const handle = page.locator(".staff-measure-resize-handle").first();
    const box = (await handle.boundingBox())!;
    await page.mouse.dblclick(box.x + (box.width / 2), box.y + 100);
    await expect.poll(async () => {
        return (await measure.boundingBox())!.width;
    }).toBe(barActionStripWidth);

    // A quadruplet splits a quarter note into sixteenths, which need more room between their anchors.
    await page.locator(".staff-measure-track-row .staff-note-head-symbol").first().click();
    await page.locator(".subdivisionToolbar button").first().click();
    await page.locator(".subdivisionToolbar .du-dropdown li", { hasText: "Quadruplet" }).locator("a")
        .click({ force: true });

    await expect.poll(async () => {
        return (await measure.boundingBox())!.width;
    }).toBe((16 * (minEventWidth + minEventGap)) + staffMeasureInsets);
});

test("places the play head for the view that is shown", async ({ page }) => {
    await openScore(page);

    // At the first measure the views place the beam differently: the staff view draws a prefix in front of
    // the measure, the grid view has none. Switching views has to place the beam again.
    await expect.poll(() => {
        return playBeamTransform(page);
    }).toBe(`translate3d(${prefixWidthPx}px, 0px, 0px)`);

    await page.locator("input.trackViewModeToggle").first().click({ force: true });
    await expect(page.locator(".grid-measure-viewer").first()).toBeVisible();
    await expect.poll(() => {
        return playBeamTransform(page);
    }).toBe("translate3d(0px, 0px, 0px)");
});

test("widens the overlay of a selected measure while the barline is dragged", async ({ page }) => {
    await openScore(page, EditEntryMode.Overwrite);
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });

    const row = page.locator(".staff-measure-track-row").first();
    const rowBox = (await row.boundingBox())!;

    // In the measure's head room, above the first staff: the click selects the whole measure.
    await page.mouse.click(rowBox.x + (rowBox.width / 2), rowBox.y - 5);
    await expect(page.locator("#selectionEditPopup .subdivisionToolbarHost")).toBeVisible();

    const overlay = page.locator(".selection-overlay");
    await expect(overlay).toHaveCount(1);
    const before = (await overlay.boundingBox())!;

    await page.evaluate((scroll) => {
        document.querySelector<HTMLElement>("#trackViewerHost")!.scrollLeft = scroll;
    }, barlineScrollPx);

    const handle = page.locator(".staff-measure-resize-handle").first();
    const box = (await handle.boundingBox())!;
    const y = box.y + 100;
    await page.mouse.move(box.x + (box.width / 2), y);
    await page.mouse.down();
    await page.mouse.move(box.x + (box.width / 2) + dragPx, y, { steps: 8 });
    await page.mouse.up();

    // The overlay is built from the staff rows, so resizing the measure rebuilds it instead of keeping the
    // width it had when the selection was made.
    await expect.poll(async () => {
        const after = await overlay.boundingBox();

        return after === null ? 0 : Math.round(after.width - before.width);
    }).toBe(dragPx);
});
