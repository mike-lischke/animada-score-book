/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IMeasureRange } from "../core/ScoreBookDataModel.js";
import { modelEventAt } from "../core/MeasureProjection.js";
import { addFractions } from "../core/serialisation/numeric-functions.js";
import { SelectionGranularity, type ISelectionEntry, type ISelectionTarget } from "./SelectionSerializer.js";

/**
 * Converts selection entries into the clear ranges they cover. Every entry resolves the model
 * objects it holds, so a selection clears exactly the content it addresses.
 *
 * @param entries The selection entries to convert.
 *
 * @returns The clear ranges derived from the selection.
 */
export const selectionToClearRanges = (entries: ISelectionEntry[]): IMeasureRange[] => {
    const ranges: IMeasureRange[] = [];

    for (const entry of entries) {
        ranges.push(...targetClearRanges(entry.target));
    }

    return ranges;
};

/**
 * Converts a selection target into the clear ranges it covers. A note clears the whole event it
 * belongs to — also when a grid cell inside its duration was selected, because that cell is grid
 * layout and no model content of its own.
 *
 * @param target The model objects the selection addresses.
 *
 * @returns The clear ranges derived from the target.
 */
const targetClearRanges = (target: ISelectionTarget): IMeasureRange[] => {
    switch (target.granularity) {
        case SelectionGranularity.Note: {
            const event = modelEventAt(target.measure, target.start ?? target.event.start) ?? target.event;

            return [{
                trackId: target.measure.track.id,
                bar: target.measure.number,
                start: { ...event.start },
                end: addFractions(event.start, event.duration),
            }];
        }

        case SelectionGranularity.NoteGroup: {
            const last = target.events[target.events.length - 1];

            return [{
                trackId: target.measure.track.id,
                bar: target.measure.number,
                start: { ...target.events[0].start },
                end: addFractions(last.start, last.duration),
            }];
        }

        case SelectionGranularity.TrackPiece: {
            return [{ trackId: target.track.id, bar: target.measure.number }];
        }

        case SelectionGranularity.Measure: {
            return target.measure.track.arrangement.tracks.map((track) => {
                return { trackId: track.id, bar: target.measure.number };
            });
        }

        case SelectionGranularity.Track: {
            return target.track.measures.map((measure) => {
                return { trackId: target.track.id, bar: measure.number };
            });
        }
    }
};
