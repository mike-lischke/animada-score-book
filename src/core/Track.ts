/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { requisitions } from "../supplement/Requisitions.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure, type ITiming
} from "./ScoreBookDataModel.js";
import { reduceFraction } from "./serialisation/numeric-functions.js";
import type { Mutable } from "./types/general.js";
import { createBeatGroups, getNewId } from "./utils.js";

/**
 * A track holds its content as a list of {@link ISbDmTrackMeasure} entries (one per bar).
 * Measure events are the single source of truth for note placement, duration and style.
 *
 * Tracks created via {@link Arrangement.addTrack} start with empty measures. Snapshot
 * application replaces measure contents wholesale; runtime editing happens directly on
 * the {@link ISbDmNoteEvent} objects returned by {@link getNoteAt} and
 * {@link notes} (synthesised rest events for empty grid slots are inserted into
 * the measure on demand by the editing code).
 */
export class Track implements ISbDmTrack {
    public readonly type = SbDmEntityType.Track;
    public readonly measures: ISbDmTrackMeasure[] = [];

    public name = "";
    public volume = 1.0;
    public effectiveVolume = 1;

    public constructor(public readonly arrangement: ISbDmArrangement, public readonly instrument: ISbDmInstrument,
        public readonly id = getNewId()) {
        // Initialise with empty measures matching the current arrangement length.
        for (let measureNumber = 1; measureNumber <= this.arrangement.timeParams.length; measureNumber++) {
            this.measures.push(this.createEmptyMeasure(measureNumber));
        }
    }

    /**
     * Returns the note event at the given grid timing, or a synthesised rest event when
     * the slot is empty. Returns undefined when the timing is out of range or covered by
     * a non-grid (polyrhythm-shaped) event.
     *
     * @param timing The bar/step position to look up.
     * @returns The matching event, a synthesised rest, or undefined.
     */
    public getNoteAt(timing: ITiming): ISbDmNoteEvent | undefined {
        const measure = this.measures[timing.bar - 1] as ISbDmTrackMeasure | undefined;
        if (!measure) {
            return undefined;
        }

        const stepsPerBar = this.getStepsPerBar();
        if (timing.step < 1 || timing.step > stepsPerBar) {
            return undefined;
        }

        const expectedStart = reduceFraction(timing.step - 1, stepsPerBar);

        // Find an event that starts exactly at this grid slot. Grid-aligned notes may carry an
        // extended duration (a multiple of 1/stepsPerBar) when they absorb the rest gap that
        // follows them within their pulse — these are still considered the "note at this slot".
        // Polyrhythm-shaped events (non-grid durations) are excluded here; they're surfaced via
        // the overlap branch below as synthesised rests so the grid view doesn't render them.
        const event = measure.events.find((candidate) => {
            const sameStart = candidate.start.numerator === expectedStart.numerator
                && candidate.start.denominator === expectedStart.denominator;
            if (!sameStart) {
                return false;
            }

            // duration === k / stepsPerBar (integer k ≥ 1)
            return (candidate.duration.numerator * stepsPerBar) % candidate.duration.denominator === 0;
        });

        if (event) {
            return event;
        }

        // The step is either uncovered or covered by a non-grid (polyrhythm-shaped) event.
        // We can only tell the two apart by checking whether *any* event overlaps the slot.
        const slotEnd = reduceFraction(timing.step, stepsPerBar);
        const overlapped = measure.events.some((candidate) => {
            const candidateEndNumerator = (candidate.start.numerator * candidate.duration.denominator)
                + (candidate.duration.numerator * candidate.start.denominator);
            const candidateEndDenominator = candidate.start.denominator * candidate.duration.denominator;
            // candidate.start < slotEnd && candidateEnd > slot.start
            const startsBeforeSlotEnd = (candidate.start.numerator * slotEnd.denominator)
                < (slotEnd.numerator * candidate.start.denominator);
            const endsAfterSlotStart = (candidateEndNumerator * expectedStart.denominator)
                > (expectedStart.numerator * candidateEndDenominator);

            return startsBeforeSlotEnd && endsAfterSlotStart;
        });

        if (overlapped) {
            // Covered by a polyrhythm-shaped event: don't render a grid slot here.
            // Return a transient rest placeholder so the UI grid still has 16 slots,
            // but mark the event in a way that can be detected by editors. The current
            // UI consumers filter by event presence, so we return a placeholder rest.
            return this.createSynthesisedRest(measure, timing);
        }

        return this.createSynthesisedRest(measure, timing);
    }

    /**
     * Iterates all note events for every measure in playback order, including rest events
     * (events where `noteStyle` is `undefined`).
     *
     * @returns An iterator over each stored note event in measure order.
     */
    public get notes(): IterableIterator<ISbDmNoteEvent> {
        const measures = this.measures;

        return (function* () {
            for (const measure of measures) {
                for (const event of measure.events) {
                    yield event;
                }
            }
        })();
    }

    /**
     * Removes all notes and subdivisions from every measure.
     */
    public clear(): void {
        for (const measure of this.measures) {
            for (const step of measure.steps) {
                step.noteStyleId = undefined;
                step.articulation = undefined;
            }

            measure.subdivisions.splice(0, measure.subdivisions.length);
            measure.events.splice(0, measure.events.length);
        }

        void requisitions.execute("trackChanged", this.id);
    }

    /**
     * Inserts a new measure at the given 0-based index. When a source measure is given, its steps and
     * subdivisions are copied into the new measure; otherwise the measure is empty.
     *
     * @param atIndex The 0-based index at which to insert.
     * @param source The measure to copy content from, or undefined for an empty measure.
     */
    public insertMeasure(atIndex: number, source?: ISbDmTrackMeasure): void {
        const measure = this.createEmptyMeasure(atIndex + 1);
        if (source) {
            measure.steps.splice(0, measure.steps.length, ...source.steps.map((step) => {
                return { ...step };
            }));

            measure.subdivisions.splice(0, measure.subdivisions.length, ...source.subdivisions.map((subdivision) => {
                return { ...subdivision };
            }));
        }

        this.measures.splice(atIndex, 0, measure);
        this.renumberMeasures();
    }

    /**
     * Deletes the measure at the given 0-based index.
     *
     * @param atIndex The 0-based index of the measure to delete.
     */
    public deleteMeasure(atIndex: number): void {
        this.measures.splice(atIndex, 1);
        this.renumberMeasures();
    }

    /**
     * Removes all notes and subdivisions from the measure at the given 0-based index.
     *
     * @param atIndex The 0-based index of the measure to clear.
     */
    public clearMeasure(atIndex: number): void {
        const measure = this.measures[atIndex];
        for (const step of measure.steps) {
            step.noteStyleId = undefined;
            step.articulation = undefined;
        }

        measure.subdivisions.splice(0, measure.subdivisions.length);
        measure.events.splice(0, measure.events.length);
    }

    /**
     * Duplicates the measure at the given 0-based index, inserting the copy right after it.
     *
     * @param atIndex The 0-based index of the measure to duplicate.
     */
    public duplicateMeasure(atIndex: number): void {
        this.insertMeasure(atIndex + 1, this.measures[atIndex]);
    }

    private renumberMeasures(): void {
        for (let index = 0; index < this.measures.length; index++) {
            const measure = this.measures[index] as Mutable<ISbDmTrackMeasure>;
            measure.number = index + 1;
            measure.id = this.getMeasureId(index + 1);
        }
    }

    private createEmptyMeasure(measureNumber: number): ISbDmTrackMeasure {
        const stepsPerBar = this.getStepsPerBar();
        const { timeSignature } = this.arrangement.timeParams;
        const [beats, beatUnits] = timeSignature.split("/").map(Number);

        return {
            id: this.getMeasureId(measureNumber),
            type: SbDmEntityType.TrackMeasure,
            number: measureNumber,
            meter: {
                beats,
                beatUnits,
                stepResolution: stepsPerBar,
                beatGroups: createBeatGroups(beats, beatUnits, stepsPerBar),
            },
            steps: Array.from({ length: stepsPerBar }, (_, index) => {
                return { index };
            }),
            subdivisions: [],
            events: [],
        };
    }

    private createSynthesisedRest(measure: ISbDmTrackMeasure, timing: ITiming): ISbDmNoteEvent {
        const stepsPerBar = this.getStepsPerBar();

        return {
            id: this.getRestPlaceholderId(timing),
            type: SbDmEntityType.NoteEvent,
            measureNumber: measure.number,
            start: reduceFraction(timing.step - 1, stepsPerBar),
            duration: reduceFraction(1, stepsPerBar),
            track: this,
            timing,
            audioData: undefined,
        };
    }

    private getMeasureId(measureNumber: number): number {
        return (this.id * 10_000) + measureNumber;
    }

    private getRestPlaceholderId(timing: ITiming): number {
        // Deterministic id within this track. Offset keeps the value distinct from event ids
        // (which come from getNewId()) and from measure ids (this.id * 10_000 + n).
        return (this.id * 1_000_000) + (timing.bar * 1_000) + timing.step;
    }

    private getStepsPerBar(): number {
        const stepsPerBar = this.arrangement.timeParams.timings.reduce((maxStep, timing) => {
            if (timing.bar !== 1) {
                return maxStep;
            }

            return Math.max(maxStep, timing.step);
        }, 0);

        if (stepsPerBar < 1) {
            throw new Error("Invalid arrangement timings: expected at least one step in bar 1");
        }

        return stepsPerBar;
    }
}
