/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { requisitions } from "../supplement/Requisitions.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackPiece
} from "./ScoreBookDataModel.js";
import {
    addFractions, compareFractions,
} from "./serialisation/numeric-functions.js";
import type { IFraction, Mutable } from "./types/general.js";
import { getNewId, reserveId } from "./utils.js";

/**
 * A track holds its content as a list of {@link ISbDmTrackPiece} entries (one per bar).
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
    public readonly id: number;
    public readonly measures: ISbDmTrackPiece[] = [];

    public name = "";
    public volume = 1.0;
    public effectiveVolume = 1;

    public constructor(public readonly arrangement: ISbDmArrangement, public readonly instrument: ISbDmInstrument,
        id?: number) {
        this.id = id ?? getNewId();
        if (id !== undefined) {
            reserveId(id);
        }

        // Initialise with empty measures matching the current arrangement length.
        for (let measureNumber = 1; measureNumber <= this.arrangement.timeParams.length; measureNumber++) {
            this.measures.push(this.createEmptyMeasure(measureNumber));
        }
    }

    /**
     * Returns the note event that sounds at the given position of a measure, or a synthesised rest covering the
     * grid slot that starts there. A longer note may cover a slot without starting there.
     *
     * @param bar The 1-based measure number.
     * @param start The position as a fraction of the measure.
     * @param slot The length of the grid slot that starts at the position.
     *
     * @returns The matching event, a synthesised rest, or undefined when the measure does not exist.
     */
    public getNoteAt(bar: number, start: IFraction, slot: IFraction): ISbDmNoteEvent | undefined {
        const measure = this.measures[bar - 1] as ISbDmTrackPiece | undefined;
        if (!measure) {
            return undefined;
        }

        // Find a sounding note that covers this slot. Grid-aligned notes start exactly on the slot.
        const event = measure.noteEvents.find((candidate) => {
            if (!candidate.audioData) {
                return false;
            }

            const candidateEnd = addFractions(candidate.start, candidate.duration);

            return compareFractions(candidate.start, start) <= 0 && compareFractions(start, candidateEnd) < 0;
        });

        return event ?? this.createSynthesisedRest(measure, start, slot);
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
                for (const event of measure.noteEvents) {
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
            measure.events.splice(0, measure.events.length, {
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 1, denominator: 1 },
            });
            measure.subdivisions.splice(0, measure.subdivisions.length);
            measure.simile = undefined;
            measure.noteEvents.splice(0, measure.noteEvents.length);
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
    public insertMeasure(atIndex: number, source?: ISbDmTrackPiece): void {
        const measure = this.createEmptyMeasure(atIndex + 1);
        if (source) {
            measure.events.splice(0, measure.events.length, ...source.events.map((event) => {
                return {
                    start: { ...event.start },
                    duration: { ...event.duration },
                    noteStyleId: event.noteStyleId,
                    articulation: event.articulation ? { ...event.articulation } : undefined,
                };
            }));

            measure.subdivisions.splice(0, measure.subdivisions.length, ...source.subdivisions.map((subdivision) => {
                return { ...subdivision };
            }));

            if (source.simile) {
                measure.simile = true;
            }
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
        measure.events.splice(0, measure.events.length, {
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 1 },
        });
        measure.subdivisions.splice(0, measure.subdivisions.length);
        measure.simile = undefined;
        measure.noteEvents.splice(0, measure.noteEvents.length);
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
            const measure = this.measures[index] as Mutable<ISbDmTrackPiece>;
            measure.number = index + 1;
            measure.id = this.getMeasureId(index + 1);

            // A simile repeats the measure before it, so the first measure of a track cannot carry one.
            if (index === 0 && measure.simile) {
                measure.simile = undefined;
            }
        }
    }

    private createEmptyMeasure(measureNumber: number): ISbDmTrackPiece {
        const { timeSignature } = this.arrangement.timeParams;
        const [beats, beatUnits] = timeSignature.split("/").map(Number);

        return {
            id: this.getMeasureId(measureNumber),
            type: SbDmEntityType.TrackPiece,
            track: this,
            number: measureNumber,
            meter: {
                beats,
                beatUnits,
            },
            events: [{
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 1, denominator: 1 },
            }],
            subdivisions: [],
            noteEvents: [],
        };
    }

    private createSynthesisedRest(measure: ISbDmTrackPiece, start: IFraction, slot: IFraction): ISbDmNoteEvent {
        return {
            id: this.getRestPlaceholderId(measure, start, slot),
            type: SbDmEntityType.NoteEvent,
            measure,
            start: { ...start },
            duration: { ...slot },
            track: this,
            audioData: undefined,
        };
    }

    private getMeasureId(measureNumber: number): number {
        return (this.id * 10_000) + measureNumber;
    }

    private getRestPlaceholderId(measure: ISbDmTrackPiece, start: IFraction, slot: IFraction): number {
        // Deterministic id within this track: the slot index inside the measure. The offset keeps the value
        // distinct from event ids (which come from getNewId()) and from measure ids (this.id * 10_000 + n).
        const slotIndex = Math.round(start.numerator * slot.denominator / (start.denominator * slot.numerator));

        return (this.id * 1_000_000) + (measure.number * 1_000) + slotIndex;
    }
}
