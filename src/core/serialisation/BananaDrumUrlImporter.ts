/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmInstrument } from "../ScoreBookDataModel.js";
import type {
    IArrangementSnapshot, IPolyrhythmSnapshot, ISerialisedArrangement, ITrackSnapshot
} from "../types/general.js";
import { isNaturalNumber } from "./snapshot-version.js";
import { calculateStepsPerBar, getNewId } from "../utils.js";
import { polyrhythmNumberToCharacter, urlNumberToCharacter } from "./constants.js";
import { convertToBaseN, urlDecodeNumber } from "./numeric_functions.js";

// BananaDrum is a fixed legacy wire format. We always map it into our internal snapshot v1.
// This intentionally does not follow arrangementSnapshotVersion, because future snapshot versions
// may drop support for older states while this importer keeps a stable, explicit legacy transform.
const bananaDrumTargetSnapshotVersion = 1;
const bananaDrumDefaultSerialisedVersion = 1;

/**
 * Handles imports of legacy BananaDrum share links.
 *
 * This class is intentionally isolated from the app's internal snapshot format so that
 * all BananaDrum-to-snapshot transformations live in a single place.
 */
export class BananaDrumUrlImporter {
    public static getArrangementSnapshotFromParams(
        searchParams: URLSearchParams,
        instruments: ISbDmInstrument[]): IArrangementSnapshot | undefined {
        const serialisedArrangement = this.getSerialisedArrangementFromParams(searchParams);
        if (!serialisedArrangement) {
            return undefined;
        }

        return this.getArrangementSnapshot(serialisedArrangement, instruments);
    }

    public static getArrangementSnapshot(serialisedArrangement: ISerialisedArrangement,
        instruments: ISbDmInstrument[]): IArrangementSnapshot {
        const serialisedVersion: number = isNaturalNumber(serialisedArrangement.version)
            ? serialisedArrangement.version
            : bananaDrumDefaultSerialisedVersion;
        const { title, composition } = serialisedArrangement;
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
        const tracks = chunks.slice(5)
            .map((serialisedTrack) => {
                return this.deserialiseTrack(serialisedTrack, baseNoteCount, serialisedVersion,
                    instruments);
            });

        // BananaDrum payloads are legacy imports in our internal snapshot semantics.
        return { version: bananaDrumTargetSnapshotVersion, title, timeParams, tracks };
    }

    private static getSerialisedArrangementFromParams(
        searchParams: URLSearchParams): ISerialisedArrangement | undefined {
        const title = searchParams.get("t") ?? undefined;

        const versionParamValue = searchParams.get("v");
        const explicitVersion = versionParamValue == null ? undefined : Number(versionParamValue);
        const resolvedExplicitVersion = isNaturalNumber(explicitVersion)
            ? explicitVersion
            : undefined;

        if (searchParams.get("a2")) {
            return { composition: searchParams.get("a2")!, version: resolvedExplicitVersion ?? 2, title };
        }

        if (searchParams.get("a")) {
            return { composition: searchParams.get("a")!, version: resolvedExplicitVersion ?? 1, title };
        }

        return undefined;
    }

    private static deserialiseTrack(serialisedTrack: string, baseNoteCount: number, version: number,
        instruments: ISbDmInstrument[]): ITrackSnapshot {
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
        const polyrhythms = this.deserialisePolyrhythms(serialisedPolyrhythms, version);
        const trackNoteCount = this.getNoteCountWithPolyrhythms(baseNoteCount, polyrhythms);
        const notes = this.deserialiseNotes(serialisedNotes, instrument, trackNoteCount);

        return { id: getNewId(), instrumentId, notes, polyrhythms };
    }

    /**
     * Deserializes legacy polyrhythm chunks from BananaDrum serialisation.
     *
     * @param serialisedPolyrhythms The serialised polyrhythms string.
     * @param version The serialisation version.
     *
     * @returns The deserialized polyrhythm snapshots.
     */
    private static deserialisePolyrhythms(serialisedPolyrhythms: string, version: number): IPolyrhythmSnapshot[] {
        if (serialisedPolyrhythms === "") {
            return [];
        }

        // On version 2, we compacted the string. See comment above.
        if (version >= 2) {
            serialisedPolyrhythms = this.unpackPolyrhythmString(serialisedPolyrhythms);
        }

        const interpretChunk = version >= 2
            ? (chunk: string) => {
                return Number(chunk);
            }
            : (chunk: string) => {
                return Number(urlDecodeNumber(chunk));
            };

        const chunks = serialisedPolyrhythms.split("-");
        const polyrhythmSnapshots: IPolyrhythmSnapshot[] = [];

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
        polyrhythmSnapshots: IPolyrhythmSnapshot[]): number {
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
}
