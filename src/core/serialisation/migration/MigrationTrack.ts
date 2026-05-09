/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Note } from "./Note.js";
import { Publisher } from "../../Publisher.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure, type ITiming
} from "../../ScoreBookDataModel.js";
import type { IFraction } from "../../types/general.js";
import type { IPolyrhythm } from "./migration-types.js";
import { exists, getNewId, isSameTiming } from "../../utils.js";
import {
    addFractions, compareFractions, divideFraction, multiplyFraction, reduceFraction, subtractFractions
} from "../numeric-functions.js";

/**
 * Track variant used exclusively by the V1 → V2 snapshot migration.
 *
 * Carries the legacy notes + polyrhythms model and exposes the polyrhythm helpers the
 * migration needs. The `measures` getter computes the projected V2 measure layout from
 * notes and polyrhythms, which lets the migrator hand the result directly to
 * {@link getArrangementSnapshot}.
 */
export class MigrationTrack extends Publisher implements ISbDmTrack {
    public readonly type = SbDmEntityType.Track;
    public readonly notes: Note[] = [];
    public readonly polyrhythms: IPolyrhythm[] = [];

    public name = "";
    public volume = 1.0;
    public effectiveVolume = 1;

    public constructor(public readonly arrangement: ISbDmArrangement, public readonly instrument: ISbDmInstrument,
        public readonly id = getNewId()) {
        super();

        // Initialise all notes as rests for every grid timing.
        this.arrangement.timeParams.timings.forEach((timing) => {
            this.notes.push(new Note(this, timing));
        });
    }

    /**
     * Projects the current notes + polyrhythms into the V2 measure model.
     *
     * @returns The track content grouped by measure with note events.
     */
    public get measures(): ISbDmTrackMeasure[] {
        const { timeParams } = this.arrangement;
        const stepsPerBar = this.getStepsPerBar();
        const notePositions = this.getVisibleNotePositions(stepsPerBar);
        const visibleNotes = Array.from(this.getMigrationNoteIterator());
        const totalTrackLength = { numerator: timeParams.length * stepsPerBar, denominator: 1 };
        const eventsByMeasure = Array.from({ length: timeParams.length }, () => {
            return [] as ISbDmNoteEvent[];
        });

        visibleNotes.forEach((note, index) => {
            const start = notePositions.get(note);
            if (!start) {
                return;
            }

            const isLastVisibleNote = index === visibleNotes.length - 1;
            const end = isLastVisibleNote
                ? totalTrackLength
                : notePositions.get(visibleNotes[index + 1]) ?? totalTrackLength;
            const event = this.createMeasureEvent(note, start, subtractFractions(end, start), stepsPerBar);

            eventsByMeasure[event.measureNumber - 1]?.push(event);
        });

        return Array.from({ length: timeParams.length }, (_, index) => {
            const measureNumber = index + 1;
            const events = eventsByMeasure[index].sort((left, right) => {
                return compareFractions(left.start, right.start);
            });

            return {
                id: this.getMeasureId(measureNumber),
                type: SbDmEntityType.TrackMeasure,
                number: measureNumber,
                events,
            };
        });
    }

    public getNoteAt(timing: ITiming): ISbDmNoteEvent | undefined {
        for (const note of this.notes) {
            if (isSameTiming(note.timing, timing)) {
                return this.noteToEvent(note, timing);
            }
        }

        return undefined;
    }

    public clear(): void {
        this.notes.forEach((note) => {
            note.noteStyle = undefined;
        });
        this.polyrhythms.forEach(({ notes }) => {
            notes.forEach((note) => {
                note.noteStyle = undefined;
            });
        });
    }

    /**
     * Iterates the projected note events in measure order. Implements the
     * {@link ISbDmTrack.getNoteIterator} contract so callers consuming a generic track
     * (e.g. snapshot serialisation) work transparently.
     *
     * @yields {ISbDmNoteEvent} Each stored note event in measure order.
     */
    public *getNoteIterator(): IterableIterator<ISbDmNoteEvent> {
        for (const measure of this.measures) {
            for (const event of measure.events) {
                yield event;
            }
        }
    }

    /**
     * Iterates the underlying migration {@link Note} instances in playback/serialisation
     * order, traversing into polyrhythms unless `polyrhythmsToIgnore` lists them (then
     * they are treated as plain notes). Used exclusively by the V1 → V2 migration.
     *
     * @param polyrhythmsToIgnore Polyrhythms to skip into.
     * @yields {Note} Each migration note in iteration order.
     */
    public *getMigrationNoteIterator(polyrhythmsToIgnore: IPolyrhythm[] = []): IterableIterator<Note> {
        let index = 0;
        let currentNoteSource = this.notes;
        let note = currentNoteSource[index] as (Note | undefined);

        while (note) {
            // First, ascend polyrhythms until we reach a visible note.
            // eslint-disable-next-line no-loop-func
            const linkedPolyrhythmUp = this.polyrhythms.find((polyrhythm) => {
                return polyrhythm.start === note;
            });

            if (linkedPolyrhythmUp && !polyrhythmsToIgnore.includes(linkedPolyrhythmUp)) {
                currentNoteSource = linkedPolyrhythmUp.notes;
                index = 0;
            } else {
                yield note;

                // If we're at the end of a polyrhythm, descend until we're not.
                while (note.polyrhythm && !currentNoteSource[index + 1]) {
                    note = note.polyrhythm.end;
                    currentNoteSource = note.polyrhythm?.notes ?? this.notes;
                    index = currentNoteSource.indexOf(note);
                }

                index++;
            }

            note = currentNoteSource[index];
        }
    }

    public addPolyrhythm(start: Note, end: Note, length: number, id: number = getNewId(),
        index?: number): void {
        if (length < 1) {
            return;
        }

        const polyrhythm: IPolyrhythm = { start, end, id, notes: [] };

        polyrhythm.notes = Array.from(Array(length))
            .map((_, noteIndex) => {
                return new Note(this, { bar: 1, step: noteIndex }, polyrhythm);
            });

        if (exists(index)) {
            this.polyrhythms.splice(index, 0, polyrhythm);
        } else {
            this.polyrhythms.push(polyrhythm);
        }

        this.publish();
    }

    public removePolyrhythm(polyrhythm: IPolyrhythm): void {
        const index = this.polyrhythms.indexOf(polyrhythm);
        if (index !== -1) {
            this.polyrhythms.splice(index, 1);
            this.publish();
        }
    }

    private getVisibleNotePositions(stepsPerBar: number): Map<Note, IFraction> {
        const notePositions = new Map<Note, IFraction>();

        this.notes.forEach((note) => {
            notePositions.set(note, {
                numerator: this.getGlobalStepIndex(note.timing, stepsPerBar),
                denominator: 1,
            });
        });

        this.polyrhythms.forEach((polyrhythm) => {
            this.addNotePositionsForPolyrhythm(polyrhythm, notePositions, stepsPerBar);
        });

        return notePositions;
    }

    private addNotePositionsForPolyrhythm(polyrhythm: IPolyrhythm, notePositions: Map<Note, IFraction>,
        stepsPerBar: number): void {
        const startPosition = notePositions.get(polyrhythm.start);
        if (!startPosition) {
            return;
        }

        const nextNote = this.getNextVisibleNoteAfterPolyrhythm(polyrhythm);
        const endPosition = nextNote
            ? notePositions.get(nextNote)
            : { numerator: this.arrangement.timeParams.length * stepsPerBar, denominator: 1 };
        if (!endPosition) {
            return;
        }

        const noteDistance = divideFraction(
            subtractFractions(endPosition, startPosition),
            polyrhythm.notes.length,
        );

        polyrhythm.notes.forEach((note, index) => {
            notePositions.set(note, addFractions(startPosition, multiplyFraction(noteDistance, index)));
        });
    }

    private getNextVisibleNoteAfterPolyrhythm(polyrhythm: IPolyrhythm): Note | undefined {
        const laterPolyrhythms = this.polyrhythms.slice(this.polyrhythms.indexOf(polyrhythm) + 1);
        const noteIterator = this.getMigrationNoteIterator(laterPolyrhythms);
        let foundPolyrhythm = false;

        for (const note of noteIterator) {
            if (foundPolyrhythm) {
                if (note.polyrhythm !== polyrhythm) {
                    return note;
                }
            } else if (note.polyrhythm === polyrhythm) {
                foundPolyrhythm = true;
            }
        }

        return undefined;
    }

    private createMeasureEvent(note: Note, startPosition: IFraction, duration: IFraction,
        stepsPerBar: number): ISbDmNoteEvent {
        const measureWidth = startPosition.denominator * stepsPerBar;
        const measureIndex = Math.floor(startPosition.numerator / measureWidth);
        const measureOffset = startPosition.numerator - (measureIndex * measureWidth);

        return {
            id: note.id,
            type: SbDmEntityType.NoteEvent,
            measureNumber: measureIndex + 1,
            start: reduceFraction(measureOffset, measureWidth),
            duration: reduceFraction(duration.numerator, duration.denominator * stepsPerBar),
            track: this,
            timing: note.timing,
            noteStyle: note.noteStyle,
        };
    }

    private noteToEvent(note: Note, timing: ITiming): ISbDmNoteEvent {
        const stepsPerBar = this.getStepsPerBar();

        return {
            id: note.id,
            type: SbDmEntityType.NoteEvent,
            measureNumber: timing.bar,
            start: reduceFraction(timing.step - 1, stepsPerBar),
            duration: reduceFraction(1, stepsPerBar),
            track: this,
            timing,
            noteStyle: note.noteStyle,
        };
    }

    private getGlobalStepIndex(timing: ITiming, stepsPerBar: number): number {
        return ((timing.bar - 1) * stepsPerBar) + (timing.step - 1);
    }

    private getMeasureId(measureNumber: number): number {
        return (this.id * 10_000) + measureNumber;
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
