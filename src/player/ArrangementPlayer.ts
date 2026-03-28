/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import type { ISbDmArrangement, ISbDmTrack, ITiming, RealTime } from "../core/ScoreBookDataModel.js";
import { sleep } from "../core/utils.js";
import { AnimationEngine } from "../ui/AnimationEngine.js";
import { AudioBufferPlayer } from "./AudioBufferPlayer.js";
import { TimeCoordinator, type IScoreMetrics } from "./TimeCoordinator.js";
import { TrackPlayer } from "./TrackPlayer.js";
import {
    Event, ICallbackEvent, IInterval, ILoopInterval, type IAudioEvent, type IMuteEvent, type MuteFilter
} from "./types.js";

export type PlayerPlayState = "playing" | "stopped";

/**
 * Coordinates playback for an `IArrangementView` by aggregating events from all `TrackPlayer`s,
 * converting times across loops, and publishing UI-relevant updates (current timing and audible tracks).
 *
 * Lifecycle:
 * - Construct with an arrangement to subscribe to changes.
 * - Connect to an `EventEngine` as an event source.
 * - Call `dispose()` when replacing the arrangement to clean up subscriptions.
 */
export class ArrangementPlayer extends Publisher {
    public readonly arrangementView: ISbDmArrangement;

    public readonly trackPlayers: Map<ISbDmTrack, TrackPlayer> = new Map<ISbDmTrack, TrackPlayer>();
    public readonly audibleTrackPlayers: Map<ISbDmTrack, TrackPlayer> = new Map<ISbDmTrack, TrackPlayer>();

    public readonly audibleTrackPlayersPublisher: Publisher = new Publisher();

    public readonly animationEngine: AnimationEngine;

    private readonly timeCoordinator: TimeCoordinator;

    private timing: ITiming | null = null;
    private callbackEvents: ICallbackEvent[] | null = null;
    private disposed = false;

    /** The AudioContext used for playback. */
    private readonly mainAudioContext = new AudioContext();

    /** We swap this out for a different context, when recording. */
    private audioContext: BaseAudioContext = this.mainAudioContext;

    private nextIterationId?: ReturnType<typeof setTimeout>;
    private loopBoundaryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * We use the AudioContext (which always runs) to move forward in time.
     * The offset gives us a starting point in the AudioContext time which corresponds to 0 in our score time.
     */
    private offset = 0;

    /** The time point relative to the start of the offset, for which we have scheduled events. */
    private timeCovered = 0;

    /** The end of the last interval we played. Once `timeCovered` reaches this point, we are done with the interval. */
    private endOffset = 0;

    /** The part of the song we want to play. If not set, the entire song is played. */
    private currentInterval?: IInterval;

    /** Whether we want to start over, once the current interval ends. */
    private loopOnEnd = false;

    private scheduledAudioEvents: Array<{ audioEvent: IAudioEvent, audioBufferPlayer: AudioBufferPlayer; }> = [];
    private scheduledCallbackEvents: Array<{
        callbackEvent: ICallbackEvent,
        timeoutId: ReturnType<typeof setTimeout>;
    }> = [];
    private scheduledMuteEvents: Array<{ muteEvent: IMuteEvent, timeoutId: ReturnType<typeof setTimeout>; }> = [];

    #state: PlayerPlayState = "stopped";

    /**
     * Creates a player for the given arrangement and sets up all necessary subscriptions.
     *
     * @param arrangement The arrangement context to observe and play.
     */
    public constructor(arrangement: ISbDmArrangement) {
        super();
        this.arrangementView = arrangement;

        this.timeCoordinator = new TimeCoordinator(this.arrangementView.timeParams, this);

        this.updateTrackPlayers();
        this.updateAudibleTrackPlayers();
        this.arrangementView.subscribe(this.updateTrackPlayers);

        this.updateCallbackEvents();
        this.arrangementView.timeParams.subscribe(this.updateCallbackEvents);

        this.animationEngine = new AnimationEngine(this);
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

    public get scoreMetrics(): IScoreMetrics {
        return this.timeCoordinator.metrics;
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
        this.publish();
        for (const player of this.trackPlayers.values()) {
            player.onStop();
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

        // Unsubscribe from arrangement changes and the event engine.
        this.arrangementView.unsubscribe(this.updateTrackPlayers);
        this.arrangementView.timeParams.unsubscribe(this.updateCallbackEvents);

        // Unsubscribe from all track players and clear references.
        for (const player of this.trackPlayers.values()) {
            player.unsubscribe(this.updateAudibleTrackPlayers);
            player.dispose();
        }
        this.trackPlayers.clear();
        this.audibleTrackPlayers.clear();
    }

    /**
     * Play an interval specified in bars. Bar numbers begin with 1.
     * Playback will start at the beginning of `startBar` and stop after the given number of bars.
     * If `loop` is true the interval will be looped.
     *
     * @param startBar The 1-based bar number to start playback at.
     * @param numberOfBars The number of bars to play.
     * @param loop Whether to loop the specified interval continuously until stopped.
     */
    public playBars(startBar: number, numberOfBars: number, loop = false): void {
        const startTime = this.timeCoordinator.convertToRealTime({ bar: startBar, step: 1 });
        const endTime = this.timeCoordinator.convertToRealTime({ bar: startBar + numberOfBars, step: 1 });
        this.play({ start: startTime, end: endTime }, loop);
    }

    /**
     * Plays the entire score or the specified interval in real time.
     *
     * @param interval An optional interval to play instead of the entire score.
     * @param loop Whether to start over when the end of the interval is reached.
     */
    public play(interval?: IInterval, loop = false): void {
        if (this.disposed) {
            return;
        }

        void this.ensureContextIsRunning().then(() => {
            // If already playing something, stop it first to clear schedules.
            if (this.nextIterationId) {
                this.stop();
            }

            // Clear any interval restriction and start from 0.
            this.#state = "playing";
            this.currentInterval = interval;
            this.loopOnEnd = loop;

            // If an interval is given, pretend we started earlier by setting the offset back in time.
            // We never access time before the current audio time.
            this.offset = this.audioContext.currentTime - (interval?.start ?? 0);
            this.endOffset = interval?.end ?? this.timeCoordinator.metrics.realTimeLength;

            // Pretend we have covered all events before the interval start.
            this.timeCovered = interval?.start ?? 0;

            this.iteration();
            this.publish();
        });
    }

    /** Stops current playback. */
    public stop(): void {
        if (this.disposed) {
            return;
        }

        this.timeCoordinator.reset();

        if (this.nextIterationId) {
            clearTimeout(this.nextIterationId);
            if (this.loopBoundaryTimeoutId !== null) {
                clearTimeout(this.loopBoundaryTimeoutId);
                this.loopBoundaryTimeoutId = null;
            }
            this.clearScheduledEvents();

            this.#state = "stopped";
            this.nextIterationId = undefined;

            this.callOnStopCallbacks();
            this.publish();
        }
    }

    public get currentTime(): number {
        if (this.#state === "playing") {
            return this.audioContext.currentTime - this.offset;
        }

        return -1;
    }

    public get state(): PlayerPlayState {
        return this.#state;
    }

    public renderToBlob = async (): Promise<Blob> => {
        this.currentInterval = undefined;
        const songDuration = this.timeCoordinator.metrics.realTimeLength;

        // Load MP3 export dependencies only when the user requests an export.
        const { MP3Export } = await import("../supplement/MP3Export.js");

        const scheduleSong = (ctx: BaseAudioContext): void => {
            this.audioContext = ctx as AudioContext;
            this.offset = this.audioContext.currentTime;
            this.clearScheduledEvents();

            // Offline rendering must pre-schedule all audio events before startRendering() begins.
            this.scheduleAudioEventsForOfflineRender(songDuration);
        };

        const mp3Exporter = new MP3Export();
        try {
            // Add 1 second tail to allow the last notes to finish playing (important for resonant instruments).
            return await mp3Exporter.exportSongToMp3(songDuration + 1, scheduleSong);
        } finally {
            this.audioContext = this.mainAudioContext;
            this.clearScheduledEvents();
        }
    };

    /**
     * The loop is a setTimeout loop.
     * It gets and schedules events in an upcoming time interval.
     * We make sure never to request any time we've requested before.
     */
    private iteration(): void {
        // We look for events in a small interval in the future (0.25s) to give ourselves time to schedule them.
        const intervalEnd = Math.min(this.currentTime + 0.25, this.endOffset);
        const interval: IInterval = { start: this.timeCovered, end: intervalEnd };

        // Stop playback if the covered time has reached the end of the current interval.
        if (interval.start >= this.endOffset) {
            // We stop playback here, but wait for a moment to let the last events fire.
            void sleep(80).then(() => {
                this.stop();
                // If we were supposed to loop, start again immediately.
                if (this.loopOnEnd) {
                    this.play(this.currentInterval, true);
                }
            });

            return;
        }

        // Get and schedule events in the upcoming interval, then schedule the next loop iteration.
        this.scheduleEvents(interval);

        this.nextIterationId = setTimeout(() => {
            this.iteration();
        }, 125); // Schedule the next iteration after 125ms.
        this.timeCovered = intervalEnd;
    }

    /**
     * Returns all events within the given interval, including audio, mute, and callback events.
     *
     * @param interval The real-time interval [start, end) to query.
     * @returns A list of events sorted by their real-time occurrence.
     */
    private getEvents(interval: IInterval): Event[] {
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
            if (!this.arrangementView.tracks.includes(trackPlayer.track)) {
                trackPlayer.dispose();
                trackPlayer.unsubscribe(this.updateAudibleTrackPlayers);
                this.trackPlayers.delete(trackPlayer.track);
                this.audibleTrackPlayers.delete(trackPlayer.track);
                somethingChanged = true;
            }
        }

        for (const track of this.arrangementView.tracks) {
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
        this.callbackEvents = this.arrangementView.timeParams.timings.map((timing) => {
            return {
                realTime: this.timeCoordinator.convertToRealTime(timing),
                callback: () => {
                    this.timing = timing;
                    this.publish();
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
    private calculateAudibleTrackPlayers(trackPlayers: Map<ISbDmTrack, TrackPlayer>): TrackPlayer[] {
        const soloedTracksPlayers: TrackPlayer[] = [];
        const unmutedTracksPlayers: TrackPlayer[] = [];

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

    private async ensureContextIsRunning(): Promise<void> {
        if (this.audioContext instanceof AudioContext) {
            if (this.audioContext.state !== "running") {
                await this.audioContext.resume();
            }

            if (this.audioContext.state !== "running") {
                throw new Error("Couldn't start the AudioContext");
            }
        }
    }

    private scheduleEvents(interval: IInterval): void {
        this.getEvents(interval).forEach((event) => {
            if ("audioBuffer" in event) {
                this.scheduleAudioEvent(event);
            }

            if ("callback" in event) {
                this.scheduleCallbackEvent(event);
            }

            if ("muteFilter" in event) {
                this.scheduleMuteEvent(event);
            }
        });

        // Also add metronome events.
    }

    /**
     * When rendering to a Blob, we can directly schedule all events in one go.
     *
     * @param songDuration The duration of the song in seconds, used to determine how long to schedule events for.
     */
    private scheduleAudioEventsForOfflineRender(songDuration: number): void {
        let intervalStart = 0;
        const muteEvents: IMuteEvent[] = [];

        // Use the same look-ahead chunk size as live playback, but schedule synchronously.
        // We could schedule all events in one go, but this is more memory efficient for long songs and doesn't
        // add overhead in an offline context. Offline rendering is like 10x faster than real-time, so
        // the scheduling overhead is negligible even with many events.
        while (intervalStart < songDuration) {
            const intervalEnd = Math.min(intervalStart + 0.25, songDuration);
            const interval: IInterval = { start: intervalStart, end: intervalEnd };

            this.getEvents(interval).forEach((event) => {
                if ("audioBuffer" in event) {
                    this.scheduleAudioEvent(event);
                }

                if ("muteFilter" in event) {
                    muteEvents.push(event);
                }
            });

            intervalStart = intervalEnd;
        }

        // Apply all mute events immediately after audio events are scheduled.
        // In offline rendering, we don't use setTimeout; we just apply the mute directly.
        for (const muteEvent of muteEvents) {
            this.muteUsingFilter(muteEvent.muteFilter);
        }
    }

    private scheduleAudioEvent(audioEvent: IAudioEvent): void {
        const audioBufferPlayer = new AudioBufferPlayer(audioEvent.audioBuffer, this.audioContext,
            audioEvent.realTime + this.offset, this.arrangementView.mainVolume / 100);
        const audioEventReference = { audioEvent, audioBufferPlayer };
        this.scheduledAudioEvents.push(audioEventReference);

        // Event listener will fire on context.suspend() as well as audio buffer finishing.
        // The 'stop' button wants to clear audio that's in mid-play.
        audioBufferPlayer.onEnded(() => {
            this.stopAudioAndUnschedule(audioEventReference);
        });
    }

    private stopAudioAndUnschedule(
        audioEventReference: { audioEvent: IAudioEvent, audioBufferPlayer: AudioBufferPlayer; }
    ): void {
        audioEventReference.audioBufferPlayer.stop();
        const scheduleIndex = this.scheduledAudioEvents.indexOf(audioEventReference);
        if (scheduleIndex !== -1) {
            this.scheduledAudioEvents.splice(scheduleIndex, 1);
        }
    }

    private scheduleCallbackEvent(callbackEvent: ICallbackEvent): void {
        const ms = Math.max(this.getMsFromNow(callbackEvent.realTime), 0);
        const callbackEventReference = {
            callbackEvent,
            timeoutId: setTimeout(() => {
                callbackEvent.callback();
                this.removeFromCallbackSchedule(callbackEventReference);
            }, ms)
        };

        this.scheduledCallbackEvents.push(callbackEventReference);
    }

    private removeFromCallbackSchedule(
        callbackEventReference: { callbackEvent: ICallbackEvent, timeoutId: ReturnType<typeof setTimeout>; }
    ): void {
        const scheduleIndex = this.scheduledCallbackEvents.indexOf(callbackEventReference);
        if (scheduleIndex !== -1) {
            this.scheduledCallbackEvents.splice(scheduleIndex, 1);
        }
        // Currently no need to clearTimeout on callback events
        // They are only getting unscheduled by this function after they fire
        // They are also getting unscheduled by clearScheduledEvents, which does clearTimeout
    }

    private scheduleMuteEvent(muteEvent: IMuteEvent): void {
        const ms = Math.max(this.getMsFromNow(muteEvent.realTime), 0);
        const scheduledMuteEvent = {
            muteEvent,
            timeoutId: setTimeout(() => {
                this.muteUsingFilter(muteEvent.muteFilter);
                this.removeFromMuteSchedule(scheduledMuteEvent);
            }, ms)
        };

        this.scheduledMuteEvents.push(scheduledMuteEvent);
    }

    private removeFromMuteSchedule(muteEventReference: {
        muteEvent: IMuteEvent,
        timeoutId: ReturnType<typeof setTimeout>;
    }): void {
        const scheduleIndex = this.scheduledMuteEvents.indexOf(muteEventReference);
        if (scheduleIndex !== -1) {
            this.scheduledMuteEvents.splice(scheduleIndex, 1);
        }
    }

    private clearScheduledEvents(): void {
        this.scheduledAudioEvents.forEach(({ audioBufferPlayer }) => {
            audioBufferPlayer.stop();
        });
        this.scheduledCallbackEvents.forEach(({ timeoutId }) => {
            clearTimeout(timeoutId);
        });
        this.scheduledMuteEvents.forEach(({ timeoutId }) => {
            clearTimeout(timeoutId);
        });
        this.scheduledAudioEvents.splice(0);
        this.scheduledCallbackEvents.splice(0);
        this.scheduledMuteEvents.splice(0);
    }

    private callOnStopCallbacks(): void {
        this.onStop();
    }

    private getMsFromNow(time: number): number {
        return (time - this.currentTime) * 1000;
    }

    private muteUsingFilter(muteFilter: MuteFilter): void {
        this.scheduledAudioEvents
            .filter((audioEventReference) => {
                return this.hasStarted(audioEventReference) && muteFilter(audioEventReference.audioEvent);
            })
            .forEach((ref) => {
                this.stopAudioAndUnschedule(ref);
            });
    }

    private hasStarted(
        audioEventReference: { audioEvent: IAudioEvent, audioBufferPlayer: AudioBufferPlayer; }
    ): boolean {
        return audioEventReference.audioEvent.realTime <= this.currentTime;
    }
}
