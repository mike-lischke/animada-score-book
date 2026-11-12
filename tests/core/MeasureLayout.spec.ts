/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
    MeasureLayout, MeasureScrollPlacement, barActionStripWidth, measureStepWidthPx, minEventWidth, minRestWidth,
    noteHeightPx, staffMeasureInsets, staffSpacePx, type IRowItem,
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
            noteStyleId: "test-note",
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

        it("centres the requested position when the view asks for it", () => {
            // Measure 2 spans 1328..2608, so its middle lies at 1968 and the viewport of 1000 puts it at 1468.
            expect(MeasureLayout.scrollToShow(offsets, 2, 1968, 0, clientWidth, margin,
                MeasureScrollPlacement.Position)).toBe(1468);
        });

        it("keeps the scroll position when a centred position is visible", () => {
            expect(MeasureLayout.scrollToShow(offsets, 2, 1400, 1300, clientWidth, margin,
                MeasureScrollPlacement.Position)).toBe(1300);
        });

        it("clamps a centred position to the scrollable range", () => {
            expect(MeasureLayout.scrollToShow(offsets, 4, 5160, 0, clientWidth, margin,
                MeasureScrollPlacement.Position)).toBe(4168);
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
    it("gives a measure of sixteenths the room its symbols take", () => {
        // Each event needs its own symbol's room; the empty tails of longer events are not part of the floor.
        expect(MeasureLayout.minimumWidthOfMeasure(arrangementOf(equalTiles(16)), 1))
            .toBe((16 * minEventWidth) + staffMeasureInsets);
    });

    it("keeps a measure wide enough for the bar action strip", () => {
        // A single whole rest needs 47 px, which the strip's own width overrides.
        const wholeRest = [{
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 1 },
        }];

        expect(MeasureLayout.minimumWidthOfMeasure(arrangementOf(wholeRest), 1))
            .toBe(barActionStripWidth);
    });

    it("lets the sum of the measure's symbols decide, not its tightest slot", () => {
        const events: IMeasureEvent[] = [
            {
                start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 32 },
                noteStyleId: "test-note",
            },
            {
                start: { numerator: 1, denominator: 32 }, duration: { numerator: 1, denominator: 32 },
                noteStyleId: "test-note",
            },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
        ];

        // Two 32nds and one whole-bar rest hold three symbols' rooms, which the strip's width overrides.
        expect(MeasureLayout.contentMinimumWidthOfMeasure(arrangementOf(events), 1))
            .toBe((2 * minEventWidth) + minRestWidth + staffMeasureInsets);
        expect(MeasureLayout.minimumWidthOfMeasure(arrangementOf(events), 1)).toBe(barActionStripWidth);
    });

    it("lets the widest track decide", () => {
        const arrangement = {
            tracks: [{ measures: [{ events: equalTiles(4) }] }, { measures: [{ events: equalTiles(8) }] }],
        } as unknown as ISbDmArrangement;

        expect(MeasureLayout.contentMinimumWidthOfMeasure(arrangement, 1))
            .toBe((8 * minEventWidth) + staffMeasureInsets);
    });
});

describe("MeasureLayout.spacedWidths", () => {
    /**
     * @returns A row of four equal events, which need a quarter of the row each.
     */
    const quarters = (): IRowItem[] => {
        return Array.from({ length: 4 }, () => {
            return { fraction: 0.25, minimumPx: minEventWidth };
        });
    };

    it("gives every event its duration's share where the row has room to spare", () => {
        expect(MeasureLayout.spacedWidths(quarters(), 400)).toEqual([100, 100, 100, 100]);
    });

    it("leaves each event the room its symbol takes at the row's floor", () => {
        // Four symbols of 25 px need exactly 100 px, which is the row's floor.
        expect(MeasureLayout.spacedWidths(quarters(), 4 * minEventWidth))
            .toEqual([minEventWidth, minEventWidth, minEventWidth, minEventWidth]);
    });

    it("blends between the room its symbols take and the proportional layout", () => {
        const items: IRowItem[] = [
            { fraction: 0.75, minimumPx: minEventWidth },
            { fraction: 0.25, minimumPx: minEventWidth },
        ];

        // The symbols take 50 px; the proportional layout needs 100 px before the short event reaches its room.
        expect(MeasureLayout.spacedWidths(items, 50)).toEqual([minEventWidth, minEventWidth]);

        // Half way, both events stand half way between their room and their proportional share at 100 px.
        expect(MeasureLayout.spacedWidths(items, 75)).toEqual([50, 25]);
        expect(MeasureLayout.spacedWidths(items, 100)).toEqual([75, 25]);
        expect(MeasureLayout.spacedWidths(items, 400)).toEqual([300, 100]);
    });

    it("keeps the proportional share of unequal events above the floor", () => {
        const items: IRowItem[] = [
            { fraction: 0.5, minimumPx: minEventWidth },
            { fraction: 0.5, minimumPx: minEventWidth },
        ];

        expect(MeasureLayout.spacedWidths(items, 1000)).toEqual([500, 500]);
    });
});
