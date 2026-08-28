/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { selectionToClearRanges } from "../ui/selection-ranges.js";
import { SelectionGranularity, type ISelectionEntry } from "../ui/selection-types.js";
import { MeasureProjection, ProjectedItemKind } from "./MeasureProjection.js";
import type {
    IMeasureReplace, ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel,
} from "./ScoreBookDataModel.js";
import {
    addFractions, compareFractions, divideFraction, greatestCommonDivisor, multiplyFraction, reduceFraction,
    subtractFractions,
} from "./serialisation/numeric-functions.js";
import {
    ClipboardContentKind, type IClipboardContent, type IClipboardMeasure, type IClipboardTrack,
} from "./types/clipboard.js";
import type { IFraction, IMeasureEvent, IMeterSnapshot, ISubdivision } from "./types/general.js";
import { primeFactors } from "./utils.js";

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
    /** Dissolve the subdivision and distribute the notes over the selected cells. */
    Dissolve,
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

/** A resolved measure-mode target: a track and the bars to fill. */
interface IMeasureTarget {
    track: ISbDmTrack;
    bars: number[];
}

/** A resolved step-mode target: one contiguous step range of one track. */
interface IStepTarget {
    track: ISbDmTrack;
    bar: number;
    startStep: number;
    endStep: number;

    /** Exact fractional start; takes precedence over {@link startStep} for subdivision slots. */
    start?: IFraction;

    /** Exact fractional end (exclusive); takes precedence over {@link endStep} for subdivision slots. */
    end?: IFraction;
}

/** The result of building step-range replacements for one source/target track pair. */
interface IStepRangeBuild {
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
 * step. Pasting replaces the target, tiling the source along the measure and step dimensions; the
 * final repetition is truncated when it does not fit.
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

        return this.dataModel.clearStepRanges(selectionToClearRanges(entries, arrangement));
    }

    /**
     * Pastes the clipboard content into the given selection, replacing the target.
     *
     * @param entries The selection entries describing the paste target.
     * @param createTrack Whether a missing track may be created for a track paste.
     * @param subdivisionMode The resolution for pasting a subdivision onto a plain selection.
     *
     * @returns The outcome of the operation.
     */
    public paste(entries: ISelectionEntry[], createTrack = false,
        subdivisionMode?: SubdivisionPasteMode): IPasteResult {
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
                return this.pasteStepRange(content, entries, arrangement, subdivisionMode);
            }
        }
    }

    private buildContent(entries: ISelectionEntry[]): IClipboardContent | undefined {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement || entries.length === 0) {
            return undefined;
        }

        const granularity = this.dominantGranularity(entries);
        switch (granularity) {
            case SelectionGranularity.Track: {
                return this.buildTrackContent(entries, arrangement);
            }

            case SelectionGranularity.Measure: {
                return this.buildMeasureContent(entries, arrangement);
            }

            case SelectionGranularity.TrackPiece: {
                return this.buildTrackPieceContent(entries, arrangement);
            }

            case SelectionGranularity.NoteGroup:
            case SelectionGranularity.Note: {
                return this.buildStepRangeContent(entries, arrangement);
            }
        }
    }

    private buildTrackContent(entries: ISelectionEntry[],
        arrangement: ISbDmArrangement): IClipboardContent | undefined {
        const tracks: IClipboardTrack[] = [];

        for (const entry of entries) {
            if (entry.granularity !== SelectionGranularity.Track) {
                continue;
            }

            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === entry.trackId;
            });

            if (!track) {
                continue;
            }

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

    private buildTrackPieceContent(entries: ISelectionEntry[],
        arrangement: ISbDmArrangement): IClipboardContent | undefined {
        const barsByTrack = new Map<number, number[]>();
        for (const entry of entries) {
            if (entry.granularity !== SelectionGranularity.TrackPiece) {
                continue;
            }

            const bars = barsByTrack.get(entry.trackId) ?? [];
            bars.push(entry.bar);
            barsByTrack.set(entry.trackId, bars);
        }

        const tracks: IClipboardTrack[] = [];
        for (const [trackId, bars] of barsByTrack) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === trackId;
            });
            if (!track) {
                continue;
            }

            const measures = this.captureMeasures(track, this.uniqueSorted(bars));
            if (measures.length > 0) {
                tracks.push({ instrumentTypeId: track.instrument.typeId, measures });
            }
        }

        return tracks.length > 0 ? { kind: ClipboardContentKind.TrackPiece, tracks } : undefined;
    }

    private buildStepRangeContent(entries: ISelectionEntry[],
        arrangement: ISbDmArrangement): IClipboardContent | undefined {
        const tracks: IClipboardTrack[] = [];

        for (const track of arrangement.tracks) {
            const trackEntries = entries.filter((entry) => {
                return entry.trackId === track.id;
            });
            if (trackEntries.length === 0) {
                continue;
            }

            const measures = this.captureStepRangeMeasures(track, trackEntries);
            if (measures.length > 0) {
                tracks.push({ instrumentTypeId: track.instrument.typeId, measures });
            }
        }

        return tracks.length > 0 ? { kind: ClipboardContentKind.EventRange, tracks } : undefined;
    }

    private captureStepRangeMeasures(track: ISbDmTrack, entries: ISelectionEntry[]): IClipboardMeasure[] {
        const measures: IClipboardMeasure[] = [];

        for (const bar of this.sortedUniqueBars(entries)) {
            const measure = track.measures.at(bar - 1);
            if (!measure) {
                continue;
            }

            const stepsPerBar = measure.meter.stepResolution;
            let rangeStart: IFraction | undefined;
            let rangeEnd: IFraction | undefined;

            for (const entry of entries) {
                if (entry.bar !== bar) {
                    continue;
                }

                const start = entry.startStep ?? entry.endStep;
                const end = entry.endStep ?? entry.startStep;
                if (start === undefined || end === undefined) {
                    continue;
                }

                let entryStart = entry.start ?? reduceFraction(start, stepsPerBar);
                let entryEnd = reduceFraction(end + 1, stepsPerBar);

                // A note entry covers the whole note, not just its start cell. Expand to the note's
                // full range so copy matches the cut behaviour, which already clears the whole note.
                if (entry.noteId !== undefined) {
                    const noteRange = this.noteRangeFor(measure, entry.noteId);
                    if (noteRange) {
                        entryStart = noteRange.start;
                        entryEnd = noteRange.end;
                    }
                } else if (entry.start !== undefined) {
                    // A subdivision rest slot has an exact start but no note id. Derive its end
                    // from the event that begins at that exact position.
                    entryEnd = this.eventEndAt(measure, entryStart) ?? entryEnd;
                }

                if (rangeStart === undefined || compareFractions(entryStart, rangeStart) < 0) {
                    rangeStart = entryStart;
                }

                if (rangeEnd === undefined || compareFractions(entryEnd, rangeEnd) > 0) {
                    rangeEnd = entryEnd;
                }
            }

            if (rangeStart === undefined || rangeEnd === undefined) {
                continue;
            }

            const events = this.captureEventRange(measure.events, rangeStart, rangeEnd);
            if (events.length === 0) {
                continue;
            }

            const content = this.captureSubdivisionContent(measure, rangeStart, rangeEnd, events.length);
            measures.push({
                meter: this.copyMeter(measure.meter),
                events,
                subdivisions: content.subdivisions,
                mixed: content.mixed,
            });
        }

        return measures;
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

    /**
     * Resolves the full fraction range of the note event with the given id, so a copied note keeps
     * its complete duration instead of being clipped to its start cell.
     *
     * @param measure The measure containing the note.
     * @param noteId The runtime note event id.
     *
     * @returns The note's start and end fractions, or undefined when the note no longer exists.
     */
    private noteRangeFor(measure: ISbDmTrackMeasure, noteId: number): IFractionRange | undefined {
        const eventIndex = measure.noteEvents.findIndex((noteEvent) => {
            return noteEvent.id === noteId;
        });
        if (eventIndex < 0) {
            return undefined;
        }

        const event = measure.events[eventIndex];

        return {
            start: { ...event.start },
            end: addFractions(event.start, event.duration),
        };
    }

    /**
     * Resolves the end fraction of the event that begins exactly at the given position. Used for
     * subdivision rest slots, whose exact start is known but whose note id is synthetic.
     *
     * @param measure The measure containing the event.
     * @param start The exact start position to look up.
     *
     * @returns The event's end fraction, or undefined when no event starts there.
     */
    private eventEndAt(measure: ISbDmTrackMeasure, start: IFraction): IFraction | undefined {
        for (const event of measure.events) {
            if (compareFractions(event.start, start) === 0) {
                return addFractions(event.start, event.duration);
            }
        }

        return undefined;
    }

    private pasteTrack(content: IClipboardContent, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, createTrack: boolean): IPasteResult {
        const source = content.tracks[0];

        const trackEntry = entries.find((entry) => {
            return entry.granularity === SelectionGranularity.Track;
        });
        let targetTrack: ISbDmTrack | undefined;

        if (trackEntry) {
            targetTrack = arrangement.tracks.find((candidate) => {
                return candidate.id === trackEntry.trackId;
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
        const granularity = this.dominantGranularity(entries);

        if (granularity === SelectionGranularity.Measure) {
            return { kind: PasteResultKind.TrackCountMismatch };
        }

        const trackIds = new Set(entries.map((entry) => {
            return entry.trackId;
        }));

        if (trackIds.size > 1) {
            return { kind: PasteResultKind.TrackCountMismatch };
        }

        let track: ISbDmTrack | undefined;
        if (granularity === SelectionGranularity.Track) {
            track = arrangement.tracks.find((candidate) => {
                return candidate.id === entries[0].trackId;
            });
        } else {
            const trackId = [...trackIds][0];
            track = arrangement.tracks.find((candidate) => {
                return candidate.id === trackId;
            });
        }

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

    private pasteStepRange(content: IClipboardContent, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, subdivisionMode?: SubdivisionPasteMode): IPasteResult {
        const granularity = this.dominantGranularity(entries);

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
            return this.pasteSingleTrackStepRange(content.tracks[0], entries, arrangement, granularity,
                subdivisionMode);
        }

        return this.pasteMultiTrackStepRange(content.tracks, entries, arrangement, granularity);
    }

    private pasteSingleTrackStepRange(sourceTrack: IClipboardTrack, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, granularity: SelectionGranularity,
        subdivisionMode?: SubdivisionPasteMode): IPasteResult {
        const trackIds = new Set(entries.map((entry) => {
            return entry.trackId;
        }));

        const replacements: IMeasureReplace[] = [];

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
                return entry.trackId === trackId;
            });

            const slots = this.sortStepTargets(
                this.resolveStepTargets(granularity, trackEntries, arrangement, track),
            );
            if (slots.length === 0) {
                continue;
            }

            const hasSubdivision = sourceTrack.measures.some((measure) => {
                return measure.subdivisions.length > 0;
            });

            let build: IStepRangeBuild;
            if (hasSubdivision && this.isTargetSubdivision(track, slots)) {
                build = this.buildSubdivisionIntoTarget(sourceTrack, track, slots, subdivisionMode);
            } else if (this.isTargetSubdivision(track, slots)) {
                build = this.buildPlainIntoTargetSubdivision(sourceTrack, track, slots);
            } else if (hasSubdivision) {
                build = this.buildSubdivisionReplacements(sourceTrack, track, slots, subdivisionMode);
            } else {
                build = this.buildStepRangeReplacements(sourceTrack, track, slots);
            }

            if (build.kind !== PasteResultKind.Success) {
                return { kind: build.kind };
            }

            replacements.push(...build.replacements);
        }

        if (replacements.length === 0) {
            return { kind: PasteResultKind.NoSelection };
        }

        return this.applyReplacements(replacements);
    }

    private pasteMultiTrackStepRange(sourceTracks: IClipboardTrack[], entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, granularity: SelectionGranularity): IPasteResult {
        const anchorEntry = this.firstSelectionEntry(entries);
        const anchorTrack = arrangement.tracks.find((candidate) => {
            return candidate.id === anchorEntry.trackId;
        });

        const matchResult = this.isBlockPaste(entries)
            ? this.matchSourceTracks(sourceTracks, arrangement.tracks, anchorTrack)
            : this.matchSourceTracksToSelection(sourceTracks, arrangement.tracks,
                new Set(entries.map((entry) => {
                    return entry.trackId;
                })));

        if (matchResult.kind !== PasteResultKind.Success) {
            return { kind: matchResult.kind };
        }

        const replacements: IMeasureReplace[] = [];
        let matchedAny = false;

        for (const match of matchResult.matches) {
            const targetTrack = match.targetTrack;
            if (!targetTrack) {
                continue;
            }

            matchedAny = true;

            const trackEntries = entries.filter((entry) => {
                return entry.trackId === targetTrack.id;
            });

            const slots = trackEntries.length > 0
                ? this.resolveStepTargets(granularity, trackEntries, arrangement, targetTrack)
                : this.anchorSlots(targetTrack, anchorEntry);

            const build = this.buildStepRangeReplacements(match.sourceTrack, targetTrack,
                this.sortStepTargets(slots));
            if (build.kind !== PasteResultKind.Success) {
                return { kind: build.kind };
            }

            replacements.push(...build.replacements);
        }

        if (!matchedAny) {
            return { kind: PasteResultKind.InstrumentMismatch };
        }

        return this.applyReplacements(replacements);
    }

    /**
     * Builds replacements for pasting a single-measure subdivision source. The target span decides
     * the case: a cursor or matching range inserts the subdivision at its proportional width, a
     * smaller range becomes the basis of a new subdivision, and a larger range needs a user
     * decision ({@link PasteResultKind.NeedsSubdivisionMode}).
     *
     * @param sourceTrack The copied subdivision source (single measure).
     * @param targetTrack The target track.
     * @param slots The resolved target slots.
     * @param subdivisionMode The chosen resolution for a larger plain selection.
     * @param normalOverride The number of parent slots a nested subdivision replaces; when omitted
     *                       the span is measured in grid steps (plain target).
     *
     * @returns The build result.
     */
    private buildSubdivisionReplacements(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IStepTarget[], subdivisionMode?: SubdivisionPasteMode,
        normalOverride?: number): IStepRangeBuild {
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
        const isCursor = slots.length === 1 && firstSlot.startStep === firstSlot.endStep;

        let targetStart: IFraction;
        let targetSpan: IFraction;

        if (isCursor) {
            targetStart = firstSlot.start ?? reduceFraction(firstSlot.startStep, stepsPerBar);
            const remaining = subtractFractions({ numerator: 1, denominator: 1 }, targetStart);
            targetSpan = compareFractions(sourceSpan, remaining) < 0 ? sourceSpan : remaining;
        } else {
            const lastSlot = slots[slots.length - 1];
            targetStart = firstSlot.start ?? reduceFraction(firstSlot.startStep, stepsPerBar);
            const lastEnd = lastSlot.end ?? reduceFraction(lastSlot.endStep + 1, stepsPerBar);
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
        if (subdivisionMode !== undefined) {
            const replacements: IMeasureReplace[] = [];
            const base: Omit<IMeasureReplace, "events" | "subdivisions"> = {
                trackId: targetTrack.id,
                bar: firstSlot.bar,
                start: targetStart,
                end: targetEnd,
            };

            switch (subdivisionMode) {
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

        // Case 4: a smaller selection (more than one cell) becomes the basis of a new subdivision.
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
     * like pasting plain notes into plain cells: the source notes tile across the selected slots and
     * the target subdivision stays intact. Selecting fewer slots than the source holds is an attempt
     * to embed a subdivision, which needs a user decision.
     *
     * @param sourceTrack The copied subdivision source.
     * @param targetTrack The target track holding the subdivision.
     * @param slots The resolved target slots.
     * @param subdivisionMode The chosen resolution for an embed (fewer slots than source notes).
     *
     * @returns The build result.
     */
    private buildSubdivisionIntoTarget(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IStepTarget[], subdivisionMode?: SubdivisionPasteMode): IStepRangeBuild {
        const sourceNoteCount = sourceTrack.measures[0].events.length;
        const isCursor = slots.length === 1 && slots[0].startStep === slots[0].endStep;

        if (!isCursor && slots.length < sourceNoteCount) {
            if (subdivisionMode === undefined) {
                return { kind: PasteResultKind.NeedsSubdivisionMode, replacements: [] };
            }

            // The nested subdivision replaces a number of parent slots, not grid steps.
            return this.buildSubdivisionReplacements(sourceTrack, targetTrack, slots, subdivisionMode,
                slots.length);
        }

        return this.buildStepRangeReplacements(sourceTrack, targetTrack, slots);
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
            isTuplet: this.computeIsTuplet(actual, normal, meter),
        };
    }

    /**
     * Computes whether an actual:normal ratio is a tuplet. A subdivision is a tuplet when the
     * reduced numerator has a prime factor that is not part of the meter's natural basis.
     *
     * @param actual The number of notes in the stream.
     * @param normal The number of original steps the subdivision replaces.
     * @param meter The meter defining the natural subdivision basis.
     *
     * @returns True when the ratio is a tuplet.
     */
    private computeIsTuplet(actual: number, normal: number, meter: IMeterSnapshot): boolean {
        const basis = this.meterBasis(meter);
        const divisor = greatestCommonDivisor(actual, normal);
        const reducedActual = divisor > 0 ? actual / divisor : actual;

        return [...primeFactors(reducedActual)].some((factor) => {
            return !basis.has(factor);
        });
    }

    /**
     * Resolves the natural subdivision basis of a meter. Binary meters use {2}, ternary meters use
     * {3}, and irregular meters have an empty basis.
     *
     * @param meter The meter to inspect.
     *
     * @returns The set of prime factors allowed for natural subdivisions.
     */
    private meterBasis(meter: IMeterSnapshot): Set<number> {
        const { beats, beatUnits } = meter;

        if (![2, 3, 4, 6, 9, 12].includes(beats)) {
            return new Set<number>();
        }

        if (beatUnits >= 8 && beats >= 6 && beats % 3 === 0) {
            return new Set([3]);
        }

        return new Set([2]);
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
        slots: IStepTarget[]): IStepRangeBuild {
        const sourceMeter = sourceTrack.measures[0].meter;
        const measure = targetTrack.measures.at(slots[0].bar - 1);
        if (!measure) {
            return { kind: PasteResultKind.NoSelection, replacements: [] };
        }

        if (!this.meterMatches(sourceMeter, measure.meter)) {
            return { kind: PasteResultKind.MeterMismatch, replacements: [] };
        }

        const range = this.slotsRange(measure, slots);
        if (this.classifyRange(measure, range.start, range.end) === RangeContentKind.Mixed) {
            return { kind: PasteResultKind.TooComplex, replacements: [] };
        }

        const sourceEvents = this.flattenSourceEvents(sourceTrack).events;
        if (sourceEvents.length === 0) {
            return { kind: PasteResultKind.Success, replacements: [] };
        }

        const zero: IFraction = { numerator: 0, denominator: 1 };
        const stepsPerBar = measure.meter.stepResolution;
        const events: IMeasureEvent[] = [];
        let cursor = { ...zero };

        for (let index = 0; index < slots.length; index++) {
            const slot = slots[index];
            const slotStart = slot.start ?? reduceFraction(slot.startStep, stepsPerBar);
            const slotEnd = slot.end ?? reduceFraction(slot.endStep + 1, stepsPerBar);
            const width = subtractFractions(slotEnd, slotStart);
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
     * Aggregates the resolved target slots into a single contiguous fraction range.
     *
     * @param measure The target measure.
     * @param slots The resolved slots, in display order.
     *
     * @returns The range spanning the first slot start to the last slot end.
     */
    private slotsRange(measure: ISbDmTrackMeasure, slots: IStepTarget[]): IFractionRange {
        const stepsPerBar = measure.meter.stepResolution;
        const first = slots[0];
        const last = slots[slots.length - 1];

        return {
            start: first.start ?? reduceFraction(first.startStep, stepsPerBar),
            end: last.end ?? reduceFraction(last.endStep + 1, stepsPerBar),
        };
    }

    /**
     * Determines whether the resolved slots target a subdivision of the given track.
     *
     * @param track The target track.
     * @param slots The resolved slots.
     *
     * @returns True when the slot range overlaps a subdivision.
     */
    private isTargetSubdivision(track: ISbDmTrack, slots: IStepTarget[]): boolean {
        if (slots.length === 0) {
            return false;
        }

        const measure = track.measures.at(slots[0].bar - 1);
        if (!measure || measure.subdivisions.length === 0) {
            return false;
        }

        const range = this.slotsRange(measure, slots);

        return this.classifyRange(measure, range.start, range.end) !== RangeContentKind.Plain;
    }

    private buildStepRangeReplacements(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IStepTarget[]): IStepRangeBuild {
        const sourceMeter = sourceTrack.measures[0].meter;
        const zero: IFraction = { numerator: 0, denominator: 1 };

        const { events: sourceEvents, length: sourceLength } = this.flattenSourceEvents(sourceTrack);

        if (sourceLength.numerator <= 0) {
            return { kind: PasteResultKind.Success, replacements: [] };
        }

        const isSingleNoteAnchor = slots.length === 1 && slots[0].startStep === slots[0].endStep;

        const replacements: IMeasureReplace[] = [];
        let sourcePosition = { ...zero };

        for (const slot of slots) {
            const measure = targetTrack.measures.at(slot.bar - 1);
            if (!measure) {
                continue;
            }

            if (!this.meterMatches(sourceMeter, measure.meter)) {
                return { kind: PasteResultKind.MeterMismatch, replacements: [] };
            }

            const stepsPerBar = measure.meter.stepResolution;
            let endStep = slot.endStep;
            let limit = reduceFraction(slot.endStep - slot.startStep + 1, stepsPerBar);
            let exactStart: IFraction | undefined;
            let exactEnd: IFraction | undefined;

            if (isSingleNoteAnchor) {
                if (slot.start !== undefined) {
                    // A subdivision slot cursor is positioned by exact fraction, not by grid step.
                    const measureEnd: IFraction = { numerator: 1, denominator: 1 };
                    const remaining = subtractFractions(measureEnd, slot.start);
                    limit = compareFractions(sourceLength, remaining) < 0 ? sourceLength : remaining;
                    exactStart = slot.start;
                    exactEnd = addFractions(slot.start, limit);
                } else {
                    // A single-note cursor pastes the source once, starting at the cursor. Limit
                    // the replaced range to the source length (truncated at the measure end) so
                    // content after the pasted notes is preserved instead of being cleared.
                    const remaining = reduceFraction(stepsPerBar - slot.startStep, stepsPerBar);
                    limit = compareFractions(sourceLength, remaining) < 0 ? sourceLength : remaining;
                    endStep = slot.startStep + this.fractionSteps(limit, stepsPerBar) - 1;
                }
            } else if (slot.start !== undefined && slot.end !== undefined) {
                // A selected range of subdivision slots: each slot's exact span is the tiling unit.
                limit = subtractFractions(slot.end, slot.start);
                exactStart = slot.start;
                exactEnd = slot.end;
            }

            const tiledEvents: IMeasureEvent[] = [];

            if (isSingleNoteAnchor) {
                for (const event of sourceEvents) {
                    const placed = this.clipEvent(event, zero, limit);
                    if (placed.duration.numerator > 0) {
                        tiledEvents.push(placed);
                    }
                }
            } else {
                let filled = { ...zero };
                while (compareFractions(filled, limit) < 0) {
                    const event = this.findSourceEvent(sourceEvents, sourcePosition);
                    const offsetInEvent = subtractFractions(sourcePosition, event.start);
                    const remainingInEvent = subtractFractions(event.duration, offsetInEvent);
                    const remainingInSlot = subtractFractions(limit, filled);
                    const take = compareFractions(remainingInEvent, remainingInSlot) < 0
                        ? remainingInEvent
                        : remainingInSlot;

                    if (take.numerator > 0) {
                        tiledEvents.push({
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
            }

            const replacement: IMeasureReplace = {
                trackId: targetTrack.id,
                bar: slot.bar,
                events: tiledEvents,
            };

            if (exactStart !== undefined && exactEnd !== undefined) {
                replacement.start = exactStart;
                replacement.end = exactEnd;
            } else {
                replacement.startStep = slot.startStep;
                replacement.endStep = endStep;
            }

            replacements.push(replacement);
        }

        return { kind: PasteResultKind.Success, replacements };
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
     * Determines whether the paste target is a single anchor (a single-cell cursor or a whole-track
     * selection) rather than an explicit range selection. A single anchor pastes the source block
     * downward across consecutive tracks; an explicit range maps source rows to the selected tracks.
     *
     * @param entries The current selection entries.
     *
     * @returns True when the paste should anchor the source block at a single position.
     */
    private isBlockPaste(entries: ISelectionEntry[]): boolean {
        if (entries.length !== 1) {
            return false;
        }

        const entry = entries[0];
        if (entry.granularity === SelectionGranularity.Track) {
            return true;
        }

        if (entry.granularity !== SelectionGranularity.Note) {
            return false;
        }

        const start = entry.startStep ?? entry.endStep;
        const end = entry.endStep ?? entry.startStep;

        return start !== undefined && start === end;
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

    private anchorSlots(track: ISbDmTrack, entry: ISelectionEntry): IStepTarget[] {
        if (entry.granularity === SelectionGranularity.Track) {
            const targets: IStepTarget[] = [];
            for (let bar = 1; bar <= track.measures.length; bar++) {
                const measure = track.measures[bar - 1];
                targets.push({ track, bar, startStep: 0, endStep: measure.meter.stepResolution - 1 });
            }

            return targets;
        }

        const measure = track.measures.at(entry.bar - 1);
        if (!measure) {
            return [];
        }

        const start = entry.startStep ?? entry.endStep;
        const end = entry.endStep ?? entry.startStep;
        if (start !== undefined && end !== undefined) {
            const target: IStepTarget = { track, bar: entry.bar, startStep: start, endStep: end };
            if (entry.start !== undefined) {
                target.start = entry.start;
                target.end = this.eventEndAt(measure, entry.start);
            }

            return [target];
        }

        return [{ track, bar: entry.bar, startStep: 0, endStep: measure.meter.stepResolution - 1 }];
    }

    private firstSelectionEntry(entries: ISelectionEntry[]): ISelectionEntry {
        return [...entries].sort((left, right) => {
            if (left.bar !== right.bar) {
                return left.bar - right.bar;
            }

            return (left.startStep ?? 0) - (right.startStep ?? 0);
        })[0];
    }

    private sortStepTargets(slots: IStepTarget[]): IStepTarget[] {
        return slots.sort((left, right) => {
            if (left.bar !== right.bar) {
                return left.bar - right.bar;
            }

            return left.startStep - right.startStep;
        });
    }

    private resolveStepTargets(granularity: SelectionGranularity, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, track: ISbDmTrack): IStepTarget[] {
        if (granularity === SelectionGranularity.Note || granularity === SelectionGranularity.NoteGroup) {
            const targets: IStepTarget[] = [];
            for (const entry of entries) {
                const start = entry.startStep ?? entry.endStep;
                const end = entry.endStep ?? entry.startStep;
                if (start === undefined || end === undefined) {
                    continue;
                }

                const target: IStepTarget = { track, bar: entry.bar, startStep: start, endStep: end };
                if (entry.start !== undefined) {
                    const measure = track.measures.at(entry.bar - 1);
                    target.start = entry.start;
                    target.end = measure !== undefined ? this.eventEndAt(measure, entry.start) : undefined;
                }

                targets.push(target);
            }

            return targets;
        }

        const bars = granularity === SelectionGranularity.Track
            ? this.allBars(arrangement)
            : this.sortedUniqueBars(entries);

        const targets: IStepTarget[] = [];
        for (const bar of bars) {
            const measure = track.measures.at(bar - 1);
            if (!measure) {
                continue;
            }

            targets.push({ track, bar, startStep: 0, endStep: measure.meter.stepResolution - 1 });
        }

        return targets;
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

    private dominantGranularity(entries: ISelectionEntry[]): SelectionGranularity {
        if (entries.some((entry) => {
            return entry.granularity === SelectionGranularity.Note;
        })) {
            return SelectionGranularity.Note;
        }

        if (entries.some((entry) => {
            return entry.granularity === SelectionGranularity.NoteGroup;
        })) {
            return SelectionGranularity.NoteGroup;
        }

        if (entries.some((entry) => {
            return entry.granularity === SelectionGranularity.TrackPiece;
        })) {
            return SelectionGranularity.TrackPiece;
        }

        if (entries.some((entry) => {
            return entry.granularity === SelectionGranularity.Measure;
        })) {
            return SelectionGranularity.Measure;
        }

        return SelectionGranularity.Track;
    }

    private sortedUniqueBars(entries: ISelectionEntry[]): number[] {
        return this.uniqueSorted(entries.map((entry) => {
            return entry.bar;
        }).filter((bar) => {
            return bar > 0;
        }));
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
