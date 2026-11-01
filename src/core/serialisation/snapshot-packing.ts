/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    IArrangementExtensions, IArrangementSnapshot, IMeasureEvent, IMeterSnapshot, ISubdivision, ITimeParamsBase,
    ITrackPieceSnapshot, ITrackSnapshot
} from "../types/general.js";
import type { Damping } from "../ScoreBookDataModel.js";
import { addFractions } from "./numeric-functions.js";
import { arrangementSnapshotVersion, isNaturalNumber, isReadableSnapshotVersion } from "./snapshots.js";

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
 * { v, t?, p, k, s?, c? }
 *   v          schema version (matches IArrangementSnapshot.version)
 *   t          optional title
 *   p          packed time params:  [timeSignature, tempo, length, pulse]
 *   k          tracks: [ [id, instrumentId, measures], ... ]
 *     measure: [ number, meter, events, subdivisions, simile? ]
 *   s          optional database score ID
 *   c          optional extension chunks, keyed by chunk name
 * ```
 */
export interface IPackedArrangement {
    v: number;
    t?: string;
    p: PackedTimeParams;
    k: PackedTrack[];
    /** Optional database score ID, carried through round-trips. */
    s?: number;
    /** Extension chunks of the features that have something to store. See {@link IArrangementExtensions}. */
    c?: IArrangementExtensions;
}

export type PackedTimeParams = [
    timeSignature: string,
    tempo: number,
    length: number,
    pulse: string,
];

export type PackedMeter = [
    numerator: number,
    denominator: number,
];

export type PackedEvent = [
    duration: [number, number],
    noteStyleId: string,
    articulation?: [Damping, boolean, boolean],
];

export type PackedSubdivision = [
    startIndex: number,
    actual: number,
    normal: number,
    isTuplet: boolean,
];

export type PackedTrackPiece = [
    number: number,
    meter: PackedMeter,
    events: PackedEvent[],
    subdivisions: PackedSubdivision[],
    simile?: boolean,
];

export type PackedTrack = [id: number, instrumentId: string, measures: PackedTrackPiece[]];

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

    if (snapshot.scoreId !== undefined) {
        packed.s = snapshot.scoreId;
    }

    if (snapshot.extensions && Object.keys(snapshot.extensions).length > 0) {
        packed.c = { ...snapshot.extensions };
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

    if (!isReadableSnapshotVersion(packed.v)) {
        throw new Error(`Unsupported snapshot schema version: ${packed.v}`);
    }

    const current = packed.v === arrangementSnapshotVersion ? packed : upgradePackedArrangement(packed);

    const snapshot: IArrangementSnapshot = {
        version: arrangementSnapshotVersion,
        timeParams: unpackTimeParams(current.p),
        tracks: current.k.map(unpackTrack),
    };

    if (current.t !== undefined) {
        snapshot.title = current.t;
    }

    if (current.s !== undefined) {
        snapshot.scoreId = current.s;
    }

    if (current.c !== undefined && Object.keys(current.c).length > 0) {
        snapshot.extensions = { ...current.c };
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
    ];
};

const unpackTimeParams = (packed: PackedTimeParams): ITimeParamsBase => {
    const [timeSignature, tempo, length, pulse] = packed;

    return { timeSignature, tempo, length, pulse };
};

/** The time params of a packed arrangement of schema 6 or older, which still state the step grid. */
type PackedLegacyTimeParams = [string, number, number, string, number];

/** A packed meter of schema 6 or older: numerator, denominator, step resolution, pulse groups. */
type PackedLegacyMeter = [number, number, number, number[]];

/** A packed measure of schema 6 or older. */
type PackedLegacyTrackPiece = [number, PackedLegacyMeter, PackedEvent[], PackedSubdivision[], boolean?];

/** A packed track of schema 6 or older. */
type PackedLegacyTrack = [number, string, PackedLegacyTrackPiece[]];

/**
 * Upgrades a packed arrangement of schema 6 or older, which stored the step grid in the time params and in every
 * meter. The current schema derives the grid from the meter instead.
 *
 * @param packed The packed arrangement of an older schema.
 *
 * @returns The same arrangement in the current schema.
 */
const upgradePackedArrangement = (packed: IPackedArrangement): IPackedArrangement => {
    const [timeSignature, tempo, length, pulse] = packed.p as unknown as PackedLegacyTimeParams;

    const tracks = (packed.k as unknown as PackedLegacyTrack[]).map(([id, instrumentId, measures]) => {
        const upgraded = measures.map(([number, meter, events, subdivisions, simile]): PackedTrackPiece => {
            const piece: PackedTrackPiece = [number, [meter[0], meter[1]], events, subdivisions];
            if (simile === true) {
                piece.push(true);
            }

            return piece;
        });

        return [id, instrumentId, upgraded] as PackedTrack;
    });

    return { ...packed, v: arrangementSnapshotVersion, p: [timeSignature, tempo, length, pulse], k: tracks };
};

const packTrack = (track: ITrackSnapshot): PackedTrack => {
    return [track.id, track.instrumentId, track.measures.map(packTrackPiece)];
};

const unpackTrack = (packed: PackedTrack): ITrackSnapshot => {
    const [id, instrumentId, measures] = packed;

    return { id, instrumentId, measures: measures.map(unpackTrackPiece) };
};

const packTrackPiece = (measure: ITrackPieceSnapshot): PackedTrackPiece => {
    const packed: PackedTrackPiece = [
        measure.number,
        packMeter(measure.meter),
        measure.events.map(packEvent),
        measure.subdivisions.map(packSubdivision),
    ];

    if (measure.simile) {
        packed.push(true);
    }

    return packed;
};

const unpackTrackPiece = (packed: PackedTrackPiece): ITrackPieceSnapshot => {
    const [number, meter, events, subdivisions, simile] = packed;

    const measure: ITrackPieceSnapshot = {
        number,
        meter: unpackMeter(meter),
        events: unpackEvents(events),
        subdivisions: subdivisions.map(unpackSubdivision),
    };

    if (simile === true) {
        measure.simile = true;
    }

    return measure;
};

const packMeter = (meter: IMeterSnapshot): PackedMeter => {
    return [
        meter.beats,
        meter.beatUnits,
    ];
};

const unpackMeter = (packed: PackedMeter): IMeterSnapshot => {
    const [numerator, denominator] = packed;

    return {
        beats: numerator,
        beatUnits: denominator,
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
