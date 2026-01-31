/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNote, type ISbDmTrack, type ITiming
} from "../../src/core/ScoreBookDataModel.js";
import type { ITimeParamsView } from "../../src/core/types/general.js";
import { EventEngine } from "../../src/player/EventEngine.js";
import type { IAudioEvent, ICallbackEvent, IEventSource, IInterval, IMuteEvent } from "../../src/player/types.js";
import { AudioContextMock } from "../setup.js";

// Minimal stubs for required types
const stubTiming: ITiming = { bar: 1, step: 1 };

const stubTimeParams: ITimeParamsView = {
    timeSignature: "4/4",
    tempo: 120,
    length: 1,
    pulse: "quarter",
    stepResolution: 16,
    isValid: () => {
        return true;
    },
    timings: [{ bar: 1, step: 1 }],
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
};

const stubArrangement: ISbDmArrangement = {
    type: SbDmEntityType.Arrangement,
    id: 1,
    timeParams: stubTimeParams,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    title: "arr",
    tracks: [],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    applyArrangementSnapshot: vi.fn(),
};

const stubInstrument: ISbDmInstrument = {
    type: SbDmEntityType.Instrument,
    id: 1,
    typeId: "1",
    displayOrder: 0,
    displayName: "instr",
    image: {
        type: SbDmEntityType.InstrumentImage,
        id: 1,
        filePath: "",
    },
    colourGroup: "blue",
    state: {
        initialized: true,
        isLeaf: true,
        expanded: false,
        expandedOnce: false,
    },
    audioPath: "",
    range: [0, 127],
    noteStyles: {},
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    noteStyleCount: 0,
};

const stubTrack: ISbDmTrack = {
    type: SbDmEntityType.Track,
    id: 1,
    name: "track",
    volume: 1,
    arrangement: stubArrangement,
    instrument: stubInstrument,
    notes: [],
    polyrhythms: [],
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getNoteAt: vi.fn(),
    getNoteIterator: vi.fn(),
    addPolyrhythm: vi.fn(),
    removePolyrhythm: vi.fn(),
    clear: vi.fn(),
};

const stubNote: ISbDmNote = {
    type: SbDmEntityType.Note,
    id: 1,
    timing: stubTiming,
    track: stubTrack,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
};

// Stub AudioBufferPlayer module to observe interactions
const instances: Array<{
    onEndedCallbacks: Array<() => void>,
    stop: ReturnType<typeof vi.fn>,
    startTime: number;
}> = [];
vi.mock("../../src/player/AudioBufferPlayer.js", () => {
    return {
        AudioBufferPlayer: class {
            public stop = vi.fn();
            public constructor(_buffer: AudioBuffer, _ctx: AudioContext, time = 0) {
                instances.push({ onEndedCallbacks: [], stop: this.stop, startTime: time });
            }

            public onEnded(cb: () => void) {
                instances[instances.length - 1].onEndedCallbacks.push(cb);
            }
        }
    };
});

// Use fake timers to control scheduling
beforeEach(() => {
    vi.useFakeTimers();
    instances.splice(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("EventEngine (class)", () => {
    it("transitions to playing on play() and publishes", async () => {
        const engine = new EventEngine();
        const publishSpy = vi.fn();
        engine.subscribe(publishSpy);

        await engine.play();
        expect(engine.state).toBe("playing");
        expect(publishSpy).toHaveBeenCalledTimes(1);
    });

    it.skip("schedules events within lookahead and wires audio/callback/mute", async () => {
        const engine = new EventEngine();
        const callbackSpy = vi.fn();
        const audioEvent: IAudioEvent = { audioBuffer: {} as AudioBuffer, realTime: 0.1, note: stubNote };
        const callbackEvent: ICallbackEvent = { realTime: 0.1, callback: callbackSpy };
        const muteEvent: IMuteEvent = {
            realTime: 0.1, muteFilter: () => {
                return true;
            }
        };
        const source: IEventSource = {
            getEvents: (interval: IInterval) => {
                // Expect sane interval bounds within lookahead
                expect(interval.start).toBeGreaterThanOrEqual(0);
                expect(interval.end).toBeGreaterThanOrEqual(interval.start);

                return [audioEvent, callbackEvent, muteEvent];
            }
        };

        engine.connect(source);
        await engine.play();
        // First loop schedules immediately
        // Advance timers once to let callback/mute events fire
        vi.runOnlyPendingTimers();

        // AudioBufferPlayer instances were created
        expect(instances.length).toBe(1);
        // Mute event should stop the audio
        expect(instances[0].stop).toHaveBeenCalled();
        // Callback event should have fired
        expect(callbackSpy).toHaveBeenCalledTimes(1);
    });

    it("stop() clears scheduled events, calls onStop, and publishes", async () => {
        const engine = new EventEngine();
        const source: IEventSource = {
            getEvents: () => {
                return [{ audioBuffer: {} as AudioBuffer, realTime: 0, note: stubNote }];
            },
            onStop: vi.fn()
        };

        engine.connect(source);
        const publishSpy = vi.fn();
        engine.subscribe(publishSpy);
        await engine.play();

        // Allow scheduling to occur.
        vi.runOnlyPendingTimers();

        engine.stop();
        expect(engine.state).toBe("stopped");
        expect(publishSpy).toHaveBeenCalled();
        expect(source.onStop).toHaveBeenCalledTimes(1);

        // Audio should have been stopped when clearing.
        expect(instances[0].stop).toHaveBeenCalled();
    });

    it("getTime returns 0 when stopped and progresses when playing", async () => {
        const engine = new EventEngine();
        expect(engine.getTime()).toBe(0);

        // Use static now to simulate time progression across all instances.
        AudioContextMock.now = 0;
        const engine2 = new EventEngine();
        await engine2.play();
        const startOffset = AudioContextMock.now;
        AudioContextMock.now = startOffset + 0.5;
        expect(engine2.getTime()).toBeCloseTo(0.5, 5);
    });
});
