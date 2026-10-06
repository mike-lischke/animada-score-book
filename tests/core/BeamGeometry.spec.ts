/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    BeamGeometry, BeamSegmentKind, maximumBeamSlope, normalStemLengthSpaces, type IBeamNote,
} from "../../src/core/BeamGeometry.js";
import { staffSpacePx } from "../../src/core/MeasureLayout.js";

const normalStemPx = normalStemLengthSpaces * staffSpacePx;

/**
 * @param anchor The note's anchor as a bar fraction.
 * @param noteLine The note's staff line.
 * @param beamCount The number of beam levels the note carries.
 *
 * @returns The note as the beam geometry sees it.
 */
const note = (anchor: number, noteLine: number, beamCount = 1): IBeamNote => {
    return { anchor, noteLine, beamCount };
};

describe("BeamGeometry", () => {
    it("stacks beam levels by the SMuFL thickness and spacing", () => {
        // One level is the beam's own thickness, every further level adds a gap and another beam.
        expect(BeamGeometry.stackDepthSpaces(1)).toBeCloseTo(0.5);
        expect(BeamGeometry.stackDepthSpaces(2)).toBeCloseTo(1.25);
        expect(BeamGeometry.stackDepthSpaces(3)).toBeCloseTo(2);

        // A note without beams keeps one beam's depth, so an ink bound never collapses.
        expect(BeamGeometry.stackDepthSpaces(0)).toBeCloseTo(0.5);
    });

    it("keeps a group of equal notes horizontal with normal stems", () => {
        const plans = BeamGeometry.plan([
            note(0, 1),
            note(1 / 16, 1),
        ], { centerLine: 1, rowWidthPx: 1000 });

        expect(plans[0].stemLengthPx).toBeCloseTo(normalStemPx);
        expect(plans[1].stemLengthPx).toBeCloseTo(normalStemPx);

        // Level 1 is horizontal: both ends of the shared stroke sit at the same height.
        expect(plans[0].strokes[0].kind).toBe(BeamSegmentKind.SharedRight);
        expect(plans[0].strokes[0].leftPx).toBeCloseTo(plans[0].strokes[0].rightPx);
        expect(plans[1].strokes[0].kind).toBe(BeamSegmentKind.PartialLeft);

        // The shared stroke ends where the second note's stub begins: one line, no seam.
        expect(plans[0].strokes[0].rightPx).toBeCloseTo(plans[1].strokes[0].rightPx);
    });

    it("slopes the beam along an ascending contour and keeps the stems normal", () => {
        const plans = BeamGeometry.plan([
            note(0, 3),
            note(1 / 16, 2),
            note(2 / 16, 1),
        ], { centerLine: 1, rowWidthPx: 1600 });

        // Ascending pitch means a smaller y towards the right, so the beam's top edge rises.
        expect(plans[0].strokes[0].leftPx).toBeGreaterThan(plans[0].strokes[0].rightPx);
        expect(plans[0].stemLengthPx).toBeCloseTo(normalStemPx);
        expect(plans[1].stemLengthPx).toBeCloseTo(normalStemPx);
        expect(plans[2].stemLengthPx).toBeCloseTo(normalStemPx);

        // The shared strokes stay on one line across the group.
        expect(plans[0].strokes[0].rightPx).toBeCloseTo(plans[1].strokes[0].leftPx);
        expect(plans[1].strokes[0].rightPx).toBeCloseTo(plans[2].strokes[0].rightPx);
    });

    it("slopes the beam the other way for a descending contour", () => {
        const plans = BeamGeometry.plan([
            note(0, 1),
            note(1 / 16, 2),
            note(2 / 16, 3),
        ], { centerLine: 1, rowWidthPx: 1600 });

        expect(plans[0].strokes[0].leftPx).toBeLessThan(plans[0].strokes[0].rightPx);
        expect(plans[0].stemLengthPx).toBeCloseTo(normalStemPx);
        expect(plans[2].stemLengthPx).toBeCloseTo(normalStemPx);
    });

    it("bounds the slope of a large jump and keeps the shortest stem normal", () => {
        const plans = BeamGeometry.plan([
            note(0, 5),
            note(1 / 16, 1),
        ], { centerLine: 1, rowWidthPx: 1000 });

        const spanPx = (1 / 16) * 1000;
        const slope = (plans[0].strokes[0].leftPx - plans[0].strokes[0].rightPx) / spanPx;
        expect(Math.abs(slope)).toBeCloseTo(maximumBeamSlope);

        // The clamped slope leaves the low note with a longer stem; the high note keeps the normal one.
        expect(Math.min(plans[0].stemLengthPx, plans[1].stemLengthPx)).toBeCloseTo(normalStemPx);
        expect(plans[0].stemLengthPx).toBeGreaterThan(normalStemPx);
    });

    it("keeps the shortest stem at the normal length when an inner note is the highest", () => {
        const plans = BeamGeometry.plan([
            note(0, 3),
            note(1 / 16, 1),
            note(2 / 16, 3),
        ], { centerLine: 1, rowWidthPx: 1600 });

        // Equal endpoint heights keep the beam horizontal, and the inner note decides its height.
        expect(plans[0].strokes[0].leftPx).toBeCloseTo(plans[0].strokes[0].rightPx);
        expect(plans[1].stemLengthPx).toBeCloseTo(normalStemPx);
        expect(plans[0].stemLengthPx).toBeGreaterThan(normalStemPx);
        expect(plans[2].stemLengthPx).toBeGreaterThan(normalStemPx);
    });

    it("marks every level of a lone note as a stub into the group", () => {
        const plans = BeamGeometry.plan([note(0, 1, 3)], { centerLine: 1, rowWidthPx: 1000 });

        expect(plans[0].strokes.map((stroke) => {
            return stroke.kind;
        })).toEqual([
            BeamSegmentKind.PartialRight,
            BeamSegmentKind.PartialRight,
            BeamSegmentKind.PartialRight,
        ]);
        expect(plans[0].strokes.map((stroke) => {
            return stroke.level;
        })).toEqual([1, 2, 3]);
    });

    it("turns a level the neighbour does not carry into a stub back towards the group", () => {
        const plans = BeamGeometry.plan([
            note(0, 1, 2),
            note(1 / 16, 1, 1),
        ], { centerLine: 1, rowWidthPx: 1000 });

        expect(plans[0].strokes.map((stroke) => {
            return stroke.kind;
        })).toEqual([BeamSegmentKind.SharedRight, BeamSegmentKind.PartialRight]);
        expect(plans[1].strokes.map((stroke) => {
            return stroke.kind;
        })).toEqual([BeamSegmentKind.PartialLeft]);
    });

    it("gives partial beams the slope of the group's line", () => {
        const plans = BeamGeometry.plan([
            note(0, 3),
            note(1 / 16, 1),
        ], { centerLine: 1, rowWidthPx: 1600 });

        const stub = plans[1].strokes[0];
        expect(stub.kind).toBe(BeamSegmentKind.PartialLeft);
        expect(stub.leftPx).toBeGreaterThan(stub.rightPx);
    });

    it("connects a group of unequal note durations on one line", () => {
        // An eighth followed by two sixteenths: the anchors are twice as far apart as within the pair.
        const plans = BeamGeometry.plan([
            note(1 / 32, 2, 1),
            note(5 / 32, 1, 2),
            note(7 / 32, 1, 2),
        ], { centerLine: 1, rowWidthPx: 1600 });

        // Every shared stroke ends where the next one begins, whatever the slots' widths are, and the
        // stroke over the eighth rises twice as far as the one over a sixteenth.
        expect(plans[0].strokes[0].rightPx).toBeCloseTo(plans[1].strokes[0].leftPx);
        expect(plans[1].strokes[0].rightPx).toBeCloseTo(plans[2].strokes[0].rightPx);

        const eighthRise = plans[0].strokes[0].leftPx - plans[0].strokes[0].rightPx;
        const sixteenthRise = plans[1].strokes[0].leftPx - plans[1].strokes[0].rightPx;
        expect(eighthRise).toBeCloseTo(sixteenthRise * 2);

        // No stem is shorter than the normal length.
        expect(Math.min(...plans.map((plan) => {
            return plan.stemLengthPx;
        }))).toBeCloseTo(normalStemPx);
    });

    it("keeps a squeezed group connected with normal stems", () => {
        // A narrow measure leaves a fifth of the room per step, so the clamped slope has to hold the
        // whole group together instead of only the pair of notes it spans.
        const plans = BeamGeometry.plan([
            note(0, 3, 1),
            note(1 / 16, 2, 2),
            note(2 / 16, 1, 2),
        ], { centerLine: 2, rowWidthPx: 240 });

        // The shared strokes meet at the same heights, and the beam still rises along the contour.
        expect(plans[0].strokes[0].rightPx).toBeCloseTo(plans[1].strokes[0].leftPx);
        expect(plans[1].strokes[0].rightPx).toBeCloseTo(plans[2].strokes[0].rightPx);
        expect(plans[0].strokes[0].leftPx).toBeGreaterThan(plans[0].strokes[0].rightPx);

        // The beam is translated so the shortest stem keeps the normal length.
        expect(Math.min(...plans.map((plan) => {
            return plan.stemLengthPx;
        }))).toBeCloseTo(normalStemPx);
    });
});
