/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    ISbDmArrangement, ISbDmNoteEvent, ISbDmTrack, ISbDmTrackMeasure, ITiming,
} from "../core/ScoreBookDataModel.js";
import type { INoteValue } from "../core/rest-notation.js";
import {
    addFractions, compareFractions, reduceFraction, subtractFractions,
} from "../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction } from "../core/types/general.js";
import { requisitions } from "../supplement/Requisitions.js";
import { modelEventAt } from "../core/MeasureProjection.js";
import { MeasureEditor, type IAddressedEvent } from "./MeasureEditor.js";
import { SelectionGranularity, type ISelectionEntry } from "./SelectionSerializer.js";

/** Identifies a cell in the grid view using zero-based step indexing. */
export interface IGridEditorPosition {
    bar: number;
    trackId: number;
    step: number;

    /** Exact start fraction for subdivision slots, which do not align to grid steps. */
    start?: IFraction;
}

/** A resolved grid cell and its current data-model content. */
export interface IGridEditorCell extends IGridEditorPosition {
    arrangement: ISbDmArrangement;
    track: ISbDmTrack;
    note?: ISbDmNoteEvent;
}

/** The position and duration at which a note can be inserted without crossing a bar line. */
export interface INoteInsertion {
    position: IGridEditorPosition;
    duration: IFraction;
}

/** A contiguous subdivision target within a single measure of one track. */
interface ISubdivisionRange {
    trackId: number;
    bar: number;
    start: IFraction;
    end: IFraction;
    spanSteps: number;
}

interface IEmptySubdivisionCandidate {
    trackId: number;
    bar: number;
    start: IFraction;
    startIndex: number;
    actual: number;
}

/**
 * Handles the edits of the grid view without rendering or listening to DOM events. On top of the
 * shared edits it owns the raster: cells, subdivision slots and the space making that follows fixed
 * steps (ADR-0003, ADR-0005).
 */
export class GridMeasureEditor extends MeasureEditor {
    /**
     * Applies a note style to a grid cell. A cell covers one grid step, so a style written into an
     * empty cell takes that step's length. A cell that addresses a position inside a step — a slot of
     * a subdivision or of a step that holds thirty-seconds — keeps the length of the event it shows.
     *
     * @param position The target grid cell.
     * @param noteStyleId The selected instrument note-style id.
     * @returns The selected audio data, or undefined when the edit was invalid.
     */
    public setNote(position: IGridEditorPosition, noteStyleId: string): IAudioData | undefined {
        const cell = this.resolveCell(position);
        const style = this.noteStyleOf(position.trackId, noteStyleId);
        const measure = cell?.track.measures[position.bar - 1];
        const start = this.resolveStartFraction(position);
        if (!style || measure === undefined || start === undefined) {
            return undefined;
        }

        const step = reduceFraction(1, measure.meter.stepResolution);
        const aligned = compareFractions(start, reduceFraction(position.step, measure.meter.stepResolution)) === 0;
        const event = aligned ? undefined : modelEventAt(measure, start);

        this.dataModel.setNoteAt(position.trackId, position.bar, start, event?.duration ?? step, noteStyleId);

        return style;
    }

    /**
     * Resolves the bar fraction covered by a note of the given value at the given position. The grid
     * addresses notes by whole steps, so a value that does not land on one has no cell and is
     * rejected here.
     *
     * @param value The selected note value, including its augmentation dot.
     * @param position The grid position whose measure supplies the meter.
     *
     * @returns The duration as a fraction of the bar, or undefined when the value is invalid.
     */
    public noteValueDuration(value: INoteValue, position: IGridEditorPosition): IFraction | undefined {
        const cell = this.resolveCell(position);
        const measure = cell?.track.measures[position.bar - 1];
        const duration = measure === undefined ? undefined : this.noteValueDurationFor(value, measure);
        if (measure === undefined || duration === undefined) {
            return undefined;
        }

        const steps = duration.numerator * measure.meter.stepResolution / duration.denominator;

        return Number.isInteger(steps) && steps >= 1 ? duration : undefined;
    }

    /**
     * Checks whether a note starts at the given position. Such a position is the target of a style
     * change, while a position that only holds rest space is the target of a note insertion.
     *
     * @param position The grid position to inspect.
     *
     * @returns True when the position holds a note.
     */
    public hasNoteAt(position: IGridEditorPosition): boolean {
        const cell = this.resolveCell(position);

        return cell?.note?.audioData !== undefined;
    }

    /**
     * Checks whether the position marks a subdivision slot, whose duration is always the slot's own
     * fraction of the bar.
     *
     * @param position The grid position whose exact start identifies the slot.
     *
     * @returns True when the position is a subdivision slot.
     */
    public isSubdivisionSlot(position: IGridEditorPosition): boolean {
        const start = this.resolveStartFraction(position);

        return start !== undefined
            && this.dataModel.isSubdivisionSlot(position.trackId, position.bar, start);
    }

    /**
     * Moves a note that does not fit at the current position to the next bar. When a following note
     * is in the way, the note is shortened to the free space before that note, so a rest between two
     * notes can always be filled. In the final bar the note is shortened to the available space.
     *
     * The staff view uses {@link StaffMeasureEditor.insertNoteWithShift} instead, which keeps the
     * requested length and shifts following notes.
     *
     * @param position The requested insertion position.
     * @param duration The requested note duration.
     *
     * @returns The usable insertion, or undefined when the position has no remaining space.
     */
    public resolveNoteInsertion(position: IGridEditorPosition, duration: IFraction): INoteInsertion | undefined {
        const cell = this.resolveCell(position);
        const start = this.resolveStartFraction(position);
        if (!cell || start === undefined) {
            return undefined;
        }

        const barEnd = { numerator: 1, denominator: 1 };
        if (compareFractions(addFractions(start, duration), barEnd) <= 0) {
            return this.limitInsertion(position, start, duration);
        }

        if (position.bar < cell.track.measures.length) {
            const nextPosition = { bar: position.bar + 1, trackId: position.trackId, step: 0 };
            const nextDuration = this.noteLengthDurationForMeasure(
                duration,
                cell.track.measures[position.bar - 1],
                cell.track.measures[position.bar],
            );

            return nextDuration === undefined
                ? undefined
                : this.limitInsertion(nextPosition, { numerator: 0, denominator: 1 }, nextDuration);
        }

        const remaining = subtractFractions(barEnd, start);

        return remaining.numerator > 0 ? this.limitInsertion(position, start, remaining) : undefined;
    }

    /**
     * Inserts a note of the given duration at the given position, replacing existing content.
     *
     * @param position The grid position marking the note start.
     * @param duration The note duration as a fraction of the bar.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns The selected audio data, or undefined when the edit was invalid.
     */
    public insertNote(position: IGridEditorPosition, duration: IFraction, noteStyleId: string): IAudioData | undefined {
        const cell = this.resolveCell(position);
        const style = this.noteStyleOf(position.trackId, noteStyleId);
        if (!cell || !style) {
            return undefined;
        }

        const start = this.resolveStartFraction(position);
        if (start === undefined) {
            return undefined;
        }

        const end = addFractions(start, duration);
        if (compareFractions(end, { numerator: 1, denominator: 1 }) > 0) {
            return undefined;
        }

        return this.dataModel.setNoteAt(position.trackId, position.bar, start, duration, noteStyleId)
            ? style
            : undefined;
    }

    /**
     * Clears the note style at a grid cell.
     *
     * @param position The grid cell to clear.
     * @returns True when the cell changed.
     */
    public clearNote(position: IGridEditorPosition): boolean {
        const cell = this.resolveCell(position);
        const measure = cell?.track.measures[position.bar - 1];
        const start = this.resolveStartFraction(position);
        if (measure === undefined || start === undefined) {
            return false;
        }

        return this.dataModel.setNoteAt(position.trackId, position.bar, start,
            reduceFraction(1, measure.meter.stepResolution), undefined);
    }

    /**
     * Creates a subdivision over an exact fractional range of one track.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     * @param start The exact start position of the subdivision (inclusive).
     * @param end The exact end position of the subdivision (exclusive).
     * @param actual The number of equal slots the subdivision contains.
     * @param normal The number of grid steps the subdivision replaces.
     *
     * @returns True when the subdivision was created.
     */
    public createSubdivision(trackId: number, bar: number, start: IFraction, end: IFraction,
        actual: number, normal: number): boolean {
        return this.dataModel.createSubdivision(trackId, bar, start, end, actual, normal);
    }

    /**
     * Creates a subdivision starting at the given cursor position. A subdivision-slot cursor
     * always creates a child that replaces exactly one parent slot.
     *
     * @param position The cursor position marking the subdivision start.
     * @param actual The number of equal slots the subdivision contains.
     * @param normal The number of grid steps the subdivision replaces.
     *
     * @returns True when the subdivision was created.
     */
    public createSubdivisionAtCursor(position: IGridEditorPosition, actual: number, normal: number): boolean {
        const measure = this.resolveMeasure(position.trackId, position.bar);
        if (!measure) {
            return false;
        }

        const stepsPerBar = measure.meter.stepResolution;
        const start = position.start ?? reduceFraction(position.step, stepsPerBar);
        const selectedEvent = position.start === undefined
            ? undefined
            : measure.events.find((event) => {
                return compareFractions(event.start, position.start!) === 0;
            });
        const endStep = position.step + normal;
        if (!selectedEvent && endStep > stepsPerBar) {
            void requisitions.execute("showWarning", "Not enough space for this subdivision at the cursor.");

            return false;
        }

        const resolvedNormal = selectedEvent ? 1 : normal;
        const end = selectedEvent ? addFractions(start, selectedEvent.duration) : reduceFraction(endStep, stepsPerBar);

        return this.dataModel.createSubdivision(position.trackId, position.bar, start, end, actual, resolvedNormal);
    }

    /**
     * Creates a subdivision covering the contiguous, single-track selection described by the given
     * entries. The selection span becomes the subdivision's `normal` step count.
     *
     * @param entries The selection entries defining the subdivision span.
     * @param actual The number of equal slots the subdivision contains.
     *
     * @returns True when the subdivision was created.
     */
    public createSubdivisionForSelection(entries: ISelectionEntry[], actual: number): boolean {
        const range = this.resolveSelectionRange(entries);
        if (!range) {
            return false;
        }

        const measure = this.resolveMeasure(range.trackId, range.bar);
        if (!measure) {
            return false;
        }

        return this.dataModel.createSubdivision(range.trackId, range.bar, range.start, range.end,
            actual, range.spanSteps, this.selectedEventsOf(entries));
    }

    /**
     * Deletes the subdivision whose first event starts at the given position.
     *
     * @param position The grid position whose exact start identifies the subdivision.
     *
     * @returns True when a subdivision was deleted.
     */
    public deleteSubdivisionAt(position: IGridEditorPosition): boolean {
        const start = this.resolveStartFraction(position);

        return start === undefined
            ? false
            : this.dataModel.deleteSubdivisionAt(position.trackId, position.bar, start);
    }

    /**
     * Checks whether an empty subdivision starts at the given position.
     *
     * @param position The grid position whose exact start identifies the subdivision.
     *
     * @returns True when the position marks the first slot of an empty subdivision.
     */
    public hasEmptySubdivisionAt(position: IGridEditorPosition): boolean {
        const start = position.start;

        return start !== undefined
            && this.dataModel.hasEmptySubdivisionAt(position.trackId, position.bar, start);
    }

    /**
     * Deletes selected subdivisions when the selection covers complete groups of rest slots.
     *
     * @param entries The current selection entries.
     *
     * @returns True when at least one complete empty subdivision was deleted.
     */
    public deleteEmptySubdivisionsForSelection(entries: ISelectionEntry[]): boolean {
        if (entries.length === 0) {
            return false;
        }

        const candidates = new Map<string, IEmptySubdivisionCandidate>();
        for (const entry of entries) {
            const target = entry.target;
            if (target.granularity !== SelectionGranularity.Note) {
                return false;
            }

            const { measure } = target;
            const cellStart = target.start ?? target.event.start;
            const eventIndex = measure.events.findIndex((event) => {
                return compareFractions(event.start, cellStart) === 0;
            });
            const subdivision = measure.subdivisions.find((candidate) => {
                return eventIndex >= candidate.startIndex
                    && eventIndex < candidate.startIndex + candidate.actual;
            });
            if (!subdivision
                || measure.events.slice(subdivision.startIndex, subdivision.startIndex + subdivision.actual)
                    .some((event) => {
                        return event.noteStyleId !== undefined;
                    })) {
                return false;
            }

            const key = `${measure.track.id}:${measure.number}:${subdivision.startIndex}`;
            candidates.set(key, {
                trackId: measure.track.id,
                bar: measure.number,
                start: { ...measure.events[subdivision.startIndex].start },
                startIndex: subdivision.startIndex,
                actual: subdivision.actual,
            });
        }

        for (const candidate of candidates.values()) {
            const measure = this.resolveMeasure(candidate.trackId, candidate.bar);
            if (!measure) {
                return false;
            }

            const complete = measure.events
                .slice(candidate.startIndex, candidate.startIndex + candidate.actual)
                .every((event) => {
                    return entries.some((entry) => {
                        const target = entry.target;

                        return target.granularity === SelectionGranularity.Note
                            && target.measure === measure
                            && compareFractions(target.start ?? target.event.start, event.start) === 0;
                    });
                });
            if (!complete) {
                return false;
            }
        }

        let deleted = false;
        for (const candidate of candidates.values()) {
            deleted = this.dataModel.deleteSubdivisionAt(candidate.trackId, candidate.bar, candidate.start)
                || deleted;
        }

        return deleted;
    }

    /**
     * Resolves a grid position against the current arrangement.
     *
     * @param position The zero-based grid position.
     * @returns The resolved cell, or undefined when the position is invalid.
     */
    public resolveCell(position: IGridEditorPosition): IGridEditorCell | undefined {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement || position.bar < 1 || position.bar > arrangement.timeParams.length) {
            return undefined;
        }

        const track = arrangement.tracks.find((candidate) => {
            return candidate.id === position.trackId;
        });
        if (!track) {
            return undefined;
        }

        const timing: ITiming = { bar: position.bar, step: position.step + 1 };
        const note = track.getNoteAt(timing);

        return { ...position, arrangement, track, note };
    }

    /**
     * Returns the current arrangement cell for an existing note event.
     *
     * @param noteId The note event identifier.
     * @returns The note position, or undefined when the note is not present.
     */
    public findNote(noteId: number): IGridEditorCell | undefined {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

        for (const track of arrangement.tracks) {
            for (const measure of track.measures) {
                const event = measure.noteEvents.find((candidate) => {
                    return candidate.id === noteId;
                });
                if (event) {
                    return {
                        arrangement,
                        track,
                        bar: measure.number,
                        trackId: track.id,
                        step: event.timing.step - 1,
                        note: event,
                    };
                }
            }
        }

        return undefined;
    }

    /**
     * Resolves the events addressed by a selection entry. The grid edits cells, so only a cell that
     * starts a note is addressed: a cell inside a longer note is grid layout and holds no note of its
     * own, and a rest keeps its length, because the grid has no free positions to move content into.
     *
     * @param entry The selection entry to resolve.
     *
     * @returns The addressed notes, in measure order.
     */
    protected override addressedEventsOf(entry: ISelectionEntry): IAddressedEvent[] {
        const { target } = entry;

        if (target.granularity === SelectionGranularity.Note) {
            const start = target.start ?? target.event.start;
            const event = modelEventAt(target.measure, start);
            if (event?.noteStyleId === undefined || compareFractions(event.start, start) !== 0) {
                return [];
            }

            return [this.addressedEventOf(event.start, target.measure)];
        }

        if (target.granularity !== SelectionGranularity.NoteGroup) {
            return [];
        }

        const addressed: IAddressedEvent[] = [];
        for (const event of target.events) {
            if (event.noteStyleId !== undefined) {
                addressed.push(this.addressedEventOf(event.start, target.measure));
            }
        }

        return addressed;
    }

    /**
     * Resolves the exact start fraction of a grid position, falling back to the grid step when the
     * position does not carry an exact subdivision-slot start.
     *
     * @param position The grid position to resolve.
     *
     * @returns The exact start fraction, or undefined when the position is invalid.
     */
    private resolveStartFraction(position: IGridEditorPosition): IFraction | undefined {
        if (position.start !== undefined) {
            return position.start;
        }

        const cell = this.resolveCell(position);
        if (!cell) {
            return undefined;
        }

        return reduceFraction(position.step, cell.track.measures[position.bar - 1].meter.stepResolution);
    }

    /**
     * Describes a position inside a measure the way the data model addresses a note.
     *
     * @param start The position as a fraction of the measure.
     * @param measure The measure the position belongs to.
     *
     * @returns The addressed event.
     */
    private addressedEventOf(start: IFraction, measure: ISbDmTrackMeasure): IAddressedEvent {
        return { trackId: measure.track.id, bar: measure.number, start: { ...start } };
    }

    private noteLengthDurationForMeasure(duration: IFraction, sourceMeasure: ISbDmTrackMeasure,
        targetMeasure: ISbDmTrackMeasure): IFraction | undefined {
        const steps = duration.numerator * sourceMeasure.meter.stepResolution / duration.denominator;
        if (!Number.isInteger(steps)) {
            return undefined;
        }

        return reduceFraction(steps, targetMeasure.meter.stepResolution);
    }

    /**
     * Shortens an insertion to the free space before the next note, because an inserted note never
     * overwrites a following note. Positions without a following note keep the requested duration.
     *
     * @param position The insertion position.
     * @param start The exact insertion start.
     * @param duration The requested note duration.
     *
     * @returns The usable insertion, or undefined when no space is left.
     */
    private limitInsertion(position: IGridEditorPosition, start: IFraction,
        duration: IFraction): INoteInsertion | undefined {
        const nextNoteStart = this.nextNoteStart(position.trackId, position.bar, start,
            addFractions(start, duration));
        const available = nextNoteStart === undefined ? duration : subtractFractions(nextNoteStart, start);

        return available.numerator > 0 ? { position, duration: available } : undefined;
    }

    /**
     * Resolves the selection entries into a contiguous subdivision range. The entries must belong
     * to a single measure of a single track, be grid-aligned, and use note-level granularity.
     *
     * @param entries The selection entries to resolve.
     *
     * @returns The resolved range, or undefined when the selection is not a usable subdivision span.
     */
    private resolveSelectionRange(entries: ISelectionEntry[]): ISubdivisionRange | undefined {
        if (entries.length === 0) {
            return undefined;
        }

        const first = entries[0].target;
        if (first.granularity === SelectionGranularity.Track
            || first.granularity === SelectionGranularity.Measure
            || first.granularity === SelectionGranularity.TrackPiece) {
            return undefined;
        }

        const measure = first.measure;
        const stepsPerBar = measure.meter.stepResolution;

        let minStep = Number.MAX_SAFE_INTEGER;
        let maxStep = Number.MIN_SAFE_INTEGER;

        for (const entry of entries) {
            const target = entry.target;
            if (target.granularity === SelectionGranularity.Track
                || target.granularity === SelectionGranularity.Measure
                || target.granularity === SelectionGranularity.TrackPiece || target.measure !== measure) {
                return undefined;
            }

            const events = target.granularity === SelectionGranularity.Note ? [target.event] : target.events;
            for (const event of events) {
                const start = event.start.numerator * stepsPerBar / event.start.denominator;
                const end = start + (event.duration.numerator * stepsPerBar / event.duration.denominator);

                // A subdivision slot does not align to a step and cannot become a subdivision again.
                if (!Number.isInteger(start) || !Number.isInteger(end)) {
                    return undefined;
                }

                minStep = Math.min(minStep, start);
                maxStep = Math.max(maxStep, end - 1);
            }
        }

        if (minStep === Number.MAX_SAFE_INTEGER || minStep < 0 || maxStep >= stepsPerBar) {
            return undefined;
        }

        const spanSteps = maxStep - minStep + 1;

        return {
            trackId: measure.track.id,
            bar: measure.number,
            start: reduceFraction(minStep, stepsPerBar),
            end: reduceFraction(maxStep + 1, stepsPerBar),
            spanSteps,
        };
    }
}
