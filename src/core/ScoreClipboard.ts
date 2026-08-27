/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { selectionToClearRanges } from "../ui/selection-ranges.js";
import { SelectionGranularity, type ISelectionEntry } from "../ui/selection-types.js";
import type {
    IMeasureReplace, ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel,
} from "./ScoreBookDataModel.js";
import {
    addFractions, compareFractions, reduceFraction, subtractFractions,
} from "./serialisation/numeric-functions.js";
import {
    ClipboardContentKind, type IClipboardContent, type IClipboardMeasure, type IClipboardTrack,
} from "./types/clipboard.js";
import type { IFraction, IMeasureEvent, IMeterSnapshot } from "./types/general.js";

/** The outcome of a paste operation. */
export enum PasteResultKind {
    Success,
    NoContent,
    NoSelection,
    InstrumentMismatch,
    MeterMismatch,
    TrackCountMismatch,
    NeedsTrackCreation,
}

/** Describes the result of a paste attempt so the caller can react or inform the user. */
export interface IPasteResult {
    kind: PasteResultKind;

    /**
     * Instrument type ids that need a track to be created (only set for
     * {@link PasteResultKind.NeedsTrackCreation}).
     */
    missingInstrumentTypeIds?: string[];
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
     *
     * @returns The outcome of the operation.
     */
    public paste(entries: ISelectionEntry[], createTrack = false): IPasteResult {
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
                return this.pasteStepRange(content, entries, arrangement);
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

            let minStep: number | undefined;
            let maxStep: number | undefined;
            for (const entry of entries) {
                if (entry.bar !== bar) {
                    continue;
                }

                const start = entry.startStep ?? entry.endStep;
                const end = entry.endStep ?? entry.startStep;
                if (start === undefined || end === undefined) {
                    continue;
                }

                minStep = minStep === undefined ? start : Math.min(minStep, start);
                maxStep = maxStep === undefined ? end : Math.max(maxStep, end);
            }

            if (minStep === undefined || maxStep === undefined) {
                continue;
            }

            const stepsPerBar = measure.meter.stepResolution;
            const rangeStart = reduceFraction(minStep, stepsPerBar);
            const rangeEnd = reduceFraction(maxStep + 1, stepsPerBar);

            const events = this.captureEventRange(measure.events, rangeStart, rangeEnd);
            if (events.length > 0) {
                measures.push({ meter: this.copyMeter(measure.meter), events, subdivisions: [] });
            }
        }

        return measures;
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
        arrangement: ISbDmArrangement): IPasteResult {
        const granularity = this.dominantGranularity(entries);

        if (granularity === SelectionGranularity.Measure) {
            return { kind: PasteResultKind.TrackCountMismatch };
        }

        if (content.tracks.length === 1) {
            return this.pasteSingleTrackStepRange(content.tracks[0], entries, arrangement, granularity);
        }

        return this.pasteMultiTrackStepRange(content.tracks, entries, arrangement, granularity);
    }

    private pasteSingleTrackStepRange(sourceTrack: IClipboardTrack, entries: ISelectionEntry[],
        arrangement: ISbDmArrangement, granularity: SelectionGranularity): IPasteResult {
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

            const build = this.buildStepRangeReplacements(sourceTrack, track, slots);
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

        const matches = this.matchSourceTracks(sourceTracks, arrangement.tracks, anchorTrack);
        const replacements: IMeasureReplace[] = [];
        let matchedAny = false;

        for (const match of matches) {
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

    private buildStepRangeReplacements(sourceTrack: IClipboardTrack, targetTrack: ISbDmTrack,
        slots: IStepTarget[]): IStepRangeBuild {
        const sourceMeter = sourceTrack.measures[0].meter;
        const zero: IFraction = { numerator: 0, denominator: 1 };

        // Flatten the captured per-measure events into one contiguous stream: each measure's
        // events start where the previous measure's events ended.
        const sourceEvents: IMeasureEvent[] = [];
        let cursor = { ...zero };
        for (const measure of sourceTrack.measures) {
            for (const event of measure.events) {
                sourceEvents.push({ ...event, start: addFractions(cursor, event.start) });
            }

            cursor = measure.events.reduce((sum, event) => {
                return addFractions(sum, event.duration);
            }, cursor);
        }

        const sourceLength = cursor;

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
            const endStep = isSingleNoteAnchor ? stepsPerBar - 1 : slot.endStep;
            const limit = reduceFraction(endStep - slot.startStep + 1, stepsPerBar);

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

            replacements.push({
                trackId: targetTrack.id,
                bar: slot.bar,
                events: tiledEvents,
                startStep: slot.startStep,
                endStep,
            });
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

    private matchSourceTracks(sourceTracks: IClipboardTrack[], targetTracks: ISbDmTrack[],
        anchorTrack?: ISbDmTrack): ISourceTrackMatch[] {
        const usedTrackIds = new Set<number>();
        const matches: ISourceTrackMatch[] = [];
        let anchorPending = anchorTrack !== undefined;

        for (const sourceTrack of sourceTracks) {
            let targetTrack: ISbDmTrack | undefined;

            if (anchorPending && anchorTrack?.instrument.typeId === sourceTrack.instrumentTypeId) {
                targetTrack = anchorTrack;
                anchorPending = false;
            } else {
                targetTrack = targetTracks.find((track) => {
                    return !usedTrackIds.has(track.id) && track.instrument.typeId === sourceTrack.instrumentTypeId;
                });
            }

            if (targetTrack) {
                usedTrackIds.add(targetTrack.id);
            }

            matches.push({ sourceTrack, targetTrack });
        }

        return matches;
    }

    private anchorSlots(track: ISbDmTrack, entry: ISelectionEntry): IStepTarget[] {
        const measure = track.measures.at(entry.bar - 1);
        if (!measure) {
            return [];
        }

        const start = entry.startStep ?? entry.endStep;
        const end = entry.endStep ?? entry.startStep;
        if (start !== undefined && end !== undefined) {
            return [{ track, bar: entry.bar, startStep: start, endStep: end }];
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

                targets.push({ track, bar: entry.bar, startStep: start, endStep: end });
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

        return { kind: PasteResultKind.Success };
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
