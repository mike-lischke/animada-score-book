/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { expandMeasureToGridEvents, synthesizeGridEventsToMeasure } from "../../src/core/grid-events.js";
import type { IMeasureEvent, ISubdivision } from "../../src/core/types/general.js";

const measureOf = (events: IMeasureEvent[], subdivisions: ISubdivision[] = [], stepResolution = 16) => {
    return { events, subdivisions, meter: { stepResolution } };
};

// Drops the explicit `articulation: undefined` key so deep equality ignores shape-only differences.
const stripArticulation = (events: IMeasureEvent[]): Array<Omit<IMeasureEvent, "articulation">> => {
    return events.map((event) => {
        return {
            start: event.start,
            duration: event.duration,
            noteStyleId: event.noteStyleId,
        };
    });
};

describe("grid events", () => {
    it("expands a quarter note into a note step plus rest steps", () => {
        const measure = measureOf([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);

        const { events, subdivisions, slotIndices } = expandMeasureToGridEvents(measure);

        expect(events).toHaveLength(16);
        expect(subdivisions).toHaveLength(0);
        expect(slotIndices.size).toBe(0);

        expect(events[0]).toMatchObject({
            noteStyleId: "1",
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 16 },
        });
        expect(events[1].noteStyleId).toBeUndefined();
        expect(events[1].start).toEqual({ numerator: 1, denominator: 16 });
        expect(events[3].start).toEqual({ numerator: 3, denominator: 16 });
        expect(events[15].start).toEqual({ numerator: 15, denominator: 16 });
    });

    it("synthesises a quarter note back from per-step events", () => {
        const original = [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ];
        const { events, subdivisions, slotIndices } = expandMeasureToGridEvents(measureOf(original));
        const pulse = { numerator: 1, denominator: 4 };

        const { events: synthesised } = synthesizeGridEventsToMeasure(
            events, subdivisions, slotIndices, pulse, 16,
        );

        expect(stripArticulation(synthesised)).toEqual(stripArticulation(original));
    });

    it("treats clearing a rest step as a no-op after synthesis", () => {
        const original = [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ];
        const { events, subdivisions, slotIndices } = expandMeasureToGridEvents(measureOf(original));
        const pulse = { numerator: 1, denominator: 4 };

        // Clear step 1, which is already an empty rest step.
        events[1].noteStyleId = undefined;

        const { events: synthesised } = synthesizeGridEventsToMeasure(
            events, subdivisions, slotIndices, pulse, 16,
        );

        expect(stripArticulation(synthesised)).toEqual(stripArticulation(original));
    });

    it("treats clearing the note step as removing the whole note", () => {
        const original = [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ];
        const { events, subdivisions, slotIndices } = expandMeasureToGridEvents(measureOf(original));
        const pulse = { numerator: 1, denominator: 4 };

        events[0].noteStyleId = undefined;

        const { events: synthesised } = synthesizeGridEventsToMeasure(
            events, subdivisions, slotIndices, pulse, 16,
        );

        expect(stripArticulation(synthesised)).toEqual(stripArticulation([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } },
        ]));
    });

    it("keeps subdivision slots intact across expansion and synthesis", () => {
        const original: IMeasureEvent[] = [
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 6 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 5, denominator: 24 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ];
        const subdivisions: ISubdivision[] = [{ startIndex: 2, actual: 3, normal: 2, isTuplet: true }];

        const { events, subdivisions: expandedSubdivisions, slotIndices } = expandMeasureToGridEvents(
            measureOf(original, subdivisions),
        );

        expect(expandedSubdivisions).toEqual([{ startIndex: 2, actual: 3, normal: 2, isTuplet: true }]);
        expect([...slotIndices]).toEqual([2, 3, 4]);
        expect(events).toHaveLength(17);
        expect(events[2].duration).toEqual({ numerator: 1, denominator: 24 });

        const pulse = { numerator: 1, denominator: 4 };
        const { events: synthesised, subdivisions: synthesisedSubdivisions } = synthesizeGridEventsToMeasure(
            events, expandedSubdivisions, slotIndices, pulse, 16,
        );

        expect(synthesisedSubdivisions).toEqual([{ startIndex: 2, actual: 3, normal: 2, isTuplet: true }]);
        expect(stripArticulation(synthesised)).toEqual(stripArticulation(original));
    });

    it("keeps adjacent same-style notes separate when synthesising", () => {
        // Two adjacent note steps followed by empty steps: the first note must not absorb the
        // second, and the second absorbs the remaining rests up to the pulse boundary.
        const perStep: IMeasureEvent[] = [
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 16 } },
            { start: { numerator: 3, denominator: 16 }, duration: { numerator: 1, denominator: 16 } },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ];

        const { events: synthesised } = synthesizeGridEventsToMeasure(
            perStep, [], new Set(), { numerator: 1, denominator: 4 }, 16,
        );

        expect(stripArticulation(synthesised)).toEqual(stripArticulation([
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 3, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]));
    });
});
