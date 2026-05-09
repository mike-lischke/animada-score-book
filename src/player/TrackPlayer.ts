/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmNoteEvent, ISbDmTrack, RealTime } from "../core/ScoreBookDataModel.js";
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

    private cachedEventTimes: Array<{ event: ISbDmNoteEvent; realTime: RealTime; }> = [];

    private disposed = false;

    private setupNotes: (() => void) | null = null;

    /**
     * Creates a player for the given track and sets up note timing caches and subscriptions.
     *
     * @param track The track view to observe and play.
     * @param timeCoordinator Converts score timings to real-time and provides loop/length context.
     */
    public constructor(track: ISbDmTrack, timeCoordinator: TimeCoordinator) {
        this.track = track;
        this.timeCoordinator = timeCoordinator;

        // Initial event timing setup depending on instrument load state.
        if (this.track.instrument.state.initialized) {
            this.rebuildEventCache();
        } else {
            this.setupNotes = () => {
                this.rebuildEventCache();
                this.track.instrument.unsubscribe(this.setupNotes!);
                this.setupNotes = null;
            };
            this.track.instrument.subscribe(this.setupNotes);
        }

        // Subscriptions to keep internal caches in sync.
        this.track.subscribe(this.handleTrackChange);
        this.timeCoordinator.subscribe(this.handleTimeChange);
        this.track.arrangement.subscribe(this.destroySelfIfNeeded);
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

        for (const { event, realTime } of this.cachedEventTimes) {
            // Treat `end` as exclusive. Events exactly on this end are included in the following interval.
            if (realTime >= interval.end) {
                break;
            }

            if (realTime >= interval.start && event.noteStyle) {
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
        this.timeCoordinator.unsubscribe(this.handleTimeChange);
        this.track.unsubscribe(this.handleTrackChange);
        this.track.arrangement.unsubscribe(this.destroySelfIfNeeded);
        if (this.setupNotes) {
            this.track.instrument.unsubscribe(this.setupNotes);
            this.setupNotes = null;
        }
    }

    /** Rebuilds the cached array of note events and their real-time positions from the track's measures. */
    private rebuildEventCache = (): void => {
        this.cachedEventTimes = [];

        for (const measure of this.track.measures) {
            for (const event of measure.events) {
                this.cachedEventTimes.push({
                    event,
                    realTime: this.timeCoordinator.convertEventToRealTime(event),
                });
            }
        }

        // Sort ascending by real-time so getEvents can break early.
        this.cachedEventTimes.sort((a, b) => {
            return a.realTime - b.realTime;
        });
    };

    /** Responds to structural changes in the track by rebuilding the event cache. */
    private handleTrackChange = (): void => {
        this.rebuildEventCache();
    };

    /** Reacts to arrangement timing changes by rebuilding the event cache. */
    private handleTimeChange = (): void => {
        this.rebuildEventCache();
    };

    /** Stops reacting if the track is removed from its arrangement (unsubscribes). */
    private destroySelfIfNeeded = (): void => {
        if (!this.track.arrangement.tracks.includes(this.track)) {
            this.timeCoordinator.unsubscribe(this.handleTimeChange);
            this.track.arrangement.unsubscribe(this.destroySelfIfNeeded);
        }
    };

    /**
     * Builds an audio event for a given note event at the provided real-time position.
     *
     * @param event The note event to play.
     * @param realTime The real-time position of the event.
     * @returns An audio event for the note.
     */
    private getAudioEvent = (event: ISbDmNoteEvent, realTime: RealTime): Event => {
        return {
            kind: "audio",
            event,
            realTime,
            audioBuffer: event.noteStyle!.audioBuffer!
        };
    };
}
