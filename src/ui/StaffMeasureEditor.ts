/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmTrackMeasure } from "../core/ScoreBookDataModel.js";
import type { INoteValue } from "../core/rest-notation.js";
import { addFractions, compareFractions, subtractFractions } from "../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction, IMeasureEvent } from "../core/types/general.js";
import { requisitions } from "../supplement/Requisitions.js";
import { MeasureEditor, type IAddressedEvent } from "./MeasureEditor.js";
import { SelectionGranularity, type ISelectionEntry } from "./SelectionSerializer.js";
import { selectionEventTargets } from "./selection-ranges.js";

/** The bar line as a bar fraction. */
const barLine: IFraction = { numerator: 1, denominator: 1 };

/**
 * Identifies a position in the staff view: the exact fraction of the measure the addressed run
 * starts at. The staff has no raster, so a position carries no step index (ADR-0005).
 */
export interface IStaffEditorPosition {
    bar: number;
    trackId: number;
    start: IFraction;
}

/** A written note in the staff view: where it starts, how long it is and which sound was applied. */
export interface IInsertedStaffNote extends IStaffEditorPosition {
    duration: IFraction;
    style: IAudioData;
}

/**
 * Handles the edits of the staff view without rendering or listening to DOM events. It addresses
 * positions as exact fractions instead of cells, and it makes room by shifting the following notes
 * instead of shortening the written one (ADR-0003, ADR-0005).
 */
export class StaffMeasureEditor extends MeasureEditor {
    /**
     * Checks whether a note starts at the given position. A rest run holds no note, so it is filled
     * by an insertion rather than a style change.
     *
     * @param position The staff position to inspect.
     *
     * @returns True when the position starts a note.
     */
    public hasNoteAt(position: IStaffEditorPosition): boolean {
        return this.hasNoteStartAt(position.trackId, position.bar, position.start);
    }

    /**
     * Checks whether the position marks a subdivision slot, whose duration is always the slot's own
     * fraction of the bar.
     *
     * @param position The staff position to inspect.
     *
     * @returns True when the position is a subdivision slot.
     */
    public isSubdivisionSlot(position: IStaffEditorPosition): boolean {
        return this.dataModel.isSubdivisionSlot(position.trackId, position.bar, position.start);
    }

    /**
     * Resolves the bar fraction covered by a note of the given value at the given position. The
     * staff has no raster, so every value the meter can express is allowed.
     *
     * @param value The selected note value, including its augmentation dot.
     * @param position The position whose measure supplies the meter.
     *
     * @returns The duration as a fraction of the bar, or undefined when the value is invalid.
     */
    public noteValueDuration(value: INoteValue, position: IStaffEditorPosition): IFraction | undefined {
        const measure = this.resolveMeasure(position.trackId, position.bar);

        return measure === undefined ? undefined : this.noteValueDurationFor(value, measure);
    }

    /**
     * Applies a note style to the note or subdivision slot at the given position. The addressed
     * element keeps its duration, because a style change never alters a note's length (ADR-0003).
     *
     * @param position The position of the addressed note or slot.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns The selected audio data, or undefined when the edit was invalid.
     */
    public setNote(position: IStaffEditorPosition, noteStyleId: string): IAudioData | undefined {
        const style = this.noteStyleOf(position.trackId, noteStyleId);
        const event = this.eventAt(position);
        if (style === undefined || event === undefined) {
            return undefined;
        }

        return this.dataModel.setNoteAt(position.trackId, position.bar, position.start, event.duration, noteStyleId)
            ? style
            : undefined;
    }

    /**
     * Writes a note of the given duration at the given position. The note keeps the requested length
     * and the following notes give way: the insertion fills the free space before the next note, and
     * the note is then grown to its requested length, which ripples the following notes to the right.
     * Where shifting is impossible — a track holding subdivisions, or no room left — the shortened
     * note remains (ADR-0003).
     *
     * @param position The position marking the note start.
     * @param duration The requested note duration.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns The written note, or undefined when the edit was invalid.
     */
    public insertNoteWithShift(position: IStaffEditorPosition, duration: IFraction,
        noteStyleId: string): IInsertedStaffNote | undefined {
        const style = this.noteStyleOf(position.trackId, noteStyleId);
        const fitting = this.fitIntoFreeSpace(position, duration);
        if (style === undefined || fitting === undefined) {
            return undefined;
        }

        const written = this.dataModel.setNoteAt(position.trackId, position.bar, position.start, fitting, noteStyleId);
        if (!written) {
            return undefined;
        }

        const shifted = compareFractions(fitting, duration) < 0
            && this.dataModel.resizeNote(position.trackId, position.bar, position.start, duration);

        return {
            bar: position.bar,
            trackId: position.trackId,
            start: { ...position.start },
            duration: shifted ? { ...duration } : fitting,
            style,
        };
    }

    /**
     * Clears the run the given position addresses, turning it into a rest.
     *
     * @param position The position of the run to clear.
     *
     * @returns True when the content changed.
     */
    public clearNote(position: IStaffEditorPosition): boolean {
        const event = this.eventAt(position);
        if (event === undefined) {
            return false;
        }

        return this.dataModel.clearRanges([{
            trackId: position.trackId,
            bar: position.bar,
            start: { ...event.start },
            end: addFractions(event.start, event.duration),
        }]);
    }

    /**
     * Removes the event at the given position and pulls the following events to the left by its
     * length. Unlike {@link clearNote}, no rest stays behind: a rest is removed as well and the
     * track becomes shorter.
     *
     * @param position The position of the event to remove.
     *
     * @returns True when the event was removed.
     */
    public deleteEventWithShift(position: IStaffEditorPosition): boolean {
        return this.dataModel.deleteEventWithShift(position.trackId, position.bar, position.start);
    }

    /**
     * Creates a subdivision over the events the selection addresses. The span from the first to the
     * last addressed event becomes the subdivision's grid span, and the selected note styles are
     * copied into its leading slots — the same edit the grid performs for a cell selection. The span
     * must cover whole grid steps, since a subdivision replaces steps.
     *
     * @param entries The selection entries defining the subdivision span.
     * @param actual The number of equal slots the subdivision contains.
     *
     * @returns True when the subdivision was created.
     */
    public createSubdivisionForSelection(entries: ISelectionEntry[], actual: number): boolean {
        const events = this.selectedEventsOf(entries);
        const first = events.at(0);
        const last = events.at(-1);
        const measure = this.measureOfSelection(entries);

        if (measure === undefined || first === undefined || last === undefined) {
            return false;
        }

        const start = { ...first.start };
        const end = addFractions(last.start, last.duration);
        const steps = this.stepSpanOf(start, end, measure);
        if (steps === undefined) {
            void requisitions.execute("showWarning", "This selection does not cover whole grid steps.");

            return false;
        }

        return this.dataModel.createSubdivision(measure.track.id, measure.number, start, end, actual, steps, events);
    }

    /**
     * Resolves the events addressed by a selection entry. A run addresses the event it renders, a note
     * group every event it contains. The staff has free positions, so a rest is addressed as well: a
     * length change moves the content behind it instead of ignoring it.
     *
     * @param entry The selection entry to resolve.
     *
     * @returns The addressed events, in measure order.
     */
    protected override addressedEventsOf(entry: ISelectionEntry): IAddressedEvent[] {
        const { target } = entry;

        // A track, a whole measure or a track piece addresses every event it covers, so a length
        // applies to all of them at once.
        if (target.granularity === SelectionGranularity.Track || target.granularity === SelectionGranularity.Measure
            || target.granularity === SelectionGranularity.TrackPiece) {
            const arrangement = this.dataModel.arrangement;

            return arrangement ? selectionEventTargets(arrangement, [entry]) : [];
        }

        if (target.granularity === SelectionGranularity.Note) {
            return [this.addressedEventOf(target.event.start, target.measure)];
        }

        return target.events.map((event) => {
            return this.addressedEventOf(event.start, target.measure);
        });
    }

    /**
     * Resolves the measure the selection lives in. A subdivision replaces a span of one measure, so a
     * selection that addresses whole tracks or several measures cannot host one.
     *
     * @param entries The selection entries to inspect.
     *
     * @returns The measure, or undefined when the selection is not confined to one.
     */
    private measureOfSelection(entries: ISelectionEntry[]): ISbDmTrackMeasure | undefined {
        const measures = new Set<ISbDmTrackMeasure>();

        for (const entry of entries) {
            const { target } = entry;
            if (target.granularity !== SelectionGranularity.Note
                && target.granularity !== SelectionGranularity.NoteGroup) {
                return undefined;
            }

            measures.add(target.measure);
        }

        const [measure] = measures;

        return measures.size === 1 ? measure : undefined;
    }

    /**
     * Resolves the number of grid steps a fractional span covers.
     *
     * @param start The span start as a fraction of the measure.
     * @param end The span end as a fraction of the measure.
     * @param measure The measure supplying the step resolution.
     *
     * @returns The step count, or undefined when the span does not run from step boundary to step boundary.
     */
    private stepSpanOf(start: IFraction, end: IFraction, measure: ISbDmTrackMeasure): number | undefined {
        const stepsPerBar = measure.meter.stepResolution;
        const from = (start.numerator * stepsPerBar) / start.denominator;
        const to = (end.numerator * stepsPerBar) / end.denominator;

        return Number.isInteger(from) && Number.isInteger(to) && to - from >= 1 ? to - from : undefined;
    }

    /**
     * Shortens a requested duration so that the insertion fits before the next note and inside the
     * measure. The following notes move afterwards, when the note grows to its full length.
     *
     * @param position The position marking the note start.
     * @param duration The requested note duration.
     *
     * @returns The duration the insertion can take, or undefined when nothing fits.
     */
    private fitIntoFreeSpace(position: IStaffEditorPosition, duration: IFraction): IFraction | undefined {
        const room = subtractFractions(barLine, position.start);
        const requested = compareFractions(duration, room) < 0 ? duration : room;
        if (requested.numerator <= 0) {
            return undefined;
        }

        const nextNote = this.nextNoteStart(position.trackId, position.bar, position.start,
            addFractions(position.start, requested));
        const available = nextNote === undefined ? requested : subtractFractions(nextNote, position.start);

        return available.numerator > 0 ? available : undefined;
    }

    /**
     * Resolves the event that starts at the given position.
     *
     * @param position The position to look up.
     *
     * @returns The event starting there, or undefined when no event starts at the position.
     */
    private eventAt(position: IStaffEditorPosition): IMeasureEvent | undefined {
        const measure = this.resolveMeasure(position.trackId, position.bar);

        return measure?.events.find((candidate) => {
            return compareFractions(candidate.start, position.start) === 0;
        });
    }

    /**
     * Describes a position inside a measure the way the data model addresses an event.
     *
     * @param start The position as a fraction of the measure.
     * @param measure The measure the position belongs to.
     *
     * @returns The addressed event.
     */
    private addressedEventOf(start: IFraction, measure: ISbDmTrackMeasure): IAddressedEvent {
        return { trackId: measure.track.id, bar: measure.number, start: { ...start } };
    }
}
