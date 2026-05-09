/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmInstrument } from "../../ScoreBookDataModel.js";
import type { ISerialisedArrangement } from "../../types/general.js";
import type {
    ILegacyArrangementSnapshot, ILegacyPolyrhythmSnapshot, ILegacyTrackSnapshot
} from "./migration-types.js";
import { getNewId } from "../../utils.js";
import { polyrhythmNumberToCharacter, urlNumberToCharacter } from "../constants.js";
import { convertToBaseN, urlDecodeNumber } from "../numeric-functions.js";

/**
 * BananaDrum has two on-the-wire encodings of the same legacy data shape:
 *  - `a`  — original encoding.
 *  - `a2` — Animada-era encoding with a compacted polyrhythm string.
 *
 * Both decode into our schema version 1 (legacy notes + polyrhythms).
 */
type BdEncoding = 1 | 2;

/**
 * Handles imports of BananaDrum-style share links and serialised arrangements.
 *
 * BananaDrum is a wire format only; it always produces a legacy (schema v1) snapshot.
 */
export class BananaDrumUrlImporter {
    /**
     * Extracts a `BananaDrum` payload from URL search params and decodes it into a legacy snapshot.
     *
     * @param searchParams The URL search params to read.
     * @param instruments The available instruments.
     * @returns A legacy snapshot, or undefined if no BananaDrum payload was found.
     */
    public static getArrangementSnapshotFromParams(
        searchParams: URLSearchParams,
        instruments: ISbDmInstrument[]): ILegacyArrangementSnapshot | undefined {
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
     * Decodes a BananaDrum-encoded `ISerialisedArrangement` into a legacy snapshot.
     *
     * Backends and shared links may persist arrangements as a `composition` string. Such
     * payloads are always BananaDrum-encoded, but the encoding variant cannot be inferred
     * from the wire data alone, so it is provided explicitly via `bdEncoding`.
     *
     * @param serialisedArrangement The arrangement payload to decode.
     * @param bdEncoding The BananaDrum encoding variant of `composition`.
     * @param instruments The available instruments.
     * @returns A legacy snapshot.
     */
    public static getArrangementSnapshot(serialisedArrangement: ISerialisedArrangement,
        bdEncoding: BdEncoding, instruments: ISbDmInstrument[]): ILegacyArrangementSnapshot {
        return this.decode(
            serialisedArrangement.composition,
            bdEncoding,
            instruments,
            serialisedArrangement.title,
        );
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

        const baseNoteCount = this.calculateStepsPerBar(timeParams.timeSignature, timeParams.stepResolution) *
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

        // The Animada-era encoding (`a2`) compacts the polyrhythm string; unpack it first.
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

        const base = BigInt(Object.keys(instrument.noteStyles).length + 1); // + 1 for rests
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
     * Calculates steps per bar for legacy import parsing.
     *
     * @param timeSignature The time signature in beats/unit format.
     * @param stepResolution The step resolution.
     * @returns The number of steps per bar.
     */
    private static calculateStepsPerBar(timeSignature: string, stepResolution: number): number {
        const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value) => {
            return Number(value);
        });

        const stepsPerBeat = stepResolution / beatUnit;
        const stepsPerBar = stepsPerBeat * beatsPerBar;
        if (!Number.isInteger(stepsPerBar) || stepsPerBar < 1) {
            throw new Error(`Incompatible time grid: ${timeSignature} with step resolution ${stepResolution}`);
        }

        return stepsPerBar;
    }
}
