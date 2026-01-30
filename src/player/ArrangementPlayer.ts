/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import type { ISbDmTrack, ITiming, RealTime } from "../core/ScoreBookDataModel.js";
import type { IArrangementView } from "../core/types/general.js";
import { TimeCoordinator } from "./TimeCoordinator.js";
import { TrackPlayer } from "./TrackPlayer.js";
import { Event, IArrangementPlayer, ICallbackEvent, IInterval, ILoopInterval, ITrackPlayer } from "./types.js";

/**
 * Coordinates playback for an `IArrangementView` by aggregating events from all `ITrackPlayer`s,
 * converting times across loops, and publishing UI-relevant updates (current timing and audible tracks).
 *
 * Lifecycle:
 * - Construct with an arrangement to subscribe to changes.
 * - Connect to an `IEventEngine` as an event source.
 * - Call `dispose()` when replacing the arrangement to clean up subscriptions.
 */
export class ArrangementPlayer extends Publisher implements IArrangementPlayer {
    public readonly arrangement: IArrangementView;

    public readonly trackPlayers: Map<ISbDmTrack, ITrackPlayer> = new Map<ISbDmTrack, ITrackPlayer>();
    public readonly audibleTrackPlayers: Map<ISbDmTrack, ITrackPlayer> = new Map<ISbDmTrack, ITrackPlayer>();

    public readonly currentTimingPublisher: Publisher = new Publisher();
    public readonly audibleTrackPlayersPublisher: Publisher = new Publisher();

    private readonly timeCoordinator: TimeCoordinator;

    private timing: ITiming | null = null;
    private callbackEvents: ICallbackEvent[] | null = null;
    private disposed = false;

    /**
     * Creates a player for the given arrangement and sets up all necessary subscriptions.
     *
     * @param arrangement The arrangement context to observe and play.
     */
    public constructor(arrangement: IArrangementView) {
        super();
        this.arrangement = arrangement;

        this.timeCoordinator = new TimeCoordinator(this.arrangement.timeParams);

        this.updateTrackPlayers();
        this.updateAudibleTrackPlayers();
        this.arrangement.subscribe(this.updateTrackPlayers);

        this.updateCallbackEvents();
        this.arrangement.timeParams.subscribe(this.updateCallbackEvents);
    }

    /**
     * The most recent `ITiming` reached during playback. `null` when stopped or before playback.
     * Updated via callback events generated from `arrangement.timeParams.timings`.
     *
     * @returns The current timing or `null` if none.
     */
    public get currentTiming(): ITiming | null {
        return this.timing;
    }

    /**
     * Converts a real-time position to loop-relative progress.
     *
     * @param realTime A time position in seconds within the overall arrangement space.
     * @returns A value in [0, 1] indicating progress through the current loop.
     */
    public convertToLoopProgress(realTime: RealTime): number {
        if (this.disposed) {
            return 0;
        }

        return this.timeCoordinator.convertToLoopProgress(realTime);
    }

    /**
     * Stops playback-related state and notifies subscribers.
     * Resets `currentTiming` and informs all track players via `onStop()`.
     */
    public onStop = (): void => {
        this.timing = null;
        this.currentTimingPublisher.publish();
        for (const player of this.trackPlayers.values()) {
            player.onStop?.();
        }
    };

    /**
     * Disposes internal subscriptions and references to avoid leaks when replacing the arrangement.
     * Safe to call before constructing a new `ArrangementPlayer` for a different arrangement.
     */
    public dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        // Stop any ongoing play state.
        this.onStop();

        // Unsubscribe from arrangement changes.
        this.arrangement.unsubscribe(this.updateTrackPlayers);
        this.arrangement.timeParams.unsubscribe(this.updateCallbackEvents);

        // Unsubscribe from all track players and clear references.
        for (const player of this.trackPlayers.values()) {
            player.unsubscribe(this.updateAudibleTrackPlayers);
            player.dispose();
        }
        this.trackPlayers.clear();
        this.audibleTrackPlayers.clear();
    }

    /**
     * Returns all events within the given interval, including audio, mute, and callback events.
     * Intervals spanning loops are split via `TimeCoordinator` and per-loop events are converted to audio time.
     *
     * @param interval The real-time interval [start, end) to query.
     * @returns A list of events sorted by their real-time occurrence.
     */
    public getEvents = (interval: IInterval): Event[] => {
        if (this.disposed) {
            return [];
        }
        const events: Event[] = [];
        const loopIntervals: ILoopInterval[] = this.timeCoordinator.convertToLoopIntervals(interval);

        loopIntervals.forEach((loopInterval) => {
            const { loopNumber } = loopInterval;
            this.audibleTrackPlayers.forEach((trackPlayer) => {
                trackPlayer.getEvents(loopInterval).forEach((event) => {
                    return events.push({
                        ...event,
                        realTime: this.timeCoordinator.convertToAudioTime(event.realTime, loopNumber)
                    });
                });
            });
        });

        events.push(...this.getCallbackEvents(interval));

        // Ensure deterministic ordering across tracks and loops.
        events.sort((a, b) => {
            return a.realTime - b.realTime;
        });

        return events;
    };

    /**
     * Builds callback events for a given interval across loops, updating `currentTiming` when fired.
     *
     * @param interval The real-time interval [start, end) to query.
     * @returns Callback events aligned to audio time within loop context.
     */
    private getCallbackEvents = (interval: IInterval): ICallbackEvent[] => {
        const eventsInInterval: ICallbackEvent[] = [];
        const loopIntervals: ILoopInterval[] = this.timeCoordinator.convertToLoopIntervals(interval);

        loopIntervals.forEach(({ loopNumber, start, end }) => {
            this.callbackEvents?.filter(({ realTime }) => {
                return realTime >= start && realTime < end;
            }).forEach((audioEvent) => {
                return eventsInInterval.push({
                    ...audioEvent,
                    realTime: this.timeCoordinator.convertToAudioTime(audioEvent.realTime, loopNumber)
                });
            });
        });

        return eventsInInterval;
    };

    /**
     * Synchronizes `trackPlayers` with the arrangement's tracks (add/remove),
     * maintains subscription to audible updates, and publishes structural changes.
     */
    private updateTrackPlayers = (): void => {
        let somethingChanged = false;

        for (const trackPlayer of this.trackPlayers.values()) {
            if (!this.arrangement.tracks.includes(trackPlayer.track)) {
                trackPlayer.unsubscribe(this.updateAudibleTrackPlayers);
                this.trackPlayers.delete(trackPlayer.track);
                this.audibleTrackPlayers.delete(trackPlayer.track);
                somethingChanged = true;
            }
        }

        for (const track of this.arrangement.tracks) {
            if (!this.trackPlayers.get(track)) {
                const trackPlayer = new TrackPlayer(track, this.timeCoordinator);
                this.trackPlayers.set(track, trackPlayer);
                trackPlayer.subscribe(this.updateAudibleTrackPlayers);
                somethingChanged = true;
            }
        }

        if (somethingChanged) {
            this.updateAudibleTrackPlayers();
            this.publish();
        }
    };

    /**
     * Recomputes timing-based callback events from `arrangement.timeParams.timings`.
     * Publishing `currentTiming` occurs when those callbacks fire during playback.
     */
    private updateCallbackEvents = (): void => {
        this.callbackEvents = this.arrangement.timeParams.timings.map((timing) => {
            return {
                realTime: this.timeCoordinator.convertToRealTime(timing),
                callback: () => {
                    this.timing = timing;
                    this.currentTimingPublisher.publish();
                },
                identifier: timing
            };
        });
    };

    /**
     * Recalculates the set of audible track players based on `solo`/`mute` state
     * and publishes when changes occur.
     */
    private updateAudibleTrackPlayers = (): void => {
        const calculatedAudibleTrackPlayers = this.calculateAudibleTrackPlayers(this.trackPlayers);

        let somethingChanged = false;

        for (const [view, track] of this.trackPlayers) {
            const shouldBeAudible = calculatedAudibleTrackPlayers.includes(track);
            const current = this.audibleTrackPlayers.get(view);
            if (shouldBeAudible) {
                if (current !== track) {
                    this.audibleTrackPlayers.set(view, track);
                    somethingChanged = true;
                }
            } else if (current !== undefined) {
                this.audibleTrackPlayers.delete(view);
                somethingChanged = true;
            }
        }

        if (somethingChanged) {
            this.audibleTrackPlayersPublisher.publish();
        }
    };

    /**
     * Filters track players to those that are audible. If any track is soloed, only soloed tracks are audible;
     * otherwise all unmuted tracks are audible.
     *
     * @param trackPlayers The complete set of track players to consider.
     * @returns The list of audible track players in their current state.
     */
    private calculateAudibleTrackPlayers(trackPlayers: Map<ISbDmTrack, ITrackPlayer>): ITrackPlayer[] {
        const soloedTracksPlayers: ITrackPlayer[] = [];
        const unmutedTracksPlayers: ITrackPlayer[] = [];

        trackPlayers.forEach((trackPlayer) => {
            if (trackPlayer.soloMute === "solo") {
                soloedTracksPlayers.push(trackPlayer);
            } else if (trackPlayer.soloMute === null) {
                unmutedTracksPlayers.push(trackPlayer);
            }
        });

        if (soloedTracksPlayers.length) {
            return soloedTracksPlayers;
        }

        return unmutedTracksPlayers;
    };
}
