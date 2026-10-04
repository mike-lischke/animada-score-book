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

/** The repeat mark a barline carries: one opens a repeated section, the other closes it. */
export enum RepeatMark {
    /** `|:`, the barline the repeated section starts at. Its value is the field of {@link IRepeatBar} it sets. */
    Start = "start",

    /** `:|`, the barline the repeated section ends at. Its value is the field of {@link IRepeatBar} it sets. */
    End = "end",
}

/** The repeat marks of one bar. Held per bar number on the arrangement, because a mark sits on a barline. */
export interface IRepeatBar {
    /** Whether the barline before the bar opens a repeated section (`|:`). */
    start?: boolean;

    /** Whether the barline after the bar closes a repeated section (`:|`). */
    end?: boolean;
}

/**
 * The kind of a range articulation. The values double as the stored kind in the snapshot chunk, so they
 * must stay stable.
 */
export enum RangeArticulationKind {
    /** A `<` hairpin that raises the dynamic level from its first to its second anchor. */
    Crescendo = "crescendo",

    /** A `>` hairpin that lowers the dynamic level from its first to its second anchor. */
    Decrescendo = "decrescendo",

    /** An `f` marking that restores the normal dynamic level at its event. */
    Forte = "forte",
}

/** A position on a track's timeline: a measure and an exact event onset inside it. */
export interface IRangeArticulationAnchor {
    /** 1-based measure number. */
    bar: number;

    /** Exact event onset within the measure, as a fraction of a bar. */
    start: IFraction;
}

/** The fields every range articulation shares. */
export interface IRangeArticulationBase {
    /** Stable id, minted by the session that created the marking. */
    id: number;

    /** The id of the track the marking belongs to. */
    trackId: number;
}

/**
 * A hairpin between two sounding note anchors of one track, in one measure or across a barline. The anchors are
 * kept in chronological order, so {@link kind} alone states whether the dynamic level rises or falls.
 */
export interface IHairpin extends IRangeArticulationBase {
    kind: RangeArticulationKind.Crescendo | RangeArticulationKind.Decrescendo;

    /** The chronologically first note anchor. */
    from: IRangeArticulationAnchor;

    /** The chronologically second note anchor. */
    to: IRangeArticulationAnchor;
}

/** An `f` marking at one event position, resetting the dynamic level to normal. */
export interface IForteMark extends IRangeArticulationBase {
    kind: RangeArticulationKind.Forte;

    /** The event position the marking sits at. A note or a rest. */
    at: IRangeArticulationAnchor;
}

/** A hairpin or an `f` marking of an arrangement. */
export type IRangeArticulation = IHairpin | IForteMark;

/**
 * Optional, feature-owned data of an arrangement snapshot, keyed by chunk name.
 *
 * A chunk carries everything one feature needs beyond the core of a snapshot (version, time params,
 * tracks). Chunk names are camelCase and name the feature rather than the stored shape. A feature owns
 * its chunk end to end: it keeps the data in a model field, writes the chunk in `toSnapshot()` and reads
 * it back in `applyArrangementSnapshot()`, so adding one never touches the core and removing one is a
 * matter of deleting those three places.
 *
 * A chunk is never required to read a snapshot, which is why a missing or unknown chunk is ignored. An unknown
 * chunk is kept and written back verbatim, so a save through a build that does not understand it never loses it.
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
    measures: ITrackPieceSnapshot[];
}

export interface ITrackPieceSnapshot {
    number: number;
    meter: IMeterSnapshot;
    events: IMeasureEvent[];
    subdivisions: ISubdivision[];

    /**
     * One-bar repeat (simile): the measure plays what the nearest preceding measure plays, so it holds no
     * content of its own. Never set on the first measure of a track.
     */
    simile?: boolean;
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
