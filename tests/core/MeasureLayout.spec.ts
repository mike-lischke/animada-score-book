/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
    MeasureLayout, barActionStripWidth, measureStepWidthPx, minEventGap, minEventWidth, noteHeightPx,
    staffMeasureInsets, staffSpacePx,
} from "../../src/core/MeasureLayout.js";
import type { ISbDmArrangement } from "../../src/core/ScoreBookDataModel.js";
import type { IMeasureEvent } from "../../src/core/types/general.js";

/**
 * Builds a measure's events as `count` equal events tiling the whole bar.
 *
 * @param count The number of events.
 *
 * @returns The measure's events.
 */
const equalTiles = (count: number): IMeasureEvent[] => {
    return Array.from({ length: count }, (_, index) => {
        return {
            start: { numerator: index, denominator: count },
            duration: { numerator: 1, denominator: count },
        };
    });
};

/**
 * Wraps events into the smallest arrangement one measure needs.
 *
 * @param events The events of the measure.
 *
 * @returns An arrangement whose first track holds one measure with those events.
 */
const arrangementOf = (events: IMeasureEvent[]): ISbDmArrangement => {
    return { tracks: [{ measures: [{ events }] }] } as unknown as ISbDmArrangement;
};

describe("MeasureLayout", () => {
    it("gives every measure the default width when no width is set", () => {
        expect(MeasureLayout.defaultWidth()).toBe(1280);
        expect(MeasureLayout.columns(3)).toEqual([1280, 1280, 1280]);
    });

    it("uses the width set for a measure and the default for the others", () => {
        const widths = new Map([[2, 2000]]);

        expect(MeasureLayout.columns(3, widths)).toEqual([1280, 2000, 1280]);
        expect(MeasureLayout.widthOf(2, widths)).toBe(2000);
        expect(MeasureLayout.widthOf(1, widths)).toBe(MeasureLayout.defaultWidth());
    });

    it("ignores widths that cannot be laid out", () => {
        const widths = new Map([[1, 0], [2, -100]]);

        expect(MeasureLayout.widthOf(1, widths)).toBe(MeasureLayout.defaultWidth());
        expect(MeasureLayout.widthOf(2, widths)).toBe(MeasureLayout.defaultWidth());
    });

    it("offsets the measures by the widths before them, including leading content", () => {
        const offsets = MeasureLayout.offsets([1280, 2000, 1280], 48);

        expect(offsets).toEqual([48, 1328, 3328, 4608]);
        expect(MeasureLayout.totalWidth(offsets)).toBe(4608);
    });

    it("offsets an empty score to its leading content only", () => {
        const offsets = MeasureLayout.offsets([], 48);

        expect(offsets).toEqual([48]);
        expect(MeasureLayout.totalWidth(offsets)).toBe(48);
        expect(MeasureLayout.columnIndexAt(offsets, 500)).toBe(0);
        expect(MeasureLayout.rangeFor(offsets, 0, 500)).toEqual({ first: 1, last: 0 });
    });

    it("resolves the column a position falls into", () => {
        const offsets = MeasureLayout.offsets([1280, 2000, 1280], 48);

        expect(MeasureLayout.columnIndexAt(offsets, 0)).toBe(0);
        expect(MeasureLayout.columnIndexAt(offsets, 47)).toBe(0);
        expect(MeasureLayout.columnIndexAt(offsets, 48)).toBe(0);
        expect(MeasureLayout.columnIndexAt(offsets, 1327)).toBe(0);
        expect(MeasureLayout.columnIndexAt(offsets, 1328)).toBe(1);
        expect(MeasureLayout.columnIndexAt(offsets, 3328)).toBe(2);
        expect(MeasureLayout.columnIndexAt(offsets, 99999)).toBe(2);
    });

    it("returns the measures that touch a horizontal interval, with overscan", () => {
        const offsets = MeasureLayout.offsets([1280, 1280, 1280, 1280]);

        expect(MeasureLayout.rangeFor(offsets, 0, 1126)).toEqual({ first: 1, last: 1 });
        expect(MeasureLayout.rangeFor(offsets, 0, 1126, 1)).toEqual({ first: 1, last: 2 });
        expect(MeasureLayout.rangeFor(offsets, 1300, 2600)).toEqual({ first: 2, last: 3 });
        expect(MeasureLayout.rangeFor(offsets, 5000, 6000)).toEqual({ first: 4, last: 4 });
        expect(MeasureLayout.rangeFor(offsets, 0, 6000, 2)).toEqual({ first: 1, last: 4 });
        expect(MeasureLayout.rangeFor(offsets, -500, 100, 1)).toEqual({ first: 1, last: 2 });
    });

    describe("scrollToShow", () => {
        const offsets = MeasureLayout.offsets([1280, 1280, 1280, 1280], 48);
        const margin = 24;
        const clientWidth = 1000;

        it("keeps the scroll position when the requested position is visible", () => {
            expect(MeasureLayout.scrollToShow(offsets, 2, 1400, 1300, clientWidth, margin)).toBe(1300);
            expect(MeasureLayout.scrollToShow(offsets, 2, 1324, 1300, clientWidth, margin)).toBe(1300);
            expect(MeasureLayout.scrollToShow(offsets, 2, 2276, 1300, clientWidth, margin)).toBe(1300);
        });

        it("anchors the measure instead of the position when a cursor steps over a measure boundary", () => {
            // Anchoring the position alone would scroll to 352 here, leaving measure 1 filling the viewport.
            expect(MeasureLayout.scrollToShow(offsets, 2, 1328, 0, clientWidth, margin)).toBe(1304);
            expect(MeasureLayout.scrollToShow(offsets, 2, 1328, 3888, clientWidth, margin)).toBe(1304);
        });

        it("follows a position that stays off-screen with the measure anchored", () => {
            expect(MeasureLayout.scrollToShow(offsets, 4, 5038, 3888, clientWidth, margin)).toBe(4062);
        });

        it("keeps the staff prefix of measure 1 visible", () => {
            expect(MeasureLayout.scrollToShow(offsets, 1, 56, 3000, clientWidth, margin)).toBe(0);
            expect(MeasureLayout.scrollToShow(offsets, 1, 700, 3000, clientWidth, margin)).toBe(0);
        });

        it("clamps to the scrollable range", () => {
            expect(MeasureLayout.scrollToShow(offsets, 4, 5168, 0, clientWidth, margin)).toBe(4168);
        });
    });
});

describe("MeasureLayout and the stylesheet constants it mirrors", () => {
    it("matches the note height declared in App.scss", () => {
        const appScss = readFileSync("src/App.scss", "utf8");

        expect(appScss).toContain(`--note-height: ${noteHeightPx}px`);
    });

    it("matches the staff space declared in App.scss", () => {
        const appScss = readFileSync("src/App.scss", "utf8");

        expect(appScss).toContain(`--staff-space: ${staffSpacePx}px`);
    });

    it("matches the measure step width declared in App.scss", () => {
        const appScss = readFileSync("src/App.scss", "utf8");

        expect(appScss).toContain(`--measure-step-width: ${measureStepWidthPx}px`);
    });

    it("matches the steps per measure the staff measure viewer is laid out for", () => {
        const componentStyles = readFileSync("src/components/component-styles.scss", "utf8");

        expect(componentStyles).toContain("--steps-per-bar: 16");
        expect(MeasureLayout.defaultWidth()).toBe(16 * noteHeightPx);
    });
});

describe("MeasureLayout.minimumWidthOfMeasure", () => {
    it("gives a measure of sixteenths the room its symbols and the air between them need", () => {
        expect(MeasureLayout.minimumWidthOfMeasure(arrangementOf(equalTiles(16)), 1))
            .toBe((16 * (minEventWidth + minEventGap)) + staffMeasureInsets);
    });

    it("keeps a measure wide enough for the bar action strip", () => {
        // A single whole rest needs 43 px, which the strip's own width overrides.
        expect(MeasureLayout.minimumWidthOfMeasure(arrangementOf(equalTiles(1)), 1))
            .toBe(barActionStripWidth);
    });

    it("lets the tightest slot of the measure decide", () => {
        const events: IMeasureEvent[] = [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 32 } },
            { start: { numerator: 1, denominator: 32 }, duration: { numerator: 1, denominator: 32 } },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
        ];

        // The 32nd pair sets the floor; the whole-bar rest behind it asks for far less.
        expect(MeasureLayout.minimumWidthOfMeasure(arrangementOf(events), 1))
            .toBe((32 * (minEventWidth + minEventGap)) + staffMeasureInsets);
    });

    it("lets the widest track decide", () => {
        const arrangement = {
            tracks: [{ measures: [{ events: equalTiles(4) }] }, { measures: [{ events: equalTiles(8) }] }],
        } as unknown as ISbDmArrangement;

        expect(MeasureLayout.minimumWidthOfMeasure(arrangement, 1))
            .toBe((8 * (minEventWidth + minEventGap)) + staffMeasureInsets);
    });
});
