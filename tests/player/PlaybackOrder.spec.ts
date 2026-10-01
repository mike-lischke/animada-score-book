/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import type { ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
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
