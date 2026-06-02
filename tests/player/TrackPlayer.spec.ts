/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it, vi } from "vitest";

import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure, type ITiming, type RealTime
} from "../../src/core/ScoreBookDataModel.js";
import type { INoteStyle, ITimeParams, Mutable } from "../../src/core/types/general.js";
import type { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";

type Sub = (...args: unknown[]) => void;

const makeSubscribable = () => {
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
        }
    };
};

/**
 * Minimal stub for the ITimeCoordinator used by TrackPlayer.
 *
 * @param realTimeLength The real time length of the arrangement.
 * @returns The stub coordinator.
 */
const makeTimeCoordinator = (realTimeLength: RealTime = 4): TimeCoordinator => {
    return {
        ...makeSubscribable(),
        metrics: {
            realTimeLength,
            secondsPerBar: 1,
            secondsPerStep: 0.1,
            bars: 1,
            beatsPerBar: 4,
            stepsPerBar: 16,
            stepsPerPulse: 2,
        },
        convertToRealTime: (timing: ITiming) => {
            return ((timing.bar - 1) * 1) + ((timing.step - 1) * 0.1);
        },
        convertEventToRealTime: (event: ISbDmNoteEvent) => {
            return event.start.numerator / event.start.denominator;
        },
        convertToAudioTime: (realTime: RealTime) => {
            return realTime;
        },
        convertToLoopProgress: () => {
            return 0;
        },
        reset: vi.fn(),
        publish: vi.fn(),
    } as unknown as TimeCoordinator;
};

const makeNote = (
    track: ISbDmTrack,
    timing: ITiming,
    noteStyle?: INoteStyle,
): ISbDmNoteEvent => {
    return {
        type: SbDmEntityType.NoteEvent,
        id: Math.floor(Math.random() * 100000),
        measureNumber: 1,
        start: { numerator: timing.step - 1, denominator: 16 },
        duration: { numerator: 1, denominator: 16 },
        track,
        timing,
        noteStyle,
    };
};

const makeTrack = (
    opts?: { instrumentLoaded?: boolean; withPolyrhythmNote?: boolean; }
): ISbDmTrack & { _notes: ISbDmNoteEvent[]; } => {
    const instrumentLoaded = opts?.instrumentLoaded ?? true;
    const timeParams: ITimeParams = {
        timeSignature: "4/4",
        tempo: 120,
        length: 1,
        pulse: "2/8",
        stepResolution: 16,
        timings: [],
        isValid: (_timing: ITiming) => {
            return true;
        },
        ...makeSubscribable(),
    };
    const arrangement: ISbDmArrangement = {
        id: 1,
        type: SbDmEntityType.Arrangement,
        title: "Test",
        timeParams,
        tracks: [] as ISbDmTrack[],
        mainVolume: 100,
        loop: false,
        useMetronome: false,
        countIn: false,
        ...makeSubscribable(),
        addTrack: vi.fn(() => {
            return track;
        }),
        removeTrack: vi.fn(),
        applyArrangementSnapshot: vi.fn(),
        measureLabels: {}
    };

    const track: Mutable<ISbDmTrack> & { _notes: ISbDmNoteEvent[]; } = {
        type: SbDmEntityType.Track,
        id: 1,
        name: "Track 1",
        volume: 1,
        effectiveVolume: 1,
        arrangement,
        instrument: {
            type: SbDmEntityType.Instrument,
            id: 99,
            typeId: "inst",
            state: {
                initialized: instrumentLoaded,
                expanded: false,
                expandedOnce: false,
                isLeaf: true,
            },
            range: [0, 10],
            displayOrder: 1,
            displayName: "Test",
            image: {
                type: SbDmEntityType.InstrumentImage,
                id: 1,
                filePath: "",
            },
            color: "blue",
            noteStyles: {},
            ...makeSubscribable()
        },
        measures: [],
        getNoteAt: () => {
            return undefined;
        },
        get notes() {
            const ns = this._notes;

            return (function* () {
                yield* ns;
            })();
        },
        ...makeSubscribable(),
        _notes: [],
        clear: vi.fn(),
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

    if (opts?.withPolyrhythmNote) {
        const polyNote = makeNote(track, { bar: 1, step: 2 }, noteStyle);
        track._notes.push(polyNote);
    }

    const measureEvents: ISbDmNoteEvent[] = track._notes.map((currentNote, index) => {
        return {
            type: SbDmEntityType.NoteEvent,
            id: currentNote.id,
            measureNumber: 1,
            start: {
                numerator: index,
                denominator: track._notes.length,
            },
            duration: {
                numerator: 1,
                denominator: track._notes.length,
            },
            track,
            timing: currentNote.timing,
            noteStyle: currentNote.noteStyle,
        };
    });
    const measure: ISbDmTrackMeasure = {
        type: SbDmEntityType.TrackMeasure,
        id: 1,
        number: 1,
        meter: {
            beats: 4,
            beatUnits: 4,
            stepResolution: track._notes.length,
            beatGroups: [track._notes.length],
        },
        steps: track._notes.map((currentNote, index) => {
            return { index, noteStyleId: currentNote.noteStyle?.id };
        }),
        subdivisions: [],
        events: measureEvents,
    };
    track.measures = [measure];

    return track;
};

describe("TrackPlayer", () => {
    it("returns no events when instrument not loaded", () => {
        const track = makeTrack({ instrumentLoaded: false });
        const player = new TrackPlayer(track, makeTimeCoordinator());

        const events = player.getEvents({ start: 0, end: 1 });
        expect(events.length).toBe(0);
    });

    it("emits audio events for notes in interval", () => {
        const track = makeTrack({ instrumentLoaded: true });
        const player = new TrackPlayer(track, makeTimeCoordinator());

        const events = player.getEvents({ start: 0, end: 1 });

        // Expect at least one audio event for the first note.
        expect(events.some((e) => {
            return "audioBuffer" in e;
        })).toBe(true);

        // All events should be within the interval and ordered
        for (let i = 1; i < events.length; i++) {
            expect(events[i - 1].realTime).toBeLessThanOrEqual(events[i].realTime);
            expect(events[i].realTime).toBeGreaterThanOrEqual(0);
            expect(events[i].realTime).toBeLessThan(1);
        }
    });

    it("returns no events after dispose", () => {
        const track = makeTrack({ instrumentLoaded: true });
        const player = new TrackPlayer(track, makeTimeCoordinator());
        player.dispose();
        const events = player.getEvents({ start: 0, end: 1 });
        expect(events.length).toBe(0);
    });
});
