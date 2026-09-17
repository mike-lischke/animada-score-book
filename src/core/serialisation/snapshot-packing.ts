/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    IArrangementSnapshot, IMeasureEvent, IMeterSnapshot, ISubdivision, ITimeParamsBase, ITrackMeasureSnapshot,
    ITrackSnapshot
} from "../types/general.js";
import { addFractions } from "./numeric-functions.js";
import { arrangementSnapshotVersion, isNaturalNumber } from "./snapshots.js";

/**
 * Compact wire format for an `IArrangementSnapshot`.
 *
 * The structure is identical in information content to `IArrangementSnapshot`, but uses
 * single-character object keys and tuple arrays for repetitive structures (tracks, measures,
 * steps, subdivisions). When JSON-stringified this is significantly smaller than the verbose snapshot,
 * while still being trivially inspectable and forward-/backward-compatible via the `v` field.
 *
 * Layout:
 * ```text
 * { v, t?, p, k, l? }
 *   v          schema version (matches IArrangementSnapshot.version)
 *   t          optional title
 *   p          packed time params:  [timeSignature, tempo, length, pulse, stepResolution]
 *   k          tracks: [ [id, instrumentId, measures], ... ]
 *     measure: [ number, meter, events, subdivisions ]
 *   l          optional measure labels: { measureNumber: label, ... }
 * ```
 */
export interface IPackedArrangement {
    v: number;
    t?: string;
    p: PackedTimeParams;
    k: PackedTrack[];
    /** Per-measure section labels, keyed by 1-based measure number (as string after JSON round-trip). */
    l?: Record<number, string>;
    /** Optional database score ID, carried through round-trips. */
    s?: number;
}

export type PackedTimeParams = [
    timeSignature: string,
    tempo: number,
    length: number,
    pulse: string,
    stepResolution: number,
];

export type PackedMeter = [
    numerator: number,
    denominator: number,
    stepResolution: number,
    beatGroups: number[],
];

export type PackedEvent = [
    duration: [number, number],
    noteStyleId: string,
    articulation?: [number, boolean, boolean],
];

export type PackedSubdivision = [
    startIndex: number,
    actual: number,
    normal: number,
    isTuplet: boolean,
];

export type PackedMeasure = [
    number: number,
    meter: PackedMeter,
    events: PackedEvent[],
    subdivisions: PackedSubdivision[],
];

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

    if (snapshot.measureLabels && Object.keys(snapshot.measureLabels).length > 0) {
        packed.l = { ...snapshot.measureLabels };
    }

    if (snapshot.scoreId !== undefined) {
        packed.s = snapshot.scoreId;
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

    if (packed.l !== undefined) {
        // JSON round-trips object keys as strings; convert back to numbers.
        snapshot.measureLabels = Object.fromEntries(
            Object.entries(packed.l).map(([k, v]) => {
                return [Number(k), v];
            }),
        );
    }

    if (packed.s !== undefined) {
        snapshot.scoreId = packed.s;
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

const packTimeParams = (timeParams: ITimeParamsBase): PackedTimeParams => {
    return [
        timeParams.timeSignature,
        timeParams.tempo,
        timeParams.length,
        timeParams.pulse,
        timeParams.stepResolution,
    ];
};

const unpackTimeParams = (packed: PackedTimeParams): ITimeParamsBase => {
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
    return [
        measure.number,
        packMeter(measure.meter),
        measure.events.map(packEvent),
        measure.subdivisions.map(packSubdivision),
    ];
};

const unpackMeasure = (packed: PackedMeasure): ITrackMeasureSnapshot => {
    const [number, meter, events, subdivisions] = packed;

    return {
        number,
        meter: unpackMeter(meter),
        events: unpackEvents(events),
        subdivisions: subdivisions.map(unpackSubdivision),
    };
};

const packMeter = (meter: IMeterSnapshot): PackedMeter => {
    return [
        meter.beats,
        meter.beatUnits,
        meter.stepResolution,
        [...meter.beatGroups],
    ];
};

const unpackMeter = (packed: PackedMeter): IMeterSnapshot => {
    const [numerator, denominator, stepResolution, beatGroups] = packed;

    return {
        beats: numerator,
        beatUnits: denominator,
        stepResolution,
        beatGroups: [...beatGroups],
    };
};

const packEvent = (event: IMeasureEvent): PackedEvent => {
    const result: PackedEvent = [
        [event.duration.numerator, event.duration.denominator],
        event.noteStyleId ?? "",
    ];

    const a = event.articulation;
    if (a) {
        result.push([a.damping, a.accent, a.ghost]);
    }

    return result;
};

const unpackEvents = (packed: PackedEvent[]): IMeasureEvent[] => {
    const events: IMeasureEvent[] = [];
    let start = { numerator: 0, denominator: 1 };

    for (const entry of packed) {
        const [duration, noteStyleId, articulation] = entry;
        const event: IMeasureEvent = {
            start: { ...start },
            duration: { numerator: duration[0], denominator: duration[1] },
            noteStyleId: noteStyleId || undefined,
        };

        if (articulation) {
            const [damping, accent, ghost] = articulation;
            event.articulation = { damping, accent, ghost };
        }

        events.push(event);
        start = addFractions(start, event.duration);
    }

    return events;
};

const packSubdivision = (subdivision: ISubdivision): PackedSubdivision => {
    return [subdivision.startIndex, subdivision.actual, subdivision.normal, subdivision.isTuplet];
};

const unpackSubdivision = (packed: PackedSubdivision): ISubdivision => {
    const [startIndex, actual, normal, isTuplet] = packed;

    return { startIndex, actual, normal, isTuplet };
};
