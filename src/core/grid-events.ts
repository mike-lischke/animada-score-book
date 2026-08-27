/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import {
    MeasureProjection, ProjectedItemKind, type IProjectedItem,
} from "./MeasureProjection.js";
import type { IMeasureProjectionInput } from "./MeasureProjection.js";
import { addFractions, compareFractions, reduceFraction } from "./serialisation/numeric-functions.js";
import type { IFraction, IMeasureEvent, ISubdivision } from "./types/general.js";

/** The expanded per-step event list plus the subdivision bookkeeping needed to synthesise it back. */
export interface IGridExpansion {
    /** Per-step events: every grid-aligned event spans exactly one step; subdivision slots stay intact. */
    events: IMeasureEvent[];

    /** Subdivisions with their start indices remapped into the expanded event list. */
    subdivisions: ISubdivision[];

    /** Indices into {@link events} that belong to a subdivision slot and must not be absorbed or merged. */
    slotIndices: Set<number>;
}

const cloneEvent = (event: IMeasureEvent): IMeasureEvent => {
    return {
        start: { ...event.start },
        duration: { ...event.duration },
        noteStyleId: event.noteStyleId,
        articulation: event.articulation ? { ...event.articulation } : undefined,
    };
};

/**
 * Splits a measure's note-based events into per-step grid events. Every grid-aligned event is
 * broken into one-step pieces (a note becomes one note step plus empty rest steps), while
 * subdivision slots keep their exact, non-aligned durations. The resulting events can be edited
 * independently and are later merged back by {@link synthesizeGridEventsToMeasure}.
 *
 * @param measure The measure whose events should be expanded.
 *
 * @returns The expanded events, the remapped subdivisions and the subdivision slot indices.
 */
export const expandMeasureToGridEvents = (measure: IMeasureProjectionInput): IGridExpansion => {
    const stepsPerBar = measure.meter.stepResolution;
    const projected = MeasureProjection.project(measure);
    const events: IMeasureEvent[] = [];
    const subdivisions: ISubdivision[] = [];
    const slotIndices = new Set<number>();

    const splitTopLevelEvent = (event: IMeasureEvent): void => {
        const stepCount = (event.duration.numerator * stepsPerBar) / event.duration.denominator;

        if (!Number.isInteger(stepCount) || stepCount <= 0) {
            events.push(cloneEvent(event));

            return;
        }

        const stepDuration = reduceFraction(1, stepsPerBar);

        if (event.noteStyleId !== undefined) {
            events.push({ ...cloneEvent(event), duration: stepDuration });

            for (let step = 1; step < stepCount; step++) {
                events.push({
                    start: addFractions(event.start, reduceFraction(step, stepsPerBar)),
                    duration: stepDuration,
                });
            }
        } else {
            for (let step = 0; step < stepCount; step++) {
                events.push({
                    start: addFractions(event.start, reduceFraction(step, stepsPerBar)),
                    duration: stepDuration,
                });
            }
        }
    };

    const walk = (items: IProjectedItem[], insideSubdivision: boolean): void => {
        for (const item of items) {
            if (item.kind === ProjectedItemKind.Event) {
                if (insideSubdivision) {
                    slotIndices.add(events.length);
                    events.push(cloneEvent(item.event));
                } else {
                    splitTopLevelEvent(item.event);
                }
            } else {
                const startIndex = events.length;
                walk(item.items, true);
                subdivisions.push({ ...item.group, startIndex });
            }
        }
    };

    walk(projected, false);

    return { events, subdivisions, slotIndices };
};

/**
 * Merges per-step grid events back into the note-based score. Each note absorbs the grid rest
 * steps following it, up to the next note, subdivision slot or pulse boundary, while consecutive
 * grid rests collapse into a single event. Subdivision slots are preserved unchanged.
 *
 * @param events The per-step events to synthesise.
 * @param subdivisions The subdivisions (already remapped into the expanded event list).
 * @param slotIndices The expanded indices that are subdivision slots.
 * @param pulse The pulse as a fraction (e.g. 1/4).
 * @param stepsPerBar The grid resolution of the measure.
 *
 * @returns The note-based events and the subdivisions remapped into the synthesised event list.
 */
export const synthesizeGridEventsToMeasure = (
    events: IMeasureEvent[],
    subdivisions: ISubdivision[],
    slotIndices: Set<number>,
    pulse: IFraction,
    stepsPerBar: number,
): { events: IMeasureEvent[]; subdivisions: ISubdivision[]; } => {
    const measureEnd: IFraction = { numerator: 1, denominator: 1 };

    const isGridRest = (event: IMeasureEvent): boolean => {
        return event.noteStyleId === undefined
            && event.duration.numerator * stepsPerBar === event.duration.denominator;
    };

    // Start of the next note or subdivision slot after the given index (grid rests do not stop absorption).
    const nextStopperStart = (index: number): IFraction => {
        for (let k = index + 1; k < events.length; k++) {
            if (slotIndices.has(k) || !isGridRest(events[k])) {
                return events[k].start;
            }
        }

        return measureEnd;
    };

    const pulseBoundaryAfter = (start: IFraction): IFraction => {
        const startInPulses = (start.numerator * pulse.denominator)
            / (start.denominator * pulse.numerator);
        const nextK = Math.floor(startInPulses) + 1;
        const candidate = reduceFraction(nextK * pulse.numerator, pulse.denominator);

        return compareFractions(candidate, measureEnd) < 0 ? candidate : measureEnd;
    };

    const final: IMeasureEvent[] = [];
    const indexToFinal = new Map<number, number>();

    let lastPushedSlot = false;

    const pushRest = (start: IFraction, duration: IFraction, slot: boolean): void => {
        const last = final.at(-1);
        const isGrid = !slot && duration.numerator * stepsPerBar === duration.denominator;
        const lastIsGridRest = last !== undefined && last.noteStyleId === undefined && !lastPushedSlot;

        if (isGrid && lastIsGridRest) {
            last.duration = addFractions(last.duration, duration);

            return;
        }

        final.push({ start: { ...start }, duration: { ...duration } });
        lastPushedSlot = slot;
    };

    const pushSlot = (event: IMeasureEvent): void => {
        final.push(cloneEvent(event));
        lastPushedSlot = true;
    };

    const pushNote = (event: IMeasureEvent, duration: IFraction): void => {
        final.push({
            start: { ...event.start },
            duration: { ...duration },
            noteStyleId: event.noteStyleId,
            articulation: event.articulation ? { ...event.articulation } : undefined,
        });
        lastPushedSlot = false;
    };

    let i = 0;

    while (i < events.length) {
        const event = events[i];
        const slot = slotIndices.has(i);

        if (event.noteStyleId === undefined) {
            if (slot) {
                pushSlot(event);
            } else {
                pushRest(event.start, event.duration, false);
            }

            indexToFinal.set(i, final.length - 1);
            i++;

            continue;
        }

        if (slot) {
            pushSlot(event);
            indexToFinal.set(i, final.length - 1);
            i++;

            continue;
        }

        const pulseEnd = pulseBoundaryAfter(event.start);
        const stopperStart = nextStopperStart(i);
        const limit = compareFractions(stopperStart, pulseEnd) < 0 ? stopperStart : pulseEnd;

        let duration = event.duration;
        let j = i + 1;

        while (j < events.length && !slotIndices.has(j) && isGridRest(events[j])
            && compareFractions(events[j].start, limit) < 0) {
            duration = addFractions(duration, events[j].duration);
            j++;
        }

        pushNote(event, duration);
        indexToFinal.set(i, final.length - 1);

        i = j;
    }

    const remappedSubdivisions = subdivisions.map((subdivision) => {
        return {
            ...subdivision,
            startIndex: indexToFinal.get(subdivision.startIndex) ?? subdivision.startIndex,
        };
    });

    return { events: final, subdivisions: remappedSubdivisions };
};
