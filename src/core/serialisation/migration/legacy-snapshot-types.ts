/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { INoteArticulation } from "../../ScoreBookDataModel.js";
import type { IMeterSnapshot, ITimeParamsBase } from "../../types/general.js";

// Legacy snapshot types kept around solely for migrating older persisted/shared formats
// (snapshot versions 1–3) into the current internal snapshot format. They must never escape
// the migration boundary into the rest of the application.

export interface ILegacyArrangementSnapshot {
    /** Snapshot schema version. For legacy snapshots this is < the current version. */
    version: number;
    title?: string;
    timeParams: ITimeParamsBase;
    tracks: ILegacyTrackSnapshot[];
}

export interface ILegacyTrackSnapshot {
    id: number;
    instrumentId: string;
    notes: string[];
    polyrhythms: ILegacyPolyrhythmSnapshot[];
}

export interface ILegacyPolyrhythmSnapshot {
    id: number;
    start: number;
    end: number;
    length: number;
}

/** Pre-v4 measure step (grid cell) as persisted by snapshot versions 2 and 3. */
export interface ILegacyMeasureStep {
    index: number;
    noteStyleId?: string;
    articulation?: INoteArticulation;
}

/** Pre-v4 subdivision (tuplet or simple grid split) as persisted by snapshot versions 2 and 3. */
export interface ILegacySubdivision {
    id: number;
    startStep: number;
    actual: number;
    normal: number;
    parentSubdivisionId?: number;
    isTuplet: boolean;
}

/** Pre-v4 measure shape: grid steps plus overlay subdivisions. */
export interface ILegacyMeasureSnapshot {
    number: number;
    meter: IMeterSnapshot;
    steps: ILegacyMeasureStep[];
    subdivisions: ILegacySubdivision[];
}

/** Pre-v4 track shape (snapshot versions 2 and 3). */
export interface ILegacyTrackSnapshotV3 {
    id: number;
    instrumentId: string;
    measures: ILegacyMeasureSnapshot[];
}

/** Pre-v4 arrangement snapshot (snapshot versions 2 and 3). */
export interface ILegacyArrangementSnapshotV3 {
    version: number;
    title?: string;
    timeParams: ITimeParamsBase;
    tracks: ILegacyTrackSnapshotV3[];
    scoreId?: number;
    measureLabels?: Record<number, string>;
}
