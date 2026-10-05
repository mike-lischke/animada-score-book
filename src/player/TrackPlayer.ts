/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import {
    SbDmEntityType, type ISbDmNoteEvent, type ISbDmTrack, type ISbDmTrackPiece, type RealTime
} from "../core/ScoreBookDataModel.js";
import type { IFraction } from "../core/types/general.js";
import { RangeArticulations } from "../core/RangeArticulations.js";
import { requisitions } from "../supplement/Requisitions.js";
import { PlaybackOrder } from "./PlaybackOrder.js";
import type { TimeCoordinator } from "./TimeCoordinator.js";
import { Event, IInterval } from "./types.js";

/** A note event and the time it sounds at, which the repeat barlines may move away from its written position. */
interface IPerformedEvent {
    event: ISbDmNoteEvent;
    realTime: RealTime;

    /** The dynamic level the note plays at, resolved from the track's hairpins and `f` markings. */
    dynamicsFactor: number;
}

/**
 * Coordinates playback for a single track.
 *
 * - Caches real-time positions for note events based on `timeCoordinator`.
 * - Produces audio events for time intervals.
 * - Keeps caches in sync with instrument load state, track edits, and timing changes.
 * - Provides a robust lifecycle via `onStop()` and `dispose()`.
 */
export class TrackPlayer {
    public readonly track: ISbDmTrack;

    private readonly timeCoordinator: TimeCoordinator;

    private disposed = false;

    /**
     * The events playback reads, one entry per sounding event of the performance: a measure contributes its own
     * resolved events, a simile the events of the measure it repeats, re-timed to its own position. A measure the
     * repeat barlines play more than once contributes its events once per pass, at the time that pass starts.
     * Kept apart from the measures' `noteEvents`, which stay the literal content the views draw and edit.
     */
    private readonly playbackEvents: IPerformedEvent[] = [];

    /**
     * Creates a player for the given track and sets up note timing caches and subscriptions.
     *
     * @param track The track view to observe and play.
     * @param timeCoordinator Converts score timings to real-time and provides loop/length context.
     */
    public constructor(track: ISbDmTrack, timeCoordinator: TimeCoordinator) {
        this.track = track;
        this.timeCoordinator = timeCoordinator;

        // Build runtime measure events immediately for UI/rendering, even if audio buffers are not loaded yet.
        this.rebuildEventCache();

        // Rebuild once instrument assets become ready.
        if (!this.track.instrument.state.initialized) {
            requisitions.register("instrumentLoaded", this.handleInstrumentLoaded);
        }

        // Subscriptions to keep internal caches in sync.
        requisitions.register("trackChanged", this.handleTrackChanged);
        requisitions.register("timeParamsChanged", this.handleTimeParamsChanged);
        requisitions.register("arrangementChanged", this.handleArrangementDestroy);
    }

    /**
     * Builds all audio events for the given real-time interval.
     * Returns an empty list if the instrument is not loaded or the player is disposed.
     *
     * @param interval The real-time interval for which to retrieve events. `end` is treated as exclusive.
     *
     * @returns Events occurring within the interval, ordered by time.
     */
    public getEvents = (interval: IInterval): Event[] => {
        if (this.disposed || !this.track.instrument.state.initialized) {
            return [];
        }

        const events: Event[] = [];

        for (const performed of this.playbackEvents) {
            // Treat `end` as exclusive. Events exactly on this end are included in the following interval.
            if (performed.realTime >= interval.end) {
                break;
            }

            if (performed.realTime >= interval.start && performed.event.audioData) {
                events.push(this.getAudioEvent(performed.event, performed.realTime, performed.dynamicsFactor));
            }
        }

        return events;
    };

    /** No-op; retained for the IEventSource interface. */
    public onStop = (): void => {
        /* nothing transient to reset */
    };

    /** Disposes all subscriptions and internal state. Safe to call multiple times. */
    public dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;

        // Unsubscribe from all sources and clear any pending instrument setup subscription.
        requisitions.unregister("instrumentLoaded", this.handleInstrumentLoaded);
        requisitions.unregister("trackChanged", this.handleTrackChanged);
        requisitions.unregister("timeParamsChanged", this.handleTimeParamsChanged);
        requisitions.unregister("arrangementChanged", this.handleArrangementDestroy);
    }

    /** Rebuilds the resolved runtime note events from the persisted measure events. */
    private rebuildEventCache = (): void => {
        const measures = this.track.measures;

        for (const measure of measures) {
            const runtimeEvents = this.resolveMeasureEvents(measure);
            measure.noteEvents.splice(0, measure.noteEvents.length, ...runtimeEvents);
        }

        this.rebuildPlaybackEvents(measures);
    };

    /**
     * Builds the playback list: the events of every bar, and for a simile the events of the bar it repeats,
     * re-timed to the simile's position. Bars the repeat barlines play more than once are expanded in play order,
     * each pass at the time it starts.
     *
     * @param measures The measures of the track, in measure order.
     */
    private rebuildPlaybackEvents(measures: readonly ISbDmTrackPiece[]): void {
        const sources = PlaybackOrder.sourcesOf(measures);
        const arrangement = this.track.arrangement;
        const order = PlaybackOrder.performedBars(arrangement.repeatBars ?? new Map(),
            arrangement.timeParams.length);
        const { secondsPerBar } = this.timeCoordinator.metrics;
        const events: IPerformedEvent[] = [];
        const markings = arrangement.rangeArticulations?.forTrack(this.track.id) ?? [];

        order.forEach((barNumber, index) => {
            const measure = measures[barNumber - 1];
            const barStart = index * secondsPerBar;
            const timeOf = (event: ISbDmNoteEvent): RealTime => {
                return barStart + ((secondsPerBar * event.start.numerator) / event.start.denominator);
            };

            // The dynamics a note sounds at follow the written measure it is written in, so a simile takes the
            // level of its own bar and every pass over a repeated bar plays its markings again.
            const factorOf = (event: ISbDmNoteEvent): number => {
                return RangeArticulations.dynamicsFactor(markings, { bar: measure.number, start: event.start });
            };

            const source = sources[barNumber - 1] ?? measure;
            if (source === measure) {
                for (const event of measure.noteEvents) {
                    events.push({ event, realTime: timeOf(event), dynamicsFactor: factorOf(event) });
                }

                return;
            }

            for (const event of source.noteEvents) {
                const repeated = {
                    ...event,
                    measure,
                    timing: this.timingForEventStart(event.start, barNumber, measure.meter.stepResolution),
                };

                events.push({ event: repeated, realTime: timeOf(event), dynamicsFactor: factorOf(event) });
            }
        });

        this.playbackEvents.splice(0, this.playbackEvents.length, ...events);
    }

    /**
     * Resolves the persisted events of a measure into runtime note events (style ids → audio data).
     *
     * @param measure The measure to resolve.
     * @returns The resolved note events, one per measure event.
     */
    private resolveMeasureEvents(measure: ISbDmTrackPiece): ISbDmNoteEvent[] {
        const stepsPerBar = measure.meter.stepResolution;

        return measure.events.map((event, eventIndex) => {
            return {
                // Deterministic id, so note references (e.g. selection note ids) stay valid across
                // cache rebuilds. Encodes track id, measure number and the event index within the measure.
                id: (this.track.id * 1_000_000) + (measure.number * 1_000) + eventIndex,
                type: SbDmEntityType.NoteEvent,
                measure,
                start: { ...event.start },
                duration: { ...event.duration },
                track: this.track,
                timing: this.timingForEventStart(event.start, measure.number, stepsPerBar),
                audioData: event.noteStyleId !== undefined
                    ? this.track.instrument.noteStyles[event.noteStyleId]
                    : undefined,
            };
        });
    }

    private timingForEventStart(start: IFraction, measureNumber: number, stepsPerBar: number): {
        bar: number;
        step: number;
    } {
        const stepIndex = (start.numerator * stepsPerBar) / start.denominator;
        const step = Math.floor(stepIndex) + 1;

        return { bar: measureNumber, step };
    }

    /**
     * Rebuilds event cache once the instrument's audio buffers are loaded, then unregisters.
     *
     * @param instrumentId The id of the instrument that finished loading.
     * @returns True if this player handles the given instrument.
     */
    private handleInstrumentLoaded = (instrumentId: number): Promise<boolean> => {
        if (instrumentId !== this.track.instrument.id) {
            return Promise.resolve(false);
        }

        this.rebuildEventCache();
        requisitions.unregister("instrumentLoaded", this.handleInstrumentLoaded);

        return Promise.resolve(true);
    };

    /**
     * Responds to structural changes in a track by rebuilding the event cache.
     *
     * @param trackId The id of the track that changed.
     * @returns True if this player handles the given track.
     */
    private handleTrackChanged = (trackId: number): Promise<boolean> => {
        if (trackId !== this.track.id) {
            return Promise.resolve(false);
        }

        this.rebuildEventCache();

        return Promise.resolve(true);
    };

    /**
     * Reacts to arrangement timing changes by rebuilding the event cache.
     *
     * @returns Always true.
     */
    private handleTimeParamsChanged = (): Promise<boolean> => {
        this.rebuildEventCache();

        return Promise.resolve(true);
    };

    /**
     * Disposes this player if its track was removed from the arrangement.
     *
     * @param arrangementId The id of the arrangement that changed.
     * @returns True if this player handles the given arrangement.
     */
    private handleArrangementDestroy = (arrangementId: number): Promise<boolean> => {
        if (arrangementId !== this.track.arrangement.id) {
            return Promise.resolve(false);
        }

        if (!this.track.arrangement.tracks.includes(this.track)) {
            this.dispose();
        }

        return Promise.resolve(true);
    };

    /**
     * Builds an audio event for a given note event at the provided real-time position.
     *
     * @param event The note event to play.
     * @param realTime The real-time position of the event.
     * @param dynamicsFactor The dynamic level the note plays at.
     *
     * @returns An audio event for the note.
     */
    private getAudioEvent = (event: ISbDmNoteEvent, realTime: RealTime, dynamicsFactor: number): Event => {
        return {
            kind: "audio",
            event,
            realTime,
            audioBuffer: event.audioData!.audioBuffer!,
            dynamicsFactor,
        };
    };
}
