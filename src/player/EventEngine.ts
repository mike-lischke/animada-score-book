/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import { AudioBufferPlayer } from "./AudioBufferPlayer.js";
import type {
    AudioEvent, ICallbackEvent, IEventEngine, EventEngineState, IEventSource, IInterval, IMuteEvent, MuteFilter
} from "./types.js";

// The core of the Animada Score Book Player is the EventEngine
// It plays audio and fires callbacks at the right time
// Playing audio boils down to the WebAudio API, so we must warp our design around that

const lookahead = 0.25; // (s) Look 250ms ahead for events
const loopFrequency = 125; // (ms) Check for upcoming events every 125ms

export class EventEngine extends Publisher implements IEventEngine {
    private readonly audioContext: AudioContext;

    private eventSources: IEventSource[] = [];
    private nextIterationId: number | null = null;
    private _state: EventEngineState = "stopped";

    // We use the AudioContext to move forward in time
    // But it always moves forward, even when the EventEngine is stopped
    // This means the AudioContext is way ahead in time
    // So we maintain an offset to calculate EventEngine time from AudioContext time
    private offset = 0;

    // We ask for events in time-intervals, but never ask for time we've already covered
    private timeCovered = 0;

    private scheduledAudioEvents: Array<{ audioEvent: AudioEvent, audioBufferPlayer: AudioBufferPlayer; }> = [];
    private scheduledCallbackEvents: Array<{ callbackEvent: ICallbackEvent, timeoutId: number; }> = [];
    private scheduledMuteEvents: Array<{ muteEvent: IMuteEvent, timeoutId: number; }> = [];

    public constructor() {
        super();
        this.audioContext = new AudioContext();
    }

    public connect(eventSource: IEventSource): void {
        this.eventSources.push(eventSource);
    }

    public disconnect(eventSource: IEventSource): void {
        const index = this.eventSources.indexOf(eventSource);
        if (index !== -1) {
            this.eventSources.splice(index, 1);
        }
    }

    public async play(): Promise<void> {
        await this.ensureContextIsRunning();
        if (this.nextIterationId === null) {
            this.offset = this.audioContext.currentTime; // should always have timeCovered = 0 at this point
            this.loop();
            this._state = "playing";
            this.publish();
        }
    }

    public stop(): void {
        if (this.nextIterationId !== null) {
            this.clearScheduledEvents();
            clearTimeout(this.nextIterationId);
            this.nextIterationId = null;
            this.timeCovered = 0;
            this._state = "stopped";
            this.callOnStopCallbacks();
            this.publish();
        }
    }

    public getTime(): number {
        if (this._state === "playing") {
            return this.audioContext.currentTime - this.offset;
        }

        return 0;
    }

    public get state(): EventEngineState {
        return this._state;
    }

    private playSound(audioBuffer: AudioBuffer, time = 0): AudioBufferPlayer {
        const audioBufferPlayer = new AudioBufferPlayer(audioBuffer, this.audioContext, time);

        return audioBufferPlayer;
    }

    private async ensureContextIsRunning(): Promise<void> {
        if (this.audioContext.state !== "running") {
            await this.audioContext.resume();
        }

        if (this.audioContext.state !== "running") {
            throw new Error("Couldn't start the AudioContext");
        }
    }

    // The loop is a setTimeout loop
    // It gets and schedules events in an upcoming time interval
    // We make sure never to request any time we've requested before
    private loop(): void {
        const intervalEnd = this.getTime() + lookahead;
        const interval: IInterval = { start: this.timeCovered, end: intervalEnd };
        this.scheduleEvents(interval);
        this.nextIterationId = setTimeout(() => {
            this.loop();
        }, loopFrequency);
        this.timeCovered = intervalEnd;
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

    private scheduleAudioEvent(audioEvent: AudioEvent): void {
        const audioBufferPlayer = this.playSound(audioEvent.audioBuffer, audioEvent.realTime + this.offset);
        const audioEventReference = { audioEvent, audioBufferPlayer };
        this.scheduledAudioEvents.push(audioEventReference);

        // Event listener will fire on context.suspend() as well as audio buffer finishing.
        // The 'stop' button wants to clear audio that's in mid-play.
        audioBufferPlayer.onEnded(() => {
            this.stopAudioAndUnschedule(audioEventReference);
        });
    }

    private stopAudioAndUnschedule(
        audioEventReference: { audioEvent: AudioEvent, audioBufferPlayer: AudioBufferPlayer; }
    ): void {
        audioEventReference.audioBufferPlayer.stop();
        const scheduleIndex = this.scheduledAudioEvents.indexOf(audioEventReference);
        if (scheduleIndex !== -1) {
            this.scheduledAudioEvents.splice(scheduleIndex, 1);
        }
    }

    private scheduleCallbackEvent(callbackEvent: ICallbackEvent): void {
        const callbackEventReference = {
            callbackEvent,
            timeoutId: setTimeout(() => {
                callbackEvent.callback();
                this.removeFromCallbackSchedule(callbackEventReference);
            }, this.getMsFromNow(callbackEvent.realTime))
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
        const scheduledMuteEvent = {
            muteEvent,
            timeoutId: setTimeout(() => {
                this.muteUsingFilter(muteEvent.muteFilter);
                this.removeFromMuteSchedule(scheduledMuteEvent);
            }, this.getMsFromNow(muteEvent.realTime))
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
        audioEventReference: { audioEvent: AudioEvent, audioBufferPlayer: AudioBufferPlayer; }
    ): boolean {
        return audioEventReference.audioEvent.realTime <= this.getTime();
    }
}

let singletonEventEngine: IEventEngine | null = null;

export const getEventEngine = (): IEventEngine => {
    singletonEventEngine ??= new EventEngine();

    return singletonEventEngine;
};
