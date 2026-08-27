/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IFraction } from "../core/types/general.js";

/** Granularity of a selection entry — determines what level of the score hierarchy is selected. */
export enum SelectionGranularity {
    /** An entire track (all its measures). */
    Track,

    /** One or more whole measures. */
    Measure,

    /** A single track within a single measure (track × measure). */
    TrackPiece,

    /** A group of notes (beamed group, subdivision, tuplet). */
    NoteGroup,

    /** A single note event. */
    Note,
}

/** Selection interaction mode — controls how new selections combine with existing ones. */
export enum SelectionMode {
    /** Clear existing selections and start fresh. */
    New,

    /** Add to existing selections without clearing. */
    Add,

    /** Toggle selection state for elements that intersect the selection rect. */
    Invert,
}

/** Identifies a position in the score for anchoring selections. */
export interface ISelectionPoint {
    bar: number;
    trackId: number;

    /** Undefined when the point is at measure/track level rather than a specific step. */
    step?: number;
}

/** A single entry in the selection state, describing one selected element in the score. */
export interface ISelectionEntry {
    granularity: SelectionGranularity;
    bar: number;
    trackId: number;

    /** Defined for TrackPiece, NoteGroup, Note. */
    startStep?: number;

    /** Defined for TrackPiece, NoteGroup, Note. */
    endStep?: number;

    /** Defined for Note. */
    noteId?: number;

    /** Defined for Note entries on subdivision slots, which do not align to grid steps. */
    start?: IFraction;
}

/**
 * Interface for Preact components that participate in hit-testing during selection.
 *
 * Each component that renders selectable score content implements this interface
 * and registers with the SelectionView. The two-phase approach is:
 *   1. Coarse phase — determine which measures/tracks intersect the rect.
 *   2. Fine phase — only if the rect extends into the interior, hit-test individual elements.
 */
export interface ISelectionHitTester {
    /**
     * Returns selection entries for all elements that intersect the given rectangle.
     *
     * @param rect The selection rectangle in viewport coordinates.
     * @returns Array of selection entries describing what was hit.
     */
    hitTest(rect: DOMRect): ISelectionEntry[];
}

/** Describes what changed in a selection update. */
export interface ISelectionDelta {
    /** Entries that were added to the selection. */
    added: ISelectionEntry[];

    /** Entries that were removed from the selection. */
    removed: ISelectionEntry[];
}

/** Published by the SelectionView when the selection rectangle changes during a drag. */
export interface ISelectionRectChange {
    /** The selection rectangle in viewport coordinates. */
    rect: DOMRect;
}
