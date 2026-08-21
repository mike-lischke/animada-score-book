/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IMeasureStep, IMeterSnapshot } from "./general.js";

/** Describes what kind of score content a clipboard entry represents. */
export enum ClipboardContentKind {
    /** An entire track (all its measures). */
    Track,

    /** One or more whole measures, spanning all tracks. */
    Measure,

    /** One measure of a single track. */
    TrackPiece,

    /** A contiguous step range (single note or note group) of a single track. */
    StepRange,
}

/** The content of one measure inside the clipboard. Steps cover either the whole measure or a selected subrange. */
export interface IClipboardMeasure {
    /** The meter this measure was recorded with, used for target compatibility checks. */
    meter: IMeterSnapshot;

    /** The measure steps, in display order. For step ranges this is only the selected subrange. */
    steps: IMeasureStep[];
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
