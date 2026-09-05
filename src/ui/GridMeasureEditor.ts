/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    ISbDmArrangement, ISbDmNoteEvent, ISbDmTrack, ISbDmTrackMeasure, ITiming, ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { addFractions, compareFractions, reduceFraction } from "../core/serialisation/numeric-functions.js";
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
