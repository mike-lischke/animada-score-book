/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { routeApi } from "./e2e-test-helpers.js";

const barCount = 8;

/** Column width of a measure at 100% zoom, as `MeasureLayout` reports it. */
const measureWidthPx = 1280;

/** Distance the viewer keeps between a measure it scrolls to and the left edge of its viewport. */
const visibilityMarginPx = 24;

/** Column offset of measure 1, which is preceded by the staff prefix. */
const firstMeasureOffsetPx = 48;

/** The state of the arrow cursor and the measure it sits in, in the viewer's coordinates. */
interface ISelectionState {
    /** 1-based measure the cursor sits in. */
    bar: number;

    /** Index of the selected run among the measure's runs, or -1 when nothing is selected. */
    runIndex: number;

    /** True when the cursor's note head is inside the viewport. */
    headVisible: boolean;

    /** Distance between the measure's left edge and the viewport's left edge. */
    measureOffset: number;
}

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

/**
 * Opens the view on the eight-measure score, in staff mode.
 *
 * @param page The page to open the score in.
 */
const openScore = async (page: Page): Promise<void> => {
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
        version: 4,
        title: "E2E Staff Window Navigation",
        timeParams: { timeSignature: "4/4", tempo: 120, length: barCount, pulse: "1/4", stepResolution: 16 },
        tracks: [{ id: 210, instrumentId: "0", measures }],
    };

    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-staff-window-navigation";
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
};

/**
 * Puts the arrow cursor on the given run of a measure. The viewer still has to be scrolled to that measure.
 *
 * @param page The page to click in.
 * @param bar The 1-based measure the run belongs to.
 * @param runIndex Zero-based index of the run among the measure's runs.
 */
const selectRun = async (page: Page, bar: number, runIndex: number): Promise<void> => {
    await page.locator(".staff-measure-viewer").nth(bar - 1)
        .locator(".staff-note-viewer-run").nth(runIndex).locator(".staff-note-head").click();
    await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(1);
};

/**
 * Scrolls the viewer far enough that the first measures are no longer rendered.
 *
 * @param page The page to scroll.
 */
const scrollAway = async (page: Page): Promise<void> => {
    await page.evaluate((width) => {
        const host = document.getElementById("trackViewerHost");
        if (host) {
            host.scrollLeft = 5 * width;
        }
    }, measureWidthPx);

    await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(0);
};

/**
 *
 * @param page The page to read the arrow cursor from.
 *
 * @returns The state of the arrow cursor and the measure it sits in.
 */
const selectionState = (page: Page): Promise<ISelectionState> => {
    return page.evaluate(() => {
        const run = document.querySelector<HTMLElement>(".staff-note-viewer-run.note-selected");
        const measure = run?.closest<HTMLElement>(".staff-measure-viewer");
        const head = run?.querySelector<HTMLElement>(".staff-note-head");
        const host = document.getElementById("trackViewerHost");

        const headRect = head?.getBoundingClientRect();
        const hostRect = host?.getBoundingClientRect();
        const measureRect = measure?.getBoundingClientRect();
        const runs = measure === null || measure === undefined
            ? []
            : Array.from(measure.querySelectorAll<HTMLElement>(".staff-note-viewer-run"));

        return {
            bar: Number(measure?.querySelector(".staff-measure-number")?.textContent ?? 0),
            runIndex: run ? runs.indexOf(run) : -1,
            headVisible: headRect !== undefined && hostRect !== undefined
                && headRect.left >= hostRect.left - 1 && headRect.right <= hostRect.right + 1,
            measureOffset: measureRect !== undefined && hostRect !== undefined
                ? Math.round(measureRect.left - hostRect.left)
                : Number.NaN,
        };
    });
};

// The score has eight measures with four events each, and the viewer renders only a window of them, so the measure
// the cursor was left in can be gone from the DOM entirely.
test("navigation steps through the events of a measure that is not rendered", async ({ page }) => {
    await openScore(page);

    await selectRun(page, 1, 0);
    await scrollAway(page);

    await page.keyboard.press("ArrowRight");

    // The cursor moves on by one event inside its own measure, and that measure is what has to come back into view.
    await expect.poll(async (): Promise<ISelectionState> => {
        return selectionState(page);
    }).toEqual({
        bar: 1,
        runIndex: 1,
        headVisible: true,
        measureOffset: firstMeasureOffsetPx,
    });
});

test("navigation steps over a measure boundary and anchors that measure in the viewport", async ({ page }) => {
    await openScore(page);

    await selectRun(page, 1, 3);
    await scrollAway(page);

    await page.keyboard.press("ArrowRight");

    // Only a measure's last event steps into the next measure. Anchoring the requested position alone would leave
    // the previous measure filling the viewport, with the cursor sitting at its right edge.
    await expect.poll(async (): Promise<ISelectionState> => {
        return selectionState(page);
    }).toEqual({
        bar: 2,
        runIndex: 0,
        headVisible: true,
        measureOffset: visibilityMarginPx,
    });
});
