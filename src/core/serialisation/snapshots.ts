/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmArrangement, ISbDmTrack } from "../ScoreBookDataModel.js";
import type {
    IArrangementSnapshot, IMeasureStep, ITrackMeasureSnapshot, ITrackSnapshot, ISubdivision
} from "../types/general.js";

/** Current internal arrangement snapshot schema version. */

export const arrangementSnapshotVersion = 2;

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
            meter: measure.meter,
            steps: getVisibleSteps(track, measure.number, measure.meter.stepResolution, measure.subdivisions),
            subdivisions: measure.subdivisions,
        };
    });
};

/**
 * Derives the visible step array for a measure by walking the base grid and
 * resolving noteStyleIds from the track's current events. This ensures that
 * edits made directly to events (e.g. in tests) are reflected in the snapshot.
 *
 * @param track The track the measure belongs to, used for looking up note styles of events.
 * @param measureNumber The measure number to get steps for.
 * @param stepsPerBar The number of grid steps per bar, used for calculating step positions of events.
 * @param subdivisions The measure's subdivisions, used for determining how many visible steps there are and which
 *                     events fall within each step.
 *
 * @returns An array of measure steps with noteStyleIds resolved from the track's events.
 */
const getVisibleSteps = (track: ISbDmTrack, measureNumber: number, stepsPerBar: number,
    subdivisions: ISubdivision[]): IMeasureStep[] => {
    const topLevelSubdivisions = subdivisions.filter((s) => {
        return s.parentSubdivisionId == null;
    }).sort((left, right) => {
        return left.startStep - right.startStep;
    });
    const topLevelByStart = new Map(topLevelSubdivisions.map((s) => {
        return [s.startStep, s] as const;
    }));

    const steps: IMeasureStep[] = [];
    let visibleIndex = 0;
    let baseStep = 1;

    while (baseStep <= stepsPerBar) {
        const subdivision = topLevelByStart.get(visibleIndex);
        if (!subdivision) {
            const note = track.getNoteAt({ bar: measureNumber, step: baseStep });
            steps.push({ index: visibleIndex, noteStyleId: note?.noteStyle?.id });
            visibleIndex += 1;
            baseStep += 1;

            continue;
        }

        // Collect events within the subdivision range from the track.
        const start = (baseStep - 1) / stepsPerBar;
        const end = (baseStep - 1 + subdivision.normal) / stepsPerBar;
        const measure = track.measures.find((candidate) => {
            return candidate.number === measureNumber;
        });
        const subEvents = measure?.events.filter((event) => {
            const eventStart = event.start.numerator / event.start.denominator;

            return eventStart >= start && eventStart < end
                && (event.duration.numerator * stepsPerBar) % event.duration.denominator !== 0;
        }) ?? [];

        for (const event of subEvents) {
            steps.push({ index: visibleIndex, noteStyleId: event.noteStyle?.id });
            visibleIndex += 1;
        }
        baseStep += subdivision.normal;
    }

    return steps;
};
