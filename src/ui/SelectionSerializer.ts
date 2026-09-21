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

/** The model object a whole-track selection addresses. */
export interface ITrackTarget {
    granularity: SelectionGranularity.Track;
    track: ISbDmTrack;
}

/**
 * The bar a measure-level selection addresses. A bar spans all tracks, so one of its measures
 * stands in for the bar.
 */
export interface IMeasureTarget {
    granularity: SelectionGranularity.Measure;
    measure: ISbDmTrackMeasure;
}

/** One track within one measure. */
export interface ITrackPieceTarget {
    granularity: SelectionGranularity.TrackPiece;
    track: ISbDmTrack;
    measure: ISbDmTrackMeasure;
}

/** A group of notes, e.g. a beamed group, a tuplet or a subdivision. */
export interface INoteGroupTarget {
    granularity: SelectionGranularity.NoteGroup;
    measure: ISbDmTrackMeasure;
    events: IMeasureEvent[];
    subdivision?: ISubdivision;
}

/** A single note event, addressed by the cell or run it was selected at. */
export interface INoteTarget {
    granularity: SelectionGranularity.Note;
    measure: ISbDmTrackMeasure;
    event: IMeasureEvent;

    /** Exact start of the addressed cell or run; a longer event spans several cells. */
    start?: IFraction;

    /**
     * Exact end (exclusive) of the addressed cell or run. A grid cell covers one cell; a staff run
     * covers the whole event, so the same event yields different content depending on the view.
     * When omitted, the addressed element is the whole event.
     */
    end?: IFraction;
}

/** The targets that address note cells of a measure: a single note or a group of notes. */
export type INoteCellTarget = INoteTarget | INoteGroupTarget;

/**
 * The model objects a selection refers to. A hit test resolves them while it matches the rendered
 * elements, so a selection holds what it selected instead of coordinates that would have to be
 * translated back into the model for every edit.
 */
export type ISelectionTarget =
    | ITrackTarget
    | IMeasureTarget
    | ITrackPieceTarget
    | INoteGroupTarget
    | INoteTarget;

/**
 * Checks whether a target addresses note cells of a measure. Only notes and note groups cover a
 * span of cells, which is what a subdivision or a note-range edit needs to resolve.
 *
 * @param target The target to inspect.
 *
 * @returns True when the target addresses note cells.
 */
export const addressesNoteCells = (target: ISelectionTarget): target is INoteCellTarget => {
    return target.granularity === SelectionGranularity.Note
        || target.granularity === SelectionGranularity.NoteGroup;
};

/** A single entry in the selection state, describing one selected element in the score. */
export interface ISelectionEntry {
    granularity: SelectionGranularity;

    /**
     * The model objects this entry refers to. A hit test resolves them while it matches the rendered
     * elements, so a selection holds what it selected instead of coordinates that would have to be
     * translated back into the model for every edit.
     */
    target: ISelectionTarget;
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
 * The coordinate form of a selection entry: what identifies the selected element in the score. A
 * selection holds model objects, which cannot be stored — the arrangement is a cyclic structure —
 * so this form is derived on demand, both for the persisted selection that is resolved again when
 * it comes back, and for consumers that only need to know where an entry sits.
 */
export interface ISerialisedSelectionEntry {
    granularity: SelectionGranularity;
    bar: number;
    trackId: number;

    /** Exact start of the addressed span within the measure (inclusive). */
    start?: IFraction;

    /** Exact end of the addressed span within the measure (exclusive). */
    end?: IFraction;
}

/**
 * The storable form of a selection: turns selection entries into plain coordinates and resolves
 * those coordinates back into the model objects of an arrangement.
 */
export class SelectionSerializer {
    /**
     * Reduces selection entries to their coordinate form, leaving out the model objects.
     *
     * @param entries The entries to store.
     *
     * @returns The coordinate copies of the entries.
     */
    public static serialise(entries: ISelectionEntry[]): ISerialisedSelectionEntry[] {
        return entries.map((entry) => {
            return SelectionSerializer.coordinatesOf(entry);
        });
    }

    /**
     * Resolves the track a selection entry belongs to. A track selection addresses the track itself;
     * every other granularity belongs to the track of the measure it addresses.
     *
     * @param entry The entry to resolve.
     *
     * @returns The track the entry belongs to.
     */
    public static trackOf(entry: ISelectionEntry): ISbDmTrack {
        const { target } = entry;

        return target.granularity === SelectionGranularity.Track ? target.track : target.measure.track;
    }

    /**
     * Resolves the bar a selection entry addresses. A track selection spans the whole score and
     * carries no bar of its own.
     *
     * @param entry The entry to resolve.
     *
     * @returns The one-based bar number, or 0 for a track selection.
     */
    public static barOf(entry: ISelectionEntry): number {
        const { target } = entry;

        return target.granularity === SelectionGranularity.Track ? 0 : target.measure.number;
    }

    /**
     * Derives the coordinate form of a selection entry from the model objects it holds. The span an
     * entry addresses is stored as fractions of its measure, so the stored form stays independent of
     * the resolution the score is displayed in.
     *
     * @param entry The entry to reduce.
     *
     * @returns The entry's coordinates.
     */
    public static coordinatesOf(entry: ISelectionEntry): ISerialisedSelectionEntry {
        const { target } = entry;

        switch (target.granularity) {
            case SelectionGranularity.Track: {
                return { granularity: target.granularity, bar: 0, trackId: target.track.id };
            }

            case SelectionGranularity.Measure: {
                return {
                    granularity: target.granularity,
                    bar: target.measure.number,
                    trackId: target.measure.track.id,
                };
            }

            case SelectionGranularity.TrackPiece: {
                return {
                    granularity: target.granularity,
                    bar: target.measure.number,
                    trackId: target.track.id,
                };
            }

            case SelectionGranularity.NoteGroup: {
                const { measure, events } = target;
                const last = events[events.length - 1];
                const end = addFractions(last.start, last.duration);

                return {
                    granularity: target.granularity,
                    bar: measure.number,
                    trackId: measure.track.id,
                    start: reduceFraction(events[0].start.numerator, events[0].start.denominator),
                    end: reduceFraction(end.numerator, end.denominator),
                };
            }

            case SelectionGranularity.Note: {
                const { measure, event } = target;
                const start = target.start ?? event.start;
                const end = target.end ?? addFractions(event.start, event.duration);

                return {
                    granularity: target.granularity,
                    bar: measure.number,
                    trackId: measure.track.id,
                    start: reduceFraction(start.numerator, start.denominator),
                    end: reduceFraction(end.numerator, end.denominator),
                };
            }
        }
    }

    /**
     * Resolves stored selection entries against the current arrangement, dropping entries whose
     * element no longer exists — a selection cannot hold something the arrangement lacks.
     *
     * @param arrangement The arrangement the entries refer to.
     * @param entries The stored entries to resolve.
     *
     * @returns The entries holding the resolved model objects.
     */
    public static deserialise(arrangement: ISbDmArrangement,
        entries: ISerialisedSelectionEntry[]): ISelectionEntry[] {
        const resolved: ISelectionEntry[] = [];
        for (const stored of entries) {
            const target = SelectionSerializer.resolveTarget(arrangement, stored);
            if (target !== undefined) {
                resolved.push({ granularity: stored.granularity, target });
            }
        }

        return resolved;
    }

    /**
     * Resolves the reference measure a bar number refers to. A measure-level selection addresses a
     * bar, which spans all tracks, so the first track that has the bar supplies the measure the
     * selection points at.
     *
     * @param arrangement The arrangement to search.
     * @param bar The one-based measure number.
     *
     * @returns The reference measure, or undefined when no track has that bar.
     */
    public static measureOfBar(arrangement: ISbDmArrangement, bar: number): ISbDmTrackMeasure | undefined {
        for (const track of arrangement.tracks) {
            const measure = track.measures.at(bar - 1);
            if (measure) {
                return measure;
            }
        }

        return undefined;
    }

    /**
     * Checks whether a target addresses a subdivision slot instead of a plain grid cell. A slot
     * occupies an exact fraction of the measure, so its start does not align to the grid cell that
     * contains it — that is how the hit tests tell the two apart.
     *
     * @param target The target to inspect.
     *
     * @returns True when the target addresses a subdivision slot.
     */
    public static addressesSubdivisionSlot(target: ISelectionTarget): boolean {
        if (target.granularity === SelectionGranularity.NoteGroup) {
            return target.subdivision !== undefined;
        }

        if (target.granularity !== SelectionGranularity.Note) {
            return false;
        }

        const start = target.start ?? target.event.start;
        const cellStart = reduceFraction(SelectionSerializer.cellOf(start, target.measure),
            target.measure.meter.stepResolution);

        return compareFractions(start, cellStart) !== 0;
    }

    /**
     * Returns the end of the span a note selection covers by default: the whole slot for a position
     * inside a subdivision slot (which may be wider than a grid cell), otherwise the addressed grid
     * cell, shortened at the end of the event.
     *
     * @param event The event the position belongs to.
     * @param start The addressed position.
     * @param measure The measure the position belongs to.
     *
     * @returns The default span end.
     */
    public static spanEnd(event: IMeasureEvent, start: IFraction, measure: ISbDmTrackMeasure): IFraction {
        const eventEnd = addFractions(event.start, event.duration);
        if (SelectionSerializer.subdivisionAt(measure, start) !== undefined) {
            return eventEnd;
        }

        const cellEnd = addFractions(start, reduceFraction(1, measure.meter.stepResolution));

        return compareFractions(cellEnd, eventEnd) < 0 ? cellEnd : eventEnd;
    }

    /**
     * Converts a position inside a measure into the grid cell that addresses it. Grid consumers —
     * the overlay, the toolbars and the grid editor — place and compare cells with this, while the
     * stored coordinates stay fractions. A position inside a subdivision slot belongs to the
     * subdivision's parent cell — the cell the rendered slot stands in for — so a slot selection
     * covers the same cell as the note it replaced.
     *
     * @param start The position as a fraction of the measure.
     * @param measure The measure supplying the step resolution.
     *
     * @returns The grid cell index.
     */
    public static cellOf(start: IFraction, measure: ISbDmTrackMeasure): number {
        const subdivision = SelectionSerializer.subdivisionAt(measure, start);
        const position = subdivision === undefined ? start : measure.events[subdivision.startIndex].start;

        return Math.floor(position.numerator * measure.meter.stepResolution / position.denominator);
    }

    /**
     * Returns the innermost subdivision that covers a position inside a measure.
     *
     * @param measure The measure to scan.
     * @param start The position as a fraction of the measure.
     *
     * @returns The covering subdivision, or undefined when the position is not subdivided.
     */
    public static subdivisionAt(measure: ISbDmTrackMeasure, start: IFraction): ISubdivision | undefined {
        let found: ISubdivision | undefined;
        let foundStart: IFraction | undefined;

        for (const subdivision of measure.subdivisions) {
            const first = measure.events.at(subdivision.startIndex);
            const last = measure.events.at(subdivision.startIndex + subdivision.actual - 1);
            if (first === undefined || last === undefined) {
                continue;
            }

            const end = addFractions(last.start, last.duration);
            const covers = compareFractions(first.start, start) <= 0 && compareFractions(start, end) < 0;
            if (covers && (foundStart === undefined || compareFractions(first.start, foundStart) > 0)) {
                found = subdivision;
                foundStart = first.start;
            }
        }

        return found;
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
                const { start } = stored;
                if (start === undefined) {
                    return undefined;
                }

                const event = SelectionSerializer.eventAt(measure, start);
                if (event === undefined) {
                    return undefined;
                }

                return {
                    granularity: SelectionGranularity.Note,
                    measure,
                    event,
                    start: { ...start },
                    end: stored.end === undefined
                        ? addFractions(event.start, event.duration)
                        : { ...stored.end },
                };
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
     * Returns the events whose start lands inside the stored span of a note group entry.
     *
     * @param measure The measure to search.
     * @param stored The stored note group entry.
     *
     * @returns The events of the group, in measure order.
     */
    private static eventsInRange(measure: ISbDmTrackMeasure, stored: ISerialisedSelectionEntry): IMeasureEvent[] {
        const { start, end } = stored;
        if (start === undefined || end === undefined) {
            return [];
        }

        return measure.events.filter((event) => {
            return compareFractions(event.start, start) >= 0 && compareFractions(event.start, end) < 0;
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
}
