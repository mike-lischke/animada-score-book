/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmInstrument } from "../../ScoreBookDataModel.js";
import { TimeParams } from "../../TimeParams.js";
import { getNewId } from "../../utils.js";
import { polyrhythmNumberToCharacter, urlNumberToCharacter } from "../constants.js";
import { convertToBaseN, urlDecodeNumber } from "../numeric-functions.js";
import type {
    ILegacyArrangementSnapshot, ILegacyPolyrhythmSnapshot, ILegacyTrackSnapshot
} from "./legacy-snapshot-types.js";

/**
 * Calculates steps per bar for legacy import parsing.
 *
 * @param timeSignature The time signature in beats/unit format.
 * @param stepResolution The step resolution.
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
 * BananaDrum has two on-the-wire encodings of the same legacy data shape:
 *  - `a`  — original encoding.
 *  - `a2` — compacted polyrhythm string.
 *
 * Both decode into our schema version 1 (legacy notes + polyrhythms).
 */
type BdEncoding = 1 | 2;

interface Timing {
    bar: number;   // 1-indexed
    step: number;  // 0-indexed within the bar
}

export class LegacyNote {
    public polyrhythm: LegacyPolyrhythm | undefined;

    public constructor(
        public readonly track: LegacyTrack,
        public readonly timing: Timing,
        public noteStyle: string | undefined,
    ) { }
}

export class LegacyPolyrhythm {
    public readonly notes: LegacyNote[];

    public constructor(
        public readonly id: number,
        public readonly start: LegacyNote,
        public readonly end: LegacyNote,
        public readonly length: number,
    ) {
        this.notes = Array.from({ length }, (_, i) => {
            return new LegacyNote(start.track, { bar: 1, step: i }, undefined);
        });

        for (const note of this.notes) {
            note.polyrhythm = this;
        }
    }
}

export class LegacyTrack {
    public readonly notes: LegacyNote[] = [];
    public readonly polyrhythms: LegacyPolyrhythm[] = [];

    public constructor(
        public readonly id: number,
        public readonly instrumentId: string,
        public readonly totalSteps: number,
        public readonly stepsPerBar: number,
    ) {
        for (let step = 0; step < totalSteps; step++) {
            const bar = Math.floor(step / stepsPerBar) + 1;
            const stepInBar = step % stepsPerBar;
            this.notes.push(new LegacyNote(this, { bar, step: stepInBar }, undefined));
        }
    }

    public *getNoteIterator(polyrhythmsToIgnore: LegacyPolyrhythm[] = []): Generator<LegacyNote> {
        let currentSource: LegacyNote[] = this.notes;
        let index = 0;
        let note: LegacyNote | undefined;

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

            let current: LegacyNote = note;
            while (current.polyrhythm && index + 1 >= currentSource.length) {
                const pr = current.polyrhythm;
                current = pr.end;
                currentSource = current.polyrhythm?.notes ?? current.track.notes;
                index = currentSource.indexOf(current);
            }

            index++;
        }
    }

    public addPolyrhythm(start: LegacyNote, end: LegacyNote, length: number,
        id: number, insertIndex?: number): LegacyPolyrhythm {
        const polyrhythm = new LegacyPolyrhythm(id, start, end, length);
        if (insertIndex != null) {
            this.polyrhythms.splice(insertIndex, 0, polyrhythm);
        } else {
            this.polyrhythms.push(polyrhythm);
        }

        return polyrhythm;
    }
}

/** Lightweight re-implementation of the original BananaDrum `Arrangement` runtime model. */
export class LegacyArrangement {
    public readonly tracks: LegacyTrack[] = [];
    public readonly timeParams: TimeParams;
    public readonly snapshot: ILegacyArrangementSnapshot;
    public title: string;

    public constructor(snapshot: ILegacyArrangementSnapshot) {
        this.snapshot = snapshot;
        this.title = snapshot.title ?? "Untitled Arrangement";

        const tp = snapshot.timeParams;
        this.timeParams = new TimeParams(
            tp.timeSignature, tp.tempo, tp.length, tp.pulse, tp.stepResolution,
        );

        const stepsPerBar = calculateStepsPerBar(
            tp.timeSignature, tp.stepResolution,
        );
        const totalSteps = stepsPerBar * tp.length;

        for (const trackSnapshot of snapshot.tracks) {
            const track = new LegacyTrack(trackSnapshot.id, trackSnapshot.instrumentId, totalSteps, stepsPerBar);

            for (let i = 0; i < trackSnapshot.polyrhythms.length; i++) {
                const polySnapshot = trackSnapshot.polyrhythms[i];
                const polyrhythmsToIgnore = track.polyrhythms.slice(i);

                const [start, end] = this.findStartEndNotes(
                    track, polySnapshot, polyrhythmsToIgnore,
                );

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
     * Finds the start and end notes for a polyrhythm within a legacy track,
     * ignoring polyrhythms that appear after the target in insertion order.
     *
     * @param track               The legacy track to search.
     * @param polySnapshot        The polyrhythm snapshot to locate notes for.
     * @param polyrhythmsToIgnore  Polyrhythms to skip during iteration.
     *
     * @returns A tuple of `[startNote, endNote]`.
     * @internal
     */
    private findStartEndNotes(track: LegacyTrack, polySnapshot: ILegacyPolyrhythmSnapshot,
        polyrhythmsToIgnore: LegacyPolyrhythm[]): [LegacyNote, LegacyNote] {
        const result: LegacyNote[] = [];
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

        return result as [LegacyNote, LegacyNote];
    };

}

/** Handles imports of BananaDrum-style share links. */
export class BananaDrumUrlImporter {
    /**
     * Creates a {@link LegacyArrangement} (schema version 1) from URL search params.
     *
     * @param searchParams The URL search params to read.
     * @param instruments The available instruments.
     * @returns A fully constructed legacy arrangement, or undefined if no BananaDrum payload was found.
     */
    public static getArrangementFromParams(searchParams: URLSearchParams,
        instruments: ISbDmInstrument[]): LegacyArrangement | undefined {
        const title = searchParams.get("t") ?? undefined;

        let legacySnapshot: ILegacyArrangementSnapshot | undefined;

        const a2 = searchParams.get("a2");
        if (a2) {
            legacySnapshot = this.decode(a2, 2, instruments, title);
        } else {
            const a = searchParams.get("a");
            if (a) {
                legacySnapshot = this.decode(a, 1, instruments, title);
            }
        }

        if (!legacySnapshot) {
            return undefined;
        }

        return new LegacyArrangement(legacySnapshot);
    }

    private static decode(composition: string, bdEncoding: BdEncoding, instruments: ISbDmInstrument[],
        title: string | undefined): ILegacyArrangementSnapshot {
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

        return { version: 1, title, timeParams, tracks };
    }

    private static deserialiseTrack(serialisedTrack: string, baseNoteCount: number, bdEncoding: BdEncoding,
        instruments: ISbDmInstrument[]): ILegacyTrackSnapshot {
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
     * Deserializes legacy polyrhythm chunks from BananaDrum serialisation.
     *
     * @param serialisedPolyrhythms The serialised polyrhythms string.
     * @param bdEncoding The BananaDrum encoding variant.
     *
     * @returns The deserialized polyrhythm snapshots.
     */
    private static deserialisePolyrhythms(serialisedPolyrhythms: string,
        bdEncoding: BdEncoding): ILegacyPolyrhythmSnapshot[] {
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
        const polyrhythmSnapshots: ILegacyPolyrhythmSnapshot[] = [];

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
        polyrhythmSnapshots: ILegacyPolyrhythmSnapshot[]): number {
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
}
