/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { AppStorage } from "./AppStorage.js";
import { Publisher } from "./Publisher.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNote, type ISbDmTrack
} from "./ScoreBookDataModel.js";
import { BananaDrumUrlImporter } from "./serialisation/BananaDrumUrlImporter.js";
import { TimeParams } from "./TimeParams.js";
import { Track } from "./Track.js";
import type {
    IArrangementSnapshot, IPolyrhythm, IPolyrhythmSnapshot, ISerialisedArrangement, ITimeParams, ITrackSnapshot
} from "./types/general.js";
import { getNewId } from "./utils.js";

export class Arrangement extends Publisher implements ISbDmArrangement {
    public readonly type = SbDmEntityType.Arrangement;
    public id = getNewId();

    /** All tracks in display order for the arrangement. */
    public readonly tracks: ISbDmTrack[] = [];

    public timeParams!: ITimeParams;

    public mainVolume = 100;
    public loop = false;
    public useMetronome = false;
    public countIn = false;

    private titleString: string | undefined;

    /**
     * Private constructor. Use the factory method to create new Arrangements.
     */
    private constructor() {
        super();
    }

    public static fromSerialized(serialized: ISerialisedArrangement, instruments: ISbDmInstrument[]): Arrangement {
        const snapshot = BananaDrumUrlImporter.getArrangementSnapshot(serialized, instruments);
        const tps = snapshot.timeParams;
        const timeParams = new TimeParams(tps.timeSignature, tps.tempo, tps.length, tps.pulse, tps.stepResolution);
        const arrangement = new Arrangement();
        arrangement.timeParams = timeParams;

        const settings = AppStorage.loadUISettings();
        if (settings) {
            arrangement.loop = settings.loop ?? false;
            arrangement.mainVolume = settings.masterVolume ?? 100;
            arrangement.useMetronome = settings.metronome ?? false;
            arrangement.countIn = settings.countIn ?? false;
        }
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

        // Remove tracks that aren't in the snapshot. Iterate backwards because removeTrack mutates this.tracks.
        for (let trackIndex = this.tracks.length - 1; trackIndex >= 0; trackIndex--) {
            const track = this.tracks[trackIndex]!;
            if (!arrangementSnapshot.tracks.some((trackSnapshot) => {
                return trackSnapshot.id === track.id;
            })) {
                this.removeTrack(track);
            }
        }

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
            if (polyrhythmSnapshot.id !== polyrhythmAtIndex?.id) {
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
