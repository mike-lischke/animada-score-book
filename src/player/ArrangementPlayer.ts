/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import type { ISbDmTrack, ITiming, RealTime } from "../core/ScoreBookDataModel.js";
import type { IArrangement } from "../core/types/general.js";
import { AnimationEngine } from "../ui/AnimationEngine.js";
import { AudioBufferPlayer } from "./AudioBufferPlayer.js";
import { TimeCoordinator, type IScoreMetrics } from "./TimeCoordinator.js";
import { TrackPlayer } from "./TrackPlayer.js";
import {
    Event, ICallbackEvent, IInterval, ILoopInterval, type IAudioEvent, type IEventSource, type IMuteEvent,
    type MuteFilter
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
    public readonly arrangementView: Readonly<IArrangement>;

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

    /** We may want to swap this out for a different context in the future, for example when recording. */
    private audioContext: AudioContext = this.mainAudioContext;

    private eventSources: IEventSource[];
    private nextIterationId: number | null = null;
    private loopBoundaryTimeoutId: number | null = null;

    /**
     * We use the AudioContext (which always runs) to move forward in time.
     * The offset gives us a starting point in the AudioContext time which corresponds to 0 in our score time.
     */
    private offset = 0;

    /** The end of the last interval we played. */
    private timeCovered = 0;

    // When set, playback is limited to this interval. If `intervalLoop` is true
    // the interval is repeated, otherwise playback stops at its end.
    private currentInterval: IInterval | null = null;
    private intervalLoop = false;
    private scheduledAudioEvents: Array<{ audioEvent: IAudioEvent, audioBufferPlayer: AudioBufferPlayer; }> = [];
    private scheduledCallbackEvents: Array<{ callbackEvent: ICallbackEvent, timeoutId: number; }> = [];
    private scheduledMuteEvents: Array<{ muteEvent: IMuteEvent, timeoutId: number; }> = [];

    #state: PlayerPlayState = "stopped";

    /**
     * Creates a player for the given arrangement and sets up all necessary subscriptions.
     *
     * @param arrangement The arrangement context to observe and play.
     */
    public constructor(arrangement: Readonly<IArrangement>) {
        super();
        this.arrangementView = arrangement;

        this.timeCoordinator = new TimeCoordinator(this.arrangementView.timeParams);

        this.updateTrackPlayers();
        this.updateAudibleTrackPlayers();
        this.arrangementView.subscribe(this.updateTrackPlayers);

        this.updateCallbackEvents();
        this.arrangementView.timeParams.subscribe(this.updateCallbackEvents);

        this.eventSources = [this];
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
        this.eventSources = [];
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
     * Returns all events within the given interval, including audio, mute, and callback events.
     * Intervals spanning loops are split via `TimeCoordinator` and per-loop events are converted to audio time.
     *
     * @param interval The real-time interval [start, end) to query.
     * @returns A list of events sorted by their real-time occurrence.
     */
    public getEvents(interval: IInterval): Event[] {
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
     * Play an interval specified in bars. Bar numbers begin with 1.
     * Playback will start at the beginning of `startBar` and stop after the given number of bars.
     * If `loop` is true the interval will be looped.
     *
     * @param startBar The 1-based bar number to start playback at.
     * @param numberOfBars The number of bars to play.
     * @param loop Whether to loop the specified interval continuously until stopped.
     *
     * @returns A promise that resolves when playback starts.
     */
    public async playBars(startBar: number, numberOfBars: number, loop = false): Promise<void> {
        const startTime = this.timeCoordinator.convertToRealTime({ bar: startBar, step: 1 });
        const endTime = this.timeCoordinator.convertToRealTime({ bar: startBar + numberOfBars, step: 1 });
        await this.playInterval({ start: startTime, end: endTime }, loop);
    }

    /**
     * Register an event source to the engine. The engine will use the source to get events to play.
     * Typical event sources are arrangement players and metronomes.
     *
     * @param eventSource The event source to register.
     */
    public addEventSource(eventSource: IEventSource): void {
        if (!this.eventSources.includes(eventSource)) {
            this.eventSources.push(eventSource);
        }
    }

    /**
     * Disconnect an event source from the engine. The engine will stop getting events from the source.
     *
     * @param eventSource The event source to disconnect.
     */
    public removeEventSource(eventSource: IEventSource): void {
        const index = this.eventSources.indexOf(eventSource);
        if (index !== -1) {
            this.eventSources.splice(index, 1);
        }
    }

    /**
     * Plays the entire score in an endless loop until `stop()` is called.
     */
    public async play(): Promise<void> {
        if (this.disposed) {
            return;
        }

        await this.ensureContextIsRunning();

        // If already playing something, stop it first to clear schedules.
        if (this.nextIterationId !== null) {
            this.stop();
        }

        // Clear any interval restriction and start from 0.
        this.#state = "playing";
        this.currentInterval = null;
        this.intervalLoop = false;
        this.offset = this.audioContext.currentTime;
        this.timeCovered = 0;

        this.iteration();
        this.publish();
    }

    /**
     * Plays a specific interval of the score. If `loop` is true the interval is
     * repeated until `stop()` is called, otherwise the engine stops when the
     * interval end is reached.
     *
     * @param interval The interval to play, in seconds.
     * @param loop Whether to loop the interval or stop at its end.
     */
    public async playInterval(interval: IInterval, loop = false): Promise<void> {
        await this.ensureContextIsRunning();

        // If already playing something, stop it first to clear schedules.
        if (this.nextIterationId !== null) {
            this.stop();
        }

        this.#state = "playing";
        this.currentInterval = interval;
        this.intervalLoop = loop;

        // Map audio context time to the requested interval start.
        this.offset = this.audioContext.currentTime;
        this.timeCovered = interval.start;

        // Get the engine going.
        this.iteration();
        this.publish();
    }

    /** Stops current playback. */
    public stop(): void {
        if (this.disposed) {
            return;
        }

        this.timeCoordinator.reset();

        if (this.nextIterationId !== null) {
            clearTimeout(this.nextIterationId);
            if (this.loopBoundaryTimeoutId !== null) {
                clearTimeout(this.loopBoundaryTimeoutId);
                this.loopBoundaryTimeoutId = null;
            }
            this.clearScheduledEvents();

            this.#state = "stopped";
            this.nextIterationId = null;
            this.timeCovered = 0;
            this.currentInterval = null;
            this.intervalLoop = false;

            this.callOnStopCallbacks();
            this.publish();
        }
    }

    public getTime(): number {
        if (this.#state === "playing") {
            // Adding the current interval start to the current time compensates for the the fact that
            // we started playing from the middle of the AudioContext time when an interval was set.
            return this.audioContext.currentTime - this.offset + (this.currentInterval?.start ?? 0);
        }

        return -1;
    }

    public get state(): PlayerPlayState {
        return this.#state;
    }

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
        if (this.audioContext.state !== "running") {
            await this.audioContext.resume();
        }

        if (this.audioContext.state !== "running") {
            throw new Error("Couldn't start the AudioContext");
        }
    }

    /**
     * The loop is a setTimeout loop.
     * It gets and schedules events in an upcoming time interval.
     * We make sure never to request any time we've requested before.
     */
    private iteration(): void {
        // We look for events in a small interval in the future (0.25s) to give ourselves time to schedule them.
        const intervalEnd = this.getTime() + 0.25;
        const interval: IInterval = { start: this.timeCovered, end: intervalEnd };

        // Get and schedule events in the upcoming interval, then schedule the next loop iteration.
        if (interval.start < interval.end) {
            this.scheduleEvents(interval);
        }

        this.nextIterationId = setTimeout(() => {
            this.iteration();
        }, 125); // Schedule the next iteration after 125ms.
        this.timeCovered = Math.min(intervalEnd, this.currentInterval?.end ?? Infinity);

        // If we're playing an interval and we've reached its end, either loop
        // back to the start or stop playback. When looping we must also clear
        // any audio or callbacks scheduled for the previous iteration so that
        // audio which would otherwise spill past the interval end is cut off.
        if (this.currentInterval && this.timeCovered >= this.currentInterval.end) {
            if (this.intervalLoop) {
                // Instead of immediately adjusting offset and clearing events
                // (which can cause UI/time mismatches), schedule the actual
                // loop transition to occur exactly when the AudioContext hits
                // the loop boundary. Compute the audio-time for the boundary
                // (offset + intervalDuration) and schedule the transition for
                // that moment.
                const intervalDuration = this.currentInterval.end - this.currentInterval.start;
                const audioBoundaryTime = this.offset + intervalDuration; // in audioContext time
                const msUntilBoundary = (audioBoundaryTime - this.audioContext.currentTime) * 1000;

                // Clear any previously scheduled boundary handler.
                if (this.loopBoundaryTimeoutId !== null) {
                    clearTimeout(this.loopBoundaryTimeoutId);
                    this.loopBoundaryTimeoutId = null;
                }

                const safeMs = Math.max(msUntilBoundary, 0);
                this.loopBoundaryTimeoutId = setTimeout(() => {
                    // At the exact audio boundary: clear scheduled events,
                    // advance offset to the next loop and reset timeCovered so
                    // playback continues from the interval start.
                    this.clearScheduledEvents();
                    this.offset += intervalDuration;
                    this.timeCovered = this.currentInterval!.start;
                    this.loopBoundaryTimeoutId = null;
                }, safeMs);
            } else {
                this.stop();
            }
        }
    }

    private scheduleEvents(interval: IInterval): void {
        this.eventSources.forEach((eventSource) => {
            eventSource.getEvents(interval).forEach((event) => {
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
        });
    }

    private scheduleAudioEvent(audioEvent: IAudioEvent): void {
        const actualOffset = this.offset - (this.currentInterval ? this.currentInterval.start : 0);
        const audioBufferPlayer = new AudioBufferPlayer(audioEvent.audioBuffer, this.audioContext,
            audioEvent.realTime + actualOffset);
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
        callbackEventReference: { callbackEvent: ICallbackEvent, timeoutId: number; }
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

    private removeFromMuteSchedule(muteEventReference: { muteEvent: IMuteEvent, timeoutId: number; }): void {
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
        this.eventSources.forEach(({ onStop }) => {
            return (onStop?.());
        });
    }

    private getMsFromNow(time: number): number {
        return (time - this.getTime()) * 1000;
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
        return audioEventReference.audioEvent.realTime <= this.getTime();
    }
}
