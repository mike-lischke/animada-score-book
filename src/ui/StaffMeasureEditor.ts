/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmTrackMeasure } from "../core/ScoreBookDataModel.js";
import type { INoteValue } from "../core/rest-notation.js";
import { addFractions, compareFractions, subtractFractions } from "../core/serialisation/numeric-functions.js";
import { EditEntryMode, type IAudioData, type IFraction, type IMeasureEvent } from "../core/types/general.js";
import { requisitions, type ISubdivisionCreationRequest } from "../supplement/Requisitions.js";
import { MeasureEditor, type IAddressedEvent, type IMeasurePosition } from "./MeasureEditor.js";
import { ScoreElementKind } from "./ScoreElementRegistry.js";
import { SelectionGranularity, type ISelectionEntry } from "./SelectionSerializer.js";
import { selectionEventTargets } from "./selection-ranges.js";

/** The bar line as a bar fraction. */
const barLine: IFraction = { numerator: 1, denominator: 1 };

/** The start of a measure as a bar fraction. */
const barStart: IFraction = { numerator: 0, denominator: 1 };

/** A written element in the staff view: where it starts, how long it is and which sound was applied. */
export interface IInsertedStaffEvent extends IMeasurePosition {
    duration: IFraction;

    /** The applied sound, or undefined for a rest. */
    style?: IAudioData;
}

/** The element an exact staff position addresses in the model: the event and its measure. */
export interface IStaffEventAddress {
    measure: ISbDmTrackMeasure;

    event: IMeasureEvent;
}

/** Where an element is written: the measure it goes into, the position it starts at and its length. */
interface IInsertionTarget {
    measure: ISbDmTrackMeasure;

    /** The position the element starts at, which is the next measure's start when it moved over. */
    position: IMeasurePosition;

    /** The element's length, which is shortened in the track's last measure. */
    duration: IFraction;
}

/**
 * Owns the staff view: free positions addressed as exact fractions, the space making that shifts the
 * following notes instead of shortening the written one (ADR-0003, ADR-0005) and the input that works
 * on them. Cursor movement follows the rendered runs, so the staff needs no note action menu.
 */
export class StaffMeasureEditor extends MeasureEditor {
    protected override readonly cursorElementClass = ".staff-note-viewer-run";
    protected override readonly cursorElementKind = ScoreElementKind.StaffRun;
    /**
     * Checks whether a note starts at the given position. A rest run holds no note, so it is filled
     * by an insertion rather than a style change.
     *
     * @param position The staff position to inspect.
     *
     * @returns True when the position starts a note.
     */
    public hasNoteAt(position: IMeasurePosition): boolean {
        return this.hasNoteStartAt(position.trackId, position.bar, position.start);
    }

    /**
     * Resolves the element an exact staff position addresses in the model. An insert needs this for
     * its following cursor, because the view has not re-rendered the shifted content yet.
     *
     * @param position The exact staff position to address.
     *
     * @returns The measure and the event starting there, or undefined when none starts there.
     */
    public eventAddressAt(position: IMeasurePosition): IStaffEventAddress | undefined {
        const measure = this.resolveMeasure(position.trackId, position.bar);
        const event = this.eventAt(position);
        if (measure === undefined || event === undefined) {
            return undefined;
        }

        return { measure, event };
    }

    /**
     * Checks whether the position marks a subdivision slot, whose duration is always the slot's own
     * fraction of the bar.
     *
     * @param position The staff position to inspect.
     *
     * @returns True when the position is a subdivision slot.
     */
    public isSubdivisionSlot(position: IMeasurePosition): boolean {
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
    public noteValueDuration(value: INoteValue, position: IMeasurePosition): IFraction | undefined {
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
    public setNote(position: IMeasurePosition, noteStyleId: string): IAudioData | undefined {
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
     * Replaces the element at the given position with a rest of the requested duration. The content
     * behind it moves by the length difference, so the rest takes the selected length and the rest
     * of the measure follows. A track holding subdivisions cannot shift, so nothing changes there.
     *
     * @param position The position of the element to replace.
     * @param duration The rest's duration as a fraction of the bar.
     *
     * @returns True when the measure changed.
     */
    public setRest(position: IMeasurePosition, duration: IFraction): boolean {
        const measure = this.resolveMeasure(position.trackId, position.bar);
        const event = this.eventAt(position);
        if (measure === undefined || event === undefined) {
            return false;
        }

        return this.dataModel.insertEventsWithShift([{
            measure,
            from: event,
            to: event,
            events: [{ start: { ...barStart }, duration: { ...duration } }],
        }]).length > 0;
    }

    /**
     * Writes a note of the given duration at the given position and makes room for it; see
     * {@link insertEventWithShift}.
     *
     * @param position The position marking the note start.
     * @param duration The requested note duration.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns The written note, or undefined when the edit was invalid.
     */
    public insertNoteWithShift(position: IMeasurePosition, duration: IFraction,
        noteStyleId: string): IInsertedStaffEvent | undefined {
        return this.insertEventWithShift(position, duration, noteStyleId);
    }

    /**
     * Writes a rest of the given duration at the given position and makes room for it; see
     * {@link insertEventWithShift}.
     *
     * @param position The position marking the rest start.
     * @param duration The requested rest duration.
     *
     * @returns The written rest, or undefined when the edit was invalid.
     */
    public insertRestWithShift(position: IMeasurePosition,
        duration: IFraction): IInsertedStaffEvent | undefined {
        return this.insertEventWithShift(position, duration, undefined);
    }

    /**
     * Clears the run the given position addresses, turning it into a rest.
     *
     * @param position The position of the run to clear.
     *
     * @returns True when the content changed.
     */
    public clearNote(position: IMeasurePosition): boolean {
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
    public deleteEventWithShift(position: IMeasurePosition): boolean {
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
     * Removes the element the cursor addresses. The insert mode takes the element together with its
     * length, so the content behind it moves up; the overwrite mode turns the selection into rests.
     *
     * @returns True when content changed.
     */
    public override deleteForward(): boolean {
        const cursor = this.cursor;
        const usesCursor = cursor !== undefined && this.entryMode === EditEntryMode.Insert
            && this.selectionManager.currentSelection.size <= 1;
        if (!usesCursor) {
            return this.deleteSelection();
        }

        // The element leaves no rest behind. Where shifting is impossible — a track holding
        // subdivisions — it is cleared to a rest instead, so Delete never does nothing silently.
        if (!this.deleteEventWithShift(cursor) && !this.clearNote(cursor)) {
            return false;
        }

        this.selectCursorAt(cursor);

        return true;
    }

    /**
     * Removes the element before the cursor and pulls the following content to the left by its length.
     *
     * @returns True when content changed.
     */
    protected override deleteContentBeforeCursor(): boolean {
        const cursor = this.cursor;

        // Backspace removes the element before the cursor, so a selection of several elements has no
        // target of its own.
        if (cursor === undefined || this.selectionManager.currentSelection.size > 1) {
            return false;
        }

        const run = this.elementAt(cursor);
        const previousRun = run === undefined ? undefined : this.findPreviousRun(run);
        const previousPosition = previousRun === undefined ? undefined : this.positionAt(previousRun);
        if (previousPosition === undefined) {
            return false;
        }

        // The element leaves no rest behind. Where shifting is impossible — a track holding
        // subdivisions — it is cleared to a rest instead, so Backspace never does nothing silently.
        if (!this.deleteEventWithShift(previousPosition) && !this.clearNote(previousPosition)) {
            return false;
        }

        this.selectCursorAt(previousPosition);

        return true;
    }

    /**
     * Creates a subdivision over the events the selection addresses. The staff has no raster, so the
     * selection itself is the span the subdivision replaces.
     *
     * @param request The requested subdivision size.
     *
     * @returns True when the subdivision was created.
     */
    protected override createRequestedSubdivision(request: ISubdivisionCreationRequest): boolean {
        return this.editMode && this.createSubdivisionForSelection(this.selectionEntries(), request.actual);
    }

    /**
     * Writes a note at the cursor. The overwrite mode only changes the style of a run that already holds
     * a note, while the insert mode writes the selected length and moves the content behind it to the
     * right. A subdivision slot keeps its own duration in both modes, because a tuplet's slots cannot
     * give way (ADR-0003).
     *
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns True when the edit was applied.
     */
    protected override writeNoteAtCursor(noteStyleId: string): boolean {
        const cursor = this.cursor;
        if (cursor === undefined) {
            return false;
        }

        const style = this.resolveNoteStyle(this.getNoteStyles(cursor.trackId), noteStyleId);
        if (style === undefined) {
            return false;
        }

        const existingNote = this.entryMode === EditEntryMode.Overwrite && this.hasNoteAt(cursor);
        if (existingNote || this.isSubdivisionSlot(cursor)) {
            this.playNote(this.setNote(cursor, style.id));
            this.focusInput();

            return true;
        }

        const duration = this.noteValueDuration(this.noteValue, cursor);
        const inserted = duration === undefined ? undefined : this.insertNoteWithShift(cursor, duration, style.id);
        this.playNote(inserted?.style);
        if (inserted !== undefined) {
            this.advanceStaffCursor(inserted);
        }

        this.focusInput();

        return true;
    }

    /**
     * Writes a rest of the selected length at the cursor. A subdivision slot keeps its own duration and
     * cannot give way, so both modes replace it. Every other position follows the entry mode: the
     * overwrite mode replaces the addressed element like a delete does, and the insert mode makes room
     * by shifting.
     *
     * @returns True when the edit was applied.
     */
    protected override writeRestAtCursor(): boolean {
        const cursor = this.cursor;
        if (cursor === undefined) {
            return false;
        }

        const duration = this.noteValueDuration(this.noteValue, cursor);
        if (duration === undefined) {
            return false;
        }

        if (this.entryMode === EditEntryMode.Overwrite || this.isSubdivisionSlot(cursor)) {
            // A track that cannot shift — it holds subdivisions — only clears the element, so the rest
            // then keeps the length of the element it replaces.
            return this.setRest(cursor, duration) || this.clearNote(cursor);
        }

        const inserted = this.insertRestWithShift(cursor, duration);
        if (inserted === undefined) {
            return false;
        }

        this.advanceStaffCursor(inserted);
        this.focusInput();

        return true;
    }

    /**
     * Resolves the duration of a note value at the cursor.
     *
     * @param value The note value to resolve.
     *
     * @returns The duration as a fraction of the bar, or undefined when the value is invalid.
     */
    protected override noteLengthAtCursor(value: INoteValue): IFraction | undefined {
        const cursor = this.cursor;

        return cursor === undefined ? undefined : this.noteValueDuration(value, cursor);
    }

    /**
     * Checks whether a selection entry places the cursor. The staff also makes a clicked run — which the
     * hit test reports as a track piece — the cursor.
     *
     * @param entry The entry to inspect.
     *
     * @returns True when the entry places the cursor.
     */
    protected override isCursorEntry(entry: ISelectionEntry): boolean {
        return entry.granularity === SelectionGranularity.Note
            || entry.granularity === SelectionGranularity.TrackPiece;
    }

    /**
     * Applies the adopted note value to the selection: the staff resizes the addressed events and ripples
     * the following ones (ADR-0003). Only the overwrite mode changes existing content; the insert mode
     * uses the value for the next entry.
     *
     * @returns True when the selection changed.
     */
    protected override resizeSelectionForLengthChange(): boolean {
        if (!this.editMode || this.entryMode !== EditEntryMode.Overwrite) {
            return false;
        }

        const entries = this.selectionEntries();
        if (!this.resizeSelection(entries, this.noteValue)) {
            return false;
        }

        this.selectionManager.replaceSelection(this.refreshSelection(entries));

        return true;
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
     * Resolves where an element of the given duration is written. An element that would cross the bar
     * line moves to the start of the next measure, which the arrangement adds when it lies behind the
     * last one and the user allows the arrangement to grow. Where no measure follows, the element is
     * shortened to the room that is left, since nothing follows it there.
     *
     * @param position The position marking the element start.
     * @param duration The requested duration.
     *
     * @returns The resolved target, or undefined when nothing fits.
     */
    private insertionTargetFor(position: IMeasurePosition, duration: IFraction): IInsertionTarget | undefined {
        const measure = this.resolveMeasure(position.trackId, position.bar);
        if (measure === undefined) {
            return undefined;
        }

        const room = subtractFractions(barLine, position.start);
        if (compareFractions(duration, room) <= 0) {
            return { measure, position, duration };
        }

        const nextBar = position.bar + 1;
        this.dataModel.ensureBarAvailable(nextBar);

        const nextMeasure = this.resolveMeasure(position.trackId, nextBar);
        if (nextMeasure !== undefined) {
            return {
                measure: nextMeasure,
                position: { bar: nextBar, trackId: position.trackId, start: { ...barStart } },
                duration,
            };
        }

        return room.numerator > 0 ? { measure, position, duration: room } : undefined;
    }

    /**
     * Writes an element of the given duration at the given position and makes room for it: the content
     * from that position on moves to the right by the element's length, so nothing is shortened or
     * overwritten. The space the insertion takes is notated as rests where the content gives way, and a
     * subdivision is pushed as one block (ADR-0003).
     *
     * @param position The position marking the element start.
     * @param duration The requested duration.
     * @param noteStyleId The selected instrument note-style id, or undefined to write a rest.
     *
     * @returns The written element, or undefined when the edit was invalid.
     */
    private insertEventWithShift(position: IMeasurePosition, duration: IFraction,
        noteStyleId?: string): IInsertedStaffEvent | undefined {
        const style = noteStyleId === undefined ? undefined : this.noteStyleOf(position.trackId, noteStyleId);
        if (noteStyleId !== undefined && style === undefined) {
            return undefined;
        }

        const target = this.insertionTargetFor(position, duration);
        if (target === undefined) {
            return undefined;
        }

        const inserted = this.dataModel.insertEventsAt([{
            measure: target.measure,
            start: target.position.start,
            events: [{ start: { ...barStart }, duration: { ...target.duration }, noteStyleId }],
        }]);
        if (inserted.length === 0) {
            return undefined;
        }

        return {
            bar: target.position.bar,
            trackId: target.position.trackId,
            start: { ...target.position.start },
            duration: { ...target.duration },
            style,
        };
    }

    /**
     * Resolves the event that starts at the given position.
     *
     * @param position The position to look up.
     *
     * @returns The event starting there, or undefined when no event starts at the position.
     */
    private eventAt(position: IMeasurePosition): IMeasureEvent | undefined {
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

    /**
     * Moves the cursor behind a written element: to the exact position after it, or to the start of the
     * following measure when the element ends at the bar line. The position is kept even when nothing
     * starts there, so a further entry cannot pile up at the same spot.
     *
     * @param inserted The element that was written.
     */
    private advanceStaffCursor(inserted: IInsertedStaffEvent): void {
        const end = addFractions(inserted.start, inserted.duration);
        const next = compareFractions(end, barLine) < 0
            ? { bar: inserted.bar, trackId: inserted.trackId, start: end }
            : { bar: inserted.bar + 1, trackId: inserted.trackId, start: barStart };

        this.cursor = next;
        this.selectStaffCursorFromModel(next);
    }

    /**
     * Selects the element an exact staff position addresses. The entry is resolved from the model,
     * because the view has not re-rendered an edited measure when an entry advances the cursor.
     *
     * @param position The exact staff position to select.
     */
    private selectStaffCursorFromModel(position: IMeasurePosition): void {
        const address = this.eventAddressAt(position);
        if (address === undefined) {
            return;
        }

        this.selectionManager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            target: {
                granularity: SelectionGranularity.Note,
                measure: address.measure,
                event: address.event,
                start: { ...position.start },
            },
        });
    }

    private findPreviousRun(run: HTMLElement): HTMLElement | undefined {
        const row = run.closest<HTMLElement>(".staff-measure-track-row");
        const rowLocation = row === null ? undefined : this.scoreElementRegistry.getLocation(row);
        if (row === null || rowLocation === undefined) {
            return undefined;
        }

        const runs = this.getRuns(row);
        const runIndex = runs.indexOf(run);
        if (runIndex > 0) {
            return runs[runIndex - 1];
        }

        const rows = this.scoreElementRegistry.findElements(ScoreElementKind.TrackRow, undefined, rowLocation.trackId)
            .filter((candidate) => {
                return candidate.classList.contains("staff-measure-track-row");
            }).sort((left, right) => {
                return (this.scoreElementRegistry.getLocation(left)?.bar ?? 0)
                    - (this.scoreElementRegistry.getLocation(right)?.bar ?? 0);
            });
        const rowIndex = rows.indexOf(row);
        if (rowIndex <= 0) {
            return undefined;
        }

        return this.getRuns(rows[rowIndex - 1]).at(-1);
    }

    private getRuns(row: HTMLElement): HTMLElement[] {
        return [...row.querySelectorAll<HTMLElement>(".staff-note-viewer-run")]
            .filter((run) => {
                return run.querySelector(
                    ".staff-note-viewer-note-symbol, .staff-note-viewer-rest-symbol",
                ) !== null;
            });
    }
}
