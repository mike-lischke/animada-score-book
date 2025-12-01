/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

// The goal here is to have intermediate objects which capture the state of the composition
// They will be used for share links, undo/redo, and tab state preservation
// Tab state preservation may require saving objects into history.state, so must be serialisable/simple

export interface IArrangementSnapshot {
    title?: string;
    timeParams: ITimeParamsSnapshot;
    tracks: ITrackSnapshot[];
}

export interface ITrackSnapshot {
    id: number;
    instrumentId: string;
    notes: string[];
    polyrhythms: IPolyrhythmSnapshot[];
}

export interface IPolyrhythmSnapshot {
    id: number;
    start: number;
    end: number;
    length: number;
}

export interface ITimeParamsSnapshot {
    timeSignature: string,
    tempo: number,
    length: number,
    pulse: string,
    stepResolution: number;
}

// The main purpose of this object is to turn into a shareable link
// So the properties line up with what will be separate query params
export interface ISerialisedArrangement {
    title?: string;
    composition: string;
    version: number;
}
