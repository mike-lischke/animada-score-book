/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISoundStyleMeta, ISbDmInstrument, ITiming, INoteArticulation } from "../ScoreBookDataModel.js";

export interface IRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface IAudioData extends Omit<ISoundStyleMeta, "file"> {
    /** The audio buffer associated with this note style. Null while the instrument is loading. */
    audioBuffer: AudioBuffer | null;

    /** The instrument to which this note style belongs. */
    readonly instrument: ISbDmInstrument;
}

export interface INoteStyleSymbol {
    src?: string; // path to use an img src
    string: string; // string to display for this note-style
}

export interface ITimeParams extends ITimeParamsBase {
    timings: ITiming[];

    isValid(timing: ITiming): boolean;
}

export interface IFraction {
    numerator: number;
    denominator: number;
}

/** Make all entries in type T mutable. */
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P]
};

export interface ITimeParamsBase {
    timeSignature: string;
    tempo: number;
    length: number;
    pulse: string;
    stepResolution: number;
}

export interface IArrangementSnapshot {
    version: number;
    title?: string;
    timeParams: ITimeParamsBase;
    tracks: ITrackSnapshot[];

    /** Optional per-measure section labels, keyed by 1-based measure number. */
    measureLabels?: Record<number, string>;
}

export interface ITrackSnapshot {
    id: number;
    instrumentId: string;
    measures: ITrackMeasureSnapshot[];
}

export interface ITrackMeasureSnapshot {
    number: number;
    meter: IMeterSnapshot;
    steps: IMeasureStep[];
    subdivisions: ISubdivision[];
}

export interface IMeterSnapshot {
    beats: number;
    beatUnits: number;
    stepResolution: number;
    beatGroups: number[];
}

export interface IMeasureStep {
    index: number;

    /** Which sound variant (center, rim, high bell…). References a key in the instrument's noteStyles map. */
    noteStyleId?: string;

    /** How the note is played. Defaults to Open / unaccented when absent. */
    articulation?: INoteArticulation;
}

/**
 * A subdivision of one or more grid steps. Subdivisions are the primary mechanism for
 * creating note values shorter than a single grid step.
 *
 * When {@link isTuplet} is true the subdivision represents a genuine tuplet (e.g. 3:2,
 * 5:4) and should be rendered with a bracket and number in staff notation. When false
 * it is a simple rhythmic subdivision (e.g. a step split into 2, 4, or 8 equal parts
 * in a simple meter) and needs no tuplet notation.
 */
export interface ISubdivision {
    id: number;

    /** 0-based index into the measure's visible steps array. */
    startStep: number;

    /** Number of subdivisions inside this group. */
    actual: number;

    /** Number of parent steps this subdivision replaces. */
    normal: number;

    /** ID of the parent subdivision, if nested. */
    parentSubdivisionId?: number;

    /** Whether this subdivision is a real tuplet requiring bracket/number notation. */
    isTuplet: boolean;
}
