/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNote, type ISbDmTrack
} from "./ScoreBookDataModel.js";
import { polyrhythmNumberToCharacter, urlNumberToCharacter } from "./serialisation/constants.js";
import { convertToBaseN, urlDecodeNumber } from "./serialisation/numeric_functions.js";
import { TimeParams } from "./TimeParams.js";
import { Track } from "./Track.js";
import type { IPolyrhythm, ITimeParams } from "./types/general.js";
import type {
    IArrangementSnapshot, IPolyrhythmSnapshot, ISerialisedArrangement, ITrackSnapshot
} from "./types/snapshots.js";
import { calculateStepsPerBar, getNewId } from "./utils.js";

export class Arrangement extends Publisher implements ISbDmArrangement {
    public readonly type = SbDmEntityType.Arrangement;
    public id = getNewId();

    /** All tracks in display order for the arrangement. */
    public readonly tracks: ISbDmTrack[] = [];

    public timeParams!: ITimeParams;

    private titleString: string | undefined;

    /**
     * Private constructor. Use the factory method to create new Arrangements.
     */
    private constructor() {
        super();
    }

    public static fromSerialized(serialized: ISerialisedArrangement, instruments: ISbDmInstrument[]): Arrangement {
        const snapshot = this.deserialiseArrangement(serialized, instruments);
        const tps = snapshot.timeParams;
        const timeParams = new TimeParams(tps.timeSignature, tps.tempo, tps.length, tps.pulse, tps.stepResolution);
        const arrangement = new Arrangement();
        arrangement.timeParams = timeParams;

        arrangement.applyArrangementSnapshot(snapshot, instruments);

        return arrangement;
    }

    /**
     * For testing only.
     *
     * @param snapshot The arrangement snapshot to create the arrangement from.
     * @param instruments The available instruments.
     * @returns The created arrangement.
     */
    public static fromSnapshot(snapshot: IArrangementSnapshot, instruments: ISbDmInstrument[]): Arrangement {
        const tps = snapshot.timeParams;
        const timeParams = new TimeParams(tps.timeSignature, tps.tempo, tps.length, tps.pulse, tps.stepResolution);
        const arrangement = new Arrangement();
        arrangement.timeParams = timeParams;

        arrangement.applyArrangementSnapshot(snapshot, instruments);

        return arrangement;
    }

    /**
     * Adds a track for the given instrument, maintaining display-order sorting.
     *
     * @param instrument The instrument to create a track for.
     * @param id Optional explicit track id; if omitted a new id is generated.
     * @returns The newly created track.
     */
    public addTrack(instrument: ISbDmInstrument, id?: number): ISbDmTrack {
        const index = this.tracks.findIndex((track) => {
            return track.instrument.displayOrder > instrument.displayOrder;
        });
        const track = new Track(this, instrument, id);
        if (index === -1) {
            this.tracks.push(track);
        } else {
            this.tracks.splice(index, 0, track);
        }
        this.publish();

        return track;
    };

    /**
     * Removes the specified track.
     *
     * @param trackToRemove The track to remove.
     * @returns True if the track was found and removed; throws otherwise.
     */
    public removeTrack(trackToRemove: ISbDmTrack): boolean {
        const index = this.tracks.indexOf(trackToRemove);
        if (index !== -1) {
            this.tracks.splice(index, 1);
            this.publish();

            return true;
        } else {
            console.warn(`Tried to remove a track but no reference to it. id: ${trackToRemove.id}`);
            throw new Error();
        }
    };

    /**
     * Current arrangement title.
     *
     * @returns The title string, defaulting to "Untitled Arrangement" if not set.
     */
    public get title() {
        return this.titleString ?? "Untitled Arrangement";
    }

    /**
     * Updates the arrangement title and publishes the change.
     *
     * @param newTitle The new title string.
     */
    public set title(newTitle: string) {
        this.titleString = newTitle;
        this.publish();
    }

    public applyArrangementSnapshot(arrangementSnapshot: IArrangementSnapshot, instruments: ISbDmInstrument[]): void {
        // applyTimeParams is redundant when loading Animada Score Book, since we just created the Arrangement with the
        // same TPs. However, applying the full snapshot is required for Undo/Redo.
        this.applyTimeParams(arrangementSnapshot);
        this.title = arrangementSnapshot.title ?? "Untitled Arrangement";

        // Remove tracks that aren't in the snapshot
        this.tracks.forEach((track) => {
            if (!arrangementSnapshot.tracks.some((trackSnapshot) => {
                return trackSnapshot.id === track.id;
            })) {
                this.removeTrack(track);
            }
        });

        // Add missing tracks
        arrangementSnapshot.tracks.forEach((trackSnapshot) => {
            let track = this.tracks.find((track) => {
                return track.id === trackSnapshot.id;
            });

            const instrument = instruments.find((inst) => {
                return inst.typeId === trackSnapshot.instrumentId;
            })!;

            track ??= this.addTrack(instrument, trackSnapshot.id);
            this.applyTrackSnapshot(track, trackSnapshot);
        });
    };

    private static deserialiseArrangement(serialisedArrangement: ISerialisedArrangement,
        instruments: ISbDmInstrument[]): IArrangementSnapshot {
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
                return this.deserialiseTrack(serialisedTrack, baseNoteCount, serialisedArrangement.version,
                    instruments);
            });

        return { title, timeParams, tracks };
    };

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
    };

    /**
     * In general, each polyrhythm is serialised as start-startEndDifference-length, eg 0-7-6.
     * In version 1, we shortened the numbers by expressing them in url-characters, so base 64.
     * The full string looked like like 2-5-f-7-9b-3-4-9-1...
     * In version 2, we instead used normal numbers, and compacted the entire string the way we compact the
     * serialised notes
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

        // On version 2, we compacted the string. See comment above
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
    };

    /**
     * @param packedPolyrhythmsString The compacted polyrhythm string.
     * @returns a string like 0-7-6-2-13-19...
     *
     * This string was compacted using our url-encoding approach that we use for notes
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
    };

    /**
     * Each polyrhythm simply hides some notes and adds some notes
     * If you do them in order, we are just adding a modifier for each one
     * And since addition is abelian, that means we actually don't care about the order here
     * That said, I just used a mathematical term along with some hand-waving, so I could be wrong
     *
     * @param baseNoteCount The base note count without polyrhythms.
     * @param polyrhythmSnapshots The polyrhythm snapshots to consider.
     *
     * @returns The note count including polyrhythm modifications.
     */
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
    };

    private static deserialiseNotes(serialisedNotes: string, instrument: ISbDmInstrument,
        trackNoteCount: number): string[] {
        const notesAsNumber = urlDecodeNumber(serialisedNotes);

        const base = BigInt(Object.keys(instrument.noteStyles).length + 1); // + 1 for rests
        const musicInBaseN = convertToBaseN(notesAsNumber, base);

        // Since the notes are concatenated into a number, any rests at the start become leading zeroes, and disappear
        // We have to work out how many there were, and put them back
        const leadingZeroesRequired = trackNoteCount - musicInBaseN.length;
        musicInBaseN.unshift(...Array.from(new Array(leadingZeroesRequired)).map(() => {
            return 0;
        }));

        return musicInBaseN.map((noteStyleNumber) => {
            return urlNumberToCharacter[noteStyleNumber];
        });
    };

    // Apply all timeParams without checking if they've changed. TP does this check and won't publish redundantly
    private applyTimeParams(arrangementSnapshot: IArrangementSnapshot): void {
        this.timeParams.timeSignature = arrangementSnapshot.timeParams.timeSignature;
        this.timeParams.tempo = arrangementSnapshot.timeParams.tempo;
        this.timeParams.length = arrangementSnapshot.timeParams.length;
        this.timeParams.pulse = arrangementSnapshot.timeParams.pulse;
        this.timeParams.stepResolution = arrangementSnapshot.timeParams.stepResolution;
    };

    private applyTrackSnapshot(track: ISbDmTrack, trackSnapshot: ITrackSnapshot): void {
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

        // Then we add missing polyrhythms, being careful to specify ID and index
        trackSnapshot.polyrhythms.forEach((polyrhythmSnapshot, polyrhythmIndex) => {
            const polyrhythmAtIndex = track.polyrhythms[polyrhythmIndex] as IPolyrhythm | undefined;
            if (!polyrhythmAtIndex || polyrhythmSnapshot.id !== polyrhythmAtIndex.id) {
                const [start, end] = this.getStartAndEndNotes(track, polyrhythmSnapshot, polyrhythmIndex);
                track.addPolyrhythm(start, end, polyrhythmSnapshot.length, polyrhythmSnapshot.id, polyrhythmIndex);
            }
        });

        let noteIndex = 0;
        for (const note of track.getNoteIterator()) {
            const noteStyleId = trackSnapshot.notes[noteIndex];
            const noteStyle = noteStyleId === "0"
                ? undefined
                : track.instrument.noteStyles[noteStyleId];
            note.noteStyle = noteStyle;
            noteIndex++;
        }
    };

    // Return the start and end Note objects for a polyrhythm we want to add to a Track
    private getStartAndEndNotes(track: ISbDmTrack, polyrhythmSnapshot: IPolyrhythmSnapshot,
        polyrhythmIndex: number): [ISbDmNote, ISbDmNote] {

        // We have to ignore later polyrhythms so that our start and end indexes are applied correctly
        const polyrhythmsToIgnore = track.polyrhythms.slice(polyrhythmIndex);
        const startEndNotes: ISbDmNote[] = [];
        let index = 0;

        for (const note of track.getNoteIterator(polyrhythmsToIgnore)) {
            if (index === polyrhythmSnapshot.start) {
                startEndNotes[0] = note;
            }
            if (index === polyrhythmSnapshot.end) {
                startEndNotes[1] = note;
                break;
            }
            index++;
        }

        return startEndNotes as [ISbDmNote, ISbDmNote];
    };
};
