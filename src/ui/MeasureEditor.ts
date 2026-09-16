/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    INoteResizeRequest, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { NoteLength, noteLengthDenominator } from "../core/rest-notation.js";
import { compareFractions, reduceFraction } from "../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction } from "../core/types/general.js";
import { selectionToClearRanges } from "./selection-ranges.js";
import { SelectionSerializer, type ISelectionEntry } from "./SelectionSerializer.js";

/** The bar line as a bar fraction. */
const barLine: IFraction = { numerator: 1, denominator: 1 };

/** A note start as the data model addresses it: one track, one measure, one exact position. */
export interface INoteStart {
    trackId: number;
    bar: number;
    start: IFraction;
}

/**
 * The edits both views share. They address notes through selection entries and exact fractions, so
 * they are independent of the position format a view uses: `GridMeasureEditor` adds cells, the
 * raster and subdivision slots on top, `StaffMeasureEditor` free positions (ADR-0005).
 */
export abstract class MeasureEditor {
    public constructor(protected readonly dataModel: ScoreBookDataModel) {
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
        return this.dataModel.clearRanges(selectionToClearRanges(entries));
    }

    /**
     * Applies a note style to all elements described by the given selection entries, honouring their
     * granularity. The style is applied only when all selected elements belong to the same
     * instrument. The data model batches the changes into one undo step.
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

        const ranges = selectionToClearRanges(entries);
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
            for (const note of this.noteStartsOf(entry)) {
                const measure = this.resolveMeasure(note.trackId, note.bar);
                const duration = measure === undefined
                    ? undefined
                    : this.noteLengthDurationFor(length, measure);
                if (duration === undefined) {
                    continue;
                }

                const request = { bar: note.bar, start: note.start, duration };
                const requests = requestsByTrack.get(note.trackId);
                if (requests) {
                    requests.push(request);
                } else {
                    requestsByTrack.set(note.trackId, [request]);
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
     * Re-resolves the given selection entries against the current measure content, so selections stay
     * accurate after structural edits such as filling a range with a note style. An edit replaces the
     * events, so the entries are serialised to their coordinates and resolved back; entries whose
     * element no longer exists are dropped.
     *
     * @param entries The selection entries to refresh.
     *
     * @returns The entries holding the current model objects.
     */
    public refreshSelection(entries: ISelectionEntry[]): ISelectionEntry[] {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return entries;
        }

        return SelectionSerializer.deserialise(arrangement, SelectionSerializer.serialise(entries));
    }

    /**
     * Returns all note styles offered by the instrument a track plays.
     *
     * @param trackId The track whose instrument supplies the styles.
     *
     * @returns The instrument's note styles, or an empty array when the track does not exist.
     */
    public getNoteStyles(trackId: number): IAudioData[] {
        const track = this.trackOf(trackId);

        return track ? Object.values(track.instrument.noteStyles) : [];
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
     * Converts a note length into its duration as a fraction of the measure. The arrangement's step
     * resolution counts steps per whole note, the measure's resolution steps per bar. The data model
     * addresses notes by whole steps, so a value that does not land on one is rejected here instead
     * of being dropped silently later.
     *
     * @param length The selected note length.
     * @param measure The measure the duration is expressed in.
     *
     * @returns The duration as a fraction of the measure, or undefined when the value is invalid.
     */
    protected noteLengthDurationFor(length: NoteLength, measure: ISbDmTrackMeasure): IFraction | undefined {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

        const denominator = noteLengthDenominator(length);
        if (denominator <= 0) {
            return undefined;
        }

        const duration = reduceFraction(arrangement.timeParams.stepResolution,
            denominator * measure.meter.stepResolution);
        const steps = duration.numerator * measure.meter.stepResolution / duration.denominator;

        return Number.isInteger(steps) && steps >= 1 && compareFractions(duration, barLine) <= 0
            ? duration
            : undefined;
    }

    /**
     * Checks whether a note starts exactly at the given position. A position inside a longer note
     * does not count: both views address what starts there, and a run of the staff always starts at
     * its event.
     *
     * @param trackId The track containing the position.
     * @param bar The one-based measure number.
     * @param start The exact position as a fraction of the measure.
     *
     * @returns True when a note starts at the position.
     */
    protected hasNoteStartAt(trackId: number, bar: number, start: IFraction): boolean {
        const measure = this.resolveMeasure(trackId, bar);
        const event = measure?.events.find((candidate) => {
            return compareFractions(candidate.start, start) === 0;
        });

        return event?.noteStyleId !== undefined;
    }

    /**
     * Finds the earliest note start inside the given span.
     *
     * @param trackId The track whose measure is inspected.
     * @param bar The one-based measure number.
     * @param start The span start, exclusive.
     * @param end The span end, exclusive.
     *
     * @returns The note start, or undefined when no note starts inside the span.
     */
    protected nextNoteStart(trackId: number, bar: number, start: IFraction,
        end: IFraction): IFraction | undefined {
        const measure = this.resolveMeasure(trackId, bar);
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
     * Resolves a note style of the instrument a track plays.
     *
     * @param trackId The track whose instrument supplies the style.
     * @param noteStyleId The note-style id to resolve.
     *
     * @returns The note style, or undefined when the track or the style does not exist.
     */
    protected noteStyleOf(trackId: number, noteStyleId: string): IAudioData | undefined {
        return this.trackOf(trackId)?.instrument.noteStyles[noteStyleId];
    }

    /**
     * Resolves a track of the current arrangement.
     *
     * @param trackId The track to resolve.
     *
     * @returns The track, or undefined when the arrangement does not contain it.
     */
    protected trackOf(trackId: number): ISbDmTrack | undefined {
        return this.dataModel.arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });
    }

    /**
     * Resolves the measure of a track at a one-based bar number.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     *
     * @returns The measure, or undefined when the track or measure does not exist.
     */
    protected resolveMeasure(trackId: number, bar: number): ISbDmTrackMeasure | undefined {
        return this.trackOf(trackId)?.measures[bar - 1];
    }

    /**
     * Resolves the note starts a selection entry addresses. A note addresses the note it was
     * selected at, a note group every note it contains; coarser granularities describe whole
     * measures or tracks and address no notes at all.
     *
     * @param entry The selection entry to resolve.
     *
     * @returns The addressed note starts, in measure order.
     */
    protected abstract noteStartsOf(entry: ISelectionEntry): INoteStart[];
}
