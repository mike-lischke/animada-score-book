/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MeasureLayout, noteHeightPx } from "../../src/core/MeasureLayout.js";

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

    it("matches the steps per measure the staff measure viewer is laid out for", () => {
        const componentStyles = readFileSync("src/components/component-styles.scss", "utf8");

        expect(componentStyles).toContain("--steps-per-bar: 16");
        expect(MeasureLayout.defaultWidth()).toBe(16 * noteHeightPx);
    });
});
