/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { INoteStyleMeta, ISbDmInstrument, ISbDmNote, ITiming } from "../ScoreBookDataModel.js";

export interface INoteStyle extends Omit<INoteStyleMeta, "file"> {
    /** The audio buffer associated with this note style. Null while the instrument is loading. */
    audioBuffer: AudioBuffer | null;

    /** The instrument to which this note style belongs. */
    readonly instrument: ISbDmInstrument;
}

export interface INoteStyleSymbol {
    src?: string; // path to use an img src
    string: string; // string to display for this note-style
}

export type Subscription = (...args: unknown[]) => void;

export interface ISubscribable {
    subscribe: (callback: Subscription) => () => void;
    unsubscribe: (callback: Subscription) => void;
}

export interface IPublisher extends ISubscribable {
    publish(): void;
}

export interface ITimeParams extends ISubscribable {
    timeSignature: string;
    tempo: number;
    length: number;
    pulse: string;
    stepResolution: number;
    timings: ITiming[];

    isValid(timing: ITiming): boolean;
}

export interface IPolyrhythm {
    id: number;
    start: ISbDmNote;
    end: ISbDmNote;
    notes: ISbDmNote[];
}

/** Make all entries in type T mutable. */
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P]
};

declare global {
    /** Holds the dev server base URL. */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    var BASE_URL: string;
}

// The goal here is to have intermediate objects which capture the state of the composition.
// They will be used for share links, undo/redo, and tab state preservation.
// Tab state preservation may require saving objects into history.state, so must be serializable/simple.

export interface IArrangementSnapshot {
    /** Snapshot schema version. Must always be a natural number. */
    version: number;
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
    timeSignature: string;
    tempo: number;
    length: number;
    pulse: string;
    stepResolution: number;
}

// The main purpose of this object is to turn into a shareable link
// So the properties line up with what will be separate query params
export interface ISerialisedArrangement {
    title?: string;
    composition: string;
    /** Serialisation format version. Missing values are interpreted as version 1. */
    version?: number;
}
