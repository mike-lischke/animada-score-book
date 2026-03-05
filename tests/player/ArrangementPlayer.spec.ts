/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it, vi } from "vitest";

import type { INoteStyle, IPolyrhythm, ITimeParams, Mutable } from "../../src/core/types/general.js";
import type { ICallbackEvent, IInterval, ILoopInterval, } from "../../src/player/types.js";

// Simple subscribable helper with publish capability for tests
type Sub = (...args: unknown[]) => void;

type CallbackHelper = { callback: () => void; } & { realTime: number; } & { identifier: unknown; };

interface PublishableSubscribable {
    subscribe: (cb: Sub) => () => void; unsubscribe: (cb: Sub) => void;
    publish: () => void;
}

const makeSubscribable = (): PublishableSubscribable => {
    const subs: Sub[] = [];

    return {
        subscribe: (cb: Sub) => {
            subs.push(cb);

            return () => {
                const i = subs.indexOf(cb);
                if (i !== -1) {
                    subs.splice(i, 1);
                }
            };
        },
        unsubscribe: (cb: Sub) => {
            const i = subs.indexOf(cb);
            if (i !== -1) {
                subs.splice(i, 1);
            }
        },
        publish: () => {
            subs.forEach((cb) => {
                cb();
            });
        }
    };
};

// Mock TimeCoordinator used by ArrangementPlayer
vi.mock("../../src/player/TimeCoordinator.js", () => {
    class MockTimeCoordinator {
        public realTimeLength: RealTime;
        private readonly subs = makeSubscribable();

        public constructor(_timeParams: ITimeParams) {
            this.realTimeLength = 1;
        }

        public subscribe(cb: Sub): void {
            this.subs.subscribe(cb);
        }

        public unsubscribe(cb: Sub): void {
            this.subs.unsubscribe(cb);
        }

        public convertToRealTime(timing: ITiming): RealTime {
            return ((timing.bar - 1) * 1) + ((timing.step - 1) * 0.1);
        }

        public convertToLoopIntervals({ start, end }: IInterval): ILoopInterval[] {
            const length = this.realTimeLength;
            const intervals: ILoopInterval[] = [];
            const startLoop = Math.floor(start / length);
            const endLoop = Math.floor(end / length);
            const startAdj = start % length;
            const endAdj = end % length;
            if (startLoop === endLoop) {
                intervals.push({ loopNumber: startLoop, start: startAdj, end: endAdj });
            } else {
                intervals.push({ loopNumber: startLoop, start: startAdj, end: length });
                intervals.push({ loopNumber: endLoop, start: 0, end: endAdj });
            }

            return intervals;
        }

        public convertToAudioTime(realTime: RealTime, loopNumber: number): RealTime {
            return realTime + (loopNumber * this.realTimeLength);
        }

        public convertToLoopProgress(realTime: RealTime): number {
            return (realTime % this.realTimeLength) / this.realTimeLength;
        }
    }

    return { TimeCoordinator: MockTimeCoordinator };
});

// Mock TrackPlayer used inside ArrangementPlayer
vi.mock("../../src/player/TrackPlayer.js", () => {
    class MockTrackPlayer {
        public soloMute: null | "solo" | "mute" = null;
        public readonly currentPolyrhythmNotePublisher = makeSubscribable();
        public stopped = false;
        private readonly subs = makeSubscribable();
        public constructor(public track: ISbDmTrack, _tc: TimeCoordinator) { }

        public get currentPolyrhythmNote(): ISbDmNote | null {
            return null;
        }

        public getEvents(interval: IInterval) {
            const events = [] as Array<{ realTime: RealTime; } & (Record<string, unknown>)>;
            const t = interval.start;
            events.push({ realTime: t, audioBuffer: {} as AudioBuffer, note: this.track.notes[0] });
            events.push({
                realTime: t,
                callback: () => {
                    return;
                }
            });

            return events;
        }

        public subscribe(cb: Sub): void {
            this.subs.subscribe(cb);
        }

        public unsubscribe(cb: Sub): void {
            this.subs.unsubscribe(cb);
        }

        public onStop(): void {
            this.stopped = true;
        }

        public dispose(): void {
            return;
        }

        // Helper to simulate internal publish on state change
        public publish(): void {
            this.subs.publish();
        }
    }

    return { TrackPlayer: MockTrackPlayer };
});

// Build simple track/arrangement factories
const makeNote = (track: ISbDmTrack, timing: ITiming, noteStyle?: INoteStyle,
    polyrhythm?: IPolyrhythm): ISbDmNote => {
    return {
        type: SbDmEntityType.Note,
        id: getNewId(),
        timing,
        track,
        noteStyle,
        polyrhythm,
        ...makeSubscribable()
    };
};

const makeArrangement = (trackCount: number): ISbDmArrangement & { _publish: () => void; } => {
    const arrangementSubs = makeSubscribable();
    const timeParamsSubs = makeSubscribable();
    const timeParams: ITimeParams & { _publish: () => void; } = {
        timeSignature: "4/4",
        tempo: 120,
        length: 1,
        pulse: "2/8",
        stepResolution: 16,
        timings: [
            { bar: 1, step: 1 },
            { bar: 1, step: 2 }
        ],
        isValid: () => {
            return true;
        },
        subscribe: timeParamsSubs.subscribe,
        unsubscribe: timeParamsSubs.unsubscribe,
        _publish: () => {
            timeParamsSubs.publish();
        }
    };

    const tracks: Array<Mutable<ISbDmTrack>> = [];
    for (let i = 0; i < trackCount; i++) {
        const trackSubs = makeSubscribable();
        const instrument: ISbDmInstrument = {
            type: SbDmEntityType.Instrument,
            id: i,
            state: {
                initialized: true,
                isLeaf: true,
                expanded: false,
                expandedOnce: false,
            },
            noteStyleCount: 0,
            audioPath: "",
            range: [21, 108],
            typeId: `inst${i}`,
            displayOrder: i + 1,
            displayName: `Inst ${i}`,
            image: {
                type: SbDmEntityType.InstrumentImage,
                id: i,
                filePath: `path/to/image${i}.png`,
            },
            color: "blue",
            noteStyles: {},
            ...makeSubscribable()
        };

        const track: ISbDmTrack = {
            type: SbDmEntityType.Track,
            id: i + 1,
            name: `Track ${i + 1}`,
            volume: 1,
            arrangement: undefined as unknown as ISbDmArrangement,
            instrument,
            notes: [],
            polyrhythms: [],
            getNoteAt: () => {
                return undefined;
            },
            getNoteIterator: function* () {
                yield* this.notes;
            },
            addPolyrhythm: vi.fn(),
            removePolyrhythm: vi.fn(),
            clear: vi.fn(),
            ...trackSubs
        };
        const noteStyle: INoteStyle = {
            id: "x",
            instrument: instrument as unknown as INoteStyle["instrument"],
            audioBuffer: {} as AudioBuffer
        } as INoteStyle;
        track.notes.push(makeNote(track, { bar: 1, step: 1 }, noteStyle));
        tracks.push(track);
    }

    const arrangement: ISbDmArrangement & { _publish: () => void; } = {
        type: SbDmEntityType.Arrangement,
        id: 1,
        title: "Test",
        timeParams,
        tracks,
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        applyArrangementSnapshot: vi.fn(),
        subscribe: arrangementSubs.subscribe,
        unsubscribe: arrangementSubs.unsubscribe,
        _publish: () => {
            arrangementSubs.publish();
        }
    };
    tracks.forEach((t) => {
        t.arrangement = arrangement;
    });

    return arrangement;
};

// Import after mocks
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNote, type ISbDmTrack, type ITiming,
    type RealTime
} from "../../src/core/ScoreBookDataModel.js";
import { ArrangementPlayer } from "../../src/player/ArrangementPlayer.js";
import { getNewId } from "../../src/core/utils.js";
import type { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import type { TrackPlayer } from "../../src/player/TrackPlayer.js";

describe("ArrangementPlayer", () => {
    it("creates track players and computes audible set (no solo)", () => {
        const arrangement = makeArrangement(2);
        const player = new ArrangementPlayer(arrangement);
        expect(player.trackPlayers.size).toBe(2);
        // Initially all unmuted => both audible
        expect(player.audibleTrackPlayers.size).toBe(2);
    });

    it("audible set reacts to solo/mute changes via subscriptions", () => {
        const arrangement = makeArrangement(3);
        const player = new ArrangementPlayer(arrangement);
        const tps = Array.from(player.trackPlayers.values()) as Array<TrackPlayer & { publish: () => void; }>;

        // Solo the second track
        tps[1].soloMute = "solo";
        tps[1].publish();
        expect(player.audibleTrackPlayers.size).toBe(1);

        // Remove solo, mute first track
        tps[1].soloMute = null;
        tps[1].publish();
        tps[0].soloMute = "mute";
        tps[0].publish();
        // Two audible (tracks 2 and 3)
        expect(player.audibleTrackPlayers.size).toBe(2);
    });

    it("updates track player set when arrangement tracks change", () => {
        const arrangement = makeArrangement(1);
        const player = new ArrangementPlayer(arrangement);
        expect(player.trackPlayers.size).toBe(1);

        // Add a new track and publish arrangement
        const currentInstrument = arrangement.tracks[0].instrument;
        const newTrack: ISbDmTrack = {
            type: SbDmEntityType.Track,
            id: 99,
            name: "New Track",
            volume: 1,
            arrangement,
            instrument: currentInstrument,
            notes: arrangement.tracks[0].notes,
            polyrhythms: [],
            getNoteAt: () => {
                return undefined;
            },
            getNoteIterator: function* () {
                yield* this.notes;
            },
            addPolyrhythm: vi.fn(),
            removePolyrhythm: vi.fn(),
            clear: vi.fn(),
            ...makeSubscribable()
        };
        arrangement.tracks.push(newTrack);
        arrangement._publish();

        expect(player.trackPlayers.size).toBe(2);
    });

    it("aggregates events across loops and includes timing callbacks", () => {
        const arrangement = makeArrangement(1);
        const player = new ArrangementPlayer(arrangement);

        // Interval crosses loop boundary (length=1): [0.9, 1.2].
        // @ts-expect-error Accessing internal for test purposes
        const events = player.getEvents({ start: 0.9, end: 1.2 });
        expect(events.length).toBeGreaterThan(0);
        // Ensure sorted order
        for (let i = 1; i < events.length; i++) {
            expect(events[i - 1].realTime).toBeLessThanOrEqual(events[i].realTime);
        }

        // Find an ArrangementPlayer timing callback (has an identifier) and fire it.
        const cb = events.find((e): e is CallbackHelper => {
            return ("callback" in e) && ("identifier" in e);
        });
        const currentTimingUpdates: number[] = [];
        player.subscribe(() => {
            currentTimingUpdates.push(1);
        });
        cb?.callback();
        expect(player.currentTiming).toBeTruthy();
        expect(currentTimingUpdates.length).toBe(1);
    });

    it("onStop resets currentTiming and forwards to track players", () => {
        const arrangement = makeArrangement(2);
        const player = new ArrangementPlayer(arrangement);

        // Prime currentTiming by firing a timing callback.
        // @ts-expect-error Accessing internal for test purposes
        const events = player.getEvents({ start: 0, end: 0.5 });
        const timingCb = events.find((e): e is ICallbackEvent & { identifier: unknown; } => {
            return ("callback" in e) && ("identifier" in e);
        });
        timingCb?.callback();
        expect(player.currentTiming).toBeTruthy();

        // Call onStop and assert reset + forwarding.
        player.onStop();
        expect(player.currentTiming).toBeNull();

        const tps = Array.from(player.trackPlayers.values()) as Array<TrackPlayer & { stopped: boolean; }>;
        tps.forEach((tp) => {
            expect(tp.stopped).toBe(true);
        });
    });
});
