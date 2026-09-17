/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmArrangement, ISbDmTrack } from "../ScoreBookDataModel.js";
import type { IArrangementSnapshot, ITrackMeasureSnapshot, ITrackSnapshot } from "../types/general.js";

/** Current internal arrangement snapshot schema version. */

export const arrangementSnapshotVersion = 4;

export const isNaturalNumber = (value: unknown): value is number => {
    return typeof value === "number" && Number.isInteger(value) && value >= 1;
};

export const getArrangementSnapshot = (arrangementView: Readonly<ISbDmArrangement>): IArrangementSnapshot => {
    const { timeSignature, tempo, length, pulse, stepResolution } = arrangementView.timeParams;

    const snapshot: IArrangementSnapshot = {
        version: arrangementSnapshotVersion,
        title: arrangementView.title,
        timeParams: { timeSignature, tempo, length, pulse, stepResolution },
        tracks: arrangementView.tracks.map(getTrackSnapshot),
    };

    if (arrangementView.id >= 10000) {
        snapshot.scoreId = arrangementView.id;
    }

    if (Object.keys(arrangementView.measureLabels).length > 0) {
        snapshot.measureLabels = { ...arrangementView.measureLabels };
    }

    return snapshot;
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
            meter: { ...measure.meter },
            events: measure.events.map((event) => {
                return {
                    start: { ...event.start },
                    duration: { ...event.duration },
                    noteStyleId: event.noteStyleId,
                    articulation: event.articulation ? { ...event.articulation } : undefined,
                };
            }),
            subdivisions: measure.subdivisions.map((subdivision) => {
                return { ...subdivision };
            }),
        };
    });
};
