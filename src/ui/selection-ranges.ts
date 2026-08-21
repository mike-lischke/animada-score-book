/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IGridClearRange, ISbDmArrangement } from "../core/ScoreBookDataModel.js";
import { SelectionGranularity, type ISelectionEntry } from "./selection-types.js";

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
                    ranges.push({
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
