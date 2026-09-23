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

export interface IArticulationSymbol {
    /** Path to use an img src. */
    src?: string;

    /**
     * A small description for space limited text. Should be 1-2 words, e.g. "rim shot", "muted",
     * "cross click".
     */
    shortDescription: string;

    /** A longer description for tooltips or alt text. */
    description?: string;
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

/**
 * Optional, feature-owned data of an arrangement snapshot, keyed by chunk name.
 *
 * A chunk carries everything one feature needs beyond the core of a snapshot (version, time params,
 * tracks). Chunk names are camelCase and name the feature rather than the stored shape. A feature owns
 * its chunk end to end: it keeps the data in a model field, writes the chunk in `toSnapshot()` and reads
 * it back in `applyArrangementSnapshot()`, so adding one never touches the core and removing one is a
 * matter of deleting those three places.
 *
 * A chunk is never required to read a snapshot, which is why a missing or unknown chunk is ignored.
 * Keys are dropped on load, so chunks travel only between builds that both know them.
 */
export type IArrangementExtensions = Record<string, unknown>;

export interface IArrangementSnapshot {
    version: number;
    title?: string;
    timeParams: ITimeParamsBase;
    tracks: ITrackSnapshot[];

    /** The database score ID, if this arrangement is backed by a DB score. */
    scoreId?: number;

    /** Feature-owned extension data, keyed by chunk name. See {@link IArrangementExtensions}. */
    extensions?: IArrangementExtensions;
}

export interface ITrackSnapshot {
    id: number;
    instrumentId: string;
    measures: ITrackMeasureSnapshot[];
}

export interface ITrackMeasureSnapshot {
    number: number;
    meter: IMeterSnapshot;
    events: IMeasureEvent[];
    subdivisions: ISubdivision[];
}

export interface IMeterSnapshot {
    beats: number;
    beatUnits: number;
    stepResolution: number;
    beatGroups: number[];
}

/**
 * A single rhythmic event in a measure — either a note ({@link noteStyleId} set) or a rest
 * ({@link noteStyleId} undefined). Events are stored in start order and tile the measure
 * contiguously, so every measure adds up to exactly one whole bar.
 */
export interface IMeasureEvent {
    /** Position within the measure as a fraction in the range 0..1. */
    start: IFraction;

    /** Length of the event as a fraction. */
    duration: IFraction;

    /** Which sound variant (center, rim, high bell…). References a key in the instrument's noteStyles map. */
    noteStyleId?: string;

    /** How the note is played. Defaults to Open / unaccented when absent. */
    articulation?: INoteArticulation;
}

/**
 * Marks a group of consecutive events as a subdivision (tuplet or symmetric split). The
 * {@link isTuplet} flag distinguishes asymmetric ratios (e.g. 3:2, 5:4), which need tuplet
 * notation, from plain binary splits that only need visual grouping in the grid.
 */
export interface ISubdivision {
    /** Index of the first event in the group. */
    startIndex: number;

    /** Number of notes in the stream. */
    actual: number;

    /** Number of "original" notes this group replaces. */
    normal: number;

    /** Whether this subdivision is a true tuplet (asymmetric ratio). */
    isTuplet: boolean;
}

/**
 * How entering an event makes room for it. Insert pushes the content behind the entry position, overwrite
 * keeps the content where it is and replaces or shortens it.
 */
export enum EditEntryMode {
    Insert,
    Overwrite,
}
