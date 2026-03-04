/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import { AudioBufferPlayer } from "./AudioBufferPlayer.js";
import type {
    IAudioEvent, ICallbackEvent, EventEngineState, IEventSource, IInterval, IMuteEvent, MuteFilter,
} from "./types.js";

/**
 * The EventEngine is the heart of the Animada Score Book Player. It's responsible to trigger audio events at the
 * right time, and to provide a single source of truth for the current play time. It also provides a pub/sub interface
 * for clients to react to play state changes and to trigger callbacks at specific times.
 */
export class EventEngine extends Publisher {

    /** The AudioContext used for playback. */
    private readonly mainAudioContext = new AudioContext();

    /** We may want to swap this out for a different context in the future, for example when recording. */
    private audioContext: AudioContext = this.mainAudioContext;

    private eventSources: IEventSource[] = [];
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

    static #instance?: EventEngine;

    #state: EventEngineState = "stopped";

    /** Singleton: use `EventEngine.instance` to access the instance. */
    private constructor() {
        super();
    }

    public static get instance(): EventEngine {
        if (!EventEngine.#instance) {
            EventEngine.#instance = new EventEngine();
        }

        return EventEngine.#instance;
    }

    /**
     * Connect an event source to the engine. The engine will use the source to get events to play.
     * Typical event sources are arrangement players and metronoms.
     *
     * @param eventSource The event source to connect.
     */
    public connect(eventSource: IEventSource): void {
        this.eventSources.push(eventSource);
    }

    /**
     * Disconnect an event source from the engine. The engine will stop getting events from the source.
     *
     * @param eventSource The event source to disconnect.
     */
    public disconnect(eventSource: IEventSource): void {
        const index = this.eventSources.indexOf(eventSource);
        if (index !== -1) {
            this.eventSources.splice(index, 1);
        }
    }

    /**
     * Plays the entire score in an endless loop until `stop()` is called.
     */
    public async play(): Promise<void> {
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

        return 0;
    }

    public get state(): EventEngineState {
        return this.#state;
    }

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
