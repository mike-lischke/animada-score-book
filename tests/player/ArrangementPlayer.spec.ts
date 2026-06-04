/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it, vi } from "vitest";

import type { INoteStyle, Mutable } from "../../src/core/types/general.js";
import type { ICallbackEvent, IInterval } from "../../src/player/types.js";

type CallbackHelper = {
    kind: "callback";
    callback: () => void;
} & { realTime: number; } & {
    identifier: unknown;
};

class TestScoreBookDataModel extends ScoreBookDataModel {
    private readonly _arrangement: ISbDmArrangement;

    public constructor(arrangement: ISbDmArrangement) {
        super();
        this._arrangement = arrangement;
    }

    public override get arrangement(): ISbDmArrangement {
        return this._arrangement;
    }
}

// Mock TimeCoordinator used by ArrangementPlayer
vi.mock("../../src/player/TimeCoordinator.js", () => {
    class MockTimeCoordinator {
        public realTimeLength: RealTime;

        public constructor() {
            this.realTimeLength = 1;
        }

        public convertToRealTime(timing: ITiming): RealTime {
            return ((timing.bar - 1) * 1) + ((timing.step - 1) * 0.1);
        }

        public convertToLoopProgress(realTime: RealTime): number {
            return (realTime % this.realTimeLength) / this.realTimeLength;
        }

        public recomputeMetrics(): void {
            // No-op for mock.
        }

        public get metrics() {
            return {
                realTimeLength: this.realTimeLength,
                secondsPerBar: 1,
                secondsPerStep: 0.1,
                bars: 1,
                beatsPerBar: 4,
                beatUnit: 4,
                pulsesPerBar: 4,
                stepsPerBar: 16,
                stepsPerPulse: 4,
            };
        }
    }

    return { TimeCoordinator: MockTimeCoordinator };
});

// Mock TrackPlayer used inside ArrangementPlayer
vi.mock("../../src/player/TrackPlayer.js", () => {
    class MockTrackPlayer {
        public stopped = false;
        public constructor(public track: ISbDmTrack, _tc: TimeCoordinator) { }

        public getEvents(interval: IInterval) {
            const events = [] as Array<{ realTime: RealTime; } & (Record<string, unknown>)>;
            const t = interval.start;
            let firstEvent: ISbDmNoteEvent | undefined;
            for (const event of this.track.notes) {
                firstEvent = event;
                break;
            }
            if (firstEvent) {
                events.push({ realTime: t, audioBuffer: {} as AudioBuffer, event: firstEvent });
            }
            events.push({
                realTime: t,
                callback: () => {
                    return;
                }
            });

            return events;
        }

        public onStop(): void {
            this.stopped = true;
        }

        public dispose(): void {
            return;
        }
    }

    return { TrackPlayer: MockTrackPlayer };
});

// Build simple track/arrangement factories
const makeNote = (track: ISbDmTrack, timing: ITiming, noteStyle?: INoteStyle): ISbDmNoteEvent => {
    return {
        type: SbDmEntityType.NoteEvent,
        id: getNewId(),
        measureNumber: 1,
        start: { numerator: timing.step - 1, denominator: 16 },
        duration: { numerator: 1, denominator: 16 },
        track,
        timing,
        noteStyle,
    };
};

const makeArrangement = (trackCount: number): ISbDmArrangement => {
    const timeParams: ISbDmTimeParams = {
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
    };

    const tracks: Array<Mutable<ISbDmTrack>> = [];
    for (let i = 0; i < trackCount; i++) {
        const instrument: ISbDmInstrument = {
            type: SbDmEntityType.Instrument,
            id: i,
            state: {
                initialized: true,
                isLeaf: true,
                expanded: false,
                expandedOnce: false,
            },
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
        };

        const notes: ISbDmNoteEvent[] = [];
        const track: ISbDmTrack = {
            type: SbDmEntityType.Track,
            id: i + 1,
            name: `Track ${i + 1}`,
            volume: 1,
            effectiveVolume: 1,
            arrangement: undefined as unknown as ISbDmArrangement,
            instrument,
            measures: [],
            getNoteAt: () => {
                return undefined;
            },
            get notes() {
                return (function* () {
                    for (const note of notes) {
                        yield note;
                    }
                })();
            },
            clear: vi.fn(),
        };

        const noteStyle: INoteStyle = {
            id: "x",
            instrument: instrument as unknown as INoteStyle["instrument"],
            audioBuffer: {} as AudioBuffer
        } as INoteStyle;
        const sourceNote = makeNote(track, { bar: 1, step: 1 }, noteStyle);
        notes.push(sourceNote);
        track.measures.push({
            type: SbDmEntityType.TrackMeasure,
            id: getNewId(),
            number: 1,
            meter: {
                beats: 4,
                beatUnits: 4,
                stepResolution: 1,
                beatGroups: [1],
            },
            steps: [{ index: 0, noteStyleId: sourceNote.noteStyle?.id }],
            subdivisions: [],
            events: [{
                type: SbDmEntityType.NoteEvent,
                id: sourceNote.id,
                measureNumber: 1,
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 1, denominator: 1 },
                track: track as unknown as ISbDmTrack,
                timing: { bar: 1, step: 1 },
                noteStyle: sourceNote.noteStyle,
            }],
        });
        tracks.push(track);
    }

    const arrangement: ISbDmArrangement = {
        type: SbDmEntityType.Arrangement,
        id: 1,
        title: "Test",
        timeParams,
        tracks,
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        applyArrangementSnapshot: vi.fn(),
        mainVolume: 1,
        loop: false,
        useMetronome: false,
        countIn: false,
        measureLabels: {},
    };
    tracks.forEach((t) => {
        t.arrangement = arrangement;
    });

    return arrangement;
};

// Import after mocks
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNoteEvent,
    type ISbDmTimeParams, type ISbDmTrack, type ITiming, type RealTime
} from "../../src/core/ScoreBookDataModel.js";
import { getNewId } from "../../src/core/utils.js";
import { ArrangementPlayer } from "../../src/player/ArrangementPlayer.js";
import type { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import type { TrackPlayer } from "../../src/player/TrackPlayer.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe("ArrangementPlayer", () => {
    it("creates track players", () => {
        const arrangement = makeArrangement(2);
        const dm = new TestScoreBookDataModel(arrangement);
        const player = new ArrangementPlayer(dm);
        expect(player.trackPlayers.size).toBe(2);
    });

    it("updates track player set when arrangement tracks change", () => {
        const arrangement = makeArrangement(1);
        const dm = new TestScoreBookDataModel(arrangement);
        const player = new ArrangementPlayer(dm);
        expect(player.trackPlayers.size).toBe(1);

        // Add a new track and publish arrangement
        const currentInstrument = arrangement.tracks[0].instrument;
        const newTrack: ISbDmTrack = {
            type: SbDmEntityType.Track,
            id: 99,
            name: "New Track",
            volume: 1,
            effectiveVolume: 1,
            arrangement,
            instrument: currentInstrument,
            measures: arrangement.tracks[0].measures,
            getNoteAt: () => {
                return undefined;
            },
            get notes() {
                return (function* () {
                    yield* [];
                })();
            },
            clear: vi.fn(),
        };
        arrangement.tracks.push(newTrack);
        void requisitions.execute("arrangementChanged", arrangement.id);

        expect(player.trackPlayers.size).toBe(2);
    });

    it("aggregates events within the requested interval and includes timing callbacks", () => {
        const arrangement = makeArrangement(1);
        const dm = new TestScoreBookDataModel(arrangement);
        const player = new ArrangementPlayer(dm);

        // Query a small direct interval.
        // @ts-expect-error Accessing internal for test purposes
        const events = player.getEvents({ start: 0, end: 0.2 });
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
        const timingSpy = (): Promise<boolean> => {
            currentTimingUpdates.push(1);

            return Promise.resolve(true);
        };
        requisitions.register("playerStateChanged", timingSpy);
        cb?.callback();
        expect(player.currentTiming).toBeTruthy();
        expect(currentTimingUpdates.length).toBe(1);
        requisitions.unregister("playerStateChanged", timingSpy);
    });

    it("onStop resets currentTiming and forwards to track players", () => {
        const arrangement = makeArrangement(2);
        const dm = new TestScoreBookDataModel(arrangement);
        const player = new ArrangementPlayer(dm);

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
        expect(player.currentTiming).toBeUndefined();

        const tps = Array.from(player.trackPlayers.values()) as Array<TrackPlayer & { stopped: boolean; }>;
        tps.forEach((tp) => {
            expect(tp.stopped).toBe(true);
        });
    });

    it("clamps loop progress at interval end during non-loop playback", () => {
        const arrangement = makeArrangement(1);
        arrangement.loop = false;
        const dm = new TestScoreBookDataModel(arrangement);
        const player = new ArrangementPlayer(dm);

        // @ts-expect-error Accessing internal for test purposes
        player.endOffset = 1;

        // Without clamping, this would wrap to 0.02 for a loop length of 1.
        const progress = player.convertToLoopProgress(1.02);
        expect(progress).toBeGreaterThan(0.99);
        expect(progress).toBeLessThan(1);
    });
});
