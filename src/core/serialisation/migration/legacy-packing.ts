/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IMeterSnapshot, ITimeParamsBase } from "../../types/general.js";
import type {
    ILegacyArrangementSnapshotV3, ILegacyMeasureSnapshot, ILegacySubdivision
} from "./legacy-snapshot-types.js";

// Legacy packed-format shapes (snapshot versions 2 and 3). These mirror the pre-v4 wire
// format and exist only to read old persisted content during migration.

type LegacyPackedTimeParams = [string, number, number, string, number];

type LegacyPackedMeter = [number, number, number, number[]];

type LegacyPackedSubdivision = [
    number, number, number, number, (number | null | undefined)?, (boolean | undefined)?
];

type LegacyPackedStep = string | [string, number, boolean, boolean];

type LegacyPackedMeasure = [number, LegacyPackedMeter, LegacyPackedStep[], LegacyPackedSubdivision[]];

type LegacyPackedTrack = [number, string, LegacyPackedMeasure[]];

interface ILegacyPackedArrangement {
    v: number;
    t?: string;
    p: LegacyPackedTimeParams;
    k: LegacyPackedTrack[];
    l?: Record<number, string>;
    s?: number;
}

export type { ILegacyPackedArrangement };

/**
 * Decodes a v2/v3 compact arrangement into a pre-v4 snapshot.
 *
 * @param packed The packed arrangement to decode.
 *
 * @returns The reconstructed legacy snapshot.
 */
export const unpackLegacyArrangement = (packed: ILegacyPackedArrangement): ILegacyArrangementSnapshotV3 => {
    const snapshot: ILegacyArrangementSnapshotV3 = {
        version: packed.v,
        timeParams: unpackTimeParams(packed.p),
        tracks: packed.k.map(unpackTrack),
    };

    if (packed.t !== undefined) {
        snapshot.title = packed.t;
    }

    if (packed.l !== undefined) {
        snapshot.measureLabels = Object.fromEntries(
            Object.entries(packed.l).map(([key, value]) => {
                return [Number(key), value];
            }),
        );
    }

    if (packed.s !== undefined) {
        snapshot.scoreId = packed.s;
    }

    return snapshot;
};

const unpackTimeParams = (packed: LegacyPackedTimeParams): ITimeParamsBase => {
    const [timeSignature, tempo, length, pulse, stepResolution] = packed;

    return { timeSignature, tempo, length, pulse, stepResolution };
};

const unpackTrack = (packed: LegacyPackedTrack): ILegacyArrangementSnapshotV3["tracks"][number] => {
    const [id, instrumentId, measures] = packed;

    return { id, instrumentId, measures: measures.map(unpackMeasure) };
};

const unpackMeasure = (packed: LegacyPackedMeasure): ILegacyMeasureSnapshot => {
    const [number, meter, steps, subdivisions] = packed;

    return {
        number,
        meter: unpackMeter(meter),
        steps: steps.map((entry, index) => {
            if (typeof entry === "string") {
                return { index, noteStyleId: entry || undefined };
            }

            const [noteStyleId, damping, accent, ghost] = entry;

            return { index, noteStyleId, articulation: { damping, accent, ghost } };
        }),
        subdivisions: subdivisions.map(unpackSubdivision),
    };
};

const unpackMeter = (packed: LegacyPackedMeter): IMeterSnapshot => {
    const [beats, beatUnits, stepResolution, beatGroups] = packed;

    return { beats, beatUnits, stepResolution, beatGroups: [...beatGroups] };
};

const unpackSubdivision = (packed: LegacyPackedSubdivision): ILegacySubdivision => {
    const [id, startStep, actual, normal, parentSubdivisionId, isTuplet] = packed;

    return {
        id,
        startStep,
        actual,
        normal,
        parentSubdivisionId: parentSubdivisionId ?? undefined,
        isTuplet: isTuplet ?? false,
    };
};
