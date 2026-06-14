/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { requisitions } from "../supplement/Requisitions.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmTrack,
    type ISbDmTrackMeasure
} from "./ScoreBookDataModel.js";
import { TimeParams } from "./TimeParams.js";
import { Track } from "./Track.js";
import type { IArrangementSnapshot, ITimeParams, ITrackSnapshot } from "./types/general.js";
import { getNewId } from "./utils.js";
import { arrangementSnapshotVersion } from "./serialisation/snapshots.js";

export class Arrangement implements ISbDmArrangement {
    public readonly type = SbDmEntityType.Arrangement;
    public id = getNewId();

    /** All tracks in display order for the arrangement. */
    public readonly tracks: ISbDmTrack[] = [];

    public timeParams!: ITimeParams;

    /** Per-measure section labels, keyed by 1-based measure number. */
    public measureLabels: Record<number, string> = {};

    public mainVolume = 100;
    public loop = false;
    public useMetronome = false;
    public countIn = false;

    private titleString: string | undefined;

    /**
     * Creates an empty arrangement with one bar, no notes, and a default set of
     * tracks. Mirrors the legacy `emptySongString` encoding:
     * 4/4, 110 bpm, 1 bar, 16th-note step resolution.
     *
     * @param instruments The available instruments (only those matching the default
     *                    type-ids will receive a track).
     * @returns A new arrangement ready for editing.
     */
    public static emptyArrangement(instruments: ISbDmInstrument[]): Arrangement {
        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 110, 1, "1/4", 16);

        // Default instrument type-ids from the legacy emptySongString.
        const typeIds = ["0", "1", "2", "3", "5", "6", "7", "8", "9"];
        for (const typeId of typeIds) {
            const instrument = instruments.find((inst) => {
                return inst.typeId === typeId;
            });

            if (instrument) {
                arrangement.addTrack(instrument);
            }
        }

        return arrangement;
    }

    /**
     * Produces a snapshot suitable for compact storage via {@link stringifyPackedArrangement}.
     *
     * @returns An arrangement snapshot reflecting the current state.
     */
    public toSnapshot(): IArrangementSnapshot {
        return {
            version: arrangementSnapshotVersion,
            title: this.titleString,
            timeParams: {
                timeSignature: this.timeParams.timeSignature,
                tempo: this.timeParams.tempo,
                length: this.timeParams.length,
                pulse: this.timeParams.pulse,
                stepResolution: this.timeParams.stepResolution,
            },
            tracks: this.tracks.map((track) => {
                return {
                    id: track.id,
                    instrumentId: track.instrument.typeId,
                    measures: track.measures.map((measure) => {
                        return {
                            number: measure.number,
                            meter: { ...measure.meter },
                            steps: measure.steps.map((step) => {
                                return { ...step };
                            }),
                            subdivisions: measure.subdivisions.map((sub) => {
                                return { ...sub };
                            }),
                        };
                    }),
                };
            }),
            measureLabels: Object.keys(this.measureLabels).length > 0
                ? { ...this.measureLabels }
                : undefined,
        };
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

        void requisitions.execute("arrangementChanged", this.id);

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
            void requisitions.execute("arrangementChanged", this.id);

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
        void requisitions.execute("arrangementChanged", this.id);
    }

    public applyArrangementSnapshot(arrangementSnapshot: IArrangementSnapshot, instruments: ISbDmInstrument[]): void {
        // applyTimeParams is redundant when loading Animada Score Book, since we just created the Arrangement with the
        // same TPs. However, applying the full snapshot is required for Undo/Redo.
        this.applyTimeParams(arrangementSnapshot);
        this.title = arrangementSnapshot.title ?? "Untitled Arrangement";
        this.measureLabels = arrangementSnapshot.measureLabels
            ? { ...arrangementSnapshot.measureLabels }
            : {};

        // Remove tracks that aren't in the snapshot. Iterate backwards because removeTrack mutates this.tracks.
        for (let trackIndex = this.tracks.length - 1; trackIndex >= 0; trackIndex--) {
            const track = this.tracks[trackIndex];
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
            this.applyTrackSnapshot(track as Track, trackSnapshot);
        });
    };

    /**
     * Apply all timeParams without checking if they've changed. TP does this check and won't publish redundantly
     *
     * @param arrangementSnapshot The snapshot containing the time parameters to apply.
     */
    private applyTimeParams(arrangementSnapshot: IArrangementSnapshot): void {
        this.timeParams.timeSignature = arrangementSnapshot.timeParams.timeSignature;
        this.timeParams.tempo = arrangementSnapshot.timeParams.tempo;
        this.timeParams.length = arrangementSnapshot.timeParams.length;
        this.timeParams.pulse = arrangementSnapshot.timeParams.pulse;
        this.timeParams.stepResolution = arrangementSnapshot.timeParams.stepResolution;
    };

    private applyTrackSnapshot(track: Track, trackSnapshot: ITrackSnapshot): void {
        const newMeasures: ISbDmTrackMeasure[] = trackSnapshot.measures.map((measureSnapshot) => {
            const beatGroupsCandidate = (measureSnapshot.meter as { beatGroups?: unknown; }).beatGroups;
            const beatGroups = Array.isArray(beatGroupsCandidate)
                ? [...(beatGroupsCandidate as number[])]
                : [measureSnapshot.meter.stepResolution];

            return {
                id: this.getTrackMeasureId(track, measureSnapshot.number),
                type: SbDmEntityType.TrackMeasure,
                number: measureSnapshot.number,
                meter: {
                    ...measureSnapshot.meter,
                    beatGroups,
                },
                steps: measureSnapshot.steps.map((step) => {
                    return { ...step };
                }),
                subdivisions: measureSnapshot.subdivisions.map((subdivision) => {
                    return { ...subdivision };
                }),
                events: [],
            };
        });

        track.measures.splice(0, track.measures.length, ...newMeasures);
        void requisitions.execute("trackChanged", track.id);
    }

    private getTrackMeasureId(track: Track, measureNumber: number): number {
        return (track.id * 100) + measureNumber;
    }
};
