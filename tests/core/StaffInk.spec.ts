/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { normalStemLengthSpaces } from "../../src/core/BeamGeometry.js";
import { staffSpacePx } from "../../src/core/MeasureLayout.js";
import { ScoreBookDataModel, type ISbDmTrack } from "../../src/core/ScoreBookDataModel.js";
import { StaffInk } from "../../src/core/StaffInk.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { createInstrument } from "../unit-test-helpers.js";

describe("StaffInk", () => {
    describe("ink bounds of a row", () => {
        it("states the head ink for a row without stems", () => {
            const ink = StaffInk.ofRow([{ noteLine: 1, beamCount: 0 }], 1);

            // A head takes half a staff space around its line, its marks hang one and a half below it.
            expect(ink.topPx).toBeCloseTo(5);
            expect(ink.bottomPx).toBeCloseTo(20);
        });

        it("reaches up to the beam line, not beyond it, while the stack stays above the head", () => {
            const ink = StaffInk.ofRow([
                { noteLine: 1, stemLengthSpaces: normalStemLengthSpaces, beamCount: 2 },
            ], 1);

            expect(ink.topPx).toBeCloseTo(normalStemLengthSpaces * staffSpacePx);

            // The two-level stack (1.25 spaces) ends above the head, so the marks state the bottom.
            expect(ink.bottomPx).toBeCloseTo(20);
        });

        it("counts a beam stack that hangs below its head on a short stem", () => {
            const ink = StaffInk.ofRow([{ noteLine: 1, stemLengthSpaces: 0.5, beamCount: 3 }], 1);

            // The three-level stack (2 spaces) reaches deeper than the head's own half space.
            expect(ink.bottomPx).toBeCloseTo(30);
        });

        it("takes the bounds of the whole row, not of one note", () => {
            const ink = StaffInk.ofRow([
                { noteLine: 1, stemLengthSpaces: normalStemLengthSpaces, beamCount: 1 },
                { noteLine: 4, stemLengthSpaces: normalStemLengthSpaces, beamCount: 1 },
            ], 2.5);

            // The highest stem states the top, the deepest head states the bottom.
            expect(ink.topPx).toBeCloseTo(50);
            expect(ink.bottomPx).toBeCloseTo(35);
        });
    });

    describe("room a row keeps below itself", () => {
        let track: ISbDmTrack;

        beforeEach(() => {
            const model = new ScoreBookDataModel();
            model.startNewArrangement([createInstrument("a", 0, 0)]);
            track = model.arrangement!.tracks[0];
            track.instrument.noteStyles["1"] = { id: "1", noteLine: 4 } as IAudioData;
        });

        it("reserves nothing while a measure labels only one tuplet", () => {
            track.measures[0].subdivisions.push({ startIndex: 0, actual: 3, normal: 2, isTuplet: true });

            expect(StaffInk.belowReservePx(track)).toBe(0);
        });

        it("reserves the room the nested tuplet's label needs below the notation", () => {
            track.measures[0].subdivisions.push(
                { startIndex: 0, actual: 3, normal: 4, isTuplet: true },
                { startIndex: 0, actual: 3, normal: 1, isTuplet: true },
            );

            // The label of the inner tuplet is drawn below the notation, which needs room on a four-line staff.
            expect(StaffInk.belowReservePx(track)).toBeGreaterThan(0);
        });
    });
});
