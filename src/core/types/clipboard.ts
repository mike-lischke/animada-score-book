/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IFraction, IMeasureEvent, IMeterSnapshot, ISubdivision } from "./general.js";
import { RangeArticulationKind } from "./general.js";

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
export interface IClipboardTrackPiece {
    /** The meter this measure was recorded with, used for target compatibility checks. */
    meter: IMeterSnapshot;

    /** The measure events, in display order. For event ranges this is only the selected subrange. */
    events: IMeasureEvent[];

    /** Subdivision groups whose start index lies within the copied event range. */
    subdivisions: ISubdivision[];

    /** One-bar repeat (simile) of the copied measure. Only a copied whole measure carries the mark. */
    simile?: boolean;

    /**
     * The source measure's column width in px at 100% zoom, or undefined when it had the default width. Only a
     * copied whole measure carries a width: a piece or an event range is content, and the measure it lands in
     * takes the width its own content needs.
     */
    width?: number;

    /**
     * Set when the copied range mixes subdivided and non-subdivided events. The subdivided part is
     * described by {@link subdivisions}, positioned relative to {@link events}.
     */
    mixed?: boolean;
}

/**
 * An anchor of a copied marking: a copied measure by its 0-based offset within the copied measures, and a fraction
 * inside it.
 */
export interface IClipboardAnchor {
    barOffset: number;
    start: IFraction;
}

/** A marking carried by the clipboard, its anchors kept in copied-measure coordinates. */
export type IClipboardArticulation =
    | {
        kind: RangeArticulationKind.Crescendo | RangeArticulationKind.Decrescendo;
        from: IClipboardAnchor;
        to: IClipboardAnchor;
    }
    | { kind: RangeArticulationKind.Forte; at: IClipboardAnchor; };

/** The clipboard content of one track, ordered along the measure dimension. */
export interface IClipboardTrack {
    /** The source instrument type, used to reject pastes into a different instrument. */
    instrumentTypeId: string;

    /** The copied measures, forming the repeat unit along the measure dimension. */
    measures: IClipboardTrackPiece[];

    /** The markings fully contained in the copied measures, in copied-measure coordinates. */
    articulations?: IClipboardArticulation[];
}

/**
 * The serialised clipboard content. This is a pure snapshot — it holds no references into the
 * data model, so it survives score load operations and can be pasted into a different score.
 */
export interface IClipboardContent {
    kind: ClipboardContentKind;
    tracks: IClipboardTrack[];
}
