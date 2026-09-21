/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    MeasureProjection, NoteGroupKind, type IMeasureGroupingInput, type INoteGroup, type INotationGrid,
} from "../../src/core/MeasureProjection.js";
import type { IFraction, IMeasureEvent, ISubdivision } from "../../src/core/types/general.js";

/**
 * Steps in one bar of the fixtures that use the default meter: a 4/4 bar with sixteenth steps. The
 * count follows from the meter, so a 6/8 bar holds fewer and a test may set its own.
 */
const fixtureStepsPerBar = 16;

/**
 * Builds a fraction, so the fixtures read as positions rather than as object literals.
 *
 * @param numerator The fraction's numerator.
 * @param denominator The fraction's denominator.
 *
 * @returns The fraction.
 */
const fraction = (numerator: number, denominator: number): IFraction => {
    return { numerator, denominator };
};

/**
 * Builds the timing grid of a bar: how many steps it holds and how many steps one pulse covers.
 *
 * @param stepsPerBar The number of base-grid steps the bar holds.
 * @param pulseSteps The number of base-grid steps one pulse covers.
 *
 * @returns The grid the grouping rules work on.
 */
const gridOf = (stepsPerBar = fixtureStepsPerBar, pulseSteps = 4): INotationGrid => {
    return {
        stepsPerBar,
        beatGroups: Array.from({ length: stepsPerBar / pulseSteps }, () => {
            return pulseSteps;
        }),
    };
};

/**
 * Builds a sounding event.
 *
 * @param start The event's start within the measure.
 * @param duration The event's duration.
 *
 * @returns The measure event.
 */
const note = (start: IFraction, duration: IFraction): IMeasureEvent => {
    return { start, duration, noteStyleId: "1" };
};

/**
 * Builds a rest event.
 *
 * @param start The event's start within the measure.
 * @param duration The event's duration.
 *
 * @returns The measure event.
 */
const rest = (start: IFraction, duration: IFraction): IMeasureEvent => {
    return { start, duration };
};

/**
 * Builds a tuplet replacing a count of notes with a number of equal slots.
 *
 * @param startIndex The index of the measure event the tuplet starts at.
 * @param actual The number of equal slots the tuplet holds.
 * @param normal The number of notes the tuplet replaces.
 *
 * @returns The subdivision.
 */
const tuplet = (startIndex: number, actual: number, normal: number): ISubdivision => {
    return { startIndex, actual, normal, isTuplet: true };
};

/**
 * Builds a measure as the grouping rules see it. The track player resolves audio data for every
 * event except the rests, which is what makes a rest end a beam group.
 *
 * @param events The measure's events, in display order.
 * @param subdivisions The measure's subdivisions, flat and in expansion order.
 * @param stepsPerBar The number of base-grid steps the bar holds.
 *
 * @returns The measure to compose note groups from.
 */
const measureOf = (events: IMeasureEvent[], subdivisions: ISubdivision[] = [],
    stepsPerBar = fixtureStepsPerBar): IMeasureGroupingInput => {
    return {
        events,
        subdivisions,
        meter: { stepResolution: stepsPerBar },
        noteEvents: events.map((event) => {
            return { audioData: event.noteStyleId === undefined ? undefined : {} };
        }),
    };
};

/**
 * Lists the groups of one kind as their event indexes.
 *
 * @param groups The groups to filter.
 * @param kind The kind to keep.
 *
 * @returns The event indexes of the matching groups, in group order.
 */
const indexesOf = (groups: INoteGroup[], kind: NoteGroupKind): number[][] => {
    return groups.filter((group) => {
        return group.kind === kind;
    }).map((group) => {
        return group.eventIndexes;
    });
};

describe("MeasureProjection note groups", () => {
    it("puts a run of beamed notes in a single group", () => {
        const measure = measureOf([
            note(fraction(0, 1), fraction(1, 16)),
            note(fraction(1, 16), fraction(1, 16)),
            note(fraction(2, 16), fraction(1, 16)),
            note(fraction(3, 16), fraction(1, 16)),
            rest(fraction(1, 4), fraction(3, 4)),
        ]);

        const groups = MeasureProjection.noteGroups(measure, gridOf());

        expect(indexesOf(groups, NoteGroupKind.Beam)).toEqual([[0, 1, 2, 3]]);
        expect(groups[0].start).toEqual(fraction(0, 1));
        expect(groups[0].end).toEqual(fraction(1, 4));
    });

    it("takes the step count of the bar from its own meter", () => {
        // A 6/8 bar counting eighths holds six steps, not sixteen: an eighth fills one step and a
        // dotted-quarter pulse covers three of them, so every three eighths form a beam group.
        const eighth = fraction(1, 6);
        const measure = measureOf([
            note(fraction(0, 6), eighth),
            note(fraction(1, 6), eighth),
            note(fraction(2, 6), eighth),
            note(fraction(3, 6), eighth),
            note(fraction(4, 6), eighth),
            note(fraction(5, 6), eighth),
        ], [], 6);

        const groups = MeasureProjection.noteGroups(measure, gridOf(6, 3));

        expect(indexesOf(groups, NoteGroupKind.Beam)).toEqual([[0, 1, 2], [3, 4, 5]]);
    });

    it("uses the exact pulse boundaries of an irregular meter", () => {
        // A 7/8 bar grouped as 2 + 2 + 3. The average pulse length of such a bar would place the
        // boundaries elsewhere and split the run differently.
        const eighth = fraction(1, 7);
        const measure = measureOf([
            note(fraction(0, 7), eighth),
            note(fraction(1, 7), eighth),
            note(fraction(2, 7), eighth),
            note(fraction(3, 7), eighth),
            note(fraction(4, 7), eighth),
            note(fraction(5, 7), eighth),
            note(fraction(6, 7), eighth),
        ], [], 7);

        const groups = MeasureProjection.noteGroups(measure, { stepsPerBar: 7, beatGroups: [2, 2, 3] });

        expect(indexesOf(groups, NoteGroupKind.Beam)).toEqual([[0, 1], [2, 3], [4, 5, 6]]);
    });

    it("breaks a beam group at a pulse boundary between top-level notes", () => {
        const measure = measureOf([
            note(fraction(0, 1), fraction(1, 16)),
            note(fraction(1, 16), fraction(1, 16)),
            note(fraction(2, 16), fraction(1, 16)),
            note(fraction(3, 16), fraction(1, 16)),
            note(fraction(4, 16), fraction(1, 16)),
            note(fraction(5, 16), fraction(1, 16)),
            rest(fraction(6, 16), fraction(10, 16)),
        ]);

        const groups = MeasureProjection.noteGroups(measure, gridOf());

        expect(indexesOf(groups, NoteGroupKind.Beam)).toEqual([[0, 1, 2, 3], [4, 5]]);
    });

    it("breaks a beam group at a rest, even when the rest is written as a flag-carrying value", () => {
        const measure = measureOf([
            note(fraction(0, 16), fraction(1, 16)),
            note(fraction(1, 16), fraction(1, 16)),
            note(fraction(2, 16), fraction(1, 16)),
            rest(fraction(3, 16), fraction(1, 16)),
            note(fraction(4, 16), fraction(1, 16)),
            note(fraction(5, 16), fraction(1, 16)),
            rest(fraction(6, 16), fraction(10, 16)),
        ]);

        // A half-note pulse keeps both runs within one pulse, so only the rest can split them.
        const groups = MeasureProjection.noteGroups(measure, gridOf(fixtureStepsPerBar, 8));

        expect(indexesOf(groups, NoteGroupKind.Beam)).toEqual([[0, 1, 2], [4, 5]]);
    });

    it("reports a tuplet with its subdivision and keeps its slots in one beam group", () => {
        const measure = measureOf([
            note(fraction(0, 1), fraction(1, 12)),
            note(fraction(1, 12), fraction(1, 12)),
            note(fraction(2, 12), fraction(1, 12)),
            rest(fraction(1, 4), fraction(3, 4)),
        ], [tuplet(0, 3, 4)]);

        const groups = MeasureProjection.noteGroups(measure, gridOf());
        const tuplets = groups.filter((group) => {
            return group.kind === NoteGroupKind.Tuplet;
        });

        expect(tuplets).toHaveLength(1);
        expect(tuplets[0].eventIndexes).toEqual([0, 1, 2]);
        expect(tuplets[0].subdivision?.actual).toBe(3);
        expect(tuplets[0].depth).toBe(0);
        expect(indexesOf(groups, NoteGroupKind.Beam)).toEqual([[0, 1, 2]]);
    });

    it("orders nested tuplets from the inside out", () => {
        // A triplet over a quarter whose first slot holds another triplet.
        const measure = measureOf([
            note(fraction(0, 36), fraction(1, 36)),
            note(fraction(1, 36), fraction(1, 36)),
            note(fraction(2, 36), fraction(1, 36)),
            note(fraction(3, 36), fraction(1, 12)),
            note(fraction(4, 36), fraction(1, 12)),
            rest(fraction(1, 4), fraction(3, 4)),
        ], [tuplet(0, 3, 4), tuplet(0, 3, 1)]);

        const groups = MeasureProjection.noteGroups(measure, gridOf());
        const tuplets = groups.filter((group) => {
            return group.kind === NoteGroupKind.Tuplet;
        });

        expect(tuplets.map((group) => {
            return group.eventIndexes;
        })).toEqual([[0, 1, 2], [0, 1, 2, 3, 4]]);
        expect(tuplets.map((group) => {
            return group.depth;
        })).toEqual([1, 0]);
    });
});
