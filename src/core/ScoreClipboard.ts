/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { selectionToClearRanges } from "../ui/selection-ranges.js";
import {
    addressesNoteCells, SelectionGranularity, SelectionSerializer, type ISelectionEntry,
} from "../ui/SelectionSerializer.js";
import { MeasureProjection, modelEventAt, ProjectedItemKind } from "./MeasureProjection.js";
import type {
    IMeasureInsert, IMeasureReplace, ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel,
} from "./ScoreBookDataModel.js";
import {
    addFractions, compareFractions, divideFraction, multiplyFraction, subtractFractions,
} from "./serialisation/numeric-functions.js";
import { computeIsTuplet } from "./tuplets.js";
import {
    ClipboardContentKind, type IClipboardContent, type IClipboardMeasure, type IClipboardTrack,
} from "./types/clipboard.js";
import type { IFraction, IMeasureEvent, IMeterSnapshot, ISubdivision } from "./types/general.js";

/** The start of a measure as a bar fraction. */
const zero: IFraction = { numerator: 0, denominator: 1 };

/** The bar line as a bar fraction. */
const barLine: IFraction = { numerator: 1, denominator: 1 };

/** The outcome of a paste operation. */
export enum PasteResultKind {
    Success,
    NoContent,
    NoSelection,
    InstrumentMismatch,
    MeterMismatch,
    TrackCountMismatch,
    NeedsTrackCreation,
    TooComplex,
    NeedsSubdivisionMode,
}

/** The resolution modes for pasting a subdivision onto a plain selection. */
export enum SubdivisionPasteMode {
    /** The entire selection becomes the basis of a new subdivision. */
    NewBase,
    /** Tile the subdivision notes over the selection, keeping the subdivision structure. */
    Tile,
    /** Dissolve the subdivision and distribute the notes over the selected range. */
    Dissolve,
}

/** How a paste resolves a source that is longer than the target range. */
export enum PasteOverflowMode {
    /** The source is cut at the end of the target range, so the content behind it stays. */
    Truncate,
    /** The whole source is inserted and the following notes move right, flowing into later measures. */
    Shift,
}

/** Describes the result of a paste attempt so the caller can react or inform the user. */
export interface IPasteResult {
    kind: PasteResultKind;

    /**
     * Instrument type ids that need a track to be created (only set for
     * {@link PasteResultKind.NeedsTrackCreation}).
     */
    missingInstrumentTypeIds?: string[];

    /**
     * Set when the paste switched between plain and subdivided notes (it introduced subdivisions
     * into the target), which invalidates the current selection. Only set on success.
     */
    selectionInvalidated?: boolean;
}

/** Optional resolutions for a paste. */
export interface IPasteOptions {
    /** Whether a missing track may be created for a track paste. */
    createTrack?: boolean;

    /** The resolution for pasting a subdivision onto a plain selection. */
    subdivisionMode?: SubdivisionPasteMode;

    /** How to resolve a source that is longer than the target range. */
    overflowMode?: PasteOverflowMode;

    /**
     * Whether every entry of the selection marks a single note (a click) instead of a range. The
     * caller knows how its selection was made, so it answers this instead of the clipboard deriving
     * it from the addresses. A single note anchors the source at its position and keeps its length.
     */
    singleNote?: boolean;
}

/** The resolutions a range paste works with. */
interface IRangePasteOptions {
    subdivisionMode?: SubdivisionPasteMode;
    overflowMode: PasteOverflowMode;
    singleNote: boolean;
}

/** A resolved measure-mode target: a track and the bars to fill. */
interface IMeasureTarget {
    track: ISbDmTrack;
    bars: number[];
}

/** A resolved paste target: one contiguous range within a measure of one track. */
interface IPasteRange {
    track: ISbDmTrack;
    bar: number;

    /** Exact start of the range (inclusive). */
    start: IFraction;

    /** Exact end of the range (exclusive). */
    end: IFraction;
}

/** The result of building range changes for one source/target track pair. */
interface IRangePasteBuild {
    kind: PasteResultKind;
    replacements: IMeasureReplace[];
}

/** A source track paired with the target track it was matched to, if any. */
interface ISourceTrackMatch {
    sourceTrack: IClipboardTrack;
    targetTrack?: ISbDmTrack;
}

/** The outcome of matching source tracks to target tracks for a multi-track paste. */
interface ISourceTrackMatchResult {
    kind: PasteResultKind;
    matches: ISourceTrackMatch[];
}

/** A fraction range with an inclusive start and an exclusive end. */
interface IFractionRange {
    start: IFraction;
    end: IFraction;
}

/** The events captured for a selection range plus the range they cover. */
interface ICapturedRange {
    events: IMeasureEvent[];
    range: IFractionRange;
}

/** A top-level subdivision span within a measure. */
interface ISubdivisionSpan extends IFractionRange {
    isTuplet: boolean;
}

/** The subdivision content classification of a copied or targeted fraction range. */
enum RangeContentKind {
    Plain,
    Subdivision,
    Mixed,
}

/**
 * The application-wide score clipboard. It holds a self-contained snapshot of the copied content,
 * so the buffer survives score load operations and can be pasted into a different score.
 *
 * Copying never mutates the data model. Cutting copies and then clears the source in a single undo
 * step. Pasting replaces the target, tiling the source across the target range; the final repetition
 * is truncated when it does not fit, unless the caller asks for a shift instead.
 */
export class ScoreClipboard {
    private content?: IClipboardContent;

    public constructor(private readonly dataModel: ScoreBookDataModel) {
    }

    public get isEmpty(): boolean {
        return this.content === undefined;
    }

    public get kind(): ClipboardContentKind | undefined {
        return this.content?.kind;
    }

    /**
     * Copies the given selection into the clipboard without mutating the data model.
     *
     * @param entries The selection entries to copy.
     *
     * @returns True when content was copied.
     */
    public copy(entries: ISelectionEntry[]): boolean {
        const content = this.buildContent(entries);
        if (!content) {
            return false;
        }

        this.content = content;

        return true;
    }

    /**
     * Copies the given selection and then clears the source content in a single undo step.
     *
     * @param entries The selection entries to cut.
     *
     * @returns True when content was cut.
     */
    public cut(entries: ISelectionEntry[]): boolean {
        if (!this.copy(entries)) {
            return false;
        }

        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return false;
        }

        return this.dataModel.clearRanges(selectionToClearRanges(entries));
    }

    /**
     * Pastes the clipboard content into the given selection, replacing the target.
     *
     * @param entries The selection entries describing the paste target.
     * @param options Optional resolutions for missing tracks, subdivisions and overflow.
     *
     * @returns The outcome of the operation.
     */
    public paste(entries: ISelectionEntry[], options?: IPasteOptions): IPasteResult {
        const { createTrack = false, subdivisionMode, overflowMode = PasteOverflowMode.Truncate,
            singleNote = false } = options ?? {};
        const content = this.content;
        if (!content) {
            return { kind: PasteResultKind.NoContent };
        }

        if (entries.length === 0) {
            return { kind: PasteResultKind.NoSelection };
        }

        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return { kind: PasteResultKind.NoSelection };
        }

        switch (content.kind) {
            case ClipboardContentKind.Track: {
                return this.pasteTrack(content, entries, arrangement, createTrack);
            }

            case ClipboardContentKind.Measure: {
                return this.pasteMeasure(content, entries, arrangement);
            }

            case ClipboardContentKind.TrackPiece: {
                return this.pasteTrackPiece(content, entries, arrangement);
            }

            case ClipboardContentKind.EventRange: {
                return this.pasteRanges(content, entries, arrangement,
                    { subdivisionMode, overflowMode, singleNote });
            }
        }
    }

    private buildContent(entries: ISelectionEntry[]): IClipboardContent | undefined {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement || entries.length === 0) {
            return undefined;
        }

        const granularity = this.finestGranularity(entries);
        switch (granularity) {
            case SelectionGranularity.Track: {
                return this.buildTrackContent(entries);
            }

            case SelectionGranularity.Measure: {
                return this.buildMeasureContent(entries, arrangement);
            }

            case SelectionGranularity.TrackPiece: {
                return this.buildTrackPieceContent(entries);
            }

            case SelectionGranularity.NoteGroup:
            case SelectionGranularity.Note: {
                return this.buildEventRangeContent(entries, arrangement);
            }
        }
    }

    private buildTrackContent(entries: ISelectionEntry[]): IClipboardContent | undefined {
        const tracks: IClipboardTrack[] = [];

        for (const entry of entries) {
            if (entry.granularity !== SelectionGranularity.Track) {
                continue;
            }

            const track = SelectionSerializer.trackOf(entry);

            tracks.push({
                instrumentTypeId: track.instrument.typeId,
                measures: track.measures.map((measure) => {
                    return this.captureMeasure(measure);
                }),
            });
        }

        return tracks.length > 0 ? { kind: ClipboardContentKind.Track, tracks } : undefined;
    }

    private buildMeasureContent(entries: ISelectionEntry[],
        arrangement: ISbDmArrangement): IClipboardContent | undefined {
        const bars = this.sortedUniqueBars(entries);
        if (bars.length === 0 || arrangement.tracks.length === 0) {
            return undefined;
        }

        const tracks = arrangement.tracks.map((track) => {
            return {
                instrumentTypeId: track.instrument.typeId,
                measures: this.captureMeasures(track, bars),
            };
        });

        return { kind: ClipboardContentKind.Measure, tracks };
    }

    private buildTrackPieceContent(entries: ISelectionEntry[]): IClipboardContent | undefined {
        const barsByTrack = new Map<ISbDmTrack, number[]>();
        for (const entry of entries) {
            const { target } = entry;
            if (target.granularity !== SelectionGranularity.TrackPiece) {
                continue;
            }

            const bars = barsByTrack.get(target.track) ?? [];
            bars.push(target.measure.number);
            barsByTrack.set(target.track, bars);
        }

        const tracks: IClipboardTrack[] = [];
        for (const [track, bars] of barsByTrack) {
            const measures = this.captureMeasures(track, this.uniqueSorted(bars));
            if (measures.length > 0) {
                tracks.push({ instrumentTypeId: track.instrument.typeId, measures });
            }
        }

        return tracks.length > 0 ? { kind: ClipboardContentKind.TrackPiece, tracks } : undefined;
    }

    private buildEventRangeContent(entries: ISelectionEntry[],
        arrangement: ISbDmArrangement): IClipboardContent | undefined {
        const tracks: IClipboardTrack[] = [];

        for (const track of arrangement.tracks) {
            const trackEntries = entries.filter((entry) => {
                return SelectionSerializer.trackOf(entry).id === track.id;
            });
            if (trackEntries.length === 0) {
                continue;
            }

            const measures = this.captureRangeMeasures(track, trackEntries);
            if (measures.length > 0) {
                tracks.push({ instrumentTypeId: track.instrument.typeId, measures });
            }
        }

        return tracks.length > 0 ? { kind: ClipboardContentKind.EventRange, tracks } : undefined;
    }

    private captureRangeMeasures(track: ISbDmTrack, entries: ISelectionEntry[]): IClipboardMeasure[] {
        const measures: IClipboardMeasure[] = [];

        for (const bar of this.sortedUniqueBars(entries)) {
            const measure = track.measures.at(bar - 1);
            if (!measure) {
                continue;
            }

            const barEntries = entries.filter((entry) => {
                return SelectionSerializer.barOf(entry) === bar;
            });

            const captured = this.captureSelectionRange(measure, barEntries);
            if (!captured) {
                continue;
            }

            const content = this.captureSubdivisionContent(measure, captured.range.start, captured.range.end,
                captured.events.length);
            measures.push({
                meter: this.copyMeter(measure.meter),
                events: captured.events,
                subdivisions: content.subdivisions,
                mixed: content.mixed,
            });
        }

        return measures;
    }

    /**
     * Captures the model events of one measure for the given selection entries. A selection that
     * addresses a single note is captured as that event, so copy matches cut: the note keeps its
     * full duration. Every other selection is captured segment by segment, the segments being the
     * ranges the selection entries address — the grid reports one entry per cell, the staff one per
     * run — so a note's start cell counts as a single cell instead of dragging the note's absorbed
     * rests into the clipboard.
     *
     * @param measure The source measure.
     * @param entries The selection entries of this measure.
     *
     * @returns The captured events (relative to the range start) with the range they cover, or
     *          undefined when the entries carry no address or no content.
     */
    private captureSelectionRange(measure: ISbDmTrackMeasure,
        entries: ISelectionEntry[]): ICapturedRange | undefined {
        const singleNote = entries.length === 1 && entries[0].target.granularity === SelectionGranularity.Note
            ? entries[0].target
            : undefined;

        if (singleNote !== undefined) {
            const start = { ...singleNote.event.start };
            const end = addFractions(singleNote.event.start, singleNote.event.duration);
            const events = this.captureEventRange(measure.events, start, end);

            return events.length > 0 ? { events, range: { start, end } } : undefined;
        }

        const ranges: IFractionRange[] = [];

        for (const entry of entries) {
            const range = this.entryRange(measure, entry);
            if (range) {
                ranges.push(range);
            }
        }

        if (ranges.length === 0) {
            return undefined;
        }

        const range = ranges.reduce((union, current) => {
            return {
                start: compareFractions(current.start, union.start) < 0 ? current.start : union.start,
                end: compareFractions(current.end, union.end) > 0 ? current.end : union.end,
            };
        });

        const events = this.captureSegments(measure, range.start, this.segmentBounds(ranges, range.end));

        return events.length > 0 ? { events, range } : undefined;
    }

    /**
     * Collects the boundaries that segment the captured range: the start and end of every entry
     * range, sorted, deduplicated and closed by the range end.
     *
     * @param ranges The entry ranges of one measure.
     * @param rangeEnd The end of the captured range.
     *
     * @returns The segment boundaries, each one closing the previous segment.
     */
    private segmentBounds(ranges: IFractionRange[], rangeEnd: IFraction): IFraction[] {
        const bounds: IFraction[] = [];

        for (const range of [...ranges, { start: rangeEnd, end: rangeEnd }]) {
            for (const bound of [range.start, range.end]) {
                if (!bounds.some((candidate) => {
                    return compareFractions(candidate, bound) === 0;
                })) {
                    bounds.push({ ...bound });
                }
            }
        }

        return bounds.sort((left, right) => {
            return compareFractions(left, right);
        });
    }

    /**
     * Resolves the fraction range one selection entry addresses. A note entry addresses the grid
     * cell or the staff run its target spans, a note group the events it groups.
     *
     * @param measure The source measure.
     * @param entry The selection entry to resolve.
     *
     * @returns The addressed fraction range, or undefined when the entry carries no address.
     */
    private entryRange(measure: ISbDmTrackMeasure, entry: ISelectionEntry): IFractionRange | undefined {
        const target = entry.target;
        if (target.granularity === SelectionGranularity.Note) {
            const start = target.start ?? target.event.start;
            const end = target.end ?? addFractions(target.event.start, target.event.duration);

            return { start: { ...start }, end: { ...end } };
        }

        if (target.granularity === SelectionGranularity.NoteGroup && target.events.length > 0) {
            const lastEvent = target.events[target.events.length - 1];

            return {
                start: { ...target.events[0].start },
                end: addFractions(lastEvent.start, lastEvent.duration),
            };
        }

        return undefined;
    }

    /**
     * Captures the events covered by the segments of the captured range. A note that begins at the
     * cursor is captured whole — a copied note keeps its duration, and the following segments inside
     * the note stay empty — while a rest or an event that began earlier fills the segment as
     * silence, so rests never drag their span into the clipboard.
     *
     * @param measure The measure to capture from.
     * @param rangeStart The start of the captured range (inclusive).
     * @param bounds The segment boundaries: the first one opens the range, each further one closes a
     *               segment.
     *
     * @returns The captured events, relative to the range start.
     */
    private captureSegments(measure: ISbDmTrackMeasure, rangeStart: IFraction,
        bounds: IFraction[]): IMeasureEvent[] {
        const captured: IMeasureEvent[] = [];
        let cursor = { ...rangeStart };

        for (let index = 1; index < bounds.length; index++) {
            const segmentEnd = bounds[index];

            while (compareFractions(cursor, segmentEnd) < 0) {
                const starting = this.eventStartingAt(measure, cursor);
                if (starting?.noteStyleId !== undefined) {
                    captured.push({
                        start: subtractFractions(cursor, rangeStart),
                        duration: { ...starting.duration },
                        noteStyleId: starting.noteStyleId,
                        articulation: starting.articulation ? { ...starting.articulation } : undefined,
                    });
                    cursor = addFractions(starting.start, starting.duration);

                    continue;
                }

                const covering = starting ?? modelEventAt(measure, cursor);
                const coveringEnd = covering === undefined
                    ? segmentEnd
                    : addFractions(covering.start, covering.duration);
                const end = compareFractions(coveringEnd, segmentEnd) > 0 ? segmentEnd : coveringEnd;
                if (compareFractions(end, cursor) <= 0) {
                    cursor = segmentEnd;

                    continue;
                }

                captured.push({
                    start: subtractFractions(cursor, rangeStart),
                    duration: subtractFractions(end, cursor),
                });
                cursor = end;
            }
        }

        return captured;
    }

    /**
     * Returns the measure event that begins exactly at the given position.
     *
     * @param measure The measure to search.
     * @param start The exact position to look up.
     *
     * @returns The event starting there, or undefined when no event begins at the position.
     */
    private eventStartingAt(measure: ISbDmTrackMeasure, start: IFraction): IMeasureEvent | undefined {
        return measure.events.find((event) => {
            return compareFractions(event.start, start) === 0;
        });
    }

    /**
     * Captures the events that overlap the given range, clipped to it and positioned relative to its
     * start. The events must tile the range without gaps, so the captured events stay contiguous.
     *
     * @param events The events to capture from, in display order.
     * @param rangeStart The range start (inclusive).
     * @param rangeEnd The range end (exclusive).
     *
     * @returns The captured events, relative to the range start.
     */
    private captureEventRange(events: IMeasureEvent[], rangeStart: IFraction,
        rangeEnd: IFraction): IMeasureEvent[] {
        const captured: IMeasureEvent[] = [];

        for (const event of events) {
            const eventEnd = addFractions(event.start, event.duration);
            if (compareFractions(eventEnd, rangeStart) <= 0 || compareFractions(event.start, rangeEnd) >= 0) {
                continue;
            }

            const clippedStart = compareFractions(event.start, rangeStart) < 0 ? rangeStart : event.start;
            const clippedEnd = compareFractions(eventEnd, rangeEnd) > 0 ? rangeEnd : eventEnd;

            captured.push({
                start: subtractFractions(clippedStart, rangeStart),
                duration: subtractFractions(clippedEnd, clippedStart),
                noteStyleId: event.noteStyleId,
                articulation: event.articulation ? { ...event.articulation } : undefined,
            });
        }

        return captured;
    }

    /**
     * Determines the subdivision bookkeeping for a copied event range. Returns the scaled
     * subdivision for a pure subdivision selection, an empty list for plain content, or the mixed
     * flag when the range mixes subdivided and non-subdivided events (which paste rejects).
     *
     * @param measure The source measure.
     * @param rangeStart The copied range start (inclusive).
     * @param rangeEnd The copied range end (exclusive).
     * @param eventCount The number of captured events.
     *
     * @returns The subdivisions and mixed flag for the copied measure.
     */
    private captureSubdivisionContent(measure: ISbDmTrackMeasure, rangeStart: IFraction, rangeEnd: IFraction,
        eventCount: number): { subdivisions: ISubdivision[]; mixed?: boolean; } {
        const kind = this.classifyRange(measure, rangeStart, rangeEnd);

        if (kind !== RangeContentKind.Subdivision) {
            return kind === RangeContentKind.Mixed
                ? { subdivisions: [], mixed: true }
                : { subdivisions: [] };
        }

        const overlapping = this.topLevelSubdivisionSpans(measure).find((span) => {
            return compareFractions(span.start, rangeEnd) < 0 && compareFractions(span.end, rangeStart) > 0;
        });

        // Scale the single subdivision to the selected slots: normal becomes the selected span in
        // steps, actual becomes the number of captured slots.
        const span = subtractFractions(rangeEnd, rangeStart);
        const stepsPerBar = measure.meter.stepResolution;
        const normal = Math.round((span.numerator * stepsPerBar) / span.denominator);

        return {
            subdivisions: [{
                startIndex: 0,
                actual: eventCount,
                normal,
                isTuplet: overlapping?.isTuplet ?? false,
            }],
        };
    }

    /**
     * Classifies a fraction range of a measure by its subdivision content: plain when it contains
     * no subdivision slots, subdivision when it contains only subdivision slots, and mixed when it
     * contains both. Mixed ranges cannot be pasted unambiguously.
     *
     * @param measure The measure to inspect.
     * @param rangeStart The range start (inclusive).
     * @param rangeEnd The range end (exclusive).
     *
     * @returns The content classification.
     */
    private classifyRange(measure: ISbDmTrackMeasure, rangeStart: IFraction, rangeEnd: IFraction): RangeContentKind {
        const spans = this.topLevelSubdivisionSpans(measure);
        if (spans.length === 0) {
            return RangeContentKind.Plain;
        }

        const overlaps = spans.some((span) => {
            return compareFractions(span.start, rangeEnd) < 0 && compareFractions(span.end, rangeStart) > 0;
        });

        const hasPlainEvents = measure.events.some((event) => {
            if (compareFractions(addFractions(event.start, event.duration), rangeStart) <= 0
                || compareFractions(event.start, rangeEnd) >= 0) {
                return false;
            }

            return !spans.some((span) => {
                return compareFractions(event.start, span.start) >= 0
                    && compareFractions(event.start, span.end) < 0;
            });
        });

        if (overlaps && hasPlainEvents) {
            return RangeContentKind.Mixed;
        }

        return overlaps ? RangeContentKind.Subdivision : RangeContentKind.Plain;
    }

    /**
     * Computes the top-level subdivision spans of a measure, in display order. Nested subdivisions
     * are absorbed into their parent's span, so every span describes a contiguous top-level group.
     *
     * @param measure The measure to inspect.
     *
     * @returns The top-level subdivision spans.
     */
    private topLevelSubdivisionSpans(measure: ISbDmTrackMeasure): ISubdivisionSpan[] {
        const projected = MeasureProjection.project(measure);
        const spans: ISubdivisionSpan[] = [];

        for (const item of projected) {
            if (item.kind === ProjectedItemKind.Subdivision) {
                spans.push({
                    start: { ...item.start },
                    end: addFractions(item.start, item.span),
                    isTuplet: item.isTuplet,
                });
            }
        }

        return spans;
    }

    private pasteTrack(content: IClipboardContent, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, createTrack: boolean): IPasteResult {
        const source = content.tracks[0];

        const trackEntry = entries.find((entry) => {
            return entry.granularity === SelectionGranularity.Track;
        });
        let targetTrack: ISbDmTrack | undefined;

        if (trackEntry) {
            const entryTrack = SelectionSerializer.trackOf(trackEntry);
            targetTrack = arrangement.tracks.find((candidate) => {
                return candidate.id === entryTrack.id;
            });
            if (targetTrack && targetTrack.instrument.typeId !== source.instrumentTypeId) {
                return { kind: PasteResultKind.InstrumentMismatch };
            }
        } else {
            targetTrack = this.findTrackByInstrument(arrangement, source.instrumentTypeId);
        }

        if (!targetTrack) {
            if (!createTrack) {
                return {
                    kind: PasteResultKind.NeedsTrackCreation,
                    missingInstrumentTypeIds: [source.instrumentTypeId],
                };
            }

            const instrument = this.dataModel.instruments.find((candidate) => {
                return candidate.typeId === source.instrumentTypeId;
            });
            if (!instrument) {
                return { kind: PasteResultKind.InstrumentMismatch };
            }

            targetTrack = arrangement.addTrack(instrument);
        }

        return this.applyMeasurePaste([{ track: targetTrack, bars: this.allBars(arrangement) }], content);
    }

    private pasteMeasure(content: IClipboardContent, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement): IPasteResult {
        const bars = this.sortedUniqueBars(entries);
        if (bars.length === 0) {
            return { kind: PasteResultKind.NoSelection };
        }

        if (arrangement.tracks.length !== content.tracks.length) {
            return { kind: PasteResultKind.TrackCountMismatch };
        }

        for (let index = 0; index < arrangement.tracks.length; index++) {
            if (arrangement.tracks[index].instrument.typeId !== content.tracks[index].instrumentTypeId) {
                return { kind: PasteResultKind.InstrumentMismatch };
            }
        }

        const targets = arrangement.tracks.map((track) => {
            return { track, bars };
        });

        return this.applyMeasurePaste(targets, content);
    }

    private pasteTrackPiece(content: IClipboardContent, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement): IPasteResult {
        const source = content.tracks[0];
        const granularity = this.finestGranularity(entries);

        if (granularity === SelectionGranularity.Measure) {
            return { kind: PasteResultKind.TrackCountMismatch };
        }

        const trackIds = new Set(entries.map((entry) => {
            return SelectionSerializer.trackOf(entry).id;
        }));

        if (trackIds.size > 1) {
            return { kind: PasteResultKind.TrackCountMismatch };
        }

        const entryTrack = SelectionSerializer.trackOf(entries[0]);
        const track = arrangement.tracks.find((candidate) => {
            return candidate.id === entryTrack.id;
        });

        if (!track) {
            return { kind: PasteResultKind.NoSelection };
        }

        if (track.instrument.typeId !== source.instrumentTypeId) {
            return { kind: PasteResultKind.InstrumentMismatch };
        }

        const bars = granularity === SelectionGranularity.Track
            ? this.allBars(arrangement)
            : this.sortedUniqueBars(entries);

        return this.applyMeasurePaste([{ track, bars }], content);
    }

    private pasteRanges(content: IClipboardContent, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, options: IRangePasteOptions): IPasteResult {
        const granularity = this.finestGranularity(entries);

        if (granularity === SelectionGranularity.Measure) {
            return { kind: PasteResultKind.TrackCountMismatch };
        }

        // A range that mixes subdivided and non-subdivided events cannot be pasted unambiguously.
        if (content.tracks.some((track) => {
            return track.measures.some((measure) => {
                return measure.mixed === true;
            });
        })) {
            return { kind: PasteResultKind.TooComplex };
        }

        const subdivisionTracks = content.tracks.filter((track) => {
            return track.measures.some((measure) => {
                return measure.subdivisions.length > 0;
            });
        });

        // Pasting subdivisions from more than one source track is too complex to match reliably.
        if (subdivisionTracks.length > 1) {
            return { kind: PasteResultKind.TooComplex };
        }

        if (content.tracks.length === 1) {
            return this.pasteSingleTrackRanges(content.tracks[0], entries, arrangement, granularity, options);
        }

        return this.pasteMultiTrackRanges(content.tracks, entries, arrangement, granularity, options);
    }

    private pasteSingleTrackRanges(sourceTrack: IClipboardTrack, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, granularity: SelectionGranularity,
        options: IRangePasteOptions): IPasteResult {
        const trackIds = new Set(entries.map((entry) => {
            return SelectionSerializer.trackOf(entry).id;
        }));

        const replacements: IMeasureReplace[] = [];
        const insertions: IMeasureInsert[] = [];

        for (const trackId of trackIds) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === trackId;
            });

            if (!track) {
                continue;
            }

            if (track.instrument.typeId !== sourceTrack.instrumentTypeId) {
                return { kind: PasteResultKind.InstrumentMismatch };
            }

            const trackEntries = entries.filter((entry) => {
                return SelectionSerializer.trackOf(entry) === track;
            });

            if (options.overflowMode === PasteOverflowMode.Shift) {
                const shifted = this.buildShiftInsertions(trackEntries, sourceTrack);
                if (shifted !== undefined) {
                    insertions.push(...shifted);

                    continue;
                }
            }

            const slots = this.sortPasteRanges(
                this.resolvePasteRanges(granularity, trackEntries, track),
            );
            if (slots.length === 0) {
                continue;
            }

            const hasSubdivision = sourceTrack.measures.some((measure) => {
                return measure.subdivisions.length > 0;
            });

            let build: IRangePasteBuild;
            if (hasSubdivision && this.isTargetSubdivision(track, slots)) {
                build = this.buildSubdivisionIntoTarget(sourceTrack, track, slots, options);
            } else if (this.isTargetSubdivision(track, slots)) {
                build = this.buildPlainIntoTargetSubdivision(sourceTrack, track, slots);
            } else if (hasSubdivision) {
                build = this.buildSubdivisionReplacements(sourceTrack, track, slots, options);
            } else {
                build = this.buildRangeReplacements(sourceTrack, track, slots, options);
            }

            if (build.kind !== PasteResultKind.Success) {
                return { kind: build.kind };
            }

            replacements.push(...build.replacements);
        }

        if (replacements.length === 0 && insertions.length === 0) {
            return { kind: PasteResultKind.NoSelection };
        }

        return this.applyRangeChanges(replacements, insertions);
    }

    private pasteMultiTrackRanges(sourceTracks: IClipboardTrack[], entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, granularity: SelectionGranularity,
        options: IRangePasteOptions): IPasteResult {
        const anchorEntry = this.firstSelectionEntry(entries);
        if (anchorEntry === undefined) {
            return { kind: PasteResultKind.NoSelection };
        }

        const anchorTrack = SelectionSerializer.trackOf(anchorEntry);

        const matchResult = this.isBlockPaste(entries)
            ? this.matchSourceTracks(sourceTracks, arrangement.tracks, anchorTrack)
            : this.matchSourceTracksToSelection(sourceTracks, arrangement.tracks, this.selectedTrackIds(entries));

        if (matchResult.kind !== PasteResultKind.Success) {
            return { kind: matchResult.kind };
        }

        const replacements: IMeasureReplace[] = [];
        const insertions: IMeasureInsert[] = [];
        let matchedAny = false;

        for (const match of matchResult.matches) {
            const targetTrack = match.targetTrack;
            if (!targetTrack) {
                continue;
            }

            matchedAny = true;

            const trackEntries = entries.filter((entry) => {
                return SelectionSerializer.trackOf(entry) === targetTrack;
            });

            if (options.overflowMode === PasteOverflowMode.Shift && trackEntries.length > 0) {
                const shifted = this.buildShiftInsertions(trackEntries, match.sourceTrack);
                if (shifted !== undefined) {
                    insertions.push(...shifted);

                    continue;
                }
            }

            const slots = trackEntries.length > 0
                ? this.resolvePasteRanges(granularity, trackEntries, targetTrack)
                : this.anchorRanges(targetTrack, anchorEntry);

            const build = this.buildRangeReplacements(match.sourceTrack, targetTrack,
                this.sortPasteRanges(slots), options);
            if (build.kind !== PasteResultKind.Success) {
                return { kind: build.kind };
            }

            replacements.push(...build.replacements);
        }

        if (!matchedAny) {
            return { kind: PasteResultKind.InstrumentMismatch };
        }

        return this.applyRangeChanges(replacements, insertions);
    }

    /**
     * Builds replacements for pasting a single-measure subdivision source. The target span decides
     * the case: a cursor or matching range inserts the subdivision at its proportional width, a
     * smaller range becomes the basis of a new subdivision, and a larger range needs a user
     * decision ({@link PasteResultKind.NeedsSubdivisionMode}).
     *
     * @param sourceTrack The copied subdivision source (single measure).
     * @param targetTrack The target track.
     * @param slots The resolved target ranges.
     * @param options The resolutions of this paste.
     * @param normalOverride The number of parent slots a nested subdivision replaces; when omitted
     *                       the span is measured in grid steps (plain target).
     *
     * @returns The build result.
     */
    private buildSubdivisionReplacements(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IPasteRange[], options: IRangePasteOptions,
        normalOverride?: number): IRangePasteBuild {
        const sourceMeasure = sourceTrack.measures[0];
        const sourceSubdivision = sourceMeasure.subdivisions.at(0);

        if (sourceTrack.measures.length !== 1 || sourceSubdivision === undefined) {
            return { kind: PasteResultKind.TooComplex, replacements: [] };
        }

        const zero: IFraction = { numerator: 0, denominator: 1 };
        const sourceSpan = sourceMeasure.events.reduce((sum, event) => {
            return addFractions(sum, event.duration);
        }, { ...zero });

        if (sourceSpan.numerator <= 0) {
            return { kind: PasteResultKind.Success, replacements: [] };
        }

        const firstSlot = slots[0];
        const measure = targetTrack.measures.at(firstSlot.bar - 1);
        if (!measure) {
            return { kind: PasteResultKind.NoSelection, replacements: [] };
        }

        if (!this.meterMatches(sourceMeasure.meter, measure.meter)) {
            return { kind: PasteResultKind.MeterMismatch, replacements: [] };
        }

        const stepsPerBar = measure.meter.stepResolution;
        const isCursor = options.singleNote && slots.length === 1;

        let targetStart: IFraction;
        let targetSpan: IFraction;

        if (isCursor) {
            targetStart = firstSlot.start;
            const remaining = subtractFractions({ numerator: 1, denominator: 1 }, targetStart);
            targetSpan = compareFractions(sourceSpan, remaining) < 0 ? sourceSpan : remaining;
        } else {
            const lastSlot = slots[slots.length - 1];
            targetStart = firstSlot.start;
            const lastEnd = lastSlot.end;
            targetSpan = subtractFractions(lastEnd, targetStart);
        }

        const targetEnd = addFractions(targetStart, targetSpan);
        const spanSteps = normalOverride ?? this.fractionSteps(targetSpan, stepsPerBar);
        const spanMatches = compareFractions(targetSpan, sourceSpan) === 0;

        if (this.classifyRange(measure, targetStart, targetEnd) === RangeContentKind.Mixed) {
            return { kind: PasteResultKind.TooComplex, replacements: [] };
        }

        // Case 1 (cursor) and Case 3 (matching selection): insert the subdivision as-is.
        if (isCursor || spanMatches) {
            let events = sourceMeasure.events.map((event) => {
                return this.cloneEvent(event);
            });
            let subdivision = { ...sourceSubdivision };

            // A cursor near the measure end truncates the subdivision to the available span.
            if (compareFractions(targetSpan, sourceSpan) < 0) {
                const clipped: IMeasureEvent[] = [];
                for (const event of events) {
                    const placed = this.clipEvent(event, zero, targetSpan);
                    if (placed.duration.numerator > 0) {
                        clipped.push(placed);
                    }
                }

                events = clipped;
                subdivision = {
                    ...subdivision,
                    actual: clipped.length,
                    normal: this.fractionSteps(targetSpan, stepsPerBar),
                };
            }

            return {
                kind: PasteResultKind.Success,
                replacements: [{
                    trackId: targetTrack.id,
                    bar: firstSlot.bar,
                    events,
                    start: targetStart,
                    end: targetEnd,
                    subdivisions: [subdivision],
                }],
            };
        }

        // A chosen mode takes precedence and applies to any selection that neither matches the
        // source nor is a plain cursor.
        if (options.subdivisionMode !== undefined) {
            const replacements: IMeasureReplace[] = [];
            const base: Omit<IMeasureReplace, "events" | "subdivisions"> = {
                trackId: targetTrack.id,
                bar: firstSlot.bar,
                start: targetStart,
                end: targetEnd,
            };

            switch (options.subdivisionMode) {
                case SubdivisionPasteMode.NewBase: {
                    const subdivision = this.newSubdivision(sourceSubdivision.actual, spanSteps, measure.meter);
                    replacements.push({
                        ...base,
                        events: this.layoutSubdivisionNotes(sourceMeasure.events, targetSpan),
                        subdivisions: [subdivision],
                    });

                    break;
                }

                case SubdivisionPasteMode.Dissolve: {
                    replacements.push({
                        ...base,
                        events: this.layoutSubdivisionNotes(sourceMeasure.events, targetSpan),
                    });

                    break;
                }

                case SubdivisionPasteMode.Tile: {
                    const events = this.tileSourceEvents(sourceMeasure.events, sourceSpan, targetSpan);
                    const subdivision = this.newSubdivision(events.length, spanSteps, measure.meter);
                    replacements.push({ ...base, events, subdivisions: [subdivision] });

                    break;
                }
            }

            return { kind: PasteResultKind.Success, replacements };
        }

        // Case 4: a smaller selection (several segments) becomes the basis of a new subdivision.
        if (compareFractions(targetSpan, sourceSpan) < 0 && spanSteps > 1) {
            const subdivision = this.newSubdivision(sourceSubdivision.actual, spanSteps, measure.meter);

            return {
                kind: PasteResultKind.Success,
                replacements: [{
                    trackId: targetTrack.id,
                    bar: firstSlot.bar,
                    events: this.layoutSubdivisionNotes(sourceMeasure.events, targetSpan),
                    start: targetStart,
                    end: targetEnd,
                    subdivisions: [subdivision],
                }],
            };
        }

        // Case 2: a larger plain selection needs a user decision.
        return { kind: PasteResultKind.NeedsSubdivisionMode, replacements: [] };
    }

    /**
     * Builds replacements for pasting a subdivision source into a subdivision target. This behaves
     * like pasting plain notes into a plain range: the source notes tile across the selected ranges
     * and the target subdivision stays intact. Selecting fewer ranges than the source holds is an
     * attempt to embed a subdivision, which needs a user decision.
     *
     * @param sourceTrack The copied subdivision source.
     * @param targetTrack The target track holding the subdivision.
     * @param slots The resolved target ranges.
     * @param options The resolutions of this paste.
     *
     * @returns The build result.
     */
    private buildSubdivisionIntoTarget(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IPasteRange[], options: IRangePasteOptions): IRangePasteBuild {
        const sourceNoteCount = sourceTrack.measures[0].events.length;
        const isCursor = options.singleNote && slots.length === 1;

        if (!isCursor && slots.length < sourceNoteCount) {
            if (options.subdivisionMode === undefined) {
                return { kind: PasteResultKind.NeedsSubdivisionMode, replacements: [] };
            }

            // The nested subdivision replaces a number of parent slots, not grid steps.
            return this.buildSubdivisionReplacements(sourceTrack, targetTrack, slots, options, slots.length);
        }

        return this.buildRangeReplacements(sourceTrack, targetTrack, slots, options);
    }

    /**
     * Creates a subdivision for the given note count and span, computing the tuplet flag from the
     * meter's natural subdivision basis.
     *
     * @param actual The number of notes in the stream.
     * @param normal The number of original steps the subdivision replaces.
     * @param meter The meter defining the natural subdivision basis.
     *
     * @returns The new subdivision.
     */
    private newSubdivision(actual: number, normal: number, meter: IMeterSnapshot): ISubdivision {
        return {
            startIndex: 0,
            actual,
            normal,
            isTuplet: computeIsTuplet(actual, normal, meter),
        };
    }

    /**
     * Lays the source note styles out as equal-width slots across the given span.
     *
     * @param sourceEvents The source events (rests keep their empty note style).
     * @param span The total span to fill.
     *
     * @returns The re-laid events, relative to the span start.
     */
    private layoutSubdivisionNotes(sourceEvents: IMeasureEvent[], span: IFraction): IMeasureEvent[] {
        const slotCount = sourceEvents.length;
        if (slotCount === 0) {
            return [];
        }

        const slotDuration = divideFraction(span, slotCount);

        return sourceEvents.map((event, index) => {
            return {
                start: multiplyFraction(slotDuration, index),
                duration: { ...slotDuration },
                noteStyleId: event.noteStyleId,
                articulation: event.articulation ? { ...event.articulation } : undefined,
            };
        });
    }

    /**
     * Tiles the source events across the given limit, repeating from the start when the source is
     * exhausted and clipping the final repetition to the limit.
     *
     * @param sourceEvents The source events, in display order.
     * @param sourceLength The total length of the source events.
     * @param limit The span to fill.
     *
     * @returns The tiled events, relative to the span start.
     */
    private tileSourceEvents(sourceEvents: IMeasureEvent[], sourceLength: IFraction,
        limit: IFraction): IMeasureEvent[] {
        const zero: IFraction = { numerator: 0, denominator: 1 };
        const tiled: IMeasureEvent[] = [];
        let filled = { ...zero };
        let sourcePosition = { ...zero };

        while (compareFractions(filled, limit) < 0) {
            const event = this.findSourceEvent(sourceEvents, sourcePosition);
            const offsetInEvent = subtractFractions(sourcePosition, event.start);
            const remainingInEvent = subtractFractions(event.duration, offsetInEvent);
            const remainingInSlot = subtractFractions(limit, filled);
            const take = compareFractions(remainingInEvent, remainingInSlot) < 0
                ? remainingInEvent
                : remainingInSlot;

            if (take.numerator > 0) {
                tiled.push({
                    start: filled,
                    duration: take,
                    noteStyleId: event.noteStyleId,
                    articulation: event.articulation ? { ...event.articulation } : undefined,
                });
                filled = addFractions(filled, take);
                sourcePosition = addFractions(sourcePosition, take);
                if (compareFractions(sourcePosition, sourceLength) >= 0) {
                    sourcePosition = subtractFractions(sourcePosition, sourceLength);
                }
            }
        }

        return tiled;
    }

    /**
     * Flattens the captured per-measure events of a source track into one contiguous stream, where
     * each measure's events start where the previous measure's events ended.
     *
     * @param sourceTrack The clipboard source track.
     *
     * @returns The flattened events and their total length.
     */
    private flattenSourceEvents(sourceTrack: IClipboardTrack): { events: IMeasureEvent[]; length: IFraction; } {
        const zero: IFraction = { numerator: 0, denominator: 1 };
        const events: IMeasureEvent[] = [];
        let cursor = { ...zero };

        for (const measure of sourceTrack.measures) {
            for (const event of measure.events) {
                events.push({ ...event, start: addFractions(cursor, event.start) });
            }

            cursor = measure.events.reduce((sum, event) => {
                return addFractions(sum, event.duration);
            }, cursor);
        }

        return { events, length: cursor };
    }

    /**
     * Builds replacements for pasting plain source notes into a subdivision target. Each target
     * slot receives one source event in order, wrapping when the source is exhausted, and the
     * target's subdivision structure is preserved.
     *
     * @param sourceTrack The plain clipboard source track.
     * @param targetTrack The target track holding the subdivision.
     * @param slots The resolved subdivision slots.
     *
     * @returns The build result.
     */
    private buildPlainIntoTargetSubdivision(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IPasteRange[]): IRangePasteBuild {
        const sourceMeter = sourceTrack.measures[0].meter;
        const measure = targetTrack.measures.at(slots[0].bar - 1);
        if (!measure) {
            return { kind: PasteResultKind.NoSelection, replacements: [] };
        }

        if (!this.meterMatches(sourceMeter, measure.meter)) {
            return { kind: PasteResultKind.MeterMismatch, replacements: [] };
        }

        const range = this.spanOf(slots);
        if (this.classifyRange(measure, range.start, range.end) === RangeContentKind.Mixed) {
            return { kind: PasteResultKind.TooComplex, replacements: [] };
        }

        const sourceEvents = this.flattenSourceEvents(sourceTrack).events;
        if (sourceEvents.length === 0) {
            return { kind: PasteResultKind.Success, replacements: [] };
        }

        const events: IMeasureEvent[] = [];
        let cursor = { ...zero };

        for (let index = 0; index < slots.length; index++) {
            const slot = slots[index];
            const width = subtractFractions(slot.end, slot.start);
            const sourceEvent = sourceEvents[index % sourceEvents.length];

            events.push({
                start: cursor,
                duration: width,
                noteStyleId: sourceEvent.noteStyleId,
                articulation: sourceEvent.articulation ? { ...sourceEvent.articulation } : undefined,
            });

            cursor = addFractions(cursor, width);
        }

        return {
            kind: PasteResultKind.Success,
            replacements: [{
                trackId: targetTrack.id,
                bar: slots[0].bar,
                events,
                start: range.start,
                end: range.end,
            }],
        };
    }

    /**
     * Aggregates the resolved paste ranges into one contiguous range.
     *
     * @param ranges The resolved ranges, in display order.
     *
     * @returns The range spanning the first start to the last end.
     */
    private spanOf(ranges: IPasteRange[]): IFractionRange {
        const first = ranges[0];
        const last = ranges[ranges.length - 1];

        return { start: first.start, end: last.end };
    }

    /**
     * Determines whether the resolved slots target a subdivision of the given track.
     *
     * @param track The target track.
     * @param slots The resolved slots.
     *
     * @returns True when the slot range overlaps a subdivision.
     */
    private isTargetSubdivision(track: ISbDmTrack, slots: IPasteRange[]): boolean {
        if (slots.length === 0) {
            return false;
        }

        const measure = track.measures.at(slots[0].bar - 1);
        if (!measure || measure.subdivisions.length === 0) {
            return false;
        }

        const range = this.spanOf(slots);

        return this.classifyRange(measure, range.start, range.end) !== RangeContentKind.Plain;
    }

    /**
     * Builds insert-with-shift requests for a staff selection: the copied events take the place of
     * the selected run and everything behind it gives way, so the copied notes keep their lengths
     * and the run behind the selection flows into the following measures.
     *
     * Returns undefined when the selection does not address measure events that the insertion can
     * work with, so the caller falls back to replacing the addressed ranges.
     *
     * @param entries The selection entries of one target track.
     * @param sourceTrack The copied source track.
     *
     * @returns The insertions, or undefined when they cannot be built from the selection.
     */
    private buildShiftInsertions(entries: ISelectionEntry[],
        sourceTrack: IClipboardTrack): IMeasureInsert[] | undefined {
        const addressed: Array<{ measure: ISbDmTrackMeasure; event: IMeasureEvent; start: IFraction; }> = [];

        for (const entry of entries) {
            const target = entry.target;
            if (target.granularity !== SelectionGranularity.Note) {
                return undefined;
            }

            addressed.push({
                measure: target.measure,
                event: target.event,
                start: target.start ?? target.event.start,
            });
        }

        if (addressed.length === 0) {
            return undefined;
        }

        const targetTrack = addressed[0].measure.track;
        if (this.trackHasSubdivisions(targetTrack) || sourceTrack.measures.some((measure) => {
            return measure.subdivisions.length > 0;
        })) {
            return undefined;
        }

        addressed.sort((left, right) => {
            if (left.measure.number !== right.measure.number) {
                return left.measure.number - right.measure.number;
            }

            return compareFractions(left.start, right.start);
        });

        const first = addressed[0];
        const last = addressed[addressed.length - 1];
        if (first.measure !== last.measure) {
            // A selection across bar lines would need the source split over the bars. Not supported yet.
            return undefined;
        }

        const { events: sourceEvents } = this.flattenSourceEvents(sourceTrack);
        const offset = subtractFractions(first.start, first.event.start);

        return [{
            measure: first.measure,
            from: first.event,
            to: last.event,
            events: sourceEvents.map((event) => {
                const placed = this.cloneEvent(event);
                placed.start = addFractions(event.start, offset);

                return placed;
            }),
        }];
    }

    /**
     * Checks whether a track contains subdivisions, which do not take part in length changes yet.
     *
     * @param track The track to inspect.
     *
     * @returns True when any measure of the track has a subdivision.
     */
    private trackHasSubdivisions(track: ISbDmTrack): boolean {
        return track.measures.some((measure) => {
            return measure.subdivisions.length > 0;
        });
    }

    private buildRangeReplacements(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IPasteRange[], options: IRangePasteOptions): IRangePasteBuild {
        const sourceMeter = sourceTrack.measures[0].meter;

        const { events: sourceEvents, length: sourceLength } = this.flattenSourceEvents(sourceTrack);

        if (sourceLength.numerator <= 0) {
            return { kind: PasteResultKind.Success, replacements: [] };
        }

        const isSingleNoteAnchor = options.singleNote && slots.length === 1;

        const replacements: IMeasureReplace[] = [];
        const groups = this.groupRangesByBar(slots);
        let sourcePosition = { ...zero };

        for (const barSlots of groups) {
            const measure = targetTrack.measures.at(barSlots[0].bar - 1);
            if (!measure) {
                continue;
            }

            if (!this.meterMatches(sourceMeter, measure.meter)) {
                return { kind: PasteResultKind.MeterMismatch, replacements: [] };
            }

            const first = barSlots[0];
            const last = barSlots[barSlots.length - 1];
            const room = subtractFractions(barLine, first.start);

            if (isSingleNoteAnchor) {
                // A single-note cursor pastes the source once, starting at the cursor. Limit the
                // replaced range to the source length (truncated at the measure end) so content
                // after the pasted notes is preserved instead of being cleared.
                const limit = compareFractions(sourceLength, room) < 0 ? sourceLength : room;
                const placed = sourceEvents.map((event) => {
                    return this.clipEvent(event, zero, limit);
                }).filter((event) => {
                    return event.duration.numerator > 0;
                });

                replacements.push({
                    trackId: targetTrack.id,
                    bar: barSlots[0].bar,
                    events: placed,
                    start: first.start,
                    end: addFractions(first.start, limit),
                });

                continue;
            }

            // A range selection lays the source out contiguously from the range start, wrapping when
            // the source is shorter. Every event keeps its full duration, so a pasted note is never
            // cut at a range boundary; the last event may therefore extend past the range end.
            const limit = subtractFractions(last.end, first.start);

            const events: IMeasureEvent[] = [];
            let filled = { ...zero };

            while (compareFractions(filled, limit) < 0) {
                const event = this.findSourceEvent(sourceEvents, sourcePosition);
                const offsetInEvent = subtractFractions(sourcePosition, event.start);
                const available = subtractFractions(event.duration, offsetInEvent);
                const roomLeft = subtractFractions(room, filled);
                const take = compareFractions(available, roomLeft) < 0 ? available : roomLeft;

                if (take.numerator <= 0) {
                    break;
                }

                events.push({
                    start: filled,
                    duration: take,
                    noteStyleId: event.noteStyleId,
                    articulation: event.articulation ? { ...event.articulation } : undefined,
                });
                filled = addFractions(filled, take);
                sourcePosition = addFractions(sourcePosition, take);
                if (compareFractions(sourcePosition, sourceLength) >= 0) {
                    sourcePosition = subtractFractions(sourcePosition, sourceLength);
                }
            }

            const contentEnd = addFractions(first.start, filled);
            const rangeEnd = compareFractions(contentEnd, last.end) > 0 ? contentEnd : last.end;

            replacements.push({
                trackId: targetTrack.id,
                bar: barSlots[0].bar,
                events,
                start: first.start,
                end: rangeEnd,
            });
        }

        return { kind: PasteResultKind.Success, replacements };
    }

    /**
     * Groups the slots of a paste target by measure, keeping their order.
     *
     * @param slots The slots to group, sorted by measure and step.
     *
     * @returns One group per measure.
     */
    private groupRangesByBar(slots: IPasteRange[]): IPasteRange[][] {
        const groups: IPasteRange[][] = [];

        for (const slot of slots) {
            const current = groups.at(-1);
            if (current?.[0].bar === slot.bar) {
                current.push(slot);
            } else {
                groups.push([slot]);
            }
        }

        return groups;
    }

    private findSourceEvent(sourceEvents: IMeasureEvent[], position: IFraction): IMeasureEvent {
        for (const event of sourceEvents) {
            const eventEnd = addFractions(event.start, event.duration);
            if (compareFractions(position, event.start) >= 0 && compareFractions(position, eventEnd) < 0) {
                return event;
            }
        }

        return sourceEvents[0];
    }

    private clipEvent(event: IMeasureEvent, offset: IFraction, limit: IFraction): IMeasureEvent {
        const start = addFractions(offset, event.start);
        const eventEnd = addFractions(start, event.duration);

        let duration = event.duration;
        if (compareFractions(eventEnd, limit) > 0) {
            duration = subtractFractions(limit, start);
        }

        return {
            start,
            duration: duration.numerator > 0 ? duration : { numerator: 0, denominator: 1 },
            noteStyleId: event.noteStyleId,
            articulation: event.articulation ? { ...event.articulation } : undefined,
        };
    }

    /**
     * Converts a fraction to the number of grid steps it covers for the given resolution.
     * Clipboard events are step-aligned, so the conversion is exact for pasted content.
     *
     * @param fraction The fraction to convert.
     * @param stepsPerBar The number of steps per measure.
     *
     * @returns The number of whole steps covered by the fraction.
     */
    private fractionSteps(fraction: IFraction, stepsPerBar: number): number {
        return Math.round((fraction.numerator * stepsPerBar) / fraction.denominator);
    }

    private matchSourceTracks(sourceTracks: IClipboardTrack[], targetTracks: ISbDmTrack[],
        anchorTrack?: ISbDmTrack): ISourceTrackMatchResult {
        const matches: ISourceTrackMatch[] = [];

        // Without an anchor (stale selection) fall back to instrument-based matching.
        if (anchorTrack === undefined) {
            const usedTrackIds = new Set<number>();
            for (const sourceTrack of sourceTracks) {
                const targetTrack = targetTracks.find((track) => {
                    return !usedTrackIds.has(track.id) && track.instrument.typeId === sourceTrack.instrumentTypeId;
                });
                if (targetTrack) {
                    usedTrackIds.add(targetTrack.id);
                }

                matches.push({ sourceTrack, targetTrack });
            }

            return { kind: PasteResultKind.Success, matches };
        }

        // The first source row anchors to the cursor's track and must match its instrument.
        if (anchorTrack.instrument.typeId !== sourceTracks[0].instrumentTypeId) {
            return { kind: PasteResultKind.InstrumentMismatch, matches: [] };
        }

        const anchorIndex = targetTracks.indexOf(anchorTrack);
        let nextTargetIndex = anchorIndex;

        for (let sourceIndex = 0; sourceIndex < sourceTracks.length; sourceIndex++) {
            const sourceTrack = sourceTracks[sourceIndex];

            if (sourceIndex === 0) {
                matches.push({ sourceTrack, targetTrack: anchorTrack });

                continue;
            }

            // Rows whose instrument no longer exists in the score are skipped without consuming a
            // target slot, so the remaining rows still line up positionally.
            const instrumentPresent = targetTracks.some((track) => {
                return track.instrument.typeId === sourceTrack.instrumentTypeId;
            });
            if (!instrumentPresent) {
                matches.push({ sourceTrack, targetTrack: undefined });

                continue;
            }

            nextTargetIndex += 1;
            const targetTrack = targetTracks.at(nextTargetIndex);
            if (!targetTrack) {
                matches.push({ sourceTrack, targetTrack: undefined });

                continue;
            }

            // The consecutive target slot holds a different instrument: the source block cannot be
            // pasted at this position.
            if (targetTrack.instrument.typeId !== sourceTrack.instrumentTypeId) {
                return { kind: PasteResultKind.InstrumentMismatch, matches: [] };
            }

            matches.push({ sourceTrack, targetTrack });
        }

        return { kind: PasteResultKind.Success, matches };
    }

    /**
     * Determines whether the paste target is a single anchor (a single note selection or a
     * whole-track selection) rather than an explicit range selection. A single anchor pastes the
     * source block downward across consecutive tracks; an explicit range maps source rows to the
     * selected tracks.
     *
     * @param entries The current selection entries.
     *
     * @returns True when the paste should anchor the source block at a single position.
     */
    private isBlockPaste(entries: ISelectionEntry[]): boolean {
        if (entries.length !== 1) {
            return false;
        }

        const { target } = entries[0];

        // A single track or a single note selection anchors the source block at its position; an
        // explicit range — a bar, a track piece or a group of notes — maps the source rows onto the
        // selection.
        return target.granularity === SelectionGranularity.Track
            || target.granularity === SelectionGranularity.Note;
    }

    /**
     * Matches source rows one-to-one with the explicitly selected tracks, in arrangement order.
     * Source rows beyond the selected tracks are skipped, so only the selected tracks are modified.
     *
     * @param sourceTracks The clipboard source tracks.
     * @param targetTracks The arrangement tracks.
     * @param selectedTrackIds The track ids present in the selection.
     *
     * @returns The match result.
     */
    private matchSourceTracksToSelection(sourceTracks: IClipboardTrack[], targetTracks: ISbDmTrack[],
        selectedTrackIds: Set<number>): ISourceTrackMatchResult {
        const selectedTracks = targetTracks.filter((track) => {
            return selectedTrackIds.has(track.id);
        });
        const matches: ISourceTrackMatch[] = [];

        for (let sourceIndex = 0; sourceIndex < sourceTracks.length; sourceIndex++) {
            const sourceTrack = sourceTracks[sourceIndex];
            const targetTrack = selectedTracks.at(sourceIndex);

            if (!targetTrack) {
                matches.push({ sourceTrack, targetTrack: undefined });

                continue;
            }

            if (targetTrack.instrument.typeId !== sourceTrack.instrumentTypeId) {
                return { kind: PasteResultKind.InstrumentMismatch, matches: [] };
            }

            matches.push({ sourceTrack, targetTrack });
        }

        return { kind: PasteResultKind.Success, matches };
    }

    private anchorRanges(track: ISbDmTrack, entry: ISelectionEntry): IPasteRange[] {
        const { target } = entry;

        if (target.granularity === SelectionGranularity.Track) {
            return track.measures.map((measure) => {
                return { track, bar: measure.number, start: zero, end: barLine };
            });
        }

        const bar = SelectionSerializer.barOf(entry);
        const measure = track.measures.at(bar - 1);
        if (!measure) {
            return [];
        }

        const entryRange = this.rangeOfEntry(entry, track);
        if (entryRange !== undefined) {
            return [entryRange];
        }

        return [{ track, bar, start: zero, end: barLine }];
    }

    /**
     * Sorts selection entries by position so the first one can anchor a multi-track paste.
     *
     * @param entries The selection entries to inspect.
     *
     * @returns The entry at the earliest position, or undefined when no entry carries a position.
     */
    private firstSelectionEntry(entries: ISelectionEntry[]): ISelectionEntry | undefined {
        let first: ISelectionEntry | undefined;
        let firstBar = Number.MAX_SAFE_INTEGER;
        let firstStart: IFraction = barLine;

        for (const entry of entries) {
            const bar = SelectionSerializer.barOf(entry);
            const start = this.spanOfEntry(entry).start;
            if (bar < firstBar || (bar === firstBar && compareFractions(start, firstStart) < 0)) {
                first = entry;
                firstBar = bar;
                firstStart = start;
            }
        }

        return first;
    }

    private sortPasteRanges(slots: IPasteRange[]): IPasteRange[] {
        return slots.sort((left, right) => {
            if (left.bar !== right.bar) {
                return left.bar - right.bar;
            }

            return compareFractions(left.start, right.start);
        });
    }

    /**
     * Resolves the range one selection entry addresses within the measure of the target track.
     *
     * @param entry The selection entry to resolve.
     * @param track The track the paste writes to.
     *
     * @returns The resolved paste range, or undefined when the entry addresses no note cells.
     */
    private rangeOfEntry(entry: ISelectionEntry, track: ISbDmTrack): IPasteRange | undefined {
        const { target } = entry;
        if (!addressesNoteCells(target)) {
            return undefined;
        }

        const span = this.spanOfEntry(entry);

        return { track, bar: target.measure.number, start: span.start, end: span.end };
    }

    /**
     * Resolves the span a selection entry addresses within its measure. Note cells carry the cell or
     * run they were selected at, a note group the events it groups, and everything coarser the whole
     * measure.
     *
     * @param entry The selection entry to resolve.
     *
     * @returns The addressed span as fractions of the entry's measure.
     */
    private spanOfEntry(entry: ISelectionEntry): IFractionRange {
        const { target } = entry;

        if (target.granularity === SelectionGranularity.Note) {
            const start = target.start ?? target.event.start;
            const end = target.end ?? addFractions(target.event.start, target.event.duration);

            return { start: { ...start }, end: { ...end } };
        }

        if (target.granularity === SelectionGranularity.NoteGroup && target.events.length > 0) {
            const last = target.events[target.events.length - 1];

            return { start: { ...target.events[0].start }, end: addFractions(last.start, last.duration) };
        }

        return { start: { ...zero }, end: { ...barLine } };
    }

    private resolvePasteRanges(granularity: SelectionGranularity, entries: ISelectionEntry[],
        track: ISbDmTrack): IPasteRange[] {
        if (granularity === SelectionGranularity.Note || granularity === SelectionGranularity.NoteGroup) {
            const ranges: IPasteRange[] = [];
            for (const entry of entries) {
                const entryRange = this.rangeOfEntry(entry, track);
                if (entryRange !== undefined) {
                    ranges.push(entryRange);
                }
            }

            return ranges;
        }

        const bars = granularity === SelectionGranularity.Track
            ? track.measures.map((measure) => {
                return measure.number;
            })
            : this.sortedUniqueBars(entries);

        const ranges: IPasteRange[] = [];
        for (const bar of bars) {
            const measure = track.measures.at(bar - 1);
            if (!measure) {
                continue;
            }

            ranges.push({ track, bar, start: zero, end: barLine });
        }

        return ranges;
    }

    private applyMeasurePaste(targets: IMeasureTarget[], content: IClipboardContent): IPasteResult {
        const replacements: IMeasureReplace[] = [];

        for (let trackIndex = 0; trackIndex < targets.length; trackIndex++) {
            const target = targets[trackIndex];
            const sourceTrack = content.tracks[trackIndex] ?? content.tracks[0];
            const sourceMeasures = sourceTrack.measures;

            for (let barIndex = 0; barIndex < target.bars.length; barIndex++) {
                const measure = target.track.measures.at(target.bars[barIndex] - 1);
                if (!measure) {
                    continue;
                }

                const sourceMeasure = sourceMeasures[barIndex % sourceMeasures.length];
                if (!this.meterMatches(sourceMeasure.meter, measure.meter)) {
                    return { kind: PasteResultKind.MeterMismatch };
                }

                replacements.push({
                    trackId: target.track.id,
                    bar: target.bars[barIndex],
                    events: sourceMeasure.events.map((event) => {
                        return this.cloneEvent(event);
                    }),
                });
            }
        }

        return this.applyReplacements(replacements);
    }

    private applyReplacements(replacements: IMeasureReplace[]): IPasteResult {
        if (replacements.length === 0) {
            return { kind: PasteResultKind.NoSelection };
        }

        this.dataModel.replaceMeasureContent(replacements);

        const selectionInvalidated = replacements.some((replacement) => {
            return replacement.subdivisions !== undefined && replacement.subdivisions.length > 0;
        });

        return selectionInvalidated
            ? { kind: PasteResultKind.Success, selectionInvalidated: true }
            : { kind: PasteResultKind.Success };
    }

    /**
     * Applies the built step-range changes: insertions that make room by shifting the following
     * notes first, then plain replacements for the tracks that could not be shifted.
     *
     * @param replacements The replacements to write.
     * @param insertions The insertions that shift the following notes.
     *
     * @returns The outcome of the operation.
     */
    private applyRangeChanges(replacements: IMeasureReplace[], insertions: IMeasureInsert[]): IPasteResult {
        const inserted = insertions.length > 0 ? this.dataModel.insertEventsWithShift(insertions) : [];
        const remaining = replacements.filter((replacement) => {
            return !inserted.includes(replacement.trackId);
        });

        if (remaining.length === 0) {
            return inserted.length > 0 ? { kind: PasteResultKind.Success } : { kind: PasteResultKind.NoSelection };
        }

        const result = this.applyReplacements(remaining);

        return inserted.length > 0 ? { kind: PasteResultKind.Success } : result;
    }

    private captureMeasures(track: ISbDmTrack, bars: number[]): IClipboardMeasure[] {
        const measures: IClipboardMeasure[] = [];

        for (const bar of bars) {
            const measure = track.measures.at(bar - 1);
            if (measure) {
                measures.push(this.captureMeasure(measure));
            }
        }

        return measures;
    }

    private captureMeasure(measure: ISbDmTrackMeasure): IClipboardMeasure {
        return {
            meter: this.copyMeter(measure.meter),
            events: measure.events.map((event) => {
                return this.cloneEvent(event);
            }),
            subdivisions: measure.subdivisions.map((subdivision) => {
                return { ...subdivision };
            }),
        };
    }

    private cloneEvent(event: IMeasureEvent): IMeasureEvent {
        return {
            start: { ...event.start },
            duration: { ...event.duration },
            noteStyleId: event.noteStyleId,
            articulation: event.articulation ? { ...event.articulation } : undefined,
        };
    }

    private copyMeter(meter: IMeterSnapshot): IMeterSnapshot {
        return {
            ...meter,
            beatGroups: [...meter.beatGroups],
        };
    }

    private meterMatches(source: IMeterSnapshot, target: IMeterSnapshot): boolean {
        return source.stepResolution === target.stepResolution
            && source.beats === target.beats
            && source.beatUnits === target.beatUnits;
    }

    /**
     * Resolves a selection to its finest granularity in a single pass. SelectionGranularity is
     * declared from coarse (Track) to fine (Note), so the highest numeric member is the finest.
     *
     * @param entries The selection entries.
     *
     * @returns The finest granularity present, or Track for an empty selection.
     */
    private finestGranularity(entries: ISelectionEntry[]): SelectionGranularity {
        let granularity = SelectionGranularity.Track;

        for (const entry of entries) {
            if (entry.granularity > granularity) {
                granularity = entry.granularity;

                // Note is already the finest possible granularity, so no further scan is needed.
                if (granularity === SelectionGranularity.Note) {
                    break;
                }
            }
        }

        return granularity;
    }

    private sortedUniqueBars(entries: ISelectionEntry[]): number[] {
        const bars: number[] = [];
        for (const entry of entries) {
            const bar = SelectionSerializer.barOf(entry);
            if (bar > 0) {
                bars.push(bar);
            }
        }

        return this.uniqueSorted(bars);
    }

    /**
     * Collects the ids of the tracks a selection addresses. Used to match the source rows of a
     * multi-track paste to the explicitly selected tracks.
     *
     * @param entries The selection entries to inspect.
     *
     * @returns The distinct track ids, in selection order.
     */
    private selectedTrackIds(entries: ISelectionEntry[]): Set<number> {
        const trackIds = new Set<number>();
        for (const entry of entries) {
            trackIds.add(SelectionSerializer.trackOf(entry).id);
        }

        return trackIds;
    }

    private uniqueSorted(values: number[]): number[] {
        return [...new Set(values)].sort((a, b) => {
            return a - b;
        });
    }

    private allBars(arrangement: ISbDmArrangement): number[] {
        return Array.from({ length: arrangement.timeParams.length }, (_, index) => {
            return index + 1;
        });
    }

    private findTrackByInstrument(arrangement: ISbDmArrangement, instrumentTypeId: string): ISbDmTrack | undefined {
        return arrangement.tracks.find((track) => {
            return track.instrument.typeId === instrumentTypeId;
        });
    }
}
