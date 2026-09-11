/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure } from "../core/ScoreBookDataModel.js";
import { addFractions, compareFractions, reduceFraction } from "../core/serialisation/numeric-functions.js";
import type { IFraction, IMeasureEvent, ISubdivision } from "../core/types/general.js";

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

/**
 * The model objects a selection refers to. A hit test resolves them while it matches the rendered
 * elements, so a selection holds what it selected instead of coordinates that would have to be
 * translated back into the model for every edit.
 */
export type ISelectionTarget =
    | { granularity: SelectionGranularity.Track; track: ISbDmTrack; }
    | { granularity: SelectionGranularity.Measure; measure: ISbDmTrackMeasure; }
    | { granularity: SelectionGranularity.TrackPiece; track: ISbDmTrack; measure: ISbDmTrackMeasure; }
    | {
        granularity: SelectionGranularity.NoteGroup; measure: ISbDmTrackMeasure;
        events: IMeasureEvent[]; subdivision?: ISubdivision;
    }
    | { granularity: SelectionGranularity.Note; measure: ISbDmTrackMeasure; event: IMeasureEvent; };

/** A single entry in the selection state, describing one selected element in the score. */
export interface ISelectionEntry {
    granularity: SelectionGranularity;
    bar: number;
    trackId: number;

    /**
     * The model objects this entry refers to. Set by hit tests; it replaces the coordinates below
     * as more consumers move over.
     */
    target?: ISelectionTarget;

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
     *
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

/**
 * A selection entry in its storable form: the coordinates that identify the selected element.
 * The model objects an entry holds cannot be stored — the arrangement is a cyclic structure — so
 * they are resolved from these coordinates when the entry comes back.
 */
export interface ISerialisedSelectionEntry {
    granularity: SelectionGranularity;
    bar: number;
    trackId: number;
    startStep?: number;
    endStep?: number;
    noteId?: number;
    start?: IFraction;
}

/**
 * The storable form of a selection: turns selection entries into plain coordinates and resolves
 * those coordinates back into the model objects of an arrangement.
 */
export class SelectionSerializer {
    /**
     * Reduces selection entries to their storable form, leaving out the model objects.
     *
     * @param entries The entries to store.
     *
     * @returns The storable copies of the entries.
     */
    public static serialise(entries: ISelectionEntry[]): ISerialisedSelectionEntry[] {
        return entries.map((entry) => {
            const stored: ISerialisedSelectionEntry = {
                granularity: entry.granularity,
                bar: entry.bar,
                trackId: entry.trackId,
            };

            if (entry.startStep !== undefined) {
                stored.startStep = entry.startStep;
            }

            if (entry.endStep !== undefined) {
                stored.endStep = entry.endStep;
            }

            if (entry.noteId !== undefined) {
                stored.noteId = entry.noteId;
            }

            if (entry.start !== undefined) {
                stored.start = { ...entry.start };
            }

            return stored;
        });
    }

    /**
     * Resolves stored selection entries against the current arrangement and attaches the model objects
     * they address. An entry whose element no longer exists keeps its coordinates without a target.
     *
     * @param arrangement The arrangement the entries refer to.
     * @param entries The stored entries to resolve.
     *
     * @returns The entries with the resolved model objects.
     */
    public static deserialise(arrangement: ISbDmArrangement,
        entries: ISerialisedSelectionEntry[]): ISelectionEntry[] {
        return entries.map((stored) => {
            const entry: ISelectionEntry = { ...stored };
            const target = SelectionSerializer.resolveTarget(arrangement, stored);
            if (target !== undefined) {
                entry.target = target;
            }

            return entry;
        });
    }

    /**
     * Resolves the model objects an entry addresses.
     *
     * @param arrangement The arrangement the entry refers to.
     * @param stored The stored entry to resolve.
     *
     * @returns The resolved target, or undefined when the arrangement does not contain the element.
     */
    private static resolveTarget(arrangement: ISbDmArrangement,
        stored: ISerialisedSelectionEntry): ISelectionTarget | undefined {
        const track = arrangement.tracks.find((candidate) => {
            return candidate.id === stored.trackId;
        });
        if (!track) {
            return undefined;
        }

        // A track selection addresses the whole track and carries no measure reference.
        if (stored.granularity === SelectionGranularity.Track) {
            return { granularity: SelectionGranularity.Track, track };
        }

        if (stored.bar < 1 || stored.bar > track.measures.length) {
            return undefined;
        }

        const measure = track.measures[stored.bar - 1];

        switch (stored.granularity) {
            case SelectionGranularity.Measure: {
                return { granularity: SelectionGranularity.Measure, measure };
            }

            case SelectionGranularity.TrackPiece: {
                return { granularity: SelectionGranularity.TrackPiece, track, measure };
            }

            case SelectionGranularity.Note: {
                const start = stored.start ?? SelectionSerializer.stepFraction(stored.startStep ?? 0, measure);
                const event = SelectionSerializer.eventAt(measure, start);

                return event === undefined
                    ? undefined
                    : { granularity: SelectionGranularity.Note, measure, event };
            }

            case SelectionGranularity.NoteGroup: {
                const events = SelectionSerializer.eventsInRange(measure, stored);
                if (events.length === 0) {
                    return undefined;
                }

                const subdivision = SelectionSerializer.subdivisionOf(measure, events[0]);

                return subdivision === undefined
                    ? { granularity: SelectionGranularity.NoteGroup, measure, events }
                    : { granularity: SelectionGranularity.NoteGroup, measure, events, subdivision };
            }
        }
    }

    /**
     * Returns the event whose span covers the given position. Events tile the measure without gaps, so
     * a position inside a longer note or rest addresses that event — the cell within it is grid layout
     * and stays in the entry's step.
     *
     * @param measure The measure to search.
     * @param start The position as a fraction of the measure.
     *
     * @returns The covering event, or undefined when no event covers the position.
     */
    private static eventAt(measure: ISbDmTrackMeasure, start: IFraction): IMeasureEvent | undefined {
        return measure.events.find((event) => {
            const end = addFractions(event.start, event.duration);

            return compareFractions(event.start, start) <= 0 && compareFractions(start, end) < 0;
        });
    }

    /**
     * Returns the events whose start lands inside the step range of a note group entry.
     *
     * @param measure The measure to search.
     * @param stored The stored note group entry.
     *
     * @returns The events of the group, in measure order.
     */
    private static eventsInRange(measure: ISbDmTrackMeasure, stored: ISerialisedSelectionEntry): IMeasureEvent[] {
        const stepsPerBar = measure.meter.stepResolution;
        const startStep = stored.startStep ?? 0;
        const endStep = stored.endStep ?? startStep;

        return measure.events.filter((event) => {
            const step = SelectionSerializer.stepOf(event.start, stepsPerBar);

            return step !== undefined && step >= startStep && step <= endStep;
        });
    }

    /**
     * Returns the subdivision whose first event is the given event, if it belongs to one.
     *
     * @param measure The measure to inspect.
     * @param event The event that starts the group.
     *
     * @returns The subdivision, or undefined when the event does not start one.
     */
    private static subdivisionOf(measure: ISbDmTrackMeasure, event: IMeasureEvent): ISubdivision | undefined {
        return measure.subdivisions.find((candidate) => {
            const startEvent = measure.events[candidate.startIndex];

            return compareFractions(startEvent.start, event.start) === 0;
        });
    }

    /**
     * Converts a step index into its fraction of the measure.
     *
     * @param step The zero-based step index.
     * @param measure The measure supplying the step resolution.
     *
     * @returns The position as a reduced fraction of the measure.
     */
    private static stepFraction(step: number, measure: ISbDmTrackMeasure): IFraction {
        return reduceFraction(step, measure.meter.stepResolution);
    }

    /**
     * Converts a position inside a measure into a step index.
     *
     * @param start The position as a fraction of the measure.
     * @param stepsPerBar The measure's step resolution.
     *
     * @returns The step index, or undefined when the position does not land on a step.
     */
    private static stepOf(start: IFraction, stepsPerBar: number): number | undefined {
        const step = start.numerator * stepsPerBar / start.denominator;

        return Number.isInteger(step) ? step : undefined;
    }
}
