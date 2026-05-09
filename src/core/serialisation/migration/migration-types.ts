/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ITimeParamsSnapshot } from "../../types/general.js";
import type { Note } from "./Note.js";

// Legacy snapshot types kept around solely for migrating older persisted/shared formats
// (snapshot version 1) into the current internal snapshot format. They must never escape
// the migration boundary into the rest of the application.

export interface ILegacyArrangementSnapshot {
    /** Snapshot schema version. For legacy snapshots this is < the current version. */
    version: number;
    title?: string;
    timeParams: ITimeParamsSnapshot;
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
} export interface IPolyrhythm {
    id: number;
    start: Note;
    end: Note;
    notes: Note[];
}
