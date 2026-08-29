/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import {
    SbDmEntityType, type ISbDmNoteEvent, type ISbDmTrack, type ISbDmTrackMeasure, type RealTime
} from "../core/ScoreBookDataModel.js";
import type { IFraction } from "../core/types/general.js";
import { requisitions } from "../supplement/Requisitions.js";
import type { TimeCoordinator } from "./TimeCoordinator.js";
import { Event, IInterval } from "./types.js";

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

        for (const event of this.track.notes) {
            const realTime = this.timeCoordinator.convertEventToRealTime(event);
            // Treat `end` as exclusive. Events exactly on this end are included in the following interval.
            if (realTime >= interval.end) {
                break;
            }

            if (realTime >= interval.start && event.audioData) {
                events.push(this.getAudioEvent(event, realTime));
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
        for (const measure of this.track.measures) {
            const runtimeEvents = this.resolveMeasureEvents(measure);
            measure.noteEvents.splice(0, measure.noteEvents.length, ...runtimeEvents);
        }
    };

    /**
     * Resolves the persisted events of a measure into runtime note events (style ids → audio data).
     *
     * @param measure The measure to resolve.
     * @returns The resolved note events, one per measure event.
     */
    private resolveMeasureEvents(measure: ISbDmTrackMeasure): ISbDmNoteEvent[] {
        const stepsPerBar = measure.meter.stepResolution;

        return measure.events.map((event, eventIndex) => {
            return {
                // Deterministic id, so note references (e.g. selection note ids) stay valid across
                // cache rebuilds. Encodes track id, measure number and the event index within the measure.
                id: (this.track.id * 1_000_000) + (measure.number * 1_000) + eventIndex,
                type: SbDmEntityType.NoteEvent,
                measureNumber: measure.number,
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
     *
     * @returns An audio event for the note.
     */
    private getAudioEvent = (event: ISbDmNoteEvent, realTime: RealTime): Event => {
        return {
            kind: "audio",
            event,
            realTime,
            audioBuffer: event.audioData!.audioBuffer!
        };
    };
}
