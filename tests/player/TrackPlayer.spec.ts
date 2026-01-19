/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import type {
    INoteStyle, INoteView, IPolyrhythmView, ITimeParamsView, ITiming, ITrackView, RealTime
} from "../../src/core/types/general.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";
import type { ILoopInterval, ITimeCoordinator } from "../../src/player/types.js";

type Sub = (...args: unknown[]) => void;

const makeSubscribable = () => {
    const subs: Sub[] = [];

    return {
        subscribe: (cb: Sub) => {
            subs.push(cb);
        },
        unsubscribe: (cb: Sub) => {
            const i = subs.indexOf(cb);
            if (i !== -1) {
                subs.splice(i, 1);
            }
        }
    };
};

/**
 * Minimal stub for the ITimeCoordinator used by TrackPlayer.
 *
 * @param realTimeLength The real time length of the arrangement.
 * @returns The stub coordinator.
 */
const makeTimeCoordinator = (realTimeLength: RealTime = 4): ITimeCoordinator => {
    return {
        ...makeSubscribable(),
        realTimeLength,
        convertToRealTime: (timing: ITiming) => {
            return ((timing.bar - 1) * 1) + ((timing.step - 1) * 0.1);
        },
        convertToLoopIntervals: () => {
            return [] as ILoopInterval[];
        },
        convertToAudioTime: (realTime) => {
            return realTime;
        },
        convertToLoopProgress: () => {
            return 0;
        }
    };
};

const makeNote = (
    track: ITrackView,
    timing: ITiming,
    noteStyle?: INoteStyle,
    polyrhythm?: IPolyrhythmView
): INoteView => {
    return {
        id: `${timing.bar}:${timing.step}`,
        timing,
        track,
        noteStyle,
        polyrhythm,
        ...makeSubscribable()
    };
};

import type { IArrangementView, IInstrument } from "../../src/core/types/general.js";

const makeTrack = (
    opts?: { instrumentLoaded?: boolean; withPolyrhythmNote?: boolean; }
): ITrackView & { _notes: INoteView[]; } => {
    const instrumentLoaded = opts?.instrumentLoaded ?? true;
    const timeParams: ITimeParamsView = {
        timeSignature: "4/4",
        tempo: 120,
        length: 1,
        pulse: "2/8",
        stepResolution: 16,
        timings: [],
        isValid: () => {
            return true;
        },
        ...makeSubscribable()
    };
    const arrangement: IArrangementView = {
        title: "Test",
        timeParams,
        tracks: [] as ITrackView[],
        ...makeSubscribable()
    };

    const track: ITrackView & { _notes: INoteView[]; } = {
        id: 1,
        arrangement,
        instrument: {
            id: "inst",
            loaded: instrumentLoaded,
            displayOrder: 1,
            displayName: "Test",
            icon: "",
            colourGroup: "blue",
            noteStyles: {},
            ...makeSubscribable()
        } as IInstrument,
        notes: [] as INoteView[],
        polyrhythms: [] as IPolyrhythmView[],
        getNoteAt: () => {
            return undefined;
        },
        getNoteIterator: function* () {
            yield* this._notes;
        },
        ...makeSubscribable(),
        _notes: [] as INoteView[],
    };

    arrangement.tracks.push(track);

    // One simple audible note at bar 1, step 1
    const noteStyle: INoteStyle = {
        id: "x",
        audioBuffer: {} as AudioBuffer,
        instrument: track.instrument
    } as INoteStyle;
    const note = makeNote(track, { bar: 1, step: 1 }, noteStyle);
    track._notes.push(note);
    track.notes = track._notes;

    if (opts?.withPolyrhythmNote) {
        // Minimal polyrhythm view object
        const poly: IPolyrhythmView = {
            id: 1,
            start: undefined as unknown as INoteView,
            end: undefined as unknown as INoteView,
            notes: []
        };
        const polyNote = makeNote(track, { bar: 1, step: 2 }, noteStyle, poly);
        track._notes.push(polyNote);
        track.notes = track._notes;
    }

    return track;
};

describe("TrackPlayer", () => {
    it("returns no events when instrument not loaded", () => {
        const track = makeTrack({ instrumentLoaded: false });
        const player = new TrackPlayer(track, makeTimeCoordinator());

        const events = player.getEvents({ start: 0, end: 1 });
        expect(events.length).toBe(0);
    });

    it("emits audio and callback events for notes in interval", () => {
        const track = makeTrack({ instrumentLoaded: true });
        const player = new TrackPlayer(track, makeTimeCoordinator());

        const events = player.getEvents({ start: 0, end: 1 });

        // Expect an audio event and a callback event for the first note
        expect(events.some((e) => {
            return "audioBuffer" in e;
        })).toBe(true);

        expect(events.some((e) => {
            return "callback" in e;
        })).toBe(true);

        // All events should be within the interval and ordered
        for (let i = 1; i < events.length; i++) {
            expect(events[i - 1].realTime).toBeLessThanOrEqual(events[i].realTime);
            expect(events[i].realTime).toBeGreaterThanOrEqual(0);
            expect(events[i].realTime).toBeLessThan(1);
        }
    });

    it("updates currentPolyrhythmNote via callback and resets onStop", () => {
        const track = makeTrack({ instrumentLoaded: true, withPolyrhythmNote: true });
        const player = new TrackPlayer(track, makeTimeCoordinator());

        const events = player.getEvents({ start: 0, end: 1 });
        const polyCallback = events.find((e): e is { callback: () => void; realTime: number; } => {
            return "callback" in e && e.realTime > 0;
        });
        expect(polyCallback).toBeTruthy();

        // Fire the callback to simulate play
        polyCallback!.callback();
        expect(player.currentPolyrhythmNote).toBe(track._notes[1]);

        player.onStop();
        expect(player.currentPolyrhythmNote).toBeNull();
    });

    it("publishes on soloMute change only when value changes", () => {
        const track = makeTrack({ instrumentLoaded: true });
        const player = new TrackPlayer(track, makeTimeCoordinator());

        let publishCount = 0;
        player.subscribe(() => {
            publishCount++;
        });

        player.soloMute = "solo";
        player.soloMute = "solo"; // no change
        player.soloMute = null;

        expect(publishCount).toBe(2);
    });

    it("returns no events after dispose", () => {
        const track = makeTrack({ instrumentLoaded: true });
        const player = new TrackPlayer(track, makeTimeCoordinator());
        player.dispose();
        const events = player.getEvents({ start: 0, end: 1 });
        expect(events.length).toBe(0);
    });
});
