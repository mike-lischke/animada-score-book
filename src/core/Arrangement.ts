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

/** Initial title and timing options for creating a new arrangement. */
export interface IArrangementCreationOptions {
    title?: string;
    timeSignature?: string;
    tempo?: number;
    length?: number;
    pulse?: string;
    stepResolution?: number;
}

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
        // Default instrument type-ids from the legacy emptySongString.
        const typeIds = ["0", "1", "2", "3", "5", "6", "7", "8", "9"];
        const selected = typeIds
            .map((typeId) => {
                return instruments.find((inst) => {
                    return inst.typeId === typeId;
                });
            })
            .filter((instrument): instrument is ISbDmInstrument => {
                return instrument !== undefined;
            });

        return Arrangement.emptyArrangementWithInstruments(selected);
    }

    /**
     * Creates an empty arrangement with one bar and a track for each given instrument.
     *
     * @param instruments The instruments that should each receive a track.
     * @param options Optional initial title and timing parameters; defaults to 4/4, 110 BPM, one bar.
     *
     * @returns A new arrangement ready for editing.
     */
    public static emptyArrangementWithInstruments(instruments: ISbDmInstrument[],
        options?: IArrangementCreationOptions): Arrangement {
        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams(
            options?.timeSignature ?? "4/4",
            options?.tempo ?? 110,
            options?.length ?? 1,
            options?.pulse ?? "1/4",
            options?.stepResolution ?? 16,
        );

        if (options?.title) {
            arrangement.title = options.title;
        }

        for (const instrument of instruments) {
            arrangement.addTrack(instrument);
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
                            events: measure.events.map((event) => {
                                return {
                                    start: { ...event.start },
                                    duration: { ...event.duration },
                                    noteStyleId: event.noteStyleId,
                                    articulation: event.articulation ? { ...event.articulation } : undefined,
                                };
                            }),
                            subdivisions: measure.subdivisions.map((subdivision) => {
                                return { ...subdivision };
                            }),
                        };
                    }),
                };
            }),
            measureLabels: Object.keys(this.measureLabels).length > 0
                ? { ...this.measureLabels }
                : undefined,
            scoreId: this.id >= 10000 ? this.id : undefined,
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
     * Duplicates the given track, inserting the copy right after the original.
     *
     * @param trackToDuplicate The track to duplicate.
     * @returns The newly created duplicate track.
     */
    public duplicateTrack(trackToDuplicate: ISbDmTrack): ISbDmTrack {
        const index = this.tracks.indexOf(trackToDuplicate);
        if (index === -1) {
            throw new Error(`Track not found for duplication. id: ${trackToDuplicate.id}`);
        }

        const copy = new Track(this, trackToDuplicate.instrument);
        copy.name = trackToDuplicate.name;
        copy.volume = trackToDuplicate.volume;
        copy.effectiveVolume = trackToDuplicate.effectiveVolume;

        // Deep-copy the measure contents (note styles and subdivisions) into the new track.
        for (let measureIndex = 0; measureIndex < copy.measures.length; measureIndex++) {
            const source = trackToDuplicate.measures[measureIndex];
            const target = copy.measures[measureIndex];

            target.events.splice(0, target.events.length,
                ...source.events.map((event) => {
                    return {
                        start: { ...event.start },
                        duration: { ...event.duration },
                        noteStyleId: event.noteStyleId,
                        articulation: event.articulation ? { ...event.articulation } : undefined,
                    };
                }));
            target.subdivisions.splice(0, target.subdivisions.length,
                ...source.subdivisions.map((subdivision) => {
                    return { ...subdivision };
                }));
        }

        this.tracks.splice(index + 1, 0, copy);
        void requisitions.execute("arrangementChanged", this.id);

        return copy;
    };

    /**
     * Inserts a number of bars before or after the given bar. When copyContent is set, the content
     * of the bar preceding the insertion point is copied into each new bar.
     *
     * @param barNumber The 1-based bar the new bars are inserted relative to.
     * @param count The number of bars to insert.
     * @param before True to insert before barNumber, false to insert after it.
     * @param copyContent True to copy the content of the preceding bar into the new bars.
     */
    public insertBars(barNumber: number, count: number, before: boolean, copyContent: boolean): void {
        const atIndex = before ? barNumber - 1 : barNumber;
        const sourceIndex = before ? barNumber - 2 : barNumber - 1;

        for (const track of this.tracks) {
            const source = copyContent ? track.measures[sourceIndex] : undefined;
            const concreteTrack = track as Track;
            for (let i = 0; i < count; i++) {
                concreteTrack.insertMeasure(atIndex + i, source);
            }
        }

        this.timeParams.length += count;
        this.shiftMeasureLabels(atIndex + 1, count);
        void requisitions.execute("arrangementChanged", this.id);
    }

    /**
     * Deletes the given bar from all tracks.
     *
     * @param barNumber The 1-based bar to delete.
     */
    public deleteBar(barNumber: number): void {
        if (this.timeParams.length <= 1) {
            return;
        }

        for (const track of this.tracks) {
            (track as Track).deleteMeasure(barNumber - 1);
        }

        this.timeParams.length -= 1;
        this.removeMeasureLabel(barNumber);
        void requisitions.execute("arrangementChanged", this.id);
    }

    /**
     * Removes all notes and subdivisions from the given bar in every track.
     *
     * @param barNumber The 1-based bar to clear.
     */
    public clearBar(barNumber: number): void {
        for (const track of this.tracks) {
            (track as Track).clearMeasure(barNumber - 1);
            void requisitions.execute("trackChanged", track.id);
        }

        void requisitions.execute("arrangementChanged", this.id);
    }

    /**
     * Duplicates the given bar, inserting the copy right after it.
     *
     * @param barNumber The 1-based bar to duplicate.
     */
    public duplicateBar(barNumber: number): void {
        for (const track of this.tracks) {
            (track as Track).duplicateMeasure(barNumber - 1);
        }

        this.timeParams.length += 1;
        this.shiftMeasureLabels(barNumber + 1, 1);
        void requisitions.execute("arrangementChanged", this.id);
    }

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

        if (arrangementSnapshot.scoreId !== undefined) {
            this.id = arrangementSnapshot.scoreId;
        }

        this.measureLabels = arrangementSnapshot.measureLabels
            ? { ...arrangementSnapshot.measureLabels }
            : {};

        // Rebuild the track list in snapshot order. Reusing addTrack here would re-sort by instrument
        // displayOrder, which is unstable when several tracks share the same instrument — a restored
        // (undone) track would then land at the end instead of its previous position.
        const restoredTracks: ISbDmTrack[] = [];

        for (const trackSnapshot of arrangementSnapshot.tracks) {
            const instrument = instruments.find((inst) => {
                return inst.typeId === trackSnapshot.instrumentId;
            })!;

            const existingTrack = this.tracks.find((track) => {
                return track.id === trackSnapshot.id;
            });
            const track = existingTrack ?? new Track(this, instrument, trackSnapshot.id);

            this.applyTrackSnapshot(track as Track, trackSnapshot);
            restoredTracks.push(track);
        }

        this.tracks.splice(0, this.tracks.length, ...restoredTracks);
        void requisitions.execute("arrangementChanged", this.id);
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
                events: measureSnapshot.events.map((event) => {
                    return {
                        start: { ...event.start },
                        duration: { ...event.duration },
                        noteStyleId: event.noteStyleId,
                        articulation: event.articulation ? { ...event.articulation } : undefined,
                    };
                }),
                subdivisions: measureSnapshot.subdivisions.map((subdivision) => {
                    return { ...subdivision };
                }),
                noteEvents: [],
            };
        });

        track.measures.splice(0, track.measures.length, ...newMeasures);
        void requisitions.execute("trackChanged", track.id);
    }

    private getTrackMeasureId(track: Track, measureNumber: number): number {
        return (track.id * 100) + measureNumber;
    }

    /**
     * Shifts section labels starting at the given bar by the given delta. Labels that would move below
     * bar 1 are dropped.
     *
     * @param fromBar The 1-based bar from which labels are shifted.
     * @param delta The number of bars to shift by (positive or negative).
     */
    private shiftMeasureLabels(fromBar: number, delta: number): void {
        const shifted: Record<number, string> = {};

        for (const [barString, label] of Object.entries(this.measureLabels)) {
            const bar = Number(barString);
            const newBar = bar >= fromBar ? bar + delta : bar;
            if (newBar >= 1) {
                shifted[newBar] = label;
            }
        }

        this.measureLabels = shifted;
    }

    /**
     * Removes the section label of the given bar and shifts later labels down by one.
     *
     * @param barNumber The 1-based bar whose label is removed.
     */
    private removeMeasureLabel(barNumber: number): void {
        const shifted: Record<number, string> = {};

        for (const [barString, label] of Object.entries(this.measureLabels)) {
            const bar = Number(barString);
            if (bar === barNumber) {
                continue;
            }

            shifted[bar > barNumber ? bar - 1 : bar] = label;
        }

        this.measureLabels = shifted;
    }
};
