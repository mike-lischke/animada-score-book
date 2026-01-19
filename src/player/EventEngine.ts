/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import { AudioBufferPlayer, createAudioBufferPlayer } from "./AudioBufferPlayer.js";
import type {
    AudioEvent, ICallbackEvent, IEventEngine, EventEngineState, IEventSource, IInterval, IMuteEvent, MuteFilter
} from "./types.js";

// The core of the Animada Score Book Player is the EventEngine
// It plays audio and fires callbacks at the right time
// Playing audio boils down to the WebAudio API, so we must warp our design around that

const lookahead = 0.25; // (s) Look 250ms ahead for events
const loopFrequency = 125; // (ms) Check for upcoming events every 125ms

export const getEventEngine = (): IEventEngine => {
    return eventEngine;
};

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
const eventEngine: IEventEngine = (function () {
    const connect = (eventSource: IEventSource) => {
        eventSources.push(eventSource);
    };

    const disconnect = (eventSource: IEventSource) => {
        const index = eventSources.indexOf(eventSource);
        if (index !== -1) {
            eventSources.splice(index, 1);
        }
    };

    const play = async () => {
        await ensureContextIsRunning();
        if (nextIterationId === null) {
            offset = audioContext.currentTime; // should always have timeCovered = 0 at this point
            loop();
            state = "playing";
            publisher.publish();
        }
    };

    const stop = () => {
        if (nextIterationId !== null) {
            clearScheduledEvents();
            clearTimeout(nextIterationId);
            nextIterationId = null;
            timeCovered = 0;
            state = "stopped";
            callOnStopCallbacks();
            publisher.publish();
        }
    };

    const getTime = () => {
        if (state === "playing") {
            return audioContext.currentTime - offset;
        }

        return 0;
    };

    const playSound = (audioBuffer: AudioBuffer, time = 0): AudioBufferPlayer => {
        const audioBufferPlayer = createAudioBufferPlayer(audioBuffer, audioContext, time);

        return audioBufferPlayer;
    };

    const ensureContextIsRunning = async () => {
        if (audioContext.state !== "running") {
            await audioContext.resume();
        }

        if (audioContext.state !== "running") {
            throw new Error("Couldn't start the AudioContext");
        }
    };

    // The loop is a setTimeout loop
    // It gets and schedules events in an upcoming time interval
    // We make sure never to request any time we've requested before
    const loop = () => {
        const intervalEnd = getTime() + lookahead;
        const interval: IInterval = { start: timeCovered, end: intervalEnd };
        scheduleEvents(interval);
        nextIterationId = setTimeout(loop, loopFrequency);
        timeCovered = intervalEnd;
    };

    const scheduleEvents = (interval: IInterval) => {
        eventSources.forEach((eventSource) => {
            eventSource.getEvents(interval).forEach((event) => {
                if ("audioBuffer" in event) {
                    scheduleAudioEvent(event);
                }
                if ("callback" in event) {
                    scheduleCallbackEvent(event);
                }
                if ("muteFilter" in event) {
                    scheduleMuteEvent(event);
                }
            });
        });
    };

    const scheduleAudioEvent = (audioEvent: AudioEvent) => {
        const audioBufferPlayer = playSound(audioEvent.audioBuffer, audioEvent.realTime + offset);
        const audioEventReference: AudioEventReference = { audioEvent, audioBufferPlayer };
        scheduledAudioEvents.push(audioEventReference);
        // Event listener will fire on context.suspend() as well as audio buffer finishing.
        // The 'stop' button wants to clear audio that's in mid-play.
        audioBufferPlayer.onEnded(() => {
            stopAudioAndUnschedule(audioEventReference);
        });
    };

    const stopAudioAndUnschedule = (audioEventReference: AudioEventReference) => {
        audioEventReference.audioBufferPlayer.stop();
        const scheduleIndex = scheduledAudioEvents.indexOf(audioEventReference);
        if (scheduleIndex !== -1) {
            scheduledAudioEvents.splice(scheduleIndex, 1);
        }
    };

    const scheduleCallbackEvent = (callbackEvent: ICallbackEvent) => {
        const callbackEventReference: CallbackEventReference = {
            callbackEvent,
            timeoutId: setTimeout(() => {
                callbackEvent.callback();
                removeFromCallbackSchedule(callbackEventReference);
            }, getMsFromNow(callbackEvent.realTime))
        };
        scheduledCallbackEvents.push(callbackEventReference);
    };

    const removeFromCallbackSchedule = (callbackEventReference: CallbackEventReference) => {
        const scheduleIndex = scheduledCallbackEvents.indexOf(callbackEventReference);
        if (scheduleIndex !== -1) {
            scheduledCallbackEvents.splice(scheduleIndex, 1);
        }
        // Currently no need to clearTimeout on callback events
        // They are only getting unscheduled by this function after they fire
        // They are also getting unscheduled by clearScheduledEvents, which does clearTimeout
    };

    const scheduleMuteEvent = (muteEvent: IMuteEvent) => {
        const scheduledMuteEvent = {
            muteEvent,
            timeoutId: setTimeout(() => {
                muteUsingFilter(muteEvent.muteFilter);
                removeFromMuteSchedule(scheduledMuteEvent);
            }, getMsFromNow(muteEvent.realTime))
        };
        scheduledMuteEvents.push(scheduledMuteEvent);
    };

    const removeFromMuteSchedule = (muteEventReference: MuteEventReference) => {
        const scheduleIndex = scheduledMuteEvents.indexOf(muteEventReference);
        if (scheduleIndex !== -1) {
            scheduledMuteEvents.splice(scheduleIndex, 1);
        }
    };

    const clearScheduledEvents = (): void => {
        scheduledAudioEvents.forEach(({ audioBufferPlayer }) => {
            audioBufferPlayer.stop();
        });
        scheduledCallbackEvents.forEach(({ timeoutId }) => {
            clearTimeout(timeoutId);
        });
        scheduledMuteEvents.forEach(({ timeoutId }) => {
            clearTimeout(timeoutId);
        });
        scheduledAudioEvents.splice(0);
        scheduledCallbackEvents.splice(0);
        scheduledMuteEvents.splice(0);
    };

    const callOnStopCallbacks = () => {
        eventSources.forEach(({ onStop }) => {
            return (onStop?.());
        });
    };

    const getMsFromNow = (time: number) => {
        return (time - getTime()) * 1000;
    };

    const muteUsingFilter = (muteFilter: MuteFilter) => {
        scheduledAudioEvents
            .filter((audioEventReference) => {
                return hasStarted(audioEventReference) && muteFilter(audioEventReference.audioEvent);
            })
            .forEach(stopAudioAndUnschedule);
    };

    const hasStarted = (audioEventReference: AudioEventReference): boolean => {
        return audioEventReference.audioEvent.realTime <= getTime();
    };

    const audioContext: AudioContext = new AudioContext();
    const eventSources: IEventSource[] = [];
    let nextIterationId: number | null = null;
    let state: EventEngineState = "stopped";
    const publisher = new Publisher();

    // We use the AudioContext to move forward in time
    // But it always moves forward, even when the EventEngine is stopped
    // This means the AudioContext is way ahead in time
    // So we maintain an offset to calculate EventEngine time from AudioContext time
    let offset = 0;

    // We ask for events in time-intervals, but never ask for time we've already covered
    let timeCovered = 0;

    interface AudioEventReference { audioEvent: AudioEvent, audioBufferPlayer: AudioBufferPlayer; }
    const scheduledAudioEvents: AudioEventReference[] = [];

    interface CallbackEventReference { callbackEvent: ICallbackEvent, timeoutId: number; }
    const scheduledCallbackEvents: CallbackEventReference[] = [];

    interface MuteEventReference { muteEvent: IMuteEvent, timeoutId: number; }
    const scheduledMuteEvents: MuteEventReference[] = [];

    return {
        connect, disconnect,
        play, stop, getTime,
        subscribe: publisher.subscribe, unsubscribe: publisher.unsubscribe,
        get state(): EventEngineState {
            return state;
        }
    };

})();
