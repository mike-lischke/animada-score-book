/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../../Publisher.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmTrack
} from "../../ScoreBookDataModel.js";
import type { Note } from "./Note.js";
import { TimeParams } from "../../TimeParams.js";
import type {
    IArrangementSnapshot, ISerialisedArrangement
} from "../../types/general.js";
import type { IPolyrhythm } from "./migration-types.js";
import { getNewId } from "../../utils.js";
import { BananaDrumUrlImporter } from "./BananaDrumUrlImporter.js";
import { MigrationTrack } from "./MigrationTrack.js";
import { isPackedArrangement, unpackArrangementSnapshot } from "../snapshot-packing.js";
import type {
    ILegacyArrangementSnapshot, ILegacyPolyrhythmSnapshot, ILegacyTrackSnapshot
} from "./migration-types.js";
import { arrangementSnapshotVersion, isNaturalNumber } from "../snapshots.js";
import { getArrangementSnapshot } from "../snapshots.js";

class MigrationArrangement extends Publisher implements ISbDmArrangement {
    public readonly type = SbDmEntityType.Arrangement;
    public readonly id = getNewId();

    public tracks: ISbDmTrack[] = [];

    public mainVolume = 100;
    public loop = false;
    public useMetronome = false;
    public countIn = false;

    public constructor(public title: string, public timeParams: TimeParams) {
        super();
    }

    public addTrack(_instrument: ISbDmInstrument, _id?: number): ISbDmTrack {
        throw new Error("Not implemented for migration arrangement");
    }

    public removeTrack(track: ISbDmTrack): void {
        const index = this.tracks.indexOf(track);
        if (index !== -1) {
            this.tracks.splice(index, 1);
        }
    }

    public applyArrangementSnapshot(_arrangementSnapshot: IArrangementSnapshot,
        _instruments: ISbDmInstrument[]): void {
        throw new Error("Not implemented for migration arrangement");
    }
}

export class ArrangementSnapshotMigrator {
    /**
     * Decodes a `BananaDrum`-style URL share link and migrates it to the current snapshot.
     *
     * Note: BananaDrum links are the only currently-supported URL composition format. They
     * encode schema version 1 data only.
     *
     * @param searchParams The URL search params to read.
     * @param instruments The available instruments.
     * @returns The migrated current-version snapshot, or undefined if no payload was found.
     */
    public static migrateFromParams(searchParams: URLSearchParams,
        instruments: ISbDmInstrument[]): IArrangementSnapshot | undefined {
        const legacySnapshot = BananaDrumUrlImporter.getArrangementSnapshotFromParams(searchParams, instruments);
        if (!legacySnapshot) {
            return undefined;
        }

        return this.migrate(legacySnapshot, instruments);
    }

    /**
     * Migrates an `ISerialisedArrangement` (a versioned wire/storage payload that carries a
     * `composition` string) to the current snapshot version.
     *
     * `ISerialisedArrangement.version` is the schema version of the payload, identical in
     * meaning to `IArrangementSnapshot.version`. Missing values are treated as version 1.
     *
     * Wire formats currently supported:
     *  - version 1: legacy BananaDrum encoding (`composition` is a BD share string).
     *  - version 2: compact-packed snapshot (`composition` is JSON of `IPackedArrangement`).
     *
     * @param serializedArrangement The serialised arrangement to migrate.
     * @param instruments The available instruments to resolve track instruments against.
     * @returns The migrated arrangement snapshot in the current schema version.
     */
    public static migrateSerialized(serializedArrangement: ISerialisedArrangement,
        instruments: ISbDmInstrument[]): IArrangementSnapshot {
        const schemaVersion = isNaturalNumber(serializedArrangement.version)
            ? serializedArrangement.version
            : 1;

        if (schemaVersion > arrangementSnapshotVersion) {
            throw new Error(`Unsupported snapshot schema version: ${schemaVersion}`);
        }

        if (schemaVersion === 1) {
            // Legacy schema. The `composition` string is BananaDrum-encoded; the encoding variant
            // can't be inferred from the wire data, so we assume the most recent variant (`a2`) used
            // by the Animada backend. Older share links go through `migrateFromParams`, which knows
            // the variant from the URL parameter name.
            const legacySnapshot = BananaDrumUrlImporter.getArrangementSnapshot(
                serializedArrangement, 2, instruments);

            return this.migrate(legacySnapshot, instruments);
        }

        // Schema >= 2: compact-packed JSON.
        const parsed = JSON.parse(serializedArrangement.composition) as unknown;
        if (!isPackedArrangement(parsed)) {
            throw new Error(`Invalid v${schemaVersion} composition payload`);
        }

        const snapshot = unpackArrangementSnapshot(parsed);
        if (snapshot.title === undefined && serializedArrangement.title !== undefined) {
            snapshot.title = serializedArrangement.title;
        }

        return this.migrate(snapshot, instruments);
    }

    /**
     * Migrates an already-decoded snapshot (current or legacy) up to the current schema.
     *
     * @param snapshot The snapshot to migrate.
     * @param instruments The available instruments.
     * @returns A snapshot in the current schema version.
     */
    public static migrate(snapshot: IArrangementSnapshot | ILegacyArrangementSnapshot,
        instruments: ISbDmInstrument[]): IArrangementSnapshot {
        if (snapshot.version < arrangementSnapshotVersion) {
            return this.migrateV1ToV2(snapshot as ILegacyArrangementSnapshot, instruments);
        }

        if (snapshot.version > arrangementSnapshotVersion) {
            throw new Error(`Unsupported snapshot schema version: ${snapshot.version}`);
        }

        return snapshot as IArrangementSnapshot;
    }

    private static migrateV1ToV2(snapshot: ILegacyArrangementSnapshot,
        instruments: ISbDmInstrument[]): IArrangementSnapshot {
        const tps = snapshot.timeParams;
        const timeParams = new TimeParams(tps.timeSignature, tps.tempo, tps.length, tps.pulse, tps.stepResolution);
        const arrangement = new MigrationArrangement(snapshot.title ?? "Untitled Arrangement", timeParams);

        snapshot.tracks.forEach((trackSnapshot) => {
            const instrument = instruments.find((inst) => {
                return inst.typeId === trackSnapshot.instrumentId;
            })!;

            const track = new MigrationTrack(arrangement, instrument, trackSnapshot.id);
            arrangement.tracks.push(track);
            this.applyTrackSnapshotV1(track, trackSnapshot);
        });

        const currentSnapshot = getArrangementSnapshot(arrangement);

        return {
            ...currentSnapshot,
            version: arrangementSnapshotVersion,
        };
    }

    private static applyTrackSnapshotV1(track: MigrationTrack, trackSnapshot: ILegacyTrackSnapshot): void {
        // First we remove polyrhythms, since this won't affect indexing.
        let polyrhythmIndex = 0;
        while (polyrhythmIndex < track.polyrhythms.length) {
            const polyrhythm = track.polyrhythms[polyrhythmIndex];

            if (!trackSnapshot.polyrhythms.some((polyrhythmSnapshot) => {
                return polyrhythmSnapshot.id === polyrhythm.id;
            })) {
                track.removePolyrhythm(polyrhythm);
            } else {
                polyrhythmIndex++;
            }
        }

        // Then we add missing polyrhythms, being careful to specify ID and index.
        trackSnapshot.polyrhythms.forEach((polyrhythmSnapshot, polyrhythmIndex) => {
            const polyrhythmAtIndex = track.polyrhythms[polyrhythmIndex] as IPolyrhythm | undefined;
            if (polyrhythmSnapshot.id !== polyrhythmAtIndex?.id) {
                const [start, end] = this.getStartAndEndNotes(track, polyrhythmSnapshot, polyrhythmIndex);
                track.addPolyrhythm(start, end, polyrhythmSnapshot.length, polyrhythmSnapshot.id, polyrhythmIndex);
            }
        });

        // Normalise legacy cross-bar polyrhythms so they are always contained within a single bar.
        this.normaliseTrackPolyrhythms(track);

        let noteIndex = 0;
        for (const note of track.getMigrationNoteIterator()) {
            const noteStyleId = trackSnapshot.notes[noteIndex];
            note.noteStyle = noteStyleId === "0"
                ? undefined
                : track.instrument.noteStyles[noteStyleId];
            noteIndex++;
        }
    }

    private static normaliseTrackPolyrhythms(track: MigrationTrack): void {
        let polyrhythmIndex = 0;
        while (polyrhythmIndex < track.polyrhythms.length) {
            const polyrhythm = track.polyrhythms[polyrhythmIndex];
            const noteSource = polyrhythm.start.polyrhythm?.notes ?? track.notes;

            const startNoteIndex = noteSource.indexOf(polyrhythm.start);
            const endNoteIndex = noteSource.indexOf(polyrhythm.end);
            if (startNoteIndex === -1 || endNoteIndex === -1 || startNoteIndex > endNoteIndex) {
                polyrhythmIndex++;
                continue;
            }

            const segments: Array<{ startNoteIndex: number; endNoteIndex: number; noteCount: number; }> = [];
            let segmentStart = startNoteIndex;
            for (let noteIndex = startNoteIndex + 1; noteIndex <= endNoteIndex; noteIndex++) {
                if (noteSource[noteIndex].timing.bar !== noteSource[noteIndex - 1].timing.bar) {
                    const segmentEnd = noteIndex - 1;
                    segments.push({
                        startNoteIndex: segmentStart,
                        endNoteIndex: segmentEnd,
                        noteCount: segmentEnd - segmentStart + 1,
                    });
                    segmentStart = noteIndex;
                }
            }

            segments.push({
                startNoteIndex: segmentStart,
                endNoteIndex,
                noteCount: endNoteIndex - segmentStart + 1,
            });

            if (segments.length === 1) {
                polyrhythmIndex++;
                continue;
            }

            const segmentLengths = this.distributePolyrhythmLength(polyrhythm.notes.length,
                segments.map((segment) => {
                    return segment.noteCount;
                }));

            track.removePolyrhythm(polyrhythm);
            const insertIndex = polyrhythmIndex;
            segments.forEach((segment, segmentIndex) => {
                track.addPolyrhythm(
                    noteSource[segment.startNoteIndex],
                    noteSource[segment.endNoteIndex],
                    segmentLengths[segmentIndex],
                    segmentIndex === 0 ? polyrhythm.id : undefined,
                    insertIndex + segmentIndex,
                );
            });

            polyrhythmIndex += segments.length;
        }
    }

    private static distributePolyrhythmLength(totalLength: number, segmentNoteCounts: number[]): number[] {
        if (segmentNoteCounts.length === 0) {
            return [];
        }

        if (segmentNoteCounts.length === 1) {
            return [totalLength];
        }

        if (totalLength < segmentNoteCounts.length) {
            return segmentNoteCounts.map(() => {
                return 1;
            });
        }

        const totalSegmentNotes = segmentNoteCounts.reduce((sum, noteCount) => {
            return sum + noteCount;
        }, 0);

        const remainingLength = totalLength - segmentNoteCounts.length;
        const segmentLengths = segmentNoteCounts.map(() => {
            return 1;
        });

        const extraInfos = segmentNoteCounts.map((noteCount, index) => {
            const rawExtraLength = remainingLength * noteCount / totalSegmentNotes;
            const baseExtraLength = Math.floor(rawExtraLength);
            segmentLengths[index] += baseExtraLength;

            return {
                index,
                fractionalPart: rawExtraLength - baseExtraLength,
            };
        });

        let assignedLength = segmentLengths.reduce((sum, length) => {
            return sum + length;
        }, 0);
        const sortedByFractionalPart = extraInfos.sort((a, b) => {
            if (a.fractionalPart !== b.fractionalPart) {
                return b.fractionalPart - a.fractionalPart;
            }

            return a.index - b.index;
        });

        for (const { index } of sortedByFractionalPart) {
            if (assignedLength >= totalLength) {
                break;
            }

            segmentLengths[index]++;
            assignedLength++;
        }

        return segmentLengths;
    }

    private static getStartAndEndNotes(track: MigrationTrack, polyrhythmSnapshot: ILegacyPolyrhythmSnapshot,
        polyrhythmIndex: number): [Note, Note] {

        // Ignore later polyrhythms so snapshot indexes resolve against the expected note stream.
        const polyrhythmsToIgnore = track.polyrhythms.slice(polyrhythmIndex);
        const startEndNotes: Note[] = [];
        let index = 0;

        for (const note of track.getMigrationNoteIterator(polyrhythmsToIgnore)) {
            if (index === polyrhythmSnapshot.start) {
                startEndNotes[0] = note;
            }
            if (index === polyrhythmSnapshot.end) {
                startEndNotes[1] = note;
                break;
            }
            index++;
        }

        return startEndNotes as [Note, Note];
    }
}
