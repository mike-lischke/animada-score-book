/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure
} from "./ScoreBookDataModel.js";
import { TimeParams } from "./TimeParams.js";
import { Track } from "./Track.js";
import type { IArrangementSnapshot, IFraction, ITimeParams, ITrackSnapshot } from "./types/general.js";
import { compareFractions, reduceFraction, subtractFractions } from "./serialisation/numeric-functions.js";
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

    /**
     * @param snapshot The arrangement snapshot to create the arrangement from.
     * @param instruments The available instruments.
     * @returns The created arrangement.
     */
    public static fromSnapshot(snapshot: IArrangementSnapshot, instruments: ISbDmInstrument[]): Arrangement {
        const tps = snapshot.timeParams;
        const timeParams = new TimeParams(tps.timeSignature, tps.tempo, tps.length, tps.pulse, tps.stepResolution);
        const arrangement = new Arrangement();
        arrangement.timeParams = timeParams;

        arrangement.applyCurrentArrangementSnapshot(snapshot, instruments);

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
        this.applyCurrentArrangementSnapshot(arrangementSnapshot, instruments);
    };

    private applyCurrentArrangementSnapshot(arrangementSnapshot: IArrangementSnapshot,
        instruments: ISbDmInstrument[]): void {
        // applyTimeParams is redundant when loading Animada Score Book, since we just created the Arrangement with the
        // same TPs. However, applying the full snapshot is required for Undo/Redo.
        this.applyTimeParams(arrangementSnapshot);
        this.title = arrangementSnapshot.title ?? "Untitled Arrangement";

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

    // Apply all timeParams without checking if they've changed. TP does this check and won't publish redundantly
    private applyTimeParams(arrangementSnapshot: IArrangementSnapshot): void {
        this.timeParams.timeSignature = arrangementSnapshot.timeParams.timeSignature;
        this.timeParams.tempo = arrangementSnapshot.timeParams.tempo;
        this.timeParams.length = arrangementSnapshot.timeParams.length;
        this.timeParams.pulse = arrangementSnapshot.timeParams.pulse;
        this.timeParams.stepResolution = arrangementSnapshot.timeParams.stepResolution;
    };

    private applyTrackSnapshot(track: Track, trackSnapshot: ITrackSnapshot): void {
        const stepsPerBar = this.getStepsPerBar();
        const pulseFraction = this.parsePulseFraction();
        const measureEnd: IFraction = { numerator: 1, denominator: 1 };

        const newMeasures: ISbDmTrackMeasure[] = trackSnapshot.measures.map((measureSnapshot) => {
            // Drop redundant grid-aligned rest events: they carry no sound and exactly fill one
            // grid slot, so they're reconstructed on demand by Track.getNoteAt. Polyrhythm-shaped
            // rest events (non-grid duration) are preserved because their duration encodes the
            // polyrhythm structure.
            const filteredSnapshotEvents = measureSnapshot.events.filter((event) => {
                if (event.noteStyleId !== "0") {
                    return true;
                }

                return !this.isGridSlotDuration(event.duration, stepsPerBar);
            });

            const events: ISbDmNoteEvent[] = filteredSnapshotEvents.map((event, index) => {
                // Extend grid-aligned sounding notes to absorb the rest gap that follows them
                // within their pulse. This stores the truthful effective duration in the data
                // model (a 16th hit followed by silence within a pulse becomes a quarter note
                // when no other events follow in that pulse). Polyrhythm-shaped events keep
                // their duration.
                let duration = event.duration;
                if (event.noteStyleId !== "0" && this.isGridMultipleDuration(duration, stepsPerBar)) {
                    const nextStart = filteredSnapshotEvents[index + 1]?.start ?? measureEnd;
                    const pulseEnd = this.pulseBoundaryAfter(event.start, pulseFraction);
                    const limit = compareFractions(nextStart, pulseEnd) < 0 ? nextStart : pulseEnd;
                    const extendedDuration = subtractFractions(limit, event.start);
                    if (compareFractions(extendedDuration, duration) > 0) {
                        duration = extendedDuration;
                    }
                }

                return {
                    id: getNewId(),
                    type: SbDmEntityType.NoteEvent,
                    measureNumber: measureSnapshot.number,
                    start: event.start,
                    duration,
                    track,
                    timing: this.timingForEventStart(event.start, measureSnapshot.number, stepsPerBar),
                    noteStyle: event.noteStyleId === "0"
                        ? undefined
                        : track.instrument.noteStyles[event.noteStyleId],
                };
            });

            return {
                id: this.getTrackMeasureId(track, measureSnapshot.number),
                type: SbDmEntityType.TrackMeasure,
                number: measureSnapshot.number,
                events,
            };
        });

        track.measures.splice(0, track.measures.length, ...newMeasures);
        track.publish();
    }

    private isGridSlotDuration(duration: IFraction, stepsPerBar: number): boolean {
        // duration === 1 / stepsPerBar  ⇔  numerator * stepsPerBar === denominator
        return duration.numerator * stepsPerBar === duration.denominator;
    }

    private isGridMultipleDuration(duration: IFraction, stepsPerBar: number): boolean {
        // duration === k / stepsPerBar (integer k ≥ 1) ⇔ numerator * stepsPerBar % denominator === 0
        return (duration.numerator * stepsPerBar) % duration.denominator === 0;
    }

    private parsePulseFraction(): IFraction {
        const [numerator, denominator] = this.timeParams.pulse.split("/").map(Number);
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
            return { numerator: 1, denominator: 4 };
        }

        return reduceFraction(numerator, denominator);
    }

    private pulseBoundaryAfter(start: IFraction, pulse: IFraction): IFraction {
        // Smallest k * pulse strictly greater than start, capped at the measure end (1/1).
        const startInPulses = (start.numerator * pulse.denominator) / (start.denominator * pulse.numerator);
        const nextK = Math.floor(startInPulses) + 1;
        const candidate = reduceFraction(nextK * pulse.numerator, pulse.denominator);
        const measureEnd: IFraction = { numerator: 1, denominator: 1 };

        return compareFractions(candidate, measureEnd) < 0 ? candidate : measureEnd;
    }

    private getStepsPerBar(): number {
        const { timings } = this.timeParams;
        let stepsPerBar = 0;
        for (const timing of timings) {
            if (timing.bar === 1 && timing.step > stepsPerBar) {
                stepsPerBar = timing.step;
            }
        }

        return stepsPerBar > 0 ? stepsPerBar : 1;
    }

    private timingForEventStart(start: { numerator: number; denominator: number; }, measureNumber: number,
        stepsPerBar: number): { bar: number; step: number; } {
        const stepIndex = (start.numerator * stepsPerBar) / start.denominator;
        const step = Math.floor(stepIndex) + 1;

        return { bar: measureNumber, step };
    }

    private getTrackMeasureId(track: Track, measureNumber: number): number {
        return (track.id * 10_000) + measureNumber;
    }
};
