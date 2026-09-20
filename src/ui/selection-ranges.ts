/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IMeasureRange, ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure }
    from "../core/ScoreBookDataModel.js";
import type { IAddressedEvent } from "./MeasureEditor.js";
import { modelEventAt } from "../core/MeasureProjection.js";
import { addFractions } from "../core/serialisation/numeric-functions.js";
import { SelectionGranularity, SelectionSerializer, type ISelectionEntry, type ISelectionTarget }
    from "./SelectionSerializer.js";
import type { IFraction } from "../core/types/general.js";

/** A measure a selection addresses, with the indexes of the events it covers. */
export interface IAddressedMeasureEvents {
    measure: ISbDmTrackMeasure;
    indexes: number[];
}

/**
 * Resolves the measure events a selection addresses. A range that covers a whole measure takes every
 * event of it, a range that addresses a span takes the event covering its start. Several ranges of
 * one measure end up in a single entry.
 *
 * @param arrangement The arrangement the entries were resolved against.
 * @param entries The selection entries to convert.
 *
 * @returns One entry per addressed measure, with its addressed event indexes.
 */
export const selectionEventsOf = (arrangement: ISbDmArrangement,
    entries: ISelectionEntry[]): IAddressedMeasureEvents[] => {
    const addressed: IAddressedMeasureEvents[] = [];

    for (const entry of entries) {
        const { target } = entry;
        const granularity = target.granularity;

        // A note and a group name the events they hold, a whole track, measure or track piece covers
        // every event of the bars it addresses.
        if (granularity === SelectionGranularity.Note || granularity === SelectionGranularity.NoteGroup) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === target.measure.track.id;
            });
            const measure = track?.measures.at(target.measure.number - 1);
            if (measure === undefined) {
                continue;
            }

            const starts = granularity === SelectionGranularity.Note
                ? [target.start ?? target.event.start]
                : target.events.map((event) => {
                    return event.start;
                });

            addAddressedEvents(addressed, measure, starts);

            continue;
        }

        for (const range of selectionToClearRanges([entry])) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === range.trackId;
            });
            const measure = track?.measures.at(range.bar - 1);
            if (measure === undefined) {
                continue;
            }

            const starts = range.start === undefined
                ? measure.events.map((event) => {
                    return event.start;
                })
                : [range.start];

            addAddressedEvents(addressed, measure, starts);
        }
    }

    return addressed;
};

/**
 * Adds the events of a measure that start at the given positions to the addressed list.
 *
 * @param addressed The list of addressed measures.
 * @param measure The measure the events belong to.
 * @param starts The positions of the addressed events.
 */
const addAddressedEvents = (addressed: IAddressedMeasureEvents[], measure: ISbDmTrackMeasure,
    starts: IFraction[]): void => {
    let covered = addressed.find((candidate) => {
        return candidate.measure === measure;
    });
    if (covered === undefined) {
        covered = { measure, indexes: [] };
        addressed.push(covered);
    }

    for (const start of starts) {
        const event = modelEventAt(measure, start);
        const index = event === undefined ? -1 : measure.events.indexOf(event);

        if (index >= 0 && !covered.indexes.includes(index)) {
            covered.indexes.push(index);
        }
    }
};

/**
 * Resolves the events a selection addresses as edit targets: the track, the bar and the start of each
 * addressed event. A range that covers a whole measure contributes every event of it.
 *
 * @param arrangement The arrangement the entries were resolved against.
 * @param entries The selection entries to convert.
 *
 * @returns The addressed events, in measure order.
 */
export const selectionEventTargets = (arrangement: ISbDmArrangement,
    entries: ISelectionEntry[]): IAddressedEvent[] => {
    const addressed: IAddressedEvent[] = [];

    for (const covered of selectionEventsOf(arrangement, entries)) {
        for (const index of covered.indexes) {
            addressed.push({
                trackId: covered.measure.track.id,
                bar: covered.measure.number,
                start: covered.measure.events[index].start,
            });
        }
    }

    return addressed;
};

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
 * Collects the distinct tracks a selection addresses. A whole measure covers every track of its bar,
 * so such an entry contributes all of them, while a note contributes its own track alone.
 *
 * @param arrangement The arrangement the entries were resolved against.
 * @param entries The selection entries to convert.
 *
 * @returns The distinct tracks, in order of first appearance.
 */
export const selectionTracksOf = (arrangement: ISbDmArrangement, entries: ISelectionEntry[]): ISbDmTrack[] => {
    const tracks: ISbDmTrack[] = [];

    for (const entry of entries) {
        const covered = targetClearRanges(entry.target).map((range) => {
            return arrangement.tracks.find((candidate) => {
                return candidate.id === range.trackId;
            });
        });

        // A track without measures still covers itself, as does an entry whose measure is gone.
        const own = covered.length === 0 ? [SelectionSerializer.trackOf(entry)] : [];

        for (const track of [...covered, ...own]) {
            if (track && !tracks.includes(track)) {
                tracks.push(track);
            }
        }
    }

    return tracks;
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
