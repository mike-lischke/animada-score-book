/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IMeasureEvent, IMeterSnapshot, ISubdivision } from "./general.js";

/** Describes what kind of score content a clipboard entry represents. */
export enum ClipboardContentKind {
    /** An entire track (all its measures). */
    Track,

    /** One or more whole measures, spanning all tracks. */
    Measure,

    /** One measure of a single track. */
    TrackPiece,

    /** A contiguous event range (single note or note group) of a single track. */
    EventRange,
}

/** The content of one measure inside the clipboard. Events cover either the whole measure or a selected subrange. */
export interface IClipboardMeasure {
    /** The meter this measure was recorded with, used for target compatibility checks. */
    meter: IMeterSnapshot;

    /** The measure events, in display order. For event ranges this is only the selected subrange. */
    events: IMeasureEvent[];

    /** Subdivision groups whose start index lies within the copied event range. */
    subdivisions: ISubdivision[];

    /**
     * Set when the copied range mixes subdivided and non-subdivided events. Such content cannot be
     * pasted unambiguously and is rejected as too complex.
     */
    mixed?: boolean;
}

/** The clipboard content of one track, ordered along the measure dimension. */
export interface IClipboardTrack {
    /** The source instrument type, used to reject pastes into a different instrument. */
    instrumentTypeId: string;

    /** The copied measures, forming the repeat unit along the measure dimension. */
    measures: IClipboardMeasure[];
}

/**
 * The serialised clipboard content. This is a pure snapshot — it holds no references into the
 * data model, so it survives score load operations and can be pasted into a different score.
 */
export interface IClipboardContent {
    kind: ClipboardContentKind;
    tracks: IClipboardTrack[];
}
