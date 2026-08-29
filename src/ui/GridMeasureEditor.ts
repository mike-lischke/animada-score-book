/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    ISbDmArrangement, ISbDmNoteEvent, ISbDmTrack, ITiming, ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { addFractions, compareFractions, reduceFraction } from "../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction } from "../core/types/general.js";
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
}
