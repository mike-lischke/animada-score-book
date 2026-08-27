/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it, vi } from "vitest";

import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure, type ITiming, type RealTime
} from "../../src/core/ScoreBookDataModel.js";
import type { IAudioData, ITimeParams, Mutable } from "../../src/core/types/general.js";
import type { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

/**
 * Minimal stub for the ITimeCoordinator used by TrackPlayer.
 *
 * @param realTimeLength The real time length of the arrangement.
 * @returns The stub coordinator.
 */
const makeTimeCoordinator = (realTimeLength: RealTime = 4): TimeCoordinator => {
    return {
        metrics: {
            realTimeLength,
            secondsPerBar: 1,
            secondsPerStep: 0.1,
            bars: 1,
            beatsPerBar: 4,
            stepsPerBar: 16,
            beatGroups: [2, 2, 2, 2, 2, 2, 2, 2],
            stepsPerPulse: 2,
            beatUnit: 4,
            pulsesPerBar: 8,
        },
        convertToRealTime: (timing: ITiming) => {
            return ((timing.bar - 1) * 1) + ((timing.step - 1) * 0.1);
        },
        convertEventToRealTime: (event: ISbDmNoteEvent) => {
            return event.start.numerator / event.start.denominator;
        },
        convertToLoopProgress: () => {
            return 0;
        },
        reset: vi.fn(),
    } as unknown as TimeCoordinator;
};

const makeNote = (
    track: ISbDmTrack,
    timing: ITiming,
    noteStyle?: IAudioData,
): ISbDmNoteEvent => {
    return {
        type: SbDmEntityType.NoteEvent,
        id: Math.floor(Math.random() * 100000),
        measureNumber: 1,
        start: { numerator: timing.step - 1, denominator: 16 },
        duration: { numerator: 1, denominator: 16 },
        track,
        timing,
        audioData: noteStyle,
    };
};

const makeTrack = (opts?: {
    instrumentLoaded?: boolean;
    withPolyrhythmNote?: boolean;
}): ISbDmTrack & { _notes: ISbDmNoteEvent[]; } => {
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
        addTrack: vi.fn(() => {
            return track;
        }),
        removeTrack: vi.fn(),
        duplicateTrack: vi.fn(),
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
        _notes: [],
        clear: vi.fn(),
    };

    arrangement.tracks.push(track);

    // One simple audible note at bar 1, step 1
    const noteStyle: IAudioData = {
        id: "x",
        audioBuffer: {} as AudioBuffer,
        instrument: track.instrument,

        sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }

    } as IAudioData;

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
            audioData: currentNote.audioData,
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
        events: track._notes.map((currentNote, index) => {
            return {
                start: { numerator: index, denominator: track._notes.length },
                duration: { numerator: 1, denominator: track._notes.length },
                noteStyleId: currentNote.audioData?.id,
            };
        }),
        subdivisions: [],
        noteEvents: measureEvents,
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

    it("keeps note event ids stable across cache rebuilds", async () => {
        const track = makeTrack({ instrumentLoaded: true });
        const player = new TrackPlayer(track, makeTimeCoordinator());

        const idsBefore = track.measures[0].noteEvents.map((event) => {
            return event.id;
        });

        // Trigger a rebuild as it happens after any track edit.
        await requisitions.execute("trackChanged", track.id);

        const idsAfter = track.measures[0].noteEvents.map((event) => {
            return event.id;
        });

        expect(idsAfter).toEqual(idsBefore);

        player.dispose();
    });
});
