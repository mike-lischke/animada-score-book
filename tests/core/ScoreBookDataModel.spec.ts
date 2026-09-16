/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { reduceFraction } from "../../src/core/serialisation/numeric-functions.js";
import type { IFraction } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { createInstrument, setCellNote } from "../unit-test-helpers.js";

/** The duration of one grid step: the test arrangements are 4/4 with sixteenth steps. */
const stepDuration: IFraction = { numerator: 1, denominator: 16 };

/**
 * Builds the exact start of a grid step within a measure of the test arrangements.
 *
 * @param step The zero-based step to build.
 *
 * @returns The start fraction of that step.
 */
const stepStart = (step: number): IFraction => {
    return reduceFraction(step, 16);
};

/**
 * Lists the start steps of a measure's notes.
 *
 * @param measure The measure to inspect.
 * @returns The start step of every note, in display order.
 */
const noteSteps = (measure: ISbDmTrackMeasure): number[] => {
    const stepsPerBar = measure.meter.stepResolution;

    return measure.events.filter((event) => {
        return event.noteStyleId !== undefined;
    }).map((event) => {
        return (event.start.numerator * stepsPerBar) / event.start.denominator;
    });
};

/**
 * Lists a measure's events as "start+duration:style" entries, with "-" for rests.
 *
 * @param measure The measure to inspect.
 * @returns One entry per event, in display order.
 */
const eventList = (measure: ISbDmTrackMeasure): string[] => {
    return measure.events.map((event) => {
        const start = `${event.start.numerator}/${event.start.denominator}`;
        const duration = `${event.duration.numerator}/${event.duration.denominator}`;

        return `${start}+${duration}:${event.noteStyleId ?? "-"}`;
    });
};

describe.sequential("ScoreBookDataModel — Auth State", () => {
    let model: ScoreBookDataModel;
    let authChangedCalls: number;
    let authChangedHandler: () => Promise<boolean>;

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        authChangedCalls = 0;
        authChangedHandler = () => {
            authChangedCalls++;

            return Promise.resolve(true);
        };

        requisitions.register("authChanged", authChangedHandler);
    });

    afterEach(() => {
        requisitions.unregister("authChanged", authChangedHandler);
    });

    it("starts unauthenticated with no capabilities", () => {
        expect(model.authenticated).toBe(false);
        expect(model.user).toBeUndefined();
        expect(model.canWriteScores).toBe(false);
        expect(model.capabilities.canEditScores).toBe(false);
    });

    it("login success sets auth state and fires authChanged", async () => {
        const loginResponse = {
            token: "test-token",
            user: { id: 1, username: "admin", displayName: "Admin", isAdmin: true },
            capabilities: {
                canEditScores: true, canManageUsers: true,
                canManageInstruments: true, canExportMP3: true,
            },
        };

        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => {
                return Promise.resolve(loginResponse);
            },
        } as Response);

        const result = await model.login("admin", "admin");

        expect(result).toBe(true);
        expect(model.authenticated).toBe(true);
        expect(model.user?.username).toBe("admin");
        expect(model.canWriteScores).toBe(true);
        expect(authChangedCalls).toBe(1);
    });

    it("login failure keeps unauthenticated state", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
        } as Response);

        const result = await model.login("bad", "wrong");

        expect(result).toBe(false);
        expect(model.authenticated).toBe(false);
        expect(model.canWriteScores).toBe(false);
        expect(authChangedCalls).toBe(0);
    });

    it("logout clears auth state and fires authChanged", async () => {
        // First log in.
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => {
                return Promise.resolve({
                    token: "t", user: { id: 1, username: "u", displayName: "U", isAdmin: false },
                    capabilities: {
                        canEditScores: true, canManageUsers: false,
                        canManageInstruments: false, canExportMP3: false
                    },
                });
            },
        } as Response);

        await model.login("u", "p");
        authChangedCalls = 0; // Reset after login.

        // Mock logout request.
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
        } as Response);

        await model.logout();

        expect(model.authenticated).toBe(false);
        expect(model.user).toBeUndefined();
        expect(model.canWriteScores).toBe(false);
        expect(authChangedCalls).toBe(1);
    });

    it("network error during login returns false", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

        const result = await model.login("admin", "admin");

        expect(result).toBe(false);
        expect(model.authenticated).toBe(false);
    });

    it("fetchApi attaches authorization header when authenticated", async () => {
        // Log in first.
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => {
                return Promise.resolve({
                    token: "my-access-token", user: {
                        id: 1, username: "u",
                        displayName: "U", isAdmin: false
                    },
                    capabilities: {
                        canEditScores: true, canManageUsers: false,
                        canManageInstruments: false, canExportMP3: false
                    },
                });
            },
        } as Response);

        await model.login("u", "p");

        // Now the model has an access token. Spy on fetch again and call a
        // method that goes through fetchApi internally (addScoreFolder).
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => {
                return Promise.resolve({ success: true, id: 42 });
            },
        } as Response);

        await model.addScoreFolder("test");

        // The last fetch call should have the Authorization header.
        const lastCall = fetchSpy.mock.calls.at(-1) as [string, RequestInit];
        const requestInit = lastCall[1];
        const headers = requestInit.headers as Record<string, string>;

        expect(headers.Authorization).toBe("Bearer my-access-token");
    });

    it("canWriteScores getter returns false for anonymous", () => {
        expect(model.canWriteScores).toBe(false);
    });

    it("capabilities getter returns defaults for anonymous", () => {
        const caps = model.capabilities;

        expect(caps.canEditScores).toBe(false);
        expect(caps.canManageUsers).toBe(false);
        expect(caps.canManageInstruments).toBe(false);
        expect(caps.canExportMP3).toBe(false);
    });
});

describe.sequential("ScoreBookDataModel track actions", () => {
    let model: ScoreBookDataModel;
    let mutatedCalls: number;

    const mutationSpy = (): Promise<boolean> => {
        mutatedCalls++;

        return Promise.resolve(true);
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        mutatedCalls = 0;
        requisitions.register("arrangementMutated", mutationSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutationSpy);
    });

    it("addTrack adds a track for the instrument and fires arrangementMutated", () => {
        const instruments = [createInstrument("0", 0, 0), createInstrument("1", 1, 1)];
        model.startNewArrangement([instruments[0]]);

        const track = model.addTrack(instruments[1]);

        expect(model.arrangement!.tracks).toHaveLength(2);
        expect(track.instrument.typeId).toBe("1");
        expect(mutatedCalls).toBe(1);
    });

    it("removeTrack removes the track and fires arrangementMutated", () => {
        const instruments = [createInstrument("0", 0, 0), createInstrument("1", 1, 1)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        const removed = model.removeTrack(track);

        expect(removed).toBe(true);
        expect(model.arrangement!.tracks).toHaveLength(1);
        expect(mutatedCalls).toBe(1);
    });

    it("duplicateTrack copies the track and fires arrangementMutated", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const source = model.arrangement!.tracks[0];

        const duplicate = model.duplicateTrack(source);

        expect(model.arrangement!.tracks).toHaveLength(2);
        expect(duplicate.instrument.typeId).toBe("0");
        expect(mutatedCalls).toBe(1);
    });

    it("clearTrack clears the notes and fires arrangementMutated", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        track.measures[0].events[0].noteStyleId = "1";

        const cleared = model.clearTrack(track);

        expect(cleared).toBe(true);
        expect(track.measures[0].events[0].noteStyleId).toBeUndefined();
        expect(mutatedCalls).toBe(1);
    });

    it("clearTrack returns false and does not fire for an empty track", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);

        const cleared = model.clearTrack(model.arrangement!.tracks[0]);

        expect(cleared).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("setNoteAt writes and clears a cell", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        expect(model.setNoteAt(track.id, 1, stepStart(2), stepDuration, "1")).toBe(true);
        expect(track.measures[0].events.some((event) => {
            return event.noteStyleId === "1";
        })).toBe(true);
        expect(mutatedCalls).toBe(1);

        expect(model.setNoteAt(track.id, 1, stepStart(2), stepDuration)).toBe(true);
        expect(track.measures[0].events.every((event) => {
            return event.noteStyleId === undefined;
        })).toBe(true);
        expect(mutatedCalls).toBe(2);
    });

    it("setNoteAt keeps adjacent same-style notes as separate events", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        // Two adjacent notes with the same style must remain two distinct hits.
        model.setNoteAt(track.id, 1, stepStart(0), stepDuration, "1");
        model.setNoteAt(track.id, 1, stepStart(1), stepDuration, "1");

        const firstNotes = measure.events.filter((event) => {
            return event.noteStyleId === "1";
        });
        expect(firstNotes).toHaveLength(2);

        // A note at the next pulse boundary must not merge with the preceding note either.
        model.setNoteAt(track.id, 1, stepStart(4), stepDuration, "1");

        const notes = measure.events.filter((event) => {
            return event.noteStyleId === "1";
        });

        expect(notes).toHaveLength(3);
        expect(notes[2].start).toEqual({ numerator: 1, denominator: 4 });
    });

    it("setNoteAt targets a subdivision slot by its exact start fraction", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events.splice(0, measure.events.length,
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 6 }, duration: { numerator: 1, denominator: 24 } },
            { start: { numerator: 5, denominator: 24 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        );
        measure.subdivisions.push({ startIndex: 2, actual: 3, normal: 2, isTuplet: true });

        // The middle triplet slot is a rest at 1/6 and must be editable via its exact start.
        const changed = model.setNoteAt(track.id, 1, { numerator: 1, denominator: 6 }, stepDuration, "2");

        expect(changed).toBe(true);
        expect(measure.events[3].noteStyleId).toBe("2");
        expect(measure.events[3].start).toEqual({ numerator: 1, denominator: 6 });
        expect(measure.events[3].duration).toEqual({ numerator: 1, denominator: 24 });
        expect(measure.subdivisions).toEqual([{ startIndex: 2, actual: 3, normal: 2, isTuplet: true }]);
        expect(mutatedCalls).toBe(1);
    });

    it("setNoteAt places a single-step note and notates the remaining rest", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        model.setNoteAt(track.id, 1, stepStart(0), stepDuration, "1");

        expect(measure.events).toHaveLength(3);
        expect(measure.events[0].noteStyleId).toBe("1");
        expect(measure.events[0].start).toEqual({ numerator: 0, denominator: 1 });
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 16 });
        expect(measure.events[1].noteStyleId).toBeUndefined();
        expect(measure.events[1].start).toEqual({ numerator: 1, denominator: 16 });
        expect(measure.events[1].duration).toEqual({ numerator: 3, denominator: 16 });
        expect(measure.events[2].noteStyleId).toBeUndefined();
        expect(measure.events[2].start).toEqual({ numerator: 1, denominator: 4 });
        expect(measure.events[2].duration).toEqual({ numerator: 3, denominator: 4 });
    });

    it("setNoteAt preserves a note that spans a pulse boundary", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events.splice(0, measure.events.length,
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 8 } },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 3, denominator: 8 }, duration: { numerator: 5, denominator: 8 } },
        );

        model.setNoteAt(track.id, 1, stepStart(15), stepDuration, "2");

        const note = measure.events.find((event) => {
            return event.noteStyleId === "1";
        });

        expect(note?.start).toEqual({ numerator: 1, denominator: 8 });
        expect(note?.duration).toEqual({ numerator: 1, denominator: 4 });
        expect(mutatedCalls).toBe(1);
    });

    it("setNoteAt inserts a note of the given duration into a rest", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        expect(model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 4 }, "1")).toBe(true);

        expect(measure.events).toHaveLength(2);
        expect(measure.events[0].noteStyleId).toBe("1");
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 4 });
        expect(measure.events[1].noteStyleId).toBeUndefined();
        expect(measure.events[1].duration).toEqual({ numerator: 3, denominator: 4 });
    });

    it("setNoteAt replaces a same-length note", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 16 }, "1");
        expect(measure.events).toHaveLength(3);

        expect(model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 16 }, "2")).toBe(true);
        expect(measure.events).toHaveLength(3);
        expect(measure.events[0].noteStyleId).toBe("2");
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 16 });
    });

    it("setNoteAt cuts into a longer note", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 4 }, "1");

        expect(model.setNoteAt(track.id, 1, { numerator: 1, denominator: 16 },
            { numerator: 1, denominator: 16 }, "2")).toBe(true);

        expect(measure.events[0]).toMatchObject({
            noteStyleId: "1", start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 16 },
        });
        expect(measure.events[1]).toMatchObject({
            noteStyleId: "2", start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 },
        });
        expect(measure.events[2]).toMatchObject({
            noteStyleId: "1", start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 8 },
        });
    });

    it("setNoteAt consumes following rests when the note at the position is shorter", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 16 }, "1");

        expect(model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 4 }, "2")).toBe(true);

        expect(measure.events).toHaveLength(2);
        expect(measure.events[0].noteStyleId).toBe("2");
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 4 });
        expect(measure.events[1].noteStyleId).toBeUndefined();
        expect(measure.events[1].duration).toEqual({ numerator: 3, denominator: 4 });
    });

    it("setNoteAt rejects when a following note blocks the span", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 16 }, "1");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 16 },
            { numerator: 1, denominator: 16 }, "1");
        const before = measure.events.map((event) => {
            return { ...event, start: { ...event.start }, duration: { ...event.duration } };
        });

        expect(model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 4 }, "2")).toBe(false);
        expect(measure.events).toEqual(before);
        expect(mutatedCalls).toBe(2);
    });

    it("insertEventsWithShift moves following notes into the next measure", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument], { length: 2 });
        const track = model.arrangement!.tracks[0];

        for (let step = 0; step < 4; step++) {
            setCellNote(model, track.id, 1, step, "1");
        }

        for (let step = 8; step < 16; step++) {
            setCellNote(model, track.id, 1, step, "1");
        }

        mutatedCalls = 0;

        // A quarter rest is replaced by two 16th notes and a quarter note, so the content behind it
        // moves two steps to the right and the last two 16th notes flow into the next measure.
        const rest = track.measures[0].events.find((event) => {
            return event.noteStyleId === undefined
                && event.start.numerator === 1 && event.start.denominator === 4;
        })!;
        const changed = model.insertEventsWithShift([{
            measure: track.measures[0],
            from: rest,
            to: rest,
            events: [
                {
                    start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 16 },
                    noteStyleId: "2",
                },
                {
                    start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 },
                    noteStyleId: "2",
                },
                {
                    start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "2",
                },
            ],
        }]);

        expect(changed).toEqual([track.id]);
        expect(noteSteps(track.measures[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15]);
        expect(noteSteps(track.measures[1])).toEqual([0, 1]);

        // The rest behind the notes is combined and split into standard values only.
        expect(track.measures[1].events.map((event) => {
            return event.duration;
        })).toEqual([
            { numerator: 1, denominator: 16 },
            { numerator: 1, denominator: 16 },
            { numerator: 1, denominator: 8 },
            { numerator: 3, denominator: 4 },
        ]);

        const quarter = track.measures[0].events.find((event) => {
            return event.noteStyleId === "2" && event.duration.denominator === 4;
        });
        expect(quarter?.start).toEqual({ numerator: 3, denominator: 8 });
        expect(mutatedCalls).toBe(1);
    });

    it("insertEventsWithShift drops notes pushed past the last measure", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        for (let step = 8; step < 16; step++) {
            setCellNote(model, track.id, 1, step, "1");
        }

        mutatedCalls = 0;

        const rest = track.measures[0].events.find((event) => {
            return event.noteStyleId === undefined;
        })!;
        model.insertEventsWithShift([{
            measure: track.measures[0],
            from: rest,
            to: rest,
            events: [
                {
                    start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "2",
                },
                {
                    start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "2",
                },
                {
                    start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "2",
                },
            ],
        }]);

        // The three quarter notes replace the half rest, so the sixteen notes behind it move a quarter
        // to the right. The four notes that would land behind the single measure are dropped.
        expect(noteSteps(track.measures[0])).toEqual([0, 4, 8, 12, 13, 14, 15]);
    });

    it("insertEventsWithShift skips tracks that contain subdivisions", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument], { length: 2 });
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 },
            3, 4);

        mutatedCalls = 0;

        const rest = track.measures[0].events.find((event) => {
            return event.noteStyleId === undefined;
        })!;
        const changed = model.insertEventsWithShift([{
            measure: track.measures[0],
            from: rest,
            to: rest,
            events: [
                {
                    start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "2",
                },
            ],
        }]);

        expect(changed).toEqual([]);
        expect(mutatedCalls).toBe(0);
    });

    it("insertEventsWithShift keeps the pasted phrase and shifts the rest of the bar", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument], { length: 2 });
        const track = model.arrangement!.tracks[0];

        // Four 16th notes, a quarter rest and eight 16th notes fill the bar.
        for (let step = 0; step < 4; step++) {
            setCellNote(model, track.id, 1, step, "2");
        }

        for (let step = 8; step < 16; step++) {
            setCellNote(model, track.id, 1, step, "2");
        }

        mutatedCalls = 0;

        const rest = track.measures[0].events.find((event) => {
            return event.noteStyleId === undefined
                && event.start.numerator === 1 && event.start.denominator === 4;
        })!;

        // A copied phrase of two 16th notes and a quarter note takes the rest's place.
        const changed = model.insertEventsWithShift([{
            measure: track.measures[0],
            from: rest,
            to: rest,
            events: [
                {
                    start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 16 },
                    noteStyleId: "1",
                },
                {
                    start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 },
                    noteStyleId: "1",
                },
                {
                    start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "1",
                },
            ],
        }]);

        expect(changed).toEqual([track.id]);
        expect(mutatedCalls).toBe(1);

        // The bar stays full and no rest appears: the eight 16th notes give way by two steps.
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/16:2", "1/16+1/16:2", "1/8+1/16:2", "3/16+1/16:2",
            "1/4+1/16:1", "5/16+1/16:1", "3/8+1/4:1",
            "5/8+1/16:2", "11/16+1/16:2", "3/4+1/16:2", "13/16+1/16:2", "7/8+1/16:2", "15/16+1/16:2",
        ]);

        // The two notes that no longer fit continue in the next measure, followed by a plain rest.
        expect(eventList(track.measures[1])).toEqual([
            "0/1+1/16:2", "1/16+1/16:2", "1/8+1/8:-", "1/4+3/4:-",
        ]);
    });

    it("insertEventsWithShift combines the rests around the inserted events", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        // A 16th note, a 7/16 rest and eight 16th notes fill the bar.
        setCellNote(model, track.id, 1, 0, "1");

        for (let step = 8; step < 16; step++) {
            setCellNote(model, track.id, 1, step, "1");
        }

        mutatedCalls = 0;

        // Replacing the note with a 16th rest merges every rest into a single half rest.
        const note = track.measures[0].events[0];
        model.insertEventsWithShift([{
            measure: track.measures[0],
            from: note,
            to: note,
            events: [
                { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 16 } },
            ],
        }]);

        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/2:-",
            "1/2+1/16:1", "9/16+1/16:1", "5/8+1/16:1", "11/16+1/16:1",
            "3/4+1/16:1", "13/16+1/16:1", "7/8+1/16:1", "15/16+1/16:1",
        ]);
    });

    it("deleteEventWithShift removes a note and pulls the following notes to the left", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 }, "1");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 4 }, { numerator: 1, denominator: 4 }, "2");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 1, denominator: 4 }, "3");

        mutatedCalls = 0;
        const deleted = model.deleteEventWithShift(track.id, 1, { numerator: 1, denominator: 4 });

        expect(deleted).toBe(true);
        expect(mutatedCalls).toBe(1);
        // The half rest behind the removed note fills the freed quarter: the last note moves left onto
        // the removed note's position and the rest behind it grows.
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/4:1",
            "1/4+1/4:3",
            "1/2+1/2:-",
        ]);
    });

    it("deleteEventWithShift removes a rest and pulls the following notes to the left", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 }, "1");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 1, denominator: 4 }, "2");

        mutatedCalls = 0;
        const deleted = model.deleteEventWithShift(track.id, 1, { numerator: 1, denominator: 4 });

        expect(deleted).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/4:1",
            "1/4+1/4:2",
            "1/2+1/2:-",
        ]);
    });

    it("deleteEventWithShift keeps every measure tiling its meter", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)], { length: 2 });
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 1, denominator: 4 }, "1");
        model.setNoteAt(track.id, 2, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 }, "2");

        // Removing the trailing quarter rest pulls the whole tail of the track to the left, so the
        // note of the second measure steps over the bar line into the first one.
        expect(model.deleteEventWithShift(track.id, 1, { numerator: 3, denominator: 4 })).toBe(true);
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/2:-",
            "1/2+1/4:1",
            "3/4+1/4:2",
        ]);
        expect(eventList(track.measures[1])).toEqual(["0/1+1/1:-"]);
    });

    it("deleteEventWithShift skips tracks that contain subdivisions", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 },
            3, 4);

        mutatedCalls = 0;

        expect(model.deleteEventWithShift(track.id, 1, { numerator: 1, denominator: 4 })).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("clearAllTracks clears every track and fires arrangementMutated once", () => {
        const instruments = [createInstrument("0", 0, 0), createInstrument("1", 1, 1)];
        model.startNewArrangement(instruments);

        for (const track of model.arrangement!.tracks) {
            track.measures[0].events[0].noteStyleId = "1";
        }

        const cleared = model.clearAllTracks();

        expect(cleared).toBe(true);
        expect(mutatedCalls).toBe(1);

        for (const track of model.arrangement!.tracks) {
            expect(track.measures[0].events[0].noteStyleId).toBeUndefined();
        }
    });

    it("clearRanges clears a range and fires arrangementMutated once", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        track.measures[0].events.splice(0, track.measures[0].events.length,
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 2, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 3, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 4, denominator: 16 }, duration: { numerator: 12, denominator: 16 } },
        );

        const cleared = model.clearRanges([{ trackId: track.id, bar: 1, start: stepStart(1), end: stepStart(3) }]);

        expect(cleared).toBe(true);
        // The cleared steps become a combined rest; the surrounding notes keep their durations.
        expect(track.measures[0].events).toHaveLength(4);
        expect(track.measures[0].events[0].noteStyleId).toBe("1");
        expect(track.measures[0].events[0].duration).toEqual({ numerator: 1, denominator: 16 });
        expect(track.measures[0].events[1].noteStyleId).toBeUndefined();
        expect(track.measures[0].events[1].duration).toEqual({ numerator: 1, denominator: 8 });
        expect(track.measures[0].events[2].noteStyleId).toBe("1");
        expect(track.measures[0].events[2].duration).toEqual({ numerator: 1, denominator: 16 });
        expect(track.measures[0].events[3].noteStyleId).toBeUndefined();
        expect(mutatedCalls).toBe(1);
    });

    it("clearRanges clears a whole measure including its subdivisions", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events[0].noteStyleId = "1";
        measure.subdivisions.push({ startIndex: 0, actual: 3, normal: 1, isTuplet: true });

        const cleared = model.clearRanges([{ trackId: track.id, bar: 1 }]);

        expect(cleared).toBe(true);
        expect(measure.events.every((event) => {
            return event.noteStyleId === undefined;
        })).toBe(true);
        expect(measure.subdivisions).toHaveLength(0);
        expect(mutatedCalls).toBe(1);
    });

    it("clearRanges batches ranges across tracks into one arrangementMutated", () => {
        const instruments = [createInstrument("0", 0, 0), createInstrument("1", 1, 1)];
        model.startNewArrangement(instruments);
        const first = model.arrangement!.tracks[0];
        const second = model.arrangement!.tracks[1];

        first.measures[0].events[0].noteStyleId = "1";
        second.measures[0].events[0].noteStyleId = "1";

        const cleared = model.clearRanges([
            { trackId: first.id, bar: 1, start: stepStart(0), end: stepStart(1) },
            { trackId: second.id, bar: 1, start: stepStart(0), end: stepStart(1) },
        ]);

        expect(cleared).toBe(true);
        expect(first.measures[0].events[0].noteStyleId).toBeUndefined();
        expect(second.measures[0].events[0].noteStyleId).toBeUndefined();
        expect(mutatedCalls).toBe(1);
    });

    it("clearRanges fires trackChanged for each affected track", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        const trackChangedTracks: number[] = [];
        const trackChangedHandler = (trackId: number): Promise<boolean> => {
            trackChangedTracks.push(trackId);

            return Promise.resolve(true);
        };

        requisitions.register("trackChanged", trackChangedHandler);
        track.measures[0].events[0].noteStyleId = "1";

        const cleared = model.clearRanges([{ trackId: track.id, bar: 1, start: stepStart(0), end: stepStart(1) }]);
        requisitions.unregister("trackChanged", trackChangedHandler);

        expect(cleared).toBe(true);
        expect(trackChangedTracks).toEqual([track.id]);
    });

    it("clearRanges returns false for ranges without content", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        const cleared = model.clearRanges([{ trackId: track.id, bar: 1, start: stepStart(0), end: stepStart(1) }]);

        expect(cleared).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("clearRanges is a no-op for an empty cell inside a note's span", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        // A note occupies the first cell; the following cells are an empty rest.
        setCellNote(model, track.id, 1, 0, "1");
        mutatedCalls = 0;

        const cleared = model.clearRanges([{ trackId: track.id, bar: 1, start: stepStart(1), end: stepStart(2) }]);

        expect(cleared).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("clearRanges preserves subdivisions when clearing a cell before them", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events.splice(0, measure.events.length,
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 6 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 5, denominator: 24 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        );
        measure.subdivisions.push({ startIndex: 2, actual: 3, normal: 2, isTuplet: true });

        const cleared = model.clearRanges([{ trackId: track.id, bar: 1, start: stepStart(1), end: stepStart(2) }]);

        expect(cleared).toBe(true);
        expect(measure.subdivisions).toEqual([{ startIndex: 2, actual: 3, normal: 2, isTuplet: true }]);
        expect(measure.events).toHaveLength(6);
        expect(measure.events[0].noteStyleId).toBe("1");
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 16 });
        expect(measure.events[1].noteStyleId).toBeUndefined();
        expect(measure.events[1].duration).toEqual({ numerator: 1, denominator: 16 });
    });

    it("createSubdivision creates a triplet of rest slots and fires arrangementMutated", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        const created = model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 3, 2);

        expect(created).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(measure.subdivisions).toEqual([{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);
        expect(measure.events).toHaveLength(4);
        expect(measure.events[0]).toMatchObject({ start: { numerator: 0, denominator: 1 } });
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 24 });
        expect(measure.events[1].duration).toEqual({ numerator: 1, denominator: 24 });
        expect(measure.events[2].duration).toEqual({ numerator: 1, denominator: 24 });
        expect(measure.events[3]).toMatchObject({ start: { numerator: 1, denominator: 8 } });
    });

    it("createSubdivision rejects invalid note or step counts", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        const created = model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 0, 2);

        expect(created).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("deleteSubdivisionAt removes the subdivision and restores grid rests", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 3, 2);
        mutatedCalls = 0;

        const deleted = model.deleteSubdivisionAt(track.id, 1, { numerator: 0, denominator: 1 });

        expect(deleted).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(measure.subdivisions).toHaveLength(0);
        expect(measure.events).toHaveLength(3);
        expect(measure.events[0]).toMatchObject({
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 16 },
        });
        expect(measure.events[1]).toMatchObject({
            start: { numerator: 1, denominator: 16 },
            duration: { numerator: 1, denominator: 16 },
        });
        expect(measure.events[2]).toMatchObject({ start: { numerator: 1, denominator: 8 } });
    });

    it("deleteSubdivisionAt returns false when no subdivision starts at the position", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        const deleted = model.deleteSubdivisionAt(track.id, 1, { numerator: 0, denominator: 1 });

        expect(deleted).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("deleteSubdivisionAt fires even when only the annotation changes", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events.splice(0, measure.events.length,
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 } },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 } },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 7, denominator: 8 } },
        );
        measure.subdivisions.push({ startIndex: 0, actual: 2, normal: 2, isTuplet: false });

        const deleted = model.deleteSubdivisionAt(track.id, 1, { numerator: 0, denominator: 1 });

        expect(deleted).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(measure.subdivisions).toHaveLength(0);
        expect(measure.events).toHaveLength(3);
    });
});
