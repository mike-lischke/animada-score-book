/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    INoteResizeRequest, ISbDmArrangement, ISbDmNoteEvent, ISbDmTrack, ISbDmTrackMeasure, ITiming,
    ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { NoteLength, noteLengthDenominator } from "../core/rest-notation.js";
import {
    addFractions, compareFractions, reduceFraction, subtractFractions,
} from "../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction } from "../core/types/general.js";
import { requisitions } from "../supplement/Requisitions.js";
import { selectionToClearRanges } from "./selection-ranges.js";
import { SelectionGranularity, type ISelectionEntry } from "./selection-types.js";

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

/** A written note: where it starts, how long it is and which sound was applied. */
export interface IInsertedNote extends INoteInsertion {
    style: IAudioData;
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

/** Handles grid editing decisions without rendering or listening to DOM events. */
export class GridMeasureEditor {
    public constructor(private readonly dataModel: ScoreBookDataModel) {
    }

    public handlePointerDown(): boolean {
        return false;
    }

    public handleKeyDown(): boolean {
        return false;
    }

    /**
     * Applies a note style to a grid cell.
     *
     * @param position The target grid cell.
     * @param noteStyleId The selected instrument note-style id.
     * @returns The selected audio data, or undefined when the edit was invalid.
     */
    public setNote(position: IGridEditorPosition, noteStyleId: string): IAudioData | undefined {
        const cell = this.resolveCell(position);
        const style = cell?.track.instrument.noteStyles[noteStyleId];
        if (!cell || !style) {
            return undefined;
        }

        this.dataModel.setGridNote(position.trackId, position.bar, position.step, noteStyleId,
            position.start);

        return style;
    }

    /**
     * Resolves the bar fraction covered by a note of the given length at the given position.
     *
     * @param length The selected note length.
     * @param position The grid position whose measure supplies the meter.
     *
     * @returns The duration as a fraction of the bar, or undefined when the value is invalid.
     */
    public noteLengthDuration(length: NoteLength, position: IGridEditorPosition): IFraction | undefined {
        const cell = this.resolveCell(position);
        if (!cell) {
            return undefined;
        }

        const measure = cell.track.measures[position.bar - 1];
        const steps = cell.arrangement.timeParams.stepResolution / noteLengthDenominator(length);

        if (!Number.isInteger(steps) || steps < 1 || steps > measure.meter.stepResolution) {
            return undefined;
        }

        return reduceFraction(steps, measure.meter.stepResolution);
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
     * The staff view uses {@link insertNoteWithShift} instead, which keeps the requested length and
     * shifts following notes.
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
        const style = cell?.track.instrument.noteStyles[noteStyleId];
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

        return this.dataModel.insertNote(position.trackId, position.bar, start, duration, noteStyleId)
            ? style
            : undefined;
    }

    /**
     * Inserts a note of the given duration in the staff view, where entries are not tied to fixed
     * grid steps. If the free space before the next note is too small, the note keeps its length and
     * the following notes give way instead of the new note being shortened. Growing the note consumes
     * the rest behind it first; only the excess moves the later notes to the right.
     *
     * @param position The requested insertion position.
     * @param duration The requested note duration.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns The written note, or undefined when the edit was invalid.
     */
    public insertNoteWithShift(position: IGridEditorPosition, duration: IFraction,
        noteStyleId: string): IInsertedNote | undefined {
        const insertion = this.resolveNoteInsertion(position, duration);
        if (insertion === undefined) {
            return undefined;
        }

        const style = this.insertNote(insertion.position, insertion.duration, noteStyleId);
        if (style === undefined) {
            return undefined;
        }

        const shifted = compareFractions(insertion.duration, duration) < 0
            && this.resizeNote(insertion.position, duration);

        return { position: insertion.position, duration: shifted ? duration : insertion.duration, style };
    }

    /**
     * Changes an existing note's duration while preserving its style and articulation.
     *
     * @param position The position of the existing note.
     * @param duration The requested note duration.
     *
     * @returns True when the note duration changed.
     */
    public resizeNote(position: IGridEditorPosition, duration: IFraction): boolean {
        const start = this.resolveStartFraction(position);

        return start !== undefined && this.dataModel.resizeNote(position.trackId, position.bar, start, duration);
    }

    /**
     * Applies a note length to the notes addressed by the selection entries. Notes in different
     * tracks are resized independently, each track rippling its own following notes. Only notes are
     * resized: rests and selections that span whole measures or tracks keep their duration.
     *
     * @param entries The selection entries to resize.
     * @param length The selected note length.
     *
     * @returns True when at least one note duration changed.
     */
    public resizeSelection(entries: ISelectionEntry[], length: NoteLength): boolean {
        const requestsByTrack = new Map<number, INoteResizeRequest[]>();

        for (const entry of entries) {
            for (const position of this.notePositionsOf(entry)) {
                const duration = this.noteLengthDuration(length, position);
                const start = this.resolveStartFraction(position);
                if (duration === undefined || start === undefined) {
                    continue;
                }

                const request = { bar: position.bar, start, duration };
                const requests = requestsByTrack.get(position.trackId);
                if (requests) {
                    requests.push(request);
                } else {
                    requestsByTrack.set(position.trackId, [request]);
                }
            }
        }

        let changed = false;
        for (const [trackId, requests] of requestsByTrack) {
            changed = this.dataModel.resizeNotes(trackId, requests) || changed;
        }

        return changed;
    }

    /**
     * Clears the note style at a grid cell.
     *
     * @param position The grid cell to clear.
     * @returns True when the cell changed.
     */
    public clearNote(position: IGridEditorPosition): boolean {
        return this.dataModel.setGridNote(position.trackId, position.bar, position.step, undefined,
            position.start);
    }

    /**
     * Clears the note content described by the given selection entries, honouring their
     * granularity. The data model batches the changes into one undo step and notifies the
     * affected tracks so viewers recompute their note structure.
     *
     * @param entries The selection entries to clear.
     *
     * @returns True when any content changed.
     */
    public clearSelection(entries: ISelectionEntry[]): boolean {
        return this.dataModel.clearStepRanges(selectionToClearRanges(entries, this.dataModel.arrangement));
    }

    /**
     * Applies a note style to all cells described by the given selection entries, honouring their
     * granularity. The style is applied only when all selected cells belong to the same instrument.
     * The data model batches the changes into one undo step.
     *
     * @param entries The selection entries to fill.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when any content changed.
     */
    public setSelectionNoteStyle(entries: ISelectionEntry[], noteStyleId: string): boolean {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return false;
        }

        const ranges = selectionToClearRanges(entries, arrangement);
        if (ranges.length === 0) {
            return false;
        }

        const trackIds = new Set(ranges.map((range) => {
            return range.trackId;
        }));
        const instrumentIds = new Set<number>();
        for (const trackId of trackIds) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === trackId;
            });
            if (track) {
                instrumentIds.add(track.instrument.id);
            }
        }

        if (instrumentIds.size > 1) {
            return false;
        }

        return this.dataModel.setNoteStyleRanges(ranges, noteStyleId);
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

        const initialEvents = entries
            .filter((entry) => {
                return entry.startStep !== undefined;
            })
            .sort((left, right) => {
                return (left.startStep ?? 0) - (right.startStep ?? 0);
            })
            .map((entry) => {
                const stepStart = reduceFraction(entry.startStep ?? 0, measure.meter.stepResolution);

                return measure.events.find((event) => {
                    return compareFractions(event.start, stepStart) === 0;
                });
            });

        return this.dataModel.createSubdivision(range.trackId, range.bar, range.start, range.end,
            actual, range.spanSteps, initialEvents);
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
        const arrangement = this.dataModel.arrangement;
        if (!arrangement || entries.length === 0) {
            return false;
        }

        const candidates = new Map<string, IEmptySubdivisionCandidate>();
        for (const entry of entries) {
            if (entry.granularity !== SelectionGranularity.Note || entry.start === undefined) {
                return false;
            }

            const entryStart = entry.start;
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === entry.trackId;
            });
            const measure = track?.measures[entry.bar - 1];
            if (!measure) {
                return false;
            }

            const eventIndex = measure.events.findIndex((event) => {
                return compareFractions(event.start, entryStart) === 0;
            });
            const subdivision = measure.subdivisions.find((candidate) => {
                return eventIndex >= candidate.startIndex
                    && eventIndex < candidate.startIndex + candidate.actual;
            });
            if (eventIndex < 0 || !subdivision
                || measure.events.slice(subdivision.startIndex, subdivision.startIndex + subdivision.actual)
                    .some((event) => {
                        return event.noteStyleId !== undefined;
                    })) {
                return false;
            }

            const key = `${entry.trackId}:${entry.bar}:${subdivision.startIndex}`;
            candidates.set(key, {
                trackId: entry.trackId,
                bar: entry.bar,
                start: { ...measure.events[subdivision.startIndex].start },
                startIndex: subdivision.startIndex,
                actual: subdivision.actual,
            });
        }

        for (const candidate of candidates.values()) {
            const track = arrangement.tracks.find((item) => {
                return item.id === candidate.trackId;
            });
            const measure = track?.measures[candidate.bar - 1];
            if (!measure) {
                return false;
            }

            const complete = measure.events
                .slice(candidate.startIndex, candidate.startIndex + candidate.actual)
                .every((event) => {
                    return entries.some((entry) => {
                        return entry.trackId === candidate.trackId
                            && entry.bar === candidate.bar
                            && entry.start !== undefined
                            && compareFractions(entry.start, event.start) === 0;
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
     * Re-resolves the note ids of the given note entries against the current measure content, so
     * selections stay accurate after structural edits such as filling a range with a note style.
     * Only note start cells carry a note id; absorbed cells and rests resolve to undefined.
     *
     * @param entries The selection entries to refresh.
     *
     * @returns The entries with updated note ids.
     */
    public refreshSelection(entries: ISelectionEntry[]): ISelectionEntry[] {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return entries;
        }

        return entries.map((entry) => {
            if (entry.granularity !== SelectionGranularity.Note) {
                return entry;
            }

            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === entry.trackId;
            });
            const measure = track?.measures[entry.bar - 1];
            if (!measure) {
                return entry;
            }

            const cellStart = entry.start ?? (entry.startStep === undefined
                ? undefined
                : reduceFraction(entry.startStep, measure.meter.stepResolution));
            if (cellStart === undefined) {
                return entry;
            }

            const noteEvent = measure.noteEvents.find((candidate) => {
                if (candidate.audioData === undefined) {
                    return false;
                }

                const eventEnd = addFractions(candidate.start, candidate.duration);

                return compareFractions(cellStart, candidate.start) >= 0
                    && compareFractions(cellStart, eventEnd) < 0;
            });

            const noteId = noteEvent !== undefined && compareFractions(cellStart, noteEvent.start) === 0
                ? noteEvent.id
                : undefined;

            return { ...entry, noteId };
        });
    }

    /**
     * Returns the current arrangement's main playback volume as a gain value.
     *
     * @returns The main volume converted to a gain value.
     */
    public getMainVolume(): number {
        return (this.dataModel.arrangement?.mainVolume ?? 100) / 100;
    }

    /**
     * Returns all note styles offered by the instrument at a grid position.
     *
     * @param position The grid position whose track instrument supplies the styles.
     * @returns The instrument's note styles, or an empty array for an invalid position.
     */
    public getNoteStyles(position: IGridEditorPosition): IAudioData[] {
        const cell = this.resolveCell(position);

        return cell ? Object.values(cell.track.instrument.noteStyles) : [];
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
     * Resolves the note starts addressed by a selection entry. Note entries address a single note,
     * note groups every note inside their step range. Coarser granularities describe whole measures
     * or tracks and are not resized.
     *
     * @param entry The selection entry to resolve.
     *
     * @returns The positions of the addressed notes.
     */
    private notePositionsOf(entry: ISelectionEntry): IGridEditorPosition[] {
        if (entry.granularity === SelectionGranularity.Note) {
            // Only the cell that starts a note carries a note id; rest cells are not resized.
            return entry.startStep === undefined || entry.noteId === undefined
                ? []
                : [{ bar: entry.bar, trackId: entry.trackId, step: entry.startStep, start: entry.start }];
        }

        if (entry.granularity !== SelectionGranularity.NoteGroup
            || entry.startStep === undefined || entry.endStep === undefined) {
            return [];
        }

        const measure = this.resolveMeasure(entry.trackId, entry.bar);
        if (!measure) {
            return [];
        }

        const stepsPerBar = measure.meter.stepResolution;
        const positions: IGridEditorPosition[] = [];
        for (const event of measure.events) {
            if (event.noteStyleId === undefined) {
                continue;
            }

            const step = event.start.numerator * stepsPerBar / event.start.denominator;
            if (!Number.isInteger(step) || step < entry.startStep || step > entry.endStep) {
                continue;
            }

            positions.push({ bar: entry.bar, trackId: entry.trackId, step, start: event.start });
        }

        return positions;
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
        const nextNoteStart = this.nextNoteStart(position, start, addFractions(start, duration));
        const available = nextNoteStart === undefined ? duration : subtractFractions(nextNoteStart, start);

        return available.numerator > 0 ? { position, duration: available } : undefined;
    }

    /**
     * Finds the earliest note start inside the given span.
     *
     * @param position The position whose measure is inspected.
     * @param start The span start, exclusive.
     * @param end The span end, exclusive.
     *
     * @returns The note start, or undefined when no note starts inside the span.
     */
    private nextNoteStart(position: IGridEditorPosition, start: IFraction, end: IFraction): IFraction | undefined {
        const measure = this.resolveMeasure(position.trackId, position.bar);
        if (!measure) {
            return undefined;
        }

        let earliest: IFraction | undefined;
        for (const event of measure.events) {
            if (event.noteStyleId === undefined
                || compareFractions(event.start, start) <= 0 || compareFractions(event.start, end) >= 0) {
                continue;
            }

            if (earliest === undefined || compareFractions(event.start, earliest) < 0) {
                earliest = event.start;
            }
        }

        return earliest;
    }

    /**
     * Resolves the measure of a track at a one-based bar number.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     *
     * @returns The measure, or undefined when the track or measure does not exist.
     */
    private resolveMeasure(trackId: number, bar: number): ISbDmTrackMeasure | undefined {
        const arrangement = this.dataModel.arrangement;

        return arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        })?.measures[bar - 1];
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

        const first = entries[0];
        const trackId = first.trackId;
        const bar = first.bar;

        let minStep = Number.MAX_SAFE_INTEGER;
        let maxStep = Number.MIN_SAFE_INTEGER;

        for (const entry of entries) {
            if (entry.trackId !== trackId || entry.bar !== bar || entry.start !== undefined) {
                return undefined;
            }

            if (entry.granularity !== SelectionGranularity.Note
                && entry.granularity !== SelectionGranularity.NoteGroup) {
                return undefined;
            }

            if (entry.startStep === undefined || entry.endStep === undefined) {
                return undefined;
            }

            minStep = Math.min(minStep, entry.startStep, entry.endStep);
            maxStep = Math.max(maxStep, entry.startStep, entry.endStep);
        }

        const measure = this.resolveMeasure(trackId, bar);
        if (!measure) {
            return undefined;
        }

        const stepsPerBar = measure.meter.stepResolution;
        if (minStep < 0 || maxStep >= stepsPerBar) {
            return undefined;
        }

        const spanSteps = maxStep - minStep + 1;

        return {
            trackId,
            bar,
            start: reduceFraction(minStep, stepsPerBar),
            end: reduceFraction(maxStep + 1, stepsPerBar),
            spanSteps,
        };
    }
}
