/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    IArrangementSnapshot, INoteEventSnapshot, ITimeParamsSnapshot, ITrackMeasureSnapshot, ITrackSnapshot
} from "../types/general.js";
import { arrangementSnapshotVersion, isNaturalNumber } from "./snapshots.js";

/**
 * Compact wire format for an `IArrangementSnapshot`.
 *
 * The structure is identical in information content to `IArrangementSnapshot`, but uses
 * single-character object keys and tuple arrays for repetitive structures (tracks, measures,
 * events). When JSON-stringified this is significantly smaller than the verbose snapshot,
 * while still being trivially inspectable and forward-/backward-compatible via the `v` field.
 *
 * Layout:
 * ```text
 * { v, t?, p, k }
 *   v          schema version (matches IArrangementSnapshot.version)
 *   t          optional title
 *   p          packed time params:  [timeSignature, tempo, length, pulse, stepResolution]
 *   k          tracks: [ [id, instrumentId, measures], ... ]
 *     measure: [ number, [event, ...] ]
 *     event:   [ startN, startD, durN, durD, noteStyleId ]
 * ```
 */
export interface IPackedArrangement {
    v: number;
    t?: string;
    p: PackedTimeParams;
    k: PackedTrack[];
}

export type PackedTimeParams = [
    timeSignature: string,
    tempo: number,
    length: number,
    pulse: string,
    stepResolution: number,
];

export type PackedNoteEvent = [
    startNumerator: number,
    startDenominator: number,
    durationNumerator: number,
    durationDenominator: number,
    noteStyleId: string,
];

export type PackedMeasure = [number: number, events: PackedNoteEvent[]];

export type PackedTrack = [id: number, instrumentId: string, measures: PackedMeasure[]];

/**
 * Encodes a snapshot into the compact wire format.
 *
 * @param snapshot The arrangement snapshot to encode.
 *
 * @returns The packed representation suitable for storage or transmission.
 */
export const packArrangementSnapshot = (snapshot: IArrangementSnapshot): IPackedArrangement => {
    if (snapshot.version !== arrangementSnapshotVersion) {
        throw new Error(
            `Cannot pack snapshot of version ${snapshot.version}; expected ${arrangementSnapshotVersion}`,
        );
    }

    const packed: IPackedArrangement = {
        v: snapshot.version,
        p: packTimeParams(snapshot.timeParams),
        k: snapshot.tracks.map(packTrack),
    };

    if (snapshot.title !== undefined) {
        packed.t = snapshot.title;
    }

    return packed;
};

/**
 * Decodes a compact arrangement back into a verbose snapshot.
 *
 * @param packed The packed arrangement to decode.
 *
 * @returns The reconstructed arrangement snapshot.
 */
export const unpackArrangementSnapshot = (packed: IPackedArrangement): IArrangementSnapshot => {
    if (!isNaturalNumber(packed.v)) {
        throw new Error("Invalid packed arrangement: missing or non-numeric version");
    }

    const snapshot: IArrangementSnapshot = {
        version: packed.v,
        timeParams: unpackTimeParams(packed.p),
        tracks: packed.k.map(unpackTrack),
    };

    if (packed.t !== undefined) {
        snapshot.title = packed.t;
    }

    return snapshot;
};

/**
 * Returns true if `value` is a packed arrangement object (has a numeric `v` field). Used to
 * distinguish compact JSON content from legacy BananaDrum URL-encoded content.
 *
 * @param value The candidate value to test.
 *
 * @returns True if `value` is a packed arrangement.
 */
export const isPackedArrangement = (value: unknown): value is IPackedArrangement => {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<IPackedArrangement>;

    return isNaturalNumber(candidate.v) && Array.isArray(candidate.p) && Array.isArray(candidate.k);
};

/**
 * Convenience: encode a snapshot to a compact JSON string suitable for storage on the backend
 * or in URL share links.
 *
 * @param snapshot The arrangement snapshot to encode.
 *
 * @returns The packed snapshot as a JSON string.
 */
export const stringifyPackedArrangement = (snapshot: IArrangementSnapshot): string => {
    return JSON.stringify(packArrangementSnapshot(snapshot));
};

/**
 * Tries to parse `content` as a compact-packed arrangement. Returns the unpacked snapshot, or
 * `undefined` if `content` is not valid compact JSON.
 *
 * @param content The string to inspect.
 *
 * @returns The decoded snapshot, or `undefined` if `content` is not compact JSON.
 */
export const tryParsePackedArrangement = (content: string): IArrangementSnapshot | undefined => {
    // Cheap pre-check to avoid throwing on non-JSON strings (e.g. BananaDrum URL params).
    const trimmed = content.trimStart();
    if (!trimmed.startsWith("{")) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(content) as unknown;
        if (!isPackedArrangement(parsed)) {
            return undefined;
        }

        return unpackArrangementSnapshot(parsed);
    } catch {
        return undefined;
    }
};

const packTimeParams = (timeParams: ITimeParamsSnapshot): PackedTimeParams => {
    return [
        timeParams.timeSignature,
        timeParams.tempo,
        timeParams.length,
        timeParams.pulse,
        timeParams.stepResolution,
    ];
};

const unpackTimeParams = (packed: PackedTimeParams): ITimeParamsSnapshot => {
    const [timeSignature, tempo, length, pulse, stepResolution] = packed;

    return { timeSignature, tempo, length, pulse, stepResolution };
};

const packTrack = (track: ITrackSnapshot): PackedTrack => {
    return [track.id, track.instrumentId, track.measures.map(packMeasure)];
};

const unpackTrack = (packed: PackedTrack): ITrackSnapshot => {
    const [id, instrumentId, measures] = packed;

    return { id, instrumentId, measures: measures.map(unpackMeasure) };
};

const packMeasure = (measure: ITrackMeasureSnapshot): PackedMeasure => {
    return [measure.number, measure.events.map(packEvent)];
};

const unpackMeasure = (packed: PackedMeasure): ITrackMeasureSnapshot => {
    const [number, events] = packed;

    return { number, events: events.map(unpackEvent) };
};

const packEvent = (event: INoteEventSnapshot): PackedNoteEvent => {
    return [
        event.start.numerator,
        event.start.denominator,
        event.duration.numerator,
        event.duration.denominator,
        event.noteStyleId,
    ];
};

const unpackEvent = (packed: PackedNoteEvent): INoteEventSnapshot => {
    const [startNumerator, startDenominator, durationNumerator, durationDenominator, noteStyleId] = packed;

    return {
        start: { numerator: startNumerator, denominator: startDenominator },
        duration: { numerator: durationNumerator, denominator: durationDenominator },
        noteStyleId,
    };
};
