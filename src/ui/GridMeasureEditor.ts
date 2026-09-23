/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { h } from "preact";

import type { IRadialMenuItem } from "../components/ui/framework/RadialMenu.js";
import { NoteStyleSymbolViewer } from "../components/ui/Note/NoteStyleSymbolViewer.js";
import type {
    ISbDmArrangement, ISbDmNoteEvent, ISbDmTrack, ISbDmTrackMeasure, ITiming,
} from "../core/ScoreBookDataModel.js";
import type { INoteValue } from "../core/rest-notation.js";
import {
    addFractions, compareFractions, reduceFraction, subtractFractions,
} from "../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction } from "../core/types/general.js";
import { modelEventAt } from "../core/MeasureProjection.js";
import type { ISubdivisionCreationRequest } from "../supplement/Requisitions.js";
import { requisitions } from "../supplement/Requisitions.js";
import { MeasureEditor, type IAddressedEvent, type IMeasurePosition } from "./MeasureEditor.js";
import { ScoreElementKind } from "./ScoreElementRegistry.js";
import { SelectionGranularity, SelectionSerializer, type ISelectionEntry } from "./SelectionSerializer.js";
import { selectionEventTargets } from "./selection-ranges.js";

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

/**
 * Owns the grid view: the raster with its cells and subdivision slots, the space making that follows
 * fixed steps (ADR-0003) and the input that works on them. Cursor movement follows the rendered
 * cells, and the view's note action menu lives here, next to the edits its items perform (ADR-0005).
 */
export class GridMeasureEditor extends MeasureEditor {
    protected override readonly cursorElementClass = ".note-viewer";
    protected override readonly cursorElementKind = ScoreElementKind.GridCell;

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
     * Moves a note that does not fit at the current position to the next bar, which the arrangement
     * adds when that bar is behind the last one. When a following note is in the way, the note is
     * shortened to the free space before that note, so a rest between two notes can always be filled.
     * Where no bar follows, the note is shortened to the available space.
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

        this.dataModel.ensureBarAvailable(position.bar + 1);

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
     * Removes the content before the cursor: the note of the previous cell, or the subdivision the
     * cursor's cell sits in when that subdivision is still empty.
     *
     * @returns True when content changed.
     */
    protected override deleteContentBeforeCursor(): boolean {
        const cursor = this.cursor;
        if (cursor === undefined) {
            return false;
        }

        const cell = this.elementAt(cursor);
        const previousCell = cell === undefined ? undefined : this.findPreviousCell(cell);
        const previousPosition = previousCell === undefined ? undefined : this.positionAt(previousCell);
        if (previousPosition === undefined) {
            return false;
        }

        const position = this.gridPositionOf(cursor);
        if (this.hasEmptySubdivisionAt(position)) {
            this.deleteSubdivisionAt(position);
        } else {
            this.clearNote(this.gridPositionOf(previousPosition));
        }

        this.selectCursorAt(previousPosition);

        return true;
    }

    /**
     * Creates a subdivision. A selection of several cells spans the subdivision; a single cell at the
     * cursor starts it, replacing the steps the request names (ADR-0007).
     *
     * @param request The requested subdivision size.
     *
     * @returns True when the subdivision was created.
     */
    protected override createRequestedSubdivision(request: ISubdivisionCreationRequest): boolean {
        if (!this.editMode) {
            return false;
        }

        const entries = this.selectionEntries();
        if (this.isMultiCellSelection(entries)) {
            return this.createSubdivisionForSelection(entries, request.actual);
        }

        const cursor = this.cursor;

        return cursor !== undefined
            && this.createSubdivisionAtCursor(this.gridPositionOf(cursor), request.actual, request.normal);
    }

    /**
     * Resolves the note styles the action menu shows. The items are built here, so a click goes
     * straight to the edit it performs.
     *
     * @returns The menu items, one per note style of the addressed instrument.
     */
    protected override noteActionItems(): IRadialMenuItem[] {
        const cursor = this.cursor;
        if (cursor === undefined) {
            return [];
        }

        return this.getNoteStyles(cursor.trackId).map((style, index) => {
            const name = style.symbol?.shortDescription ?? style.id;
            const tooltip = style.symbol?.description ?? name;

            return {
                id: style.id,
                label: name,
                tooltip: `${tooltip} (${index + 1})`,
                icon: h(NoteStyleSymbolViewer, { noteStyle: style, "data-tooltip": "inherit" }),
                onClick: () => {
                    this.applyNoteActionStyle(style.id);
                },
            };
        });
    }

    /**
     * Writes the style the menu picked into the addressed cell, which keeps that cell's length, and
     * moves the cursor behind it.
     *
     * @param noteStyleId The picked note-style id.
     *
     * @returns True when the edit was applied.
     */
    protected override applyNoteActionStyle(noteStyleId: string): boolean {
        const cursor = this.cursor;
        if (cursor === undefined) {
            return false;
        }

        const applied = this.setNote(this.gridPositionOf(cursor), noteStyleId);

        this.playNote(applied);
        this.advanceCursor();
        this.focusInput();

        return applied !== undefined;
    }

    /**
     * Writes a note at the cursor. A subdivision slot keeps its own duration and is only restyled;
     * every other cell writes the selected length, shortened to the free space before the next note
     * (ADR-0003).
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

        const position = this.gridPositionOf(cursor);
        const style = this.resolveNoteStyle(this.getNoteStyles(position.trackId), noteStyleId);
        if (style === undefined) {
            return false;
        }

        const applied = this.isSubdivisionSlot(position)
            ? this.setNote(position, style.id)
            : this.insertSelectedLength(position, style.id);
        this.playNote(applied);
        this.advanceCursor();
        this.focusInput();

        return true;
    }

    /**
     * Turns the addressed cell into a rest. A cell covers one grid step, so there is no length to apply.
     *
     * @returns True when the edit was applied.
     */
    protected override writeRestAtCursor(): boolean {
        const cursor = this.cursor;
        if (cursor === undefined || !this.clearNote(this.gridPositionOf(cursor))) {
            return false;
        }

        this.advanceCursor();
        this.focusInput();

        return true;
    }

    /**
     * Resolves the duration of a note value at the cursor.
     *
     * @param value The note value to resolve.
     *
     * @returns The duration as a fraction of the bar, or undefined when the grid cannot address the value.
     */
    protected override noteLengthAtCursor(value: INoteValue): IFraction | undefined {
        const cursor = this.cursor;

        return cursor === undefined ? undefined : this.noteValueDuration(value, this.gridPositionOf(cursor));
    }

    /**
     * Checks whether a selection entry places the cursor. The grid addresses cells, so only a note does.
     *
     * @param entry The entry to inspect.
     *
     * @returns True when the entry places the cursor.
     */
    protected override isCursorEntry(entry: ISelectionEntry): boolean {
        return entry.granularity === SelectionGranularity.Note;
    }

    /**
     * The grid never resizes existing content when the note value changes: the value applies to the
     * next entry, which shortens itself to the free space before the next note (ADR-0003).
     *
     * @returns False, because no selection changes.
     */
    protected override resizeSelectionForLengthChange(): boolean {
        return false;
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

        // A track, a whole measure or a track piece addresses every event it covers, so a length
        // applies to all of them at once.
        if (target.granularity === SelectionGranularity.Track || target.granularity === SelectionGranularity.Measure
            || target.granularity === SelectionGranularity.TrackPiece) {
            const arrangement = this.dataModel.arrangement;

            return arrangement ? selectionEventTargets(arrangement, [entry]) : [];
        }

        if (target.granularity === SelectionGranularity.Note) {
            const start = target.start ?? target.event.start;
            const event = modelEventAt(target.measure, start);
            if (event?.noteStyleId === undefined || compareFractions(event.start, start) !== 0) {
                return [];
            }

            return [this.addressedEventOf(event.start, target.measure)];
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

    /**
     * Writes the selected length into a cell, shortened to the free space before the next note.
     *
     * @param position The cell to write to.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns The selected audio data, or undefined when nothing fits.
     */
    private insertSelectedLength(position: IGridEditorPosition, noteStyleId: string): IAudioData | undefined {
        const duration = this.noteValueDuration(this.noteValue, position);
        const insertion = duration === undefined ? undefined : this.resolveNoteInsertion(position, duration);

        return insertion === undefined
            ? undefined
            : this.insertNote(insertion.position, insertion.duration, noteStyleId);
    }

    /**
     * Describes a cursor position the way the grid addresses a cell. The raster needs the step the
     * exact position falls on, which the grid derives from the measure here (ADR-0006).
     *
     * @param position The fraction position to describe.
     *
     * @returns The grid position addressing the same element.
     */
    private gridPositionOf(position: IMeasurePosition): IGridEditorPosition {
        const measure = this.resolveMeasure(position.trackId, position.bar);
        const step = measure === undefined ? 0 : SelectionSerializer.cellOf(position.start, measure);

        return { bar: position.bar, trackId: position.trackId, step, start: { ...position.start } };
    }

    /**
     * Moves the cursor behind the written cell: to the next cell of the measure, or to the first cell
     * of the following measure of the track.
     */
    private advanceCursor(): void {
        const cursor = this.cursor;
        const cell = cursor === undefined ? undefined : this.elementAt(cursor);
        const nextCell = cell === undefined ? undefined : this.findNextCell(cell);
        const position = nextCell === undefined ? undefined : this.positionAt(nextCell);
        if (position !== undefined) {
            this.selectCursorAt(position);
        }
    }

    private findNextCell(cell: HTMLElement): HTMLElement | undefined {
        const row = cell.closest<HTMLElement>(".grid-measure-row");
        const rowLocation = row === null ? undefined : this.scoreElementRegistry.getLocation(row);
        if (row === null || rowLocation === undefined) {
            return undefined;
        }

        const cells = this.getCells(rowLocation.bar, rowLocation.trackId);
        const cellIndex = cells.indexOf(cell);
        if (cellIndex + 1 < cells.length) {
            return cells[cellIndex + 1];
        }

        const rows = this.getTrackRows(rowLocation.trackId);
        rows.sort((left, right) => {
            return (this.scoreElementRegistry.getLocation(left)?.bar ?? 0)
                - (this.scoreElementRegistry.getLocation(right)?.bar ?? 0);
        });
        const rowIndex = rows.indexOf(row);
        if (rowIndex < 0 || rowIndex + 1 >= rows.length) {
            return undefined;
        }

        const nextRowLocation = this.scoreElementRegistry.getLocation(rows[rowIndex + 1]);

        return nextRowLocation === undefined
            ? undefined
            : this.getCells(nextRowLocation.bar, nextRowLocation.trackId).at(0);
    }

    private findPreviousCell(cell: HTMLElement): HTMLElement | undefined {
        const row = cell.closest<HTMLElement>(".grid-measure-row");
        const rowLocation = row === null ? undefined : this.scoreElementRegistry.getLocation(row);
        if (row === null || rowLocation === undefined) {
            return undefined;
        }

        const cells = this.getCells(rowLocation.bar, rowLocation.trackId);
        const cellIndex = cells.indexOf(cell);
        if (cellIndex > 0) {
            return cells[cellIndex - 1];
        }

        const rows = this.getTrackRows(rowLocation.trackId);
        rows.sort((left, right) => {
            return (this.scoreElementRegistry.getLocation(left)?.bar ?? 0)
                - (this.scoreElementRegistry.getLocation(right)?.bar ?? 0);
        });
        const rowIndex = rows.indexOf(row);
        if (rowIndex <= 0) {
            return undefined;
        }

        const previousRowLocation = this.scoreElementRegistry.getLocation(rows[rowIndex - 1]);
        const previousCells = previousRowLocation === undefined
            ? []
            : this.getCells(previousRowLocation.bar, previousRowLocation.trackId);

        return previousCells[previousCells.length - 1];
    }

    private getTrackRows(trackId: number): HTMLElement[] {
        return this.scoreElementRegistry.findElements(ScoreElementKind.TrackRow)
            .filter((row) => {
                return row.classList.contains("grid-measure-row")
                    && this.scoreElementRegistry.getLocation(row)?.trackId === trackId;
            });
    }

    private getCells(bar: number, trackId: number): HTMLElement[] {
        return this.scoreElementRegistry.findElements(ScoreElementKind.GridCell, bar, trackId);
    }
}
