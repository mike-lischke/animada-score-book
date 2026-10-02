/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmArrangement, ISbDmTrack } from "../ScoreBookDataModel.js";
import type {
    IArrangementExtensions, IArrangementSnapshot, IRepeatBar, ITrackPieceSnapshot, ITrackSnapshot,
} from "../types/general.js";

/** Current internal arrangement snapshot schema version. */

export const arrangementSnapshotVersion = 6;

/**
 * Every snapshot version this build reads, the current one included. An older version is upgraded on load, so a
 * score a previous build wrote keeps its content. A schema change adds the version it supersedes here.
 */
const readableSnapshotVersions: ReadonlySet<number> = new Set([5, arrangementSnapshotVersion]);

/**
 * @param version The schema version of a snapshot.
 *
 * @returns True when this build reads the version, upgrading it when it is an older one.
 */
export const isReadableSnapshotVersion = (version: unknown): version is number => {
    return typeof version === "number" && readableSnapshotVersions.has(version);
};

/** Chunk name under which an arrangement stores the column widths of individual measures. */
const measureWidthsChunk = "measureWidths";

/** Chunk name under which an arrangement stores the repeat marks of its bars. */
const repeatBarsChunk = "repeatBars";

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

    const extensions = collectArrangementExtensions(arrangementView);
    if (extensions !== undefined) {
        snapshot.extensions = extensions;
    }

    return snapshot;
};

/**
 * Collects the extension chunks of an arrangement: the chunk this build owns, plus the foreign chunks
 * kept verbatim, so writing a snapshot never drops data this build does not understand.
 *
 * @param arrangementView The arrangement to collect the chunks of.
 *
 * @returns The chunks, or undefined when the arrangement has none.
 */
export const collectArrangementExtensions = (
    arrangementView: Readonly<ISbDmArrangement>,
): IArrangementExtensions | undefined => {
    const chunks: IArrangementExtensions = { ...arrangementView.foreignExtensions };

    const widths = arrangementView.measureWidths;
    if (widths !== undefined && widths.size > 0) {
        chunks[measureWidthsChunk] = Object.fromEntries(widths);
    }

    const repeats = arrangementView.repeatBars;
    if (repeats !== undefined && repeats.size > 0) {
        chunks[repeatBarsChunk] = Object.fromEntries([...repeats].map(([bar, marks]) => {
            const stored: IRepeatBar = {};
            if (marks.start) {
                stored.start = true;
            }

            if (marks.end) {
                stored.end = true;
            }

            return [bar, stored];
        }));
    }

    return Object.keys(chunks).length > 0 ? chunks : undefined;
};

/**
 * Applies an arrangement snapshot's extension chunks. The chunks this build knows are read into their model
 * fields; the ones it does not know are kept verbatim, so the next snapshot writes them back unchanged. The
 * chunks are filtered against the arrangement's bar count, so the time parameters have to be applied first.
 *
 * @param arrangementView The arrangement to apply the chunks to.
 * @param snapshot The snapshot whose chunks to apply.
 */
export const applyArrangementExtensions = (arrangementView: ISbDmArrangement,
    snapshot: IArrangementSnapshot): void => {
    const { [measureWidthsChunk]: widthChunk, [repeatBarsChunk]: repeatChunk, ...foreign } = snapshot.extensions ?? {};

    arrangementView.foreignExtensions = foreign;

    applyMeasureWidths(arrangementView, widthChunk);
    applyRepeatBars(arrangementView, repeatChunk);
};

/**
 * @param arrangementView The arrangement to read the widths into.
 * @param chunk The width chunk of a snapshot, as it was written.
 */
const applyMeasureWidths = (arrangementView: ISbDmArrangement, chunk: unknown): void => {
    const widths = arrangementView.measureWidths;
    if (widths === undefined) {
        return;
    }

    widths.clear();

    if (typeof chunk !== "object" || chunk === null) {
        return;
    }

    const bars = arrangementView.timeParams.length;
    for (const [bar, width] of Object.entries(chunk)) {
        const barNumber = Number(bar);
        if (Number.isInteger(barNumber) && barNumber >= 1 && barNumber <= bars
            && typeof width === "number" && Number.isFinite(width) && width > 0) {
            widths.set(barNumber, width);
        }
    }
};

/**
 * @param arrangementView The arrangement to read the repeat marks into.
 * @param chunk The repeat chunk of a snapshot, as it was written.
 */
const applyRepeatBars = (arrangementView: ISbDmArrangement, chunk: unknown): void => {
    const repeats = arrangementView.repeatBars;
    if (repeats === undefined) {
        return;
    }

    repeats.clear();

    if (typeof chunk !== "object" || chunk === null) {
        return;
    }

    const bars = arrangementView.timeParams.length;
    for (const [bar, marks] of Object.entries(chunk)) {
        const barNumber = Number(bar);
        if (!Number.isInteger(barNumber) || barNumber < 1 || barNumber > bars
            || typeof marks !== "object" || marks === null) {
            continue;
        }

        const { start, end } = marks as IRepeatBar;
        const stored: IRepeatBar = {};
        if (start === true) {
            stored.start = true;
        }

        if (end === true) {
            stored.end = true;
        }

        if (stored.start !== undefined || stored.end !== undefined) {
            repeats.set(barNumber, stored);
        }
    }
};

const getTrackSnapshot = (track: ISbDmTrack): ITrackSnapshot => {
    return {
        id: track.id,
        instrumentId: track.instrument.typeId,
        measures: getMeasureSnapshots(track),
    };
};

const getMeasureSnapshots = (track: ISbDmTrack): ITrackPieceSnapshot[] => {
    return track.measures.map((measure) => {
        const snapshot: ITrackPieceSnapshot = {
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

        if (measure.simile) {
            snapshot.simile = true;
        }

        return snapshot;
    });
};
