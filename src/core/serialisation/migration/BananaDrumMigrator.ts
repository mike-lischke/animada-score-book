/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { PlayerPlayState } from "../../../player/ArrangementPlayer.js";
import { TimeCoordinator, type IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { decomposeRestSpan } from "../../rest-notation.js";
import type { INoteArticulation, ISbDmInstrument } from "../../ScoreBookDataModel.js";
import { TimeParams } from "../../TimeParams.js";
import type {
    IArrangementSnapshot, IFraction, IMeasureEvent, IMeterSnapshot, ISubdivision, ITimeParamsBase,
    ITrackMeasureSnapshot, ITrackSnapshot
} from "../../types/general.js";
import type { IRealtimeProvider } from "../../../ui/AnimationEngine.js";
import { getNewId, primeFactors } from "../../utils.js";
import {
    addFractions, compareFractions, convertToBaseN, greatestCommonDivisor, reduceFraction, urlDecodeNumber
} from "../numeric-functions.js";
import { arrangementSnapshotVersion } from "../snapshots.js";
import { polyrhythmNumberToCharacter, urlNumberToCharacter } from "../constants.js";

/**
 * An arrangement as a BananaDrum share link describes it: one entry per track, each a flat list of note
 * style ids with the polyrhythms laid over them. This is the shape the decoder produces and the shape the
 * migration consumes, so both the wire format and its in-memory form are covered by one contract.
 */
export interface IBananaDrumSnapshot {
    title?: string;
    timeParams: ITimeParamsBase;
    tracks: IBananaDrumTrackSnapshot[];
}

export interface IBananaDrumTrackSnapshot {
    id: number;
    instrumentId: string;
    /** Note style id per note of the flattened track, "0" for a rest. */
    notes: string[];
    polyrhythms: IBananaDrumPolyrhythmSnapshot[];
}

/** A polyrhythm spans the notes between its start and end index and sounds the given number of notes. */
export interface IBananaDrumPolyrhythmSnapshot {
    id: number;
    start: number;
    end: number;
    length: number;
}

/** One grid cell of a measure: either a note or a rest. */
interface IBananaDrumStep {
    index: number;
    noteStyleId?: string;
}

/** A subdivision of a measure, measured in that measure's grid steps. */
interface IBananaDrumSubdivision {
    id: number;
    startStep: number;
    actual: number;
    normal: number;
    parentSubdivisionId?: number;
    isTuplet: boolean;
}

/** A measure as the share link grid describes it: steps with the subdivisions laid over them. */
interface IBananaDrumMeasure {
    number: number;
    meter: IMeterSnapshot;
    steps: IBananaDrumStep[];
    subdivisions: IBananaDrumSubdivision[];
}

/** A flat event produced by expanding steps and subdivisions. */
interface ISerializedEvent {
    start: IFraction;
    duration: IFraction;
    noteStyleId?: string;
    articulation?: INoteArticulation;
}

/** A subdivision record captured during expansion, before rest absorption shifts indices. */
interface ISubdivisionRecord {
    firstSerializedIndex: number;
    leafCount: number;
    actual: number;
    normal: number;
    isTuplet: boolean;
}

interface ITiming {
    bar: number;   // 1-indexed
    step: number;  // 0-indexed within the bar
}

/** BananaDrum has two on-the-wire encodings of the same data shape: `a` original, `a2` compacted. */
type BdEncoding = 1 | 2;

/** Note of the decoded share link, linked into the polyrhythm it belongs to, if any. */
class BananaDrumNote {
    public polyrhythm: BananaDrumPolyrhythm | undefined;

    public constructor(
        public readonly track: BananaDrumTrack,
        public readonly timing: ITiming,
        public noteStyle: string | undefined,
    ) { }
}

/** Polyrhythm of the decoded share link. Its notes replace the notes between start and end. */
class BananaDrumPolyrhythm {
    public readonly notes: BananaDrumNote[];

    public constructor(
        public readonly id: number,
        public readonly start: BananaDrumNote,
        public readonly end: BananaDrumNote,
        public readonly length: number,
    ) {
        this.notes = Array.from({ length }, (_, i) => {
            return new BananaDrumNote(start.track, { bar: 1, step: i }, undefined);
        });

        for (const note of this.notes) {
            note.polyrhythm = this;
        }
    }
}

/** Track of the decoded share link: a grid of notes plus the polyrhythms over it. */
class BananaDrumTrack {
    public readonly notes: BananaDrumNote[] = [];
    public readonly polyrhythms: BananaDrumPolyrhythm[] = [];

    public constructor(
        public readonly id: number,
        public readonly instrumentId: string,
        public readonly totalSteps: number,
        public readonly stepsPerBar: number,
    ) {
        for (let step = 0; step < totalSteps; step++) {
            const bar = Math.floor(step / stepsPerBar) + 1;
            const stepInBar = step % stepsPerBar;
            this.notes.push(new BananaDrumNote(this, { bar, step: stepInBar }, undefined));
        }
    }

    public *getNoteIterator(polyrhythmsToIgnore: BananaDrumPolyrhythm[] = []): Generator<BananaDrumNote> {
        let currentSource: BananaDrumNote[] = this.notes;
        let index = 0;
        let note: BananaDrumNote | undefined;

        while (index < currentSource.length) {
            note = currentSource[index];
            const linkedUp = this.polyrhythms.find((p) => {
                return p.start === note && !polyrhythmsToIgnore.includes(p);
            });
            if (linkedUp) {
                currentSource = linkedUp.notes;
                index = 0;
                continue;
            }

            yield note;

            let current: BananaDrumNote = note;
            while (current.polyrhythm && index + 1 >= currentSource.length) {
                const pr = current.polyrhythm;
                current = pr.end;
                currentSource = current.polyrhythm?.notes ?? current.track.notes;
                index = currentSource.indexOf(current);
            }

            index++;
        }
    }

    public addPolyrhythm(start: BananaDrumNote, end: BananaDrumNote, length: number,
        id: number, insertIndex?: number): BananaDrumPolyrhythm {
        const polyrhythm = new BananaDrumPolyrhythm(id, start, end, length);
        if (insertIndex != null) {
            this.polyrhythms.splice(insertIndex, 0, polyrhythm);
        } else {
            this.polyrhythms.push(polyrhythm);
        }

        return polyrhythm;
    }
}

/** Re-implementation of the original BananaDrum `Arrangement` runtime model. */
class BananaDrumArrangement {
    public readonly tracks: BananaDrumTrack[] = [];
    public readonly timeParams: TimeParams;
    public readonly snapshot: IBananaDrumSnapshot;
    public title: string;

    public constructor(snapshot: IBananaDrumSnapshot) {
        this.snapshot = snapshot;
        this.title = snapshot.title ?? "Untitled Arrangement";

        const tp = snapshot.timeParams;
        this.timeParams = new TimeParams(
            tp.timeSignature, tp.tempo, tp.length, tp.pulse, tp.stepResolution,
        );

        const stepsPerBar = calculateStepsPerBar(tp.timeSignature, tp.stepResolution);
        const totalSteps = stepsPerBar * tp.length;

        for (const trackSnapshot of snapshot.tracks) {
            const track = new BananaDrumTrack(trackSnapshot.id, trackSnapshot.instrumentId, totalSteps, stepsPerBar);

            for (let i = 0; i < trackSnapshot.polyrhythms.length; i++) {
                const polySnapshot = trackSnapshot.polyrhythms[i];
                const polyrhythmsToIgnore = track.polyrhythms.slice(i);

                const [start, end] = this.findStartEndNotes(track, polySnapshot, polyrhythmsToIgnore);

                track.addPolyrhythm(start, end, polySnapshot.length, polySnapshot.id, i);
            }

            let noteIndex = 0;
            for (const note of track.getNoteIterator()) {
                const styleId = trackSnapshot.notes[noteIndex];
                note.noteStyle = styleId !== "0" ? styleId : undefined;
                noteIndex++;
            }

            this.tracks.push(track);
        }
    }

    /**
     * Finds the start and end notes for a polyrhythm within a track, ignoring polyrhythms that appear
     * after the target in insertion order.
     *
     * @param track The track to search.
     * @param polySnapshot The polyrhythm to locate the notes for.
     * @param polyrhythmsToIgnore Polyrhythms to skip during iteration.
     *
     * @returns The start and end note of the polyrhythm.
     */
    private findStartEndNotes(track: BananaDrumTrack, polySnapshot: IBananaDrumPolyrhythmSnapshot,
        polyrhythmsToIgnore: BananaDrumPolyrhythm[]): [BananaDrumNote, BananaDrumNote] {
        const result: BananaDrumNote[] = [];
        let index = 0;

        for (const note of track.getNoteIterator(polyrhythmsToIgnore)) {
            if (index === polySnapshot.start) {
                result[0] = note;
            }

            if (index === polySnapshot.end) {
                result[1] = note;
                break;
            }

            index++;
        }

        return result as [BananaDrumNote, BananaDrumNote];
    }
}

/**
 * @param timeSignature The time signature of the legacy time grid.
 * @param stepResolution The step resolution of the legacy time grid.
 *
 * @returns The number of steps per bar.
 */
const calculateStepsPerBar = (timeSignature: string, stepResolution: number): number => {
    const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value) => {
        return Number(value);
    });

    const stepsPerBeat = stepResolution / beatUnit;
    const stepsPerBar = stepsPerBeat * beatsPerBar;
    if (!Number.isInteger(stepsPerBar) || stepsPerBar < 1) {
        throw new Error(`Incompatible time grid: ${timeSignature} with step resolution ${stepResolution}`);
    }

    return stepsPerBar;
};

/**
 * Decodes and migrates BananaDrum share links — the only input format that predates the current snapshot
 * schema. Everything of that format lives here: the wire decoding, the note-and-polyrhythm model the link
 * describes, and the conversion of that model into the current event-based schema.
 */
export class BananaDrumMigrator {
    /**
     * Decodes the payload of a BananaDrum share link.
     *
     * @param searchParams The URL search params of the link.
     * @param instruments The available instruments, used to decode note style numbers.
     *
     * @returns The decoded arrangement, or undefined if the params hold no BananaDrum payload.
     */
    public static decodeShareLink(searchParams: URLSearchParams,
        instruments: ISbDmInstrument[]): IBananaDrumSnapshot | undefined {
        const title = searchParams.get("t") ?? undefined;

        const a2 = searchParams.get("a2");
        if (a2) {
            return this.decode(a2, 2, instruments, title);
        }

        const a = searchParams.get("a");
        if (a) {
            return this.decode(a, 1, instruments, title);
        }

        return undefined;
    }

    /**
     * Migrates a decoded share-link arrangement into the current snapshot schema.
     *
     * @param snapshot The decoded share-link arrangement.
     * @param instruments The available instruments.
     *
     * @returns The arrangement snapshot at the current schema version.
     */
    public static toSnapshot(snapshot: IBananaDrumSnapshot, instruments: ISbDmInstrument[]): IArrangementSnapshot {
        const arrangement = new BananaDrumArrangement(snapshot);
        const metrics = BananaDrumMigrator.getScoreMetrics(arrangement);
        const meterBase = BananaDrumMigrator.getMeterBase(metrics.beatsPerBar, metrics.beatUnit);
        const tp = arrangement.timeParams;

        return {
            version: arrangementSnapshotVersion,
            title: arrangement.title,
            timeParams: {
                timeSignature: tp.timeSignature,
                tempo: tp.tempo,
                length: tp.length,
                pulse: tp.pulse,
                stepResolution: tp.stepResolution,
            },
            tracks: arrangement.tracks.map((track) => {
                return BananaDrumMigrator.convertTrack(track, metrics, meterBase, tp.pulse, instruments);
            }),
        };
    }

    /**
     * @param source A decoded snapshot of unknown shape.
     *
     * @returns True if the source is the arrangement a share link describes, i.e. notes with polyrhythms
     *          instead of measures with events.
     */
    public static isShareLinkSnapshot(source: IArrangementSnapshot
        | IBananaDrumSnapshot): source is IBananaDrumSnapshot {
        if ((source as Partial<IArrangementSnapshot>).version !== undefined) {
            return false;
        }

        return Array.isArray((source as Partial<IBananaDrumSnapshot>).tracks);
    }

    private static decode(composition: string, bdEncoding: BdEncoding, instruments: ISbDmInstrument[],
        title: string | undefined): IBananaDrumSnapshot {
        const chunks = composition.split(".");

        const timeParams = {
            timeSignature: chunks[0].replace("-", "/"),
            tempo: Number(chunks[1]),
            length: Number(chunks[2]),
            pulse: chunks[3].replace("-", "/"),
            stepResolution: Number(chunks[4])
        };

        const baseNoteCount = calculateStepsPerBar(timeParams.timeSignature, timeParams.stepResolution) *
            timeParams.length;
        const tracks = chunks.slice(5).map((serialisedTrack) => {
            return this.deserialiseTrack(serialisedTrack, baseNoteCount, bdEncoding, instruments);
        });

        return { title, timeParams, tracks };
    }

    private static deserialiseTrack(serialisedTrack: string, baseNoteCount: number, bdEncoding: BdEncoding,
        instruments: ISbDmInstrument[]): IBananaDrumTrackSnapshot {
        const instrumentId = serialisedTrack[0];
        const instrument = instruments.find((inst) => {
            return inst.typeId === instrumentId;
        })!;

        let splitterIndex = serialisedTrack.indexOf("-");
        if (splitterIndex === -1) {
            splitterIndex = serialisedTrack.length;
        }

        const serialisedNotes = serialisedTrack.substring(1, splitterIndex);
        const serialisedPolyrhythms = serialisedTrack.substring(splitterIndex + 1);
        const polyrhythms = this.deserialisePolyrhythms(serialisedPolyrhythms, bdEncoding);
        const trackNoteCount = this.getNoteCountWithPolyrhythms(baseNoteCount, polyrhythms);
        const notes = this.deserialiseNotes(serialisedNotes, instrument, trackNoteCount);

        return { id: getNewId(), instrumentId, notes, polyrhythms };
    }

    /**
     * Deserializes the polyrhythm chunks of a track.
     *
     * @param serialisedPolyrhythms The serialised polyrhythms string.
     * @param bdEncoding The BananaDrum encoding variant.
     *
     * @returns The deserialized polyrhythms.
     */
    private static deserialisePolyrhythms(serialisedPolyrhythms: string,
        bdEncoding: BdEncoding): IBananaDrumPolyrhythmSnapshot[] {
        if (serialisedPolyrhythms === "") {
            return [];
        }

        // The `a2` encoding compacts the polyrhythm string; unpack it first.
        if (bdEncoding >= 2) {
            serialisedPolyrhythms = this.unpackPolyrhythmString(serialisedPolyrhythms);
        }

        const interpretChunk = bdEncoding >= 2
            ? (chunk: string) => {
                return Number(chunk);
            }
            : (chunk: string) => {
                return Number(urlDecodeNumber(chunk));
            };

        const chunks = serialisedPolyrhythms.split("-");
        const polyrhythmSnapshots: IBananaDrumPolyrhythmSnapshot[] = [];

        // Each polyrhythm is encoded in 3 chunks.
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 3) {
            const start = interpretChunk(chunks[chunkIndex]);
            const startEndDifference = interpretChunk(chunks[chunkIndex + 1]);
            const end = start + startEndDifference;
            const length = interpretChunk(chunks[chunkIndex + 2]);

            polyrhythmSnapshots.push({ id: getNewId(), start, end, length });
        }

        return polyrhythmSnapshots;
    }

    /**
     * @param packedPolyrhythmsString The compacted polyrhythm string.
     *
     * @returns a string like 0-7-6-2-13-19...
     */
    private static unpackPolyrhythmString(packedPolyrhythmsString: string): string {
        const polyrhythmsAsBigInt = urlDecodeNumber(packedPolyrhythmsString);
        const polyrhythmStringAsNumbers = convertToBaseN(polyrhythmsAsBigInt, 11n);

        const unpackedPolyrhythmsString = polyrhythmStringAsNumbers.reduce(
            (a, b) => {
                return a + polyrhythmNumberToCharacter[b];
            },
            ""
        );

        if (unpackedPolyrhythmsString.startsWith("-")) {
            return "0" + unpackedPolyrhythmsString;
        }

        return unpackedPolyrhythmsString;
    }

    private static getNoteCountWithPolyrhythms(baseNoteCount: number,
        polyrhythmSnapshots: IBananaDrumPolyrhythmSnapshot[]): number {
        return polyrhythmSnapshots
            .map(({ start, end, length }) => {
                return length + start - end - 1;
            })
            .reduce(
                (noteCount, polyrhythmLengthModifier) => {
                    return noteCount + polyrhythmLengthModifier;
                },
                baseNoteCount
            );
    }

    private static deserialiseNotes(serialisedNotes: string, instrument: ISbDmInstrument,
        trackNoteCount: number): string[] {
        const notesAsNumber = urlDecodeNumber(serialisedNotes);

        const base = BigInt(Object.keys(instrument.noteStyles).length + 1); // +1 for rests
        const musicInBaseN = convertToBaseN(notesAsNumber, base);

        // Since the notes are concatenated into a number, any rests at the start become leading zeroes, and disappear
        // We have to work out how many there were, and put them back.
        const leadingZeroesRequired = trackNoteCount - musicInBaseN.length;
        musicInBaseN.unshift(...Array.from(new Array(leadingZeroesRequired)).map(() => {
            return 0;
        }));

        return musicInBaseN.map((noteStyleNumber) => {
            return urlNumberToCharacter[noteStyleNumber];
        });
    }

    /**
     * @param arrangement The decoded share-link arrangement.
     *
     * @returns The score metrics of its time grid.
     */
    private static getScoreMetrics(arrangement: BananaDrumArrangement): IScoreMetrics {
        const realtimeProvider: IRealtimeProvider = {
            get state(): PlayerPlayState {
                return "stopped";
            },
            get currentTime() {
                return 0;
            },
        };

        const tp = arrangement.timeParams;

        return new TimeCoordinator({
            timeSignature: tp.timeSignature,
            tempo: tp.tempo,
            length: tp.length,
            pulse: tp.pulse,
            stepResolution: tp.stepResolution,
        }, realtimeProvider).metrics;
    }

    /**
     * Converts one decoded track into the step measures the event expansion works on, together with the
     * already migrated measure events.
     *
     * @param track The decoded share-link track.
     * @param metrics The score metrics of the arrangement.
     * @param meterBase The natural subdivision basis of the meter.
     * @param pulse The pulse of the arrangement.
     * @param instruments The available instruments, used to resolve articulations.
     *
     * @returns The migrated track.
     */
    private static convertTrack(track: BananaDrumTrack, metrics: IScoreMetrics, meterBase: Set<number>,
        pulse: string, instruments: ISbDmInstrument[]): ITrackSnapshot {
        const instrument = instruments.find((candidate) => {
            return candidate.typeId === track.instrumentId;
        });

        return {
            id: track.id,
            instrumentId: track.instrumentId,
            measures: BananaDrumMigrator.convertTrackMeasures(track, metrics, meterBase, pulse, instrument),
        };
    }

    private static convertTrackMeasures(track: BananaDrumTrack, metrics: IScoreMetrics, meterBase: Set<number>,
        pulse: string, instrument: ISbDmInstrument | undefined): ITrackMeasureSnapshot[] {
        const measures: ITrackMeasureSnapshot[] = [];
        const stepsPerBar = metrics.stepsPerBar;

        const visibleNotes: BananaDrumNote[] = [];
        for (const note of track.getNoteIterator()) {
            visibleNotes.push(note);
        }

        let noteCursor = 0;
        for (let measureNumber = 0; measureNumber < metrics.bars; measureNumber++) {
            const subdivisions = BananaDrumMigrator.collectMeasureSubdivisions(
                visibleNotes, noteCursor, measureNumber, stepsPerBar,
            );
            const visibleCount = BananaDrumMigrator.countMeasureVisibleSteps(
                visibleNotes, noteCursor, measureNumber, stepsPerBar,
            );

            BananaDrumMigrator.computeIsTupletWithNesting(subdivisions, meterBase);

            const steps: IBananaDrumStep[] = [];
            for (let j = 0; j < visibleCount; j++) {
                const note = visibleNotes[noteCursor + j];
                steps.push({
                    index: j,
                    noteStyleId: note.noteStyle ?? undefined,
                });
            }

            noteCursor += visibleCount;

            measures.push(BananaDrumMigrator.convertMeasure({
                number: measureNumber + 1,
                meter: {
                    beats: metrics.beatsPerBar,
                    beatUnits: metrics.beatUnit,
                    stepResolution: stepsPerBar,
                    beatGroups: metrics.beatGroups,
                },
                steps,
                subdivisions,
            }, instrument, pulse));
        }

        return measures;
    }

    /**
     * Computes how many notes of a polyrhythm fall into a given measure.
     *
     * Both {@link prStartStep} and {@link prEndStep} are inclusive base-grid
     * positions. Distributes {@link totalActual} notes proportionally across the
     * total replaced steps so that measure boundaries get a consistent integer
     * split (floor accumulation, last overlapping measure gets the remainder).
     *
     * @param prStartStep The start step of the polyrhythm (inclusive).
     * @param prEndStep The end step of the polyrhythm (inclusive).
     * @param totalActual The total number of actual notes in the polyrhythm.
     * @param measureBaseStart The start step of the measure (inclusive).
     * @param measureBaseEnd The end step of the measure (inclusive).
     *
     * @returns The number of notes belonging to the measure, and whether any notes remain for later measures.
     */
    private static splitPolyrhythmNotes(prStartStep: number, prEndStep: number, totalActual: number,
        measureBaseStart: number, measureBaseEnd: number): { notesInMeasure: number; hasMore: boolean; } {
        const totalNormal = prEndStep - prStartStep + 1; // inclusive → count

        const previousNormal = Math.max(0, measureBaseStart - prStartStep);
        const previousNotes = Math.floor(totalActual * previousNormal / totalNormal);

        const overlapEnd = Math.min(prEndStep, measureBaseEnd);
        const overlapNormal = Math.max(0, overlapEnd - Math.max(prStartStep, measureBaseStart) + 1);

        const notesEnd = Math.floor(totalActual * (previousNormal + overlapNormal) / totalNormal);

        return {
            notesInMeasure: notesEnd - previousNotes,
            hasMore: prEndStep > measureBaseEnd,
        };
    }

    private static collectMeasureSubdivisions(visibleNotes: BananaDrumNote[], noteCursor: number,
        measureNumber: number, stepsPerBar: number): IBananaDrumSubdivision[] {
        const subdivisions: IBananaDrumSubdivision[] = [];
        const measureBaseStart = measureNumber * stepsPerBar;
        const measureBaseEnd = measureBaseStart + stepsPerBar - 1;
        const seenPolyrhythmIds = new Set<number>();

        let i = noteCursor;
        while (i < visibleNotes.length) {
            const note = visibleNotes[i];
            const pr = note.polyrhythm;
            if (!pr) {
                // Grid note — stop when we reach the next measure.
                const globalStep = ((note.timing.bar - 1) * stepsPerBar) + note.timing.step;
                if (globalStep >= measureBaseStart + stepsPerBar) {
                    break;
                }

                i++;
                continue;
            }

            // Only process each polyrhythm once per measure.
            if (seenPolyrhythmIds.has(pr.id)) {
                i++;
                continue;
            }

            // Nested polyrhythms (start note is itself inside another PR) always
            // belong to the current measure and occupy one slot in their parent.
            const isNested = pr.start.polyrhythm !== undefined;

            let normal: number;
            let notesInMeasure: number;
            let hasMore: boolean;

            if (isNested) {
                normal = 1;
                notesInMeasure = pr.length;
                hasMore = false;
            } else {
                const prStartStep = (pr.start.timing.bar * stepsPerBar) + pr.start.timing.step - stepsPerBar;
                const prEndStep = (pr.end.timing.bar * stepsPerBar) + pr.end.timing.step - stepsPerBar;

                const overlapStart = Math.max(prStartStep, measureBaseStart);
                const overlapEnd = Math.min(prEndStep, measureBaseEnd);

                if (overlapStart > overlapEnd) {
                    // No overlap with this measure.
                    if (prStartStep >= measureBaseStart + stepsPerBar) {
                        break;
                    }

                    i++;
                    continue;
                }

                normal = overlapEnd - overlapStart + 1;

                const split = BananaDrumMigrator.splitPolyrhythmNotes(
                    prStartStep, prEndStep, pr.length, measureBaseStart, measureBaseEnd,
                );
                notesInMeasure = split.notesInMeasure;
                hasMore = split.hasMore;
            }

            seenPolyrhythmIds.add(pr.id);

            subdivisions.push({
                id: pr.id,
                startStep: i - noteCursor,
                actual: notesInMeasure,
                normal,
                isTuplet: false,
                parentSubdivisionId: undefined, // Derived locally per measure below
            });

            if (!hasMore && notesInMeasure === 0) {
                break;
            }

            // Advance one note at a time — the polyrhythm may contain nested
            // children whose notes are interleaved.  seenPolyrhythmIds prevents
            // duplicate subdivision entries for the same polyrhythm.
            i++;
        }

        BananaDrumMigrator.deriveLocalParents(subdivisions);

        return subdivisions;
    }

    /**
     * Derives parent-child relationships for subdivisions within a single
     * measure, based on their positions in the steps array.  A subdivision B
     * is a child of A when B occupies one or more of A's slots, i.e.
     * B.startStep falls within A's slot range.
     *
     * @param subdivisions The subdivisions of a single measure to update in-place.
     */
    private static deriveLocalParents(subdivisions: IBananaDrumSubdivision[]): void {
        if (subdivisions.length < 2) {
            return;
        }

        // Sort by startStep so smaller-range candidates are considered first.
        const sorted = [...subdivisions].sort((a, b) => {
            return a.startStep - b.startStep || (b.actual - a.actual);
        });

        for (const sub of subdivisions) {
            let parent: IBananaDrumSubdivision | undefined;

            for (const candidate of sorted) {
                if (candidate.id === sub.id) {
                    continue;
                }

                const relativeSlot = sub.startStep - candidate.startStep;
                if (relativeSlot > 0 && relativeSlot + sub.normal <= candidate.actual) {
                    if (!parent || candidate.actual < parent.actual) {
                        parent = candidate;
                    }
                }
            }

            sub.parentSubdivisionId = parent?.id;
        }
    }

    private static countMeasureVisibleSteps(visibleNotes: BananaDrumNote[], noteCursor: number,
        measureNumber: number, stepsPerBar: number): number {
        const barEnd = (measureNumber + 1) * stepsPerBar;
        let count = 0;

        for (let i = noteCursor; i < visibleNotes.length; i++) {
            const note = visibleNotes[i];
            if (!note.polyrhythm) {
                // Grid note — stop when we reach the next measure.
                const globalStep = ((note.timing.bar - 1) * stepsPerBar) + note.timing.step;
                if (globalStep >= barEnd) {
                    break;
                }
            } else {
                // Determine this individual PR note's position in the base grid
                // so cross-bar polyrhythms are split correctly across measures.
                const pr = note.polyrhythm;

                // Nested polyrhythms (whose start note is itself inside another
                // PR) are always within the current measure — no cross-bar check.
                if (pr.start.polyrhythm) {
                    count++;
                    continue;
                }

                const prStartStep = (pr.start.timing.bar * stepsPerBar) + pr.start.timing.step - stepsPerBar;
                const prEndStep = (pr.end.timing.bar * stepsPerBar) + pr.end.timing.step - stepsPerBar;
                const totalNormal = prEndStep - prStartStep + 1;

                const noteIndex = pr.notes.indexOf(note);
                const pos = prStartStep + (noteIndex * totalNormal / pr.length);

                if (pos >= barEnd) {
                    break;
                }
            }

            count++;
        }

        return count;
    }

    private static getMeterBase(beatsPerBar: number, beatUnit: number): Set<number> {
        if (![2, 3, 4, 6, 9, 12].includes(beatsPerBar)) {
            return new Set<number>();
        }

        if (beatUnit >= 8 && beatsPerBar >= 6 && beatsPerBar % 3 === 0) {
            return new Set([3]);
        }

        return new Set([2]);
    }

    private static computeIsTupletWithNesting(subdivisions: IBananaDrumSubdivision[], meterBase: Set<number>): void {
        const sorted = [...subdivisions].sort((a, b) => {
            return (b.parentSubdivisionId != null ? 1 : 0) - (a.parentSubdivisionId != null ? 1 : 0);
        });

        const childrenByParent = new Map<number, IBananaDrumSubdivision[]>();
        for (const sub of subdivisions) {
            if (sub.parentSubdivisionId != null) {
                const list = childrenByParent.get(sub.parentSubdivisionId) ?? [];
                list.push(sub);
                childrenByParent.set(sub.parentSubdivisionId, list);
            }
        }

        for (const sub of sorted) {
            // Reduce the ratio to simplest terms. A subdivision is a tuplet iff either
            // reduced side has a prime factor outside the meter's natural basis S.
            const divisor = greatestCommonDivisor(sub.actual, sub.normal);
            const reducedActual = divisor > 0 ? sub.actual / divisor : sub.actual;
            const reducedNormal = divisor > 0 ? sub.normal / divisor : sub.normal;
            const selfIsTuplet = [...primeFactors(reducedActual), ...primeFactors(reducedNormal)].some((factor) => {
                return !meterBase.has(factor);
            });

            const children = childrenByParent.get(sub.id) ?? [];
            const childIsTuplet = children.some((c) => {
                return c.isTuplet;
            });

            sub.isTuplet = selfIsTuplet || childIsTuplet;
        }
    }

    /**
     * Expands the steps and subdivisions of a measure into the current event-based shape. The expansion is
     * faithful to the old playback model: each note absorbs the following grid rests up to the next
     * note/subdivision rest or the pulse boundary, and the gaps between notes become explicit rest events.
     *
     * @param measure The step-based measure to expand.
     * @param instrument The instrument the measure's track plays, used for articulations.
     * @param pulse The pulse of the arrangement.
     *
     * @returns The measure in the current schema.
     */
    private static convertMeasure(measure: IBananaDrumMeasure, instrument: ISbDmInstrument | undefined,
        pulse: string): ITrackMeasureSnapshot {
        const { events: serialized, subdivisions: subdivisionRecords } = BananaDrumMigrator.expandMeasure(
            measure, instrument,
        );
        const pulseFraction = BananaDrumMigrator.parsePulse(pulse);
        const measureEnd: IFraction = { numerator: 1, denominator: 1 };
        const stepResolution = measure.meter.stepResolution;

        const isGridRest = (event: ISerializedEvent): boolean => {
            return event.noteStyleId === undefined
                && event.duration.numerator * stepResolution === event.duration.denominator;
        };

        // Start of the next note or subdivision rest after the given index (grid rests do not stop absorption).
        const nextStopperStart = (serializedIndex: number): IFraction => {
            for (let k = serializedIndex + 1; k < serialized.length; k++) {
                if (!isGridRest(serialized[k])) {
                    return serialized[k].start;
                }
            }

            return measureEnd;
        };

        const pulseBoundaryAfter = (start: IFraction): IFraction => {
            const startInPulses = (start.numerator * pulseFraction.denominator)
                / (start.denominator * pulseFraction.numerator);
            const nextK = Math.floor(startInPulses) + 1;
            const candidate = reduceFraction(nextK * pulseFraction.numerator, pulseFraction.denominator);

            return compareFractions(candidate, measureEnd) < 0 ? candidate : measureEnd;
        };

        const final: IMeasureEvent[] = [];
        const serializedToFinal = new Map<number, number>();

        const subdivisionLeafIndices = new Set<number>();
        for (const record of subdivisionRecords) {
            for (let leaf = 0; leaf < record.leafCount; leaf++) {
                subdivisionLeafIndices.add(record.firstSerializedIndex + leaf);
            }
        }

        const pushRest = (start: IFraction, duration: IFraction): void => {
            const last = final.at(-1);
            const isGrid = duration.numerator * stepResolution === duration.denominator;
            const isGridAligned = (fraction: IFraction): boolean => {
                return (fraction.numerator * stepResolution) % fraction.denominator === 0;
            };

            const lastIsGridRest = last !== undefined && last.noteStyleId === undefined
                && isGridAligned(last.start)
                && (last.duration.numerator * stepResolution) % last.duration.denominator === 0;

            if (isGrid && lastIsGridRest) {
                last.duration = addFractions(last.duration, duration);

                return;
            }

            final.push({ start: { ...start }, duration: { ...duration } });
        };

        let i = 0;

        while (i < serialized.length) {
            const event = serialized[i];

            if (event.noteStyleId === undefined) {
                pushRest(event.start, event.duration);
                serializedToFinal.set(i, final.length - 1);
                i++;

                continue;
            }

            if (subdivisionLeafIndices.has(i)) {
                // Subdivision notes must not absorb following grid rests: they already fill their
                // subdivision slot, so extending them would overflow the subdivision's cell span.
                final.push({
                    start: { ...event.start },
                    duration: { ...event.duration },
                    noteStyleId: event.noteStyleId,
                    articulation: event.articulation ? { ...event.articulation } : undefined,
                });
                serializedToFinal.set(i, final.length - 1);
                i++;

                continue;
            }

            const pulseEnd = pulseBoundaryAfter(event.start);
            const stopperStart = nextStopperStart(i);
            const limit = compareFractions(stopperStart, pulseEnd) < 0 ? stopperStart : pulseEnd;

            let duration = event.duration;
            let j = i + 1;

            while (j < serialized.length && isGridRest(serialized[j])
                && compareFractions(serialized[j].start, limit) < 0) {
                duration = addFractions(duration, serialized[j].duration);
                j++;
            }

            final.push({
                start: { ...event.start },
                duration,
                noteStyleId: event.noteStyleId,
                articulation: event.articulation ? { ...event.articulation } : undefined,
            });
            serializedToFinal.set(i, final.length - 1);

            i = j;
        }

        const subdivisionFinalIndices = new Set<number>();
        for (const record of subdivisionRecords) {
            for (let leaf = 0; leaf < record.leafCount; leaf++) {
                const finalIndex = serializedToFinal.get(record.firstSerializedIndex + leaf);
                if (finalIndex !== undefined) {
                    subdivisionFinalIndices.add(finalIndex);
                }
            }
        }

        const events = BananaDrumMigrator.decomposeFinalRests(final, subdivisionFinalIndices, stepResolution);

        const subdivisions: ISubdivision[] = subdivisionRecords.map((record) => {
            const start = serialized[record.firstSerializedIndex].start;
            const startIndex = events.findIndex((event) => {
                return compareFractions(event.start, start) === 0;
            });

            return {
                startIndex: startIndex >= 0 ? startIndex : 0,
                actual: record.actual,
                normal: record.normal,
                isTuplet: record.isTuplet,
            };
        });

        return {
            number: measure.number,
            meter: { ...measure.meter },
            events,
            subdivisions,
        };
    }

    /**
     * Decomposes every non-subdivision rest into standard note values, so the staff view can render
     * each rest with a single glyph. Only the span decides the split, so a dotted value may stand
     * wherever it fits. Subdivision slot events stay untouched.
     *
     * @param events The synthesised measure events.
     * @param subdivisionIndices Indices into {@link events} that are subdivision slot events.
     * @param stepResolution The measure's step resolution.
     *
     * @returns The events with standard-value rests.
     */
    private static decomposeFinalRests(events: IMeasureEvent[], subdivisionIndices: Set<number>,
        stepResolution: number): IMeasureEvent[] {
        const result: IMeasureEvent[] = [];

        for (let index = 0; index < events.length; index++) {
            const event = events[index];

            if (event.noteStyleId !== undefined || subdivisionIndices.has(index)) {
                result.push(event);

                continue;
            }

            const startStep = (event.start.numerator * stepResolution) / event.start.denominator;
            const durationSteps = (event.duration.numerator * stepResolution) / event.duration.denominator;

            if (!Number.isInteger(startStep) || !Number.isInteger(durationSteps) || durationSteps <= 0) {
                result.push(event);

                continue;
            }

            let position = { ...event.start };
            for (const part of decomposeRestSpan(event.duration)) {
                result.push({ start: position, duration: { ...part } });
                position = addFractions(position, part);
            }
        }

        return result;
    }

    /**
     * Resolves the articulation to store on a step's event. The share link carries none, so it is derived
     * from the sample profile of the instrument variant the step names — which is what the playback of the
     * original app assumed.
     *
     * @param step The step to resolve the articulation for.
     * @param instrument The instrument the step's track plays, if it is still known.
     *
     * @returns The articulation for the step's event, or undefined for a step without a note.
     */
    private static resolveStepArticulation(step: IBananaDrumStep,
        instrument: ISbDmInstrument | undefined): INoteArticulation | undefined {
        if (step.noteStyleId === undefined) {
            return undefined;
        }

        const variant = instrument?.noteStyles[step.noteStyleId];
        if (variant === undefined) {
            return undefined;
        }

        const { builtInDamping, builtInAccent, ghost } = variant.sampleProfile;

        return { damping: builtInDamping, accent: builtInAccent, ghost };
    }

    /**
     * Expands a measure's steps and subdivisions into a flat, contiguous event stream. Every step
     * becomes one event; subdivisions are expanded into their constituent sub-notes and captured as
     * subdivision records (tuplet or symmetric split).
     *
     * @param measure The step-based measure to expand.
     * @param instrument The instrument the measure's track plays, used for articulations.
     *
     * @returns The flat event stream and the captured subdivision records.
     */
    private static expandMeasure(measure: IBananaDrumMeasure, instrument: ISbDmInstrument | undefined): {
        events: ISerializedEvent[]; subdivisions: ISubdivisionRecord[];
    } {
        const stepsPerBar = measure.meter.stepResolution;
        const steps = [...measure.steps].sort((left, right) => {
            return left.index - right.index;
        });
        const stepData = steps.map((step) => {
            return {
                noteStyleId: step.noteStyleId,
                articulation: BananaDrumMigrator.resolveStepArticulation(step, instrument),
            };
        });

        const subdivisions = measure.subdivisions;
        const topLevelSubdivisions = [...subdivisions]
            .filter((sub) => {
                return sub.parentSubdivisionId == null;
            })
            .sort((left, right) => {
                return left.startStep - right.startStep;
            });

        const subdivisionsById = new Map(subdivisions.map((sub) => {
            return [sub.id, sub] as const;
        }));

        const childrenByParentId = new Map<number, Map<number, IBananaDrumSubdivision>>();
        for (const sub of subdivisions) {
            if (sub.parentSubdivisionId == null) {
                continue;
            }

            const parent = subdivisionsById.get(sub.parentSubdivisionId);
            if (parent == null) {
                continue;
            }

            const relativeSlot = sub.startStep - parent.startStep;
            let slotMap = childrenByParentId.get(sub.parentSubdivisionId);
            if (!slotMap) {
                slotMap = new Map();
                childrenByParentId.set(sub.parentSubdivisionId, slotMap);
            }

            slotMap.set(relativeSlot, sub);
        }

        const totalVisibleSteps = (sub: IBananaDrumSubdivision): number => {
            const children = childrenByParentId.get(sub.id);
            if (!children || children.size === 0) {
                return sub.actual;
            }

            let size = sub.actual;
            for (const child of children.values()) {
                size = size - child.normal + totalVisibleSteps(child);
            }

            return size;
        };

        const topLevelByAbsStep = new Map(topLevelSubdivisions.map((sub) => {
            return [sub.startStep, sub] as const;
        }));

        const subdivisionsByBaseStep = new Map<number, IBananaDrumSubdivision>();
        {
            let absIdx = 0;

            for (let baseStep = 0; baseStep < stepsPerBar;) {
                const sub = topLevelByAbsStep.get(absIdx);

                if (sub) {
                    subdivisionsByBaseStep.set(baseStep, sub);
                    absIdx += totalVisibleSteps(sub);
                    baseStep += sub.normal;
                } else {
                    absIdx++;
                    baseStep++;
                }
            }
        }

        const events: ISerializedEvent[] = [];
        const records: ISubdivisionRecord[] = [];
        let visibleStepIndex = 0;

        const expandSubdivision = (sub: IBananaDrumSubdivision, eventStart: IFraction,
            parentNoteDuration: IFraction): void => {
            const noteDuration = reduceFraction(
                sub.normal * parentNoteDuration.numerator,
                parentNoteDuration.denominator * sub.actual,
            );

            records.push({
                firstSerializedIndex: events.length,
                leafCount: totalVisibleSteps(sub),
                actual: sub.actual,
                normal: sub.normal,
                isTuplet: sub.isTuplet,
            });

            const children = childrenByParentId.get(sub.id);
            let slotStart = eventStart;
            let noteIndex = 0;

            while (noteIndex < sub.actual) {
                const child = children?.get(noteIndex);
                if (child) {
                    expandSubdivision(child, slotStart, noteDuration);
                    slotStart = addFractions(
                        slotStart,
                        reduceFraction(noteDuration.numerator * child.normal, noteDuration.denominator),
                    );
                    noteIndex += child.normal;
                } else {
                    const data = stepData.at(visibleStepIndex);
                    events.push({
                        start: slotStart,
                        duration: noteDuration,
                        noteStyleId: data?.noteStyleId,
                        articulation: data?.articulation ? { ...data.articulation } : undefined,
                    });
                    slotStart = addFractions(slotStart, noteDuration);
                    visibleStepIndex += 1;
                    noteIndex += 1;
                }
            }
        };

        let baseStep = 0;

        while (baseStep < stepsPerBar) {
            const sub = subdivisionsByBaseStep.get(baseStep);
            if (!sub) {
                const data = stepData.at(visibleStepIndex);
                events.push({
                    start: reduceFraction(baseStep, stepsPerBar),
                    duration: reduceFraction(1, stepsPerBar),
                    noteStyleId: data?.noteStyleId,
                    articulation: data?.articulation ? { ...data.articulation } : undefined,
                });
                baseStep += 1;
                visibleStepIndex += 1;

                continue;
            }

            expandSubdivision(sub, reduceFraction(baseStep, stepsPerBar), reduceFraction(1, stepsPerBar));
            baseStep += sub.normal;
        }

        return { events, subdivisions: records };
    }

    private static parsePulse(pulse: string): IFraction {
        const [numerator, denominator] = pulse.split("/").map(Number);
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
            return { numerator: 1, denominator: 4 };
        }

        return reduceFraction(numerator, denominator);
    }
}
