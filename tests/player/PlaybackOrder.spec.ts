/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
import type { IRepeatBar } from "../../src/core/types/general.js";
import { PlaybackOrder } from "../../src/player/PlaybackOrder.js";

/**
 * Builds a stand-in track piece; only the mark matters to the resolution.
 *
 * @param number The one-based measure number.
 * @param simile Whether the piece carries the one-bar repeat mark.
 *
 * @returns The stand-in track piece.
 */
const piece = (number: number, simile = false): ISbDmTrackPiece => {
    return { number, simile: simile ? true : undefined } as unknown as ISbDmTrackPiece;
};

describe("PlaybackOrder", () => {
    it("maps every measure to itself when no simile is set", () => {
        const measures = [piece(1), piece(2), piece(3)];

        expect(PlaybackOrder.sourcesOf(measures)).toEqual(measures);
    });

    it("maps a simile to the measure before it", () => {
        const measures = [piece(1), piece(2), piece(3, true)];

        expect(PlaybackOrder.sourcesOf(measures)).toEqual([measures[0], measures[1], measures[1]]);
    });

    it("resolves a chain of similes to the nearest preceding measure", () => {
        const measures = [piece(1), piece(2, true), piece(3, true), piece(4, true), piece(5)];

        expect(PlaybackOrder.sourcesOf(measures)).toEqual([
            measures[0], measures[0], measures[0], measures[0], measures[4],
        ]);
    });

    it("reports no source for a simile that has no preceding measure", () => {
        const measures = [piece(1, true), piece(2)];

        expect(PlaybackOrder.sourcesOf(measures)).toEqual([undefined, measures[1]]);
    });
});

/**
 * @param marks The repeat marks, keyed by 1-based bar number.
 *
 * @returns The map the resolution reads them from.
 */
const marksOf = (marks: Record<number, IRepeatBar>): Map<number, IRepeatBar> => {
    return new Map(Object.entries(marks).map(([bar, mark]) => {
        return [Number(bar), mark];
    }));
};

describe("PlaybackOrder.performedBars", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("plays the bars in the order they are written when no repeat is marked", () => {
        expect(PlaybackOrder.performedBars(marksOf({}), 3)).toEqual([1, 2, 3]);
    });

    it("repeats the section a pair of marked barlines encloses", () => {
        expect(PlaybackOrder.performedBars(marksOf({ 1: { start: true }, 2: { end: true } }), 3))
            .toEqual([1, 2, 1, 2, 3]);
    });

    it("repeats a bar that carries both marks", () => {
        expect(PlaybackOrder.performedBars(marksOf({ 2: { start: true, end: true } }), 3)).toEqual([1, 2, 2, 3]);
    });

    it("repeats from the first bar when a repeat closes without one that opens", () => {
        expect(PlaybackOrder.performedBars(marksOf({ 2: { end: true } }), 3)).toEqual([1, 2, 1, 2, 3]);
    });

    it("plays an inner section through before the outer one goes on", () => {
        const marks = marksOf({ 1: { start: true }, 2: { start: true }, 3: { end: true }, 4: { end: true } });

        expect(PlaybackOrder.performedBars(marks, 4)).toEqual([1, 2, 3, 2, 3, 4, 1, 2, 3, 2, 3, 4]);
    });

    it("plays a marked section as often as the play count states", () => {
        expect(PlaybackOrder.performedBars(marksOf({ 1: { start: true }, 2: { end: true } }), 3, 3))
            .toEqual([1, 2, 1, 2, 1, 2, 3]);
    });

    it("leaves a repeat that never closes without effect", () => {
        expect(PlaybackOrder.performedBars(marksOf({ 2: { start: true } }), 3)).toEqual([1, 2, 3]);
    });

    it("stops resolving a nesting that would grow without bound", () => {
        // Twenty sections around each other, the last end closing the outermost one: the marks alone ask for
        // 2^20 passes over the bars.
        const marks: Record<number, IRepeatBar> = {};
        for (let bar = 1; bar <= 20; bar++) {
            marks[bar] = { start: true };
        }

        for (let bar = 21; bar <= 40; bar++) {
            marks[bar] = { end: true };
        }

        const warn = vi.spyOn(console, "warn").mockImplementation(() => {
            // The warning is what the test asserts; silencing it keeps the test output clean.
        });

        const order = PlaybackOrder.performedBars(marksOf(marks), 40);

        expect(order.length).toBe(40 * 16);
        expect(order.every((bar) => {
            return bar >= 1 && bar <= 40;
        })).toBe(true);
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith("PlaybackOrder: the repeat marks of 40 bars resolve to more than 640 bars");
    });
});
