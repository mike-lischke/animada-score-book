/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmArrangement, ISbDmTrack } from "../ScoreBookDataModel.js";
import type {
    IArrangementSnapshot, INoteEventSnapshot, ITrackMeasureSnapshot, ITrackSnapshot
} from "../types/general.js";

/** Current internal arrangement snapshot schema version. */

export const arrangementSnapshotVersion = 2;

export const isNaturalNumber = (value: unknown): value is number => {
    return typeof value === "number" && Number.isInteger(value) && value >= 1;
};

export const getArrangementSnapshot = (arrangementView: Readonly<ISbDmArrangement>): IArrangementSnapshot => {
    const { timeSignature, tempo, length, pulse, stepResolution } = arrangementView.timeParams;

    return {
        version: arrangementSnapshotVersion,
        title: arrangementView.title,
        timeParams: { timeSignature, tempo, length, pulse, stepResolution },
        tracks: arrangementView.tracks.map(getTrackSnapshot)
    };
};

const getTrackSnapshot = (track: ISbDmTrack): ITrackSnapshot => {
    return {
        id: track.id,
        instrumentId: track.instrument.typeId,
        measures: getMeasureSnapshots(track),
    };
};

const getMeasureSnapshots = (track: ISbDmTrack): ITrackMeasureSnapshot[] => {
    return track.measures.map((measure) => {
        return {
            number: measure.number,
            events: measure.events.map((event) => {
                const eventSnapshot: INoteEventSnapshot = {
                    start: event.start,
                    duration: event.duration,
                    noteStyleId: event.noteStyle?.id ?? "0",
                };

                return eventSnapshot;
            }),
        };
    });
};
