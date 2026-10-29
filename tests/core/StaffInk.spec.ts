/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { normalStemLengthSpaces } from "../../src/core/BeamGeometry.js";
import { staffSpacePx } from "../../src/core/MeasureLayout.js";
import { ScoreBookDataModel, type ISbDmTrack } from "../../src/core/ScoreBookDataModel.js";
import { HeadMark, StaffInk } from "../../src/core/StaffInk.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { createInstrument } from "../unit-test-helpers.js";

describe("StaffInk", () => {
    describe("ink bounds of a row", () => {
        it("states the head ink for a row without stems or marks", () => {
            const ink = StaffInk.ofRow([{ noteLine: 1, beamCount: 0 }], 1);

            // A head takes half a staff space around its line, and nothing hangs below it.
            expect(ink.topPx).toBeCloseTo(5);
            expect(ink.bottomPx).toBeCloseTo(5);
        });

        it("reserves the room of the deepest mark a note carries", () => {
            const dot = StaffInk.ofRow([{ noteLine: 1, beamCount: 0, marks: [HeadMark.Dot] }], 1);
            const ghost = StaffInk.ofRow([{ noteLine: 1, beamCount: 0, marks: [HeadMark.GhostParenthesis] }], 1);
            const accent = StaffInk.ofRow([{ noteLine: 1, beamCount: 0, marks: [HeadMark.Accent] }], 1);
            const both = StaffInk.ofRow([
                { noteLine: 1, beamCount: 0, marks: [HeadMark.Dot, HeadMark.Accent] },
            ], 1);

            // A dot and a parenthesis reach a quarter space below the head's ink, an accent two and a half.
            expect(dot.bottomPx).toBeCloseTo(7.5);
            expect(ghost.bottomPx).toBeCloseTo(7.5);
            expect(accent.bottomPx).toBeCloseTo(29);
            expect(both.bottomPx).toBeCloseTo(29);
        });

        it("lets the deepest note state the bounds, its marks included", () => {
            const ink = StaffInk.ofRow([
                { noteLine: 3, beamCount: 0, marks: [HeadMark.Accent] },
                { noteLine: 1, beamCount: 0 },
            ], 2);

            // The accent of the higher note reaches deeper than the head of the lower one.
            expect(ink.bottomPx).toBeCloseTo(39);
        });

        it("reaches up to the beam line, not beyond it, while the stack stays above the head", () => {
            const ink = StaffInk.ofRow([
                { noteLine: 1, stemLengthSpaces: normalStemLengthSpaces, beamCount: 2 },
            ], 1);

            expect(ink.topPx).toBeCloseTo(normalStemLengthSpaces * staffSpacePx);

            // The two-level stack (1.25 spaces) ends above the head, so the head's own bottom states the ink.
            expect(ink.bottomPx).toBeCloseTo(5);
        });

        it("counts a beam stack that hangs below its head on a short stem", () => {
            const ink = StaffInk.ofRow([{ noteLine: 1, stemLengthSpaces: 0.5, beamCount: 3 }], 1);

            // The three-level stack (1.5 spaces) reaches deeper than the head's own half space.
            expect(ink.bottomPx).toBeCloseTo(15);
        });

        it("takes the bounds of the whole row, not of one note", () => {
            const ink = StaffInk.ofRow([
                { noteLine: 1, stemLengthSpaces: normalStemLengthSpaces, beamCount: 1 },
                { noteLine: 4, stemLengthSpaces: normalStemLengthSpaces, beamCount: 1 },
            ], 2.5);

            // The lowest note's stem states the top, the highest note's head the bottom.
            expect(ink.topPx).toBeCloseTo(50);
            expect(ink.bottomPx).toBeCloseTo(20);
        });
    });

    describe("room a tuplet marker needs beside the notation", () => {
        let track: ISbDmTrack;

        beforeEach(() => {
            const model = new ScoreBookDataModel();
            model.startNewArrangement([createInstrument("a", 0, 0)]);
            track = model.arrangement!.tracks[0];
            track.instrument.noteStyles["1"] = { id: "1", noteLine: 4 } as IAudioData;
        });

        it("keeps no room while a measure labels no tuplet", () => {
            expect(StaffInk.aboveMarkerRoomPx(track)).toBe(0);
            expect(StaffInk.belowMarkerRoomPx(track)).toBe(0);
        });

        it("keeps room above the notation for the outermost tuplet's label", () => {
            track.measures[0].subdivisions.push({ startIndex: 0, actual: 3, normal: 2, isTuplet: true });

            expect(StaffInk.aboveMarkerRoomPx(track)).toBeGreaterThan(0);
            expect(StaffInk.belowMarkerRoomPx(track)).toBe(0);
        });

        it("keeps room below the notation for the label of a nested tuplet", () => {
            track.measures[0].subdivisions.push(
                { startIndex: 0, actual: 3, normal: 4, isTuplet: true },
                { startIndex: 0, actual: 3, normal: 1, isTuplet: true },
            );

            expect(StaffInk.aboveMarkerRoomPx(track)).toBeGreaterThan(0);
            expect(StaffInk.belowMarkerRoomPx(track)).toBeGreaterThan(0);
        });
    });
});
