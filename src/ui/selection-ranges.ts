/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IGridClearRange, ISbDmArrangement } from "../core/ScoreBookDataModel.js";
import { addFractions } from "../core/serialisation/numeric-functions.js";
import { SelectionGranularity, type ISelectionEntry } from "./selection-types.js";

/**
 * Resolves the clear range of the note event occupying the selected cell. The note id is present
 * only on a note's start cell, so this clears the whole note (or a single subdivision slot). A cell
 * without a note id is a rest cell, which clears itself and is treated as a no-op by the per-step
 * synthesis.
 *
 * @param arrangement The arrangement the entry refers to.
 * @param entry The note selection entry.
 *
 * @returns The note's exact clear range, or undefined for a rest cell.
 */
const noteClearRange = (arrangement: ISbDmArrangement, entry: ISelectionEntry): IGridClearRange | undefined => {
    if (entry.startStep === undefined || entry.noteId === undefined) {
        return undefined;
    }

    const track = arrangement.tracks.find((candidate) => {
        return candidate.id === entry.trackId;
    });
    const measure = track?.measures[entry.bar - 1];
    if (!measure) {
        return undefined;
    }

    const eventIndex = measure.noteEvents.findIndex((noteEvent) => {
        return noteEvent.id === entry.noteId;
    });
    if (eventIndex < 0) {
        return undefined;
    }

    const event = measure.events[eventIndex];
    const eventEnd = addFractions(event.start, event.duration);

    return { trackId: entry.trackId, bar: entry.bar, start: { ...event.start }, end: eventEnd };
};

/**
 * Converts selection entries into clear ranges, honouring each entry's granularity.
 * This mapping is shared by the delete action and the clipboard cut operation.
 *
 * @param entries The selection entries to convert.
 * @param arrangement The arrangement the entries refer to; undefined results in an empty list.
 *
 * @returns The clear ranges derived from the selection.
 */
export const selectionToClearRanges = (entries: ISelectionEntry[],
    arrangement: ISbDmArrangement | undefined): IGridClearRange[] => {
    const ranges: IGridClearRange[] = [];

    if (!arrangement) {
        return ranges;
    }

    for (const entry of entries) {
        switch (entry.granularity) {
            case SelectionGranularity.Note: {
                if (entry.startStep !== undefined) {
                    ranges.push(noteClearRange(arrangement, entry) ?? {
                        trackId: entry.trackId,
                        bar: entry.bar,
                        startStep: entry.startStep,
                        endStep: entry.startStep,
                    });
                }

                break;
            }

            case SelectionGranularity.NoteGroup: {
                if (entry.startStep !== undefined && entry.endStep !== undefined) {
                    ranges.push({
                        trackId: entry.trackId,
                        bar: entry.bar,
                        startStep: entry.startStep,
                        endStep: entry.endStep,
                    });
                }

                break;
            }

            case SelectionGranularity.TrackPiece: {
                ranges.push({ trackId: entry.trackId, bar: entry.bar });

                break;
            }

            case SelectionGranularity.Measure: {
                for (const track of arrangement.tracks) {
                    ranges.push({ trackId: track.id, bar: entry.bar });
                }

                break;
            }

            case SelectionGranularity.Track: {
                for (let bar = 1; bar <= arrangement.timeParams.length; bar++) {
                    ranges.push({ trackId: entry.trackId, bar });
                }

                break;
            }
        }
    }

    return ranges;
};
