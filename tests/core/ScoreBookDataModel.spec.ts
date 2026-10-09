/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStorage } from "../../src/core/AppStorage.js";
import { Arrangement } from "../../src/core/Arrangement.js";
import { MeasureLayout } from "../../src/core/MeasureLayout.js";
import { HairpinEnd, RangeArticulations } from "../../src/core/RangeArticulations.js";
import { ScoreBookDataModel, type ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
import { reduceFraction } from "../../src/core/serialisation/numeric-functions.js";
import type { IFraction, IMeasureEvent, IRangeArticulation, IRangeArticulationAnchor }
    from "../../src/core/types/general.js";
import { RangeArticulationKind, RepeatMark } from "../../src/core/types/general.js";
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
const noteSteps = (measure: ISbDmTrackPiece): number[] => {
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
const eventList = (measure: ISbDmTrackPiece): string[] => {
    return measure.events.map((event) => {
        const start = `${event.start.numerator}/${event.start.denominator}`;
        const duration = `${event.duration.numerator}/${event.duration.denominator}`;

        return `${start}+${duration}:${event.noteStyleId ?? "-"}`;
    });
};

/**
 * Lists the spans of a measure's notes, which also covers starts between two grid steps.
 *
 * @param measure The measure to inspect.
 * @returns One "start+duration" entry per note, in display order.
 */
const noteSpans = (measure: ISbDmTrackPiece): string[] => {
    return measure.events.filter((event) => {
        return event.noteStyleId !== undefined;
    }).map((event) => {
        return `${event.start.numerator}/${event.start.denominator}`
            + `+${event.duration.numerator}/${event.duration.denominator}`;
    });
};

describe("ScoreBookDataModel — Auth State", { concurrent: false }, () => {
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

describe("ScoreBookDataModel track actions", { concurrent: false }, () => {
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
        expect(measure.events[1].duration).toEqual({ numerator: 3, denominator: 4 });
        expect(measure.events[2].noteStyleId).toBeUndefined();
        expect(measure.events[2].start).toEqual({ numerator: 13, denominator: 16 });
        expect(measure.events[2].duration).toEqual({ numerator: 3, denominator: 16 });
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

        // The rest behind the notes is combined and split into standard values only, largest first.
        expect(track.measures[1].events.map((event) => {
            return event.duration;
        })).toEqual([
            { numerator: 1, denominator: 16 },
            { numerator: 1, denominator: 16 },
            { numerator: 3, denominator: 4 },
            { numerator: 1, denominator: 8 },
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

    it("insertEventsAt inserts an element and moves the content behind it", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument], { length: 2 });
        const track = model.arrangement!.tracks[0];

        for (const step of [0, 4, 8, 12]) {
            setCellNote(model, track.id, 1, step, "1");
        }

        mutatedCalls = 0;
        const changed = model.insertEventsAt([{
            measure: track.measures[0],
            start: stepStart(4),
            events: [{
                start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
                noteStyleId: "2",
            }],
        }]);

        expect(changed).toEqual([track.id]);
        expect(noteSpans(track.measures[0])).toEqual(["0/1+1/16", "1/4+1/4", "1/2+1/16", "3/4+1/16"]);
        expect(noteSpans(track.measures[1])).toEqual(["0/1+1/16"]);
        expect(mutatedCalls).toBe(1);
    });

    it("insertEventsAt pushes a subdivision block as a whole", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument], { length: 2 });
        const track = model.arrangement!.tracks[0];

        model.createSubdivision(track.id, 1, { numerator: 1, denominator: 4 }, { numerator: 1, denominator: 2 },
            3, 4);

        model.insertEventsAt([{
            measure: track.measures[0],
            start: { numerator: 0, denominator: 1 },
            events: [{
                start: { numerator: 0, denominator: 1 }, duration: stepDuration, noteStyleId: "2",
            }],
        }]);

        // The block keeps its three slots and moves behind the inserted note.
        const subdivision = track.measures[0].subdivisions[0];
        expect(subdivision).toBeDefined();
        expect(track.measures[0].events[subdivision.startIndex].start).toEqual({
            numerator: 5, denominator: 16,
        });
        expect(noteSpans(track.measures[0])).toEqual(["0/1+1/16"]);
    });

    it("insertEventsAt moves a subdivision block into the next measure", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument], { length: 2 });
        const track = model.arrangement!.tracks[0];

        model.createSubdivision(track.id, 1, { numerator: 3, denominator: 4 }, { numerator: 1, denominator: 1 },
            3, 4);

        model.insertEventsAt([{
            measure: track.measures[0],
            start: { numerator: 3, denominator: 4 },
            events: [{
                start: { numerator: 0, denominator: 1 }, duration: stepDuration, noteStyleId: "2",
            }],
        }]);

        expect(track.measures[0].subdivisions).toEqual([]);
        expect(noteSpans(track.measures[0])).toEqual(["3/4+1/16"]);

        const moved = track.measures[1].subdivisions[0];
        expect(moved).toBeDefined();
        expect(track.measures[1].events[moved.startIndex].start).toEqual({ numerator: 0, denominator: 1 });
    });

    it("deleteEventWithShift removes an event in front of a subdivision", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument], { length: 1 });
        const track = model.arrangement!.tracks[0];

        setCellNote(model, track.id, 1, 0, "1");
        model.createSubdivision(track.id, 1, { numerator: 1, denominator: 4 }, { numerator: 1, denominator: 2 },
            3, 4);

        expect(model.deleteEventWithShift(track.id, 1, { numerator: 0, denominator: 1 })).toBe(true);
        expect(noteSpans(track.measures[0])).toEqual([]);
    });

    it("insertEventsAt moves an element that overshoots the bar line into a new bar", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        model.insertEventsAt([{
            measure: track.measures[0],
            start: stepStart(15),
            events: [{
                start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
                noteStyleId: "2",
            }],
        }]);

        expect(model.arrangement!.timeParams.length).toBe(2);
        expect(track.measures).toHaveLength(2);
        expect(noteSpans(track.measures[0])).toEqual([]);
        expect(noteSpans(track.measures[1])).toEqual(["0/1+1/4"]);
    });

    it("insertEventsAt grows the arrangement instead of dropping pushed content", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        setCellNote(model, track.id, 1, 12, "1");

        model.insertEventsAt([{
            measure: track.measures[0],
            start: stepStart(0),
            events: [{
                start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 2 },
                noteStyleId: "2",
            }],
        }]);

        expect(model.arrangement!.timeParams.length).toBe(2);
        expect(noteSpans(track.measures[0])).toEqual(["0/1+1/2"]);
        expect(noteSpans(track.measures[1])).toEqual(["1/4+1/16"]);
    });

    it("setNoteAt adds the bar the write addresses", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        expect(model.setNoteAt(track.id, 2, stepStart(0), stepDuration, "1")).toBe(true);
        expect(model.arrangement!.timeParams.length).toBe(2);
        expect(noteSpans(track.measures[1])).toEqual(["0/1+1/16"]);
    });

    it("keeps the content inside the last bar when growing is switched off", () => {
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({ autoExtendOnOverflow: false });
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        setCellNote(model, track.id, 1, 12, "1");

        model.insertEventsAt([{
            measure: track.measures[0],
            start: stepStart(0),
            events: [{
                start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 2 },
                noteStyleId: "2",
            }],
        }]);

        expect(model.arrangement!.timeParams.length).toBe(1);
        expect(noteSpans(track.measures[0])).toEqual(["0/1+1/2"]);
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

        // The two notes that no longer fit continue in the next measure, followed by rests.
        expect(eventList(track.measures[1])).toEqual([
            "0/1+1/16:2", "1/16+1/16:2", "1/8+3/4:-", "7/8+1/8:-",
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

    it("resizeEvents gives a rest a new length and moves the following notes", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 }, "1");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 1, denominator: 4 }, "2");

        mutatedCalls = 0;
        const changed = model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 2 },
        }]);

        expect(changed).toBe(true);
        expect(mutatedCalls).toBe(1);
        // The quarter rest between the notes grows to a half, so the second note moves behind it.
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/4:1",
            "1/4+1/2:-",
            "3/4+1/4:2",
        ]);
    });

    it("resizeEvents applies notes and rests of one selection in a single edit", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 }, "1");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 1, denominator: 4 }, "2");

        mutatedCalls = 0;
        const changed = model.resizeEvents(track.id, [
            { bar: 1, start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 8 } },
            { bar: 1, start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 8 } },
        ]);

        expect(changed).toBe(true);
        expect(mutatedCalls).toBe(1);
        // The rest shrinks to an eighth and pulls the note behind it left; the note keeps its start
        // because it was resized first, as the requests run from the last one to the first.
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/4:1",
            "1/4+1/8:-",
            "3/8+1/8:2",
            "1/2+1/2:-",
        ]);
    });

    it("resizeEvents caps a rest at the bar line", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];

        // The trailing quarter rest of the measure cannot grow into a half.
        const changed = model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 3, denominator: 4 }, duration: { numerator: 1, denominator: 2 },
        }]);

        expect(changed).toBe(false);
        expect(eventList(track.measures[0])).toEqual(["0/1+1/1:-"]);
    });

    it("splits the only rest of a measure into the requested part", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];

        // Nothing gives way behind the measure's only rest, so the request shapes the notation: the rest
        // takes a half and the space behind it becomes the second half rest.
        mutatedCalls = 0;
        const changed = model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 2 },
        }]);

        expect(changed).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(eventList(track.measures[0])).toEqual(["0/1+1/2:-", "1/2+1/2:-"]);

        // A part of the split is resized on its own: the rest of the measure keeps its structure.
        expect(model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
        }])).toBe(true);
        expect(eventList(track.measures[0])).toEqual(["0/1+1/4:-", "1/4+1/4:-", "1/2+1/2:-"]);
    });

    it("keeps a split rest when a later layout rewrites the track", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.ensureBarAvailable(2);

        model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 2 },
        }]);

        // An edit in another measure lays the whole track out again, which keeps the split.
        expect(model.resizeEvents(track.id, [{
            bar: 2, start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
        }])).toBe(true);

        expect(eventList(track.measures[0])).toEqual(["0/1+1/2:-", "1/2+1/2:-"]);
    });

    it("joins the split rests again when the addressed rest takes the whole measure", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 2 },
        }]);

        expect(model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 },
        }])).toBe(true);

        expect(eventList(track.measures[0])).toEqual(["0/1+1/1:-"]);
    });

    it("resizes a note whose start sits between two grid steps", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 32 }, "1");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 16 }, { numerator: 1, denominator: 16 }, "2");

        mutatedCalls = 0;
        const changed = model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 8 },
        }]);

        expect(changed).toBe(true);
        expect(mutatedCalls).toBe(1);
        // The second note keeps its half-step start and grows: neither its position nor the
        // thirty-second before it stops the space making.
        expect(noteSpans(track.measures[0])).toEqual(["0/1+1/32", "1/16+1/8"]);
    });

    it("deleteEventWithShift works on a track holding a sub-step note", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 32 }, "1");
        model.setNoteAt(track.id, 1, { numerator: 1, denominator: 16 }, { numerator: 1, denominator: 16 }, "2");

        mutatedCalls = 0;
        const deleted = model.deleteEventWithShift(track.id, 1, { numerator: 1, denominator: 16 });

        expect(deleted).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(noteSpans(track.measures[0])).toEqual(["0/1+1/32"]);
    });

    it("resizeEvents keeps the slots of a subdivision at their length", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 3, denominator: 4 },
            3, 4);

        mutatedCalls = 0;

        // A slot's length follows from the subdivision's ratio, so the request cannot change it.
        const changed = model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 7, denominator: 12 }, duration: { numerator: 1, denominator: 8 },
        }]);

        expect(changed).toBe(false);
        expect(mutatedCalls).toBe(0);
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/2:-",
            "1/2+1/12:-",
            "7/12+1/12:-",
            "2/3+1/12:-",
            "3/4+1/4:-",
        ]);
    });

    it("resizeEvents moves a subdivision aside when a note in front of it grows", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 }, "1");
        model.createSubdivision(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 3, denominator: 4 },
            3, 4);

        mutatedCalls = 0;
        const changed = model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 0, denominator: 1 }, duration: { numerator: 3, denominator: 4 },
        }]);

        expect(changed).toBe(true);
        expect(mutatedCalls).toBe(1);
        // The subdivision steps aside as one block: its slots keep their length and their spacing, and
        // its record follows the first slot to its new index.
        expect(eventList(track.measures[0])).toEqual([
            "0/1+3/4:1",
            "3/4+1/12:-",
            "5/6+1/12:-",
            "11/12+1/12:-",
        ]);

        const measure = track.measures[0];
        const subdivision = measure.subdivisions[0];
        expect(subdivision.actual).toBe(3);
        expect(subdivision.normal).toBe(4);
        expect(measure.events[subdivision.startIndex].start).toEqual({ numerator: 3, denominator: 4 });
    });

    it("resizeEvents moves a subdivision aside when a rest in front of it shrinks", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1, { numerator: 1, denominator: 2 }, { numerator: 3, denominator: 4 },
            3, 4);

        mutatedCalls = 0;
        const changed = model.resizeEvents(track.id, [{
            bar: 1, start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
        }]);

        expect(changed).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/4:-",
            "1/4+1/12:-",
            "1/3+1/12:-",
            "5/12+1/12:-",
            "1/2+1/2:-",
        ]);
    });

    it("deleteEventWithShift reports no change for the closing rest behind a subdivision", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 },
            3, 4);

        mutatedCalls = 0;

        // The rest is pulled left and notated again at the same place, so nothing changed at all.
        expect(model.deleteEventWithShift(track.id, 1, { numerator: 1, denominator: 4 })).toBe(false);
        expect(mutatedCalls).toBe(0);
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/12:-",
            "1/12+1/12:-",
            "1/6+1/12:-",
            "1/4+3/4:-",
        ]);
    });

    it("deleteEventWithShift moves a subdivision block up when an event in front of it goes", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events.splice(0, measure.events.length,
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 } },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 } },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 }, noteStyleId: "1" },
        );
        model.createSubdivision(track.id, 1, { numerator: 1, denominator: 4 }, { numerator: 1, denominator: 2 }, 3, 4);

        mutatedCalls = 0;

        expect(model.deleteEventWithShift(track.id, 1, { numerator: 0, denominator: 1 })).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(eventList(measure)).toEqual([
            "0/1+1/12:-",
            "1/12+1/12:-",
            "1/6+1/12:-",
            "1/4+1/2:1",
            "3/4+1/4:-",
        ]);
    });

    it("deleteEventWithShift refuses a slot inside a subdivision", () => {
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 },
            3, 4);

        mutatedCalls = 0;

        // A slot cannot give way, so its deletion is refused and the controller clears it instead.
        expect(model.deleteEventWithShift(track.id, 1, { numerator: 1, denominator: 12 })).toBe(false);
        expect(mutatedCalls).toBe(0);
        expect(eventList(track.measures[0])).toEqual([
            "0/1+1/12:-",
            "1/12+1/12:-",
            "1/6+1/12:-",
            "1/4+3/4:-",
        ]);
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

    it("setNoteStyles writes single events and fires arrangementMutated once", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events.splice(0, measure.events.length,
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 7, denominator: 8 } },
        );
        mutatedCalls = 0;

        const changed = model.setNoteStyles([{
            trackId: track.id,
            bar: 1,
            start: { numerator: 1, denominator: 16 },
            noteStyleId: "2",
        }]);

        expect(changed).toBe(true);
        expect(mutatedCalls).toBe(1);
        expect(measure.events[0].noteStyleId).toBe("1");
        expect(measure.events[1].noteStyleId).toBe("2");
        expect(measure.events[1].duration).toEqual({ numerator: 1, denominator: 16 });
        expect(measure.events[2].noteStyleId).toBeUndefined();
    });

    it("setNoteStyles ignores assignments for unknown events", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        mutatedCalls = 0;

        const changed = model.setNoteStyles([{
            trackId: track.id,
            bar: 1,
            start: { numerator: 5, denominator: 16 },
            noteStyleId: "2",
        }]);

        expect(changed).toBe(false);
        expect(mutatedCalls).toBe(0);
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

    it("createSubdivision refuses a third tuplet level", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        // A triplet over a quarter and, inside it, a triplet over two of its slots: the second level.
        expect(model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 4 }, 3, 2)).toBe(true);
        expect(model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 6 }, 3, 2)).toBe(true);

        mutatedCalls = 0;
        const created = model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 9 }, 3, 2);

        // The staff draws one bracket above and one below the notes, so a third level is refused.
        expect(created).toBe(false);
        expect(mutatedCalls).toBe(0);
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

/**
 * Builds sixteen sixteenth notes tiling one bar of the test arrangement.
 *
 * @returns The measure's events.
 */
const sixteenthNotes = (): IMeasureEvent[] => {
    return Array.from({ length: 16 }, (_, index) => {
        return {
            start: { numerator: index, denominator: 16 },
            duration: { numerator: 1, denominator: 16 },
            noteStyleId: "1",
        };
    });
};

describe("ScoreBookDataModel measure widths", { concurrent: false }, () => {
    let model: ScoreBookDataModel;
    let widths: Map<number, number>;
    let mutatedCalls: number;
    let changedCalls: number;

    const mutatedSpy = (): Promise<boolean> => {
        mutatedCalls++;

        return Promise.resolve(true);
    };

    const changedSpy = (): Promise<boolean> => {
        changedCalls++;

        return Promise.resolve(true);
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        mutatedCalls = 0;
        changedCalls = 0;
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        widths = model.arrangement!.measureWidths!;
        requisitions.register("arrangementMutated", mutatedSpy);
        requisitions.register("arrangementChanged", changedSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutatedSpy);
        requisitions.unregister("arrangementChanged", changedSpy);
    });

    it("stores a width and refreshes the layout without recording an undo step", () => {
        expect(model.setMeasureWidth(1, 2000)).toBe(true);
        expect(widths.get(1)).toBe(2000);
        expect(changedCalls).toBe(1);
        expect(mutatedCalls).toBe(0);
    });

    it("raises a width below the floor to the smallest width the measure fits in", () => {
        const floor = MeasureLayout.minimumWidthOfMeasure(model.arrangement!, 1);

        expect(model.setMeasureWidth(1, floor - 100)).toBe(true);
        expect(widths.get(1)).toBe(floor);
    });

    it("restores the default width when the width is undefined", () => {
        model.setMeasureWidth(1, 2000);

        expect(model.setMeasureWidth(1, undefined)).toBe(true);
        expect(widths.has(1)).toBe(false);
    });

    it("stores no width for a measure at its default width", () => {
        expect(model.setMeasureWidth(1, MeasureLayout.defaultWidth())).toBe(false);
        expect(widths.size).toBe(0);
    });

    it("ignores a measure the arrangement does not have", () => {
        expect(model.setMeasureWidth(5, 2000)).toBe(false);
        expect(widths.size).toBe(0);
    });

    it("records the whole gesture as one undo step", () => {
        model.setMeasureWidth(1, 2000);
        model.setMeasureWidth(1, 2100);
        model.commitMeasureWidths();

        expect(mutatedCalls).toBe(1);
    });

    it("widens a measure whose edit packs it tighter than its width, as the same undo step", () => {
        const track = model.arrangement!.tracks[0];
        const floor = MeasureLayout.minimumWidthOfMeasure(model.arrangement!, 1);
        expect(model.setMeasureWidth(1, floor)).toBe(true);
        expect(widths.get(1)).toBe(floor);

        const before = mutatedCalls;
        model.replaceMeasureContent([{ trackId: track.id, bar: 1, events: sixteenthNotes(), subdivisions: [] }]);

        const widened = MeasureLayout.minimumWidthOfMeasure(model.arrangement!, 1);
        expect(widened).toBeGreaterThan(floor);
        expect(widths.get(1)).toBe(widened);
        expect(mutatedCalls - before).toBe(1);
    });

    it("leaves a measure without a width at its default width", () => {
        const track = model.arrangement!.tracks[0];

        model.replaceMeasureContent([{ trackId: track.id, bar: 1, events: sixteenthNotes(), subdivisions: [] }]);

        expect(widths.size).toBe(0);
    });
});

describe("ScoreBookDataModel one-bar repeat (simile)", { concurrent: false }, () => {
    let model: ScoreBookDataModel;
    let trackId: number;
    let mutatedCalls: number;

    const mutatedSpy = (): Promise<boolean> => {
        mutatedCalls++;

        return Promise.resolve(true);
    };

    beforeEach(() => {
        mutatedCalls = 0;
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)], { length: 2 });
        trackId = model.arrangement!.tracks[0].id;
        requisitions.register("arrangementMutated", mutatedSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutatedSpy);
    });

    it("empties the track piece and marks it, as one undo step", () => {
        setCellNote(model, trackId, 2, 0, "1");
        mutatedCalls = 0;

        expect(model.setMeasureSimiles([{ trackId, bar: 2 }], true)).toBe(true);

        const piece = model.arrangement!.tracks[0].measures[1];
        expect(piece.simile).toBe(true);
        expect(piece.events).toHaveLength(1);
        expect(piece.events[0].noteStyleId).toBeUndefined();
        expect(piece.subdivisions).toHaveLength(0);
        expect(mutatedCalls).toBe(1);
    });

    it("clears the mark and leaves the piece empty", () => {
        model.setMeasureSimiles([{ trackId, bar: 2 }], true);
        mutatedCalls = 0;

        expect(model.setMeasureSimiles([{ trackId, bar: 2 }], false)).toBe(true);

        const piece = model.arrangement!.tracks[0].measures[1];
        expect(piece.simile).toBeUndefined();
        expect(piece.events).toHaveLength(1);
        expect(mutatedCalls).toBe(1);
    });

    it("refuses the first measure of a track", () => {
        expect(model.setMeasureSimiles([{ trackId, bar: 1 }], true)).toBe(false);
        expect(model.arrangement!.tracks[0].measures[0].simile).toBeUndefined();
        expect(mutatedCalls).toBe(0);
    });

    it("is a no-op when the mark already holds the requested state", () => {
        model.setMeasureSimiles([{ trackId, bar: 2 }], true);
        mutatedCalls = 0;

        expect(model.setMeasureSimiles([{ trackId, bar: 2 }], true)).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("treats a batch of track pieces as one edit", () => {
        model.startNewArrangement([createInstrument("0", 0, 0), createInstrument("1", 1, 1)], { length: 2 });
        const first = model.arrangement!.tracks[0].id;
        const second = model.arrangement!.tracks[1].id;

        expect(model.setMeasureSimiles([{ trackId: first, bar: 2 }, { trackId: second, bar: 2 }], true)).toBe(true);

        expect(model.arrangement!.tracks[0].measures[1].simile).toBe(true);
        expect(model.arrangement!.tracks[1].measures[1].simile).toBe(true);
        expect(mutatedCalls).toBe(1);
    });

    it("drops a mark that a bar deletion moves onto the first measure", () => {
        model.setMeasureSimiles([{ trackId, bar: 2 }], true);

        model.deleteBar(1);

        const piece = model.arrangement!.tracks[0].measures[0];
        expect(piece.number).toBe(1);
        expect(piece.simile).toBeUndefined();
    });
});

describe("ScoreBookDataModel repeat barlines", { concurrent: false }, () => {
    let model: ScoreBookDataModel;
    let mutatedCalls: number;

    const mutatedSpy = (): Promise<boolean> => {
        mutatedCalls++;

        return Promise.resolve(true);
    };

    beforeEach(() => {
        mutatedCalls = 0;
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)], { length: 3 });
        requisitions.register("arrangementMutated", mutatedSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutatedSpy);
    });

    it("marks the bars the edit addresses, as one undo step", () => {
        expect(model.setRepeatBars([1, 3], RepeatMark.Start, true)).toBe(true);

        expect(model.arrangement!.repeatBars?.get(1)).toEqual({ start: true });
        expect(model.arrangement!.repeatBars?.get(3)).toEqual({ start: true });
        expect(mutatedCalls).toBe(1);
    });

    it("keeps the other mark of a bar and drops the bar once both are gone", () => {
        model.setRepeatBars([2], RepeatMark.Start, true);
        model.setRepeatBars([2], RepeatMark.End, true);
        expect(model.arrangement!.repeatBars?.get(2)).toEqual({ start: true, end: true });

        mutatedCalls = 0;
        expect(model.setRepeatBars([2], RepeatMark.Start, false)).toBe(true);
        expect(model.arrangement!.repeatBars?.get(2)).toEqual({ end: true });
        expect(mutatedCalls).toBe(1);

        expect(model.setRepeatBars([2], RepeatMark.End, false)).toBe(true);
        expect(model.arrangement!.repeatBars?.size).toBe(0);
    });

    it("ignores bars outside the arrangement and a mark that already holds", () => {
        model.setRepeatBars([2], RepeatMark.End, true);
        mutatedCalls = 0;

        expect(model.setRepeatBars([2, 4, 0], RepeatMark.End, true)).toBe(false);
        expect(mutatedCalls).toBe(0);
    });
});

describe("ScoreBookDataModel — Range Articulations", { concurrent: false }, () => {
    let model: ScoreBookDataModel;
    let mutatedCalls: number;

    /**
     * @param trackIndex The track to look in.
     *
     * @returns The id of that track.
     */
    const trackIdOf = (trackIndex: number): number => {
        return model.arrangement!.tracks[trackIndex].id;
    };

    /**
     * @param bar The 1-based measure to look in.
     * @param trackIndex The track to look in.
     *
     * @returns The anchors of that measure's notes, in order.
     */
    const noteAnchorsIn = (bar: number, trackIndex: number): IRangeArticulationAnchor[] => {
        return model.arrangement!.tracks[trackIndex].measures[bar - 1].events.filter((event) => {
            return event.noteStyleId !== undefined;
        }).map((event) => {
            return { bar, start: { ...event.start } };
        });
    };

    /**
     * @param bar The 1-based measure to look in.
     * @param trackIndex The track to look in.
     *
     * @returns The anchor of the first event of that measure that carries no note.
     */
    const restAnchorIn = (bar: number, trackIndex: number): IRangeArticulationAnchor => {
        const rest = model.arrangement!.tracks[trackIndex].measures[bar - 1].events.find((event) => {
            return event.noteStyleId === undefined;
        });
        if (rest === undefined) {
            throw new Error(`The measure ${bar} of track ${trackIndex} holds no rest.`);
        }

        return { bar, start: { ...rest.start } };
    };

    /**
     * @returns The markings the arrangement holds, in insertion order.
     */
    const markings = (): IRangeArticulation[] => {
        return model.arrangement!.rangeArticulations?.all.slice() ?? [];
    };

    const mutatedSpy = (): Promise<boolean> => {
        mutatedCalls++;

        return Promise.resolve(true);
    };

    beforeEach(() => {
        mutatedCalls = 0;
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0), createInstrument("1", 1, 1)], { length: 2 });

        // Every even step of both tracks carries a note, so the odd ones stay rests.
        for (const trackIndex of [0, 1]) {
            for (const bar of [1, 2]) {
                for (let step = 0; step < 16; step += 2) {
                    setCellNote(model, trackIdOf(trackIndex), bar, step, "1");
                }
            }
        }

        requisitions.register("arrangementMutated", mutatedSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutatedSpy);
    });

    it("inserts a hairpin between two notes as one undo step", () => {
        const notes = noteAnchorsIn(1, 0);

        const hairpin = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]);

        expect(hairpin?.kind).toBe(RangeArticulationKind.Crescendo);
        expect(hairpin?.trackId).toBe(trackIdOf(0));
        expect(markings()).toEqual([hairpin]);
        expect(mutatedCalls).toBe(1);
    });

    it("refuses a hairpin that rests, overlaps another or runs against its own order", () => {
        const notes = noteAnchorsIn(1, 0);

        expect(model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], restAnchorIn(1, 0)))
            .toBeUndefined();
        expect(model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2])).toBeDefined();

        mutatedCalls = 0;
        expect(model.insertHairpin(RangeArticulationKind.Decrescendo, trackIdOf(0), notes[1], notes[3]))
            .toBeUndefined();
        expect(model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[2], notes[0]))
            .toBeUndefined();
        expect(mutatedCalls).toBe(0);
    });

    it("keeps an f out of a hairpin and a hairpin off an f", () => {
        const notes = noteAnchorsIn(1, 0);
        const hairpin = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[4]);
        if (hairpin === undefined) {
            throw new Error("Expected the hairpin to be inserted.");
        }

        mutatedCalls = 0;
        expect(model.insertForteMark(trackIdOf(0), notes[2])).toBeUndefined();

        model.removeRangeArticulation(hairpin.id);
        expect(model.insertForteMark(trackIdOf(0), notes[2])).toBeDefined();

        mutatedCalls = 0;
        expect(model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[4]))
            .toBeUndefined();
        expect(model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[2], notes[6]))
            .toBeUndefined();
        expect(mutatedCalls).toBe(0);
    });

    it("places an f on a rest and refuses a second one on that event", () => {
        const rest = restAnchorIn(1, 0);

        const mark = model.insertForteMark(trackIdOf(0), rest);

        expect(mark?.kind).toBe(RangeArticulationKind.Forte);
        expect(mutatedCalls).toBe(1);

        mutatedCalls = 0;
        expect(model.insertForteMark(trackIdOf(0), rest)).toBeUndefined();
        expect(mutatedCalls).toBe(0);
    });

    it("moves one end of a hairpin and turns it around when it passes the other", () => {
        const notes = noteAnchorsIn(1, 0);
        const hairpin = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[4]);
        if (hairpin === undefined) {
            throw new Error("Expected the hairpin to be inserted.");
        }

        mutatedCalls = 0;
        expect(model.moveHairpinAnchor(hairpin.id, trackIdOf(0), HairpinEnd.From, notes[6])).toBe(true);

        const turned = markings()[0];
        if (!RangeArticulations.isHairpin(turned)) {
            throw new Error("Expected the stored marking to be a hairpin.");
        }

        expect(turned.from).toEqual(notes[4]);
        expect(turned.to).toEqual(notes[6]);
        expect(turned.kind).toBe(RangeArticulationKind.Decrescendo);
        expect(mutatedCalls).toBe(1);
    });

    it("refuses an end move that would overlap another hairpin or land on a rest", () => {
        const notes = noteAnchorsIn(1, 0);
        const first = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]);
        const second = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[4], notes[6]);
        if (first === undefined || second === undefined) {
            throw new Error("Expected both hairpins to be inserted.");
        }

        mutatedCalls = 0;
        expect(model.moveHairpinAnchor(second.id, trackIdOf(0), HairpinEnd.From, notes[1])).toBe(false);
        expect(model.moveHairpinAnchor(second.id, trackIdOf(0), HairpinEnd.To, restAnchorIn(1, 0))).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("moves a hairpin to another track and frees the notes it covered", () => {
        const notes = noteAnchorsIn(1, 0);
        const elsewhere = noteAnchorsIn(1, 1);
        const hairpin = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]);
        if (hairpin === undefined) {
            throw new Error("Expected the hairpin to be inserted.");
        }

        mutatedCalls = 0;
        expect(model.moveHairpin(hairpin.id, trackIdOf(1), elsewhere[2], elsewhere[4])).toBe(true);

        expect(markings()[0].trackId).toBe(trackIdOf(1));
        expect(mutatedCalls).toBe(1);

        expect(model.insertForteMark(trackIdOf(0), notes[1])).toBeDefined();
    });

    it("moves an f onto another rest and onto another track", () => {
        const mark = model.insertForteMark(trackIdOf(0), restAnchorIn(1, 0));
        if (mark === undefined) {
            throw new Error("Expected the f marking to be inserted.");
        }

        mutatedCalls = 0;
        expect(model.moveForteMark(mark.id, trackIdOf(0), restAnchorIn(2, 0))).toBe(true);
        expect(mutatedCalls).toBe(1);

        expect(model.moveForteMark(mark.id, trackIdOf(1), noteAnchorsIn(1, 1)[0])).toBe(true);
        expect(markings()[0].trackId).toBe(trackIdOf(1));
    });

    it("changes nothing when a move names the place a marking already stands at", () => {
        const notes = noteAnchorsIn(1, 0);
        const hairpin = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]);
        const mark = model.insertForteMark(trackIdOf(0), restAnchorIn(2, 0));
        if (hairpin === undefined || mark === undefined) {
            throw new Error("Expected both markings to be inserted.");
        }

        mutatedCalls = 0;
        expect(model.moveHairpinAnchor(hairpin.id, trackIdOf(0), HairpinEnd.To, notes[2])).toBe(false);
        expect(model.moveForteMark(mark.id, trackIdOf(0), restAnchorIn(2, 0))).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("removes a marking and reports a second removal of it", () => {
        const notes = noteAnchorsIn(1, 0);
        const hairpin = model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]);
        if (hairpin === undefined) {
            throw new Error("Expected the hairpin to be inserted.");
        }

        mutatedCalls = 0;
        expect(model.removeRangeArticulation(hairpin.id)).toBe(true);
        expect(markings()).toHaveLength(0);
        expect(mutatedCalls).toBe(1);

        mutatedCalls = 0;
        expect(model.removeRangeArticulation(hairpin.id)).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("drops the hairpin whose anchor note is deleted in the same edit", () => {
        const notes = noteAnchorsIn(1, 0);
        expect(model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]))
            .toBeDefined();

        mutatedCalls = 0;
        expect(model.deleteEventWithShift(trackIdOf(0), 1, notes[0].start)).toBe(true);

        expect(markings()).toHaveLength(0);
        expect(mutatedCalls).toBe(1);
    });

    it("drops the hairpin whose anchor note becomes a rest", () => {
        const notes = noteAnchorsIn(1, 0);
        expect(model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]))
            .toBeDefined();

        mutatedCalls = 0;
        expect(model.setNoteAt(trackIdOf(0), 1, notes[0].start, { numerator: 1, denominator: 16 }, undefined))
            .toBe(true);

        expect(markings()).toHaveLength(0);
        expect(mutatedCalls).toBe(1);
    });

    it("shifts the markings of the bars a new bar is inserted before", () => {
        const notes = noteAnchorsIn(2, 0);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]);

        mutatedCalls = 0;
        model.insertBars(2, 1, true, false);

        const shifted = markings()[0];
        if (!RangeArticulations.isHairpin(shifted)) {
            throw new Error("Expected the stored marking to be a hairpin.");
        }

        expect(shifted.from.bar).toBe(3);
        expect(shifted.to.bar).toBe(3);
        expect(mutatedCalls).toBe(1);
    });

    it("drops the markings of a deleted bar and shifts the later ones", () => {
        const first = noteAnchorsIn(1, 0);
        const second = noteAnchorsIn(2, 0);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), first[0], first[2]);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), second[0], second[2]);

        mutatedCalls = 0;
        model.deleteBar(1);

        const kept = markings();
        expect(kept).toHaveLength(1);
        if (!RangeArticulations.isHairpin(kept[0])) {
            throw new Error("Expected the stored marking to be a hairpin.");
        }

        expect(kept[0].from.bar).toBe(1);
        expect(mutatedCalls).toBe(1);
    });

    it("copies the markings a duplicated bar holds fully and leaves a reaching hairpin behind", () => {
        const first = noteAnchorsIn(1, 0);
        const second = noteAnchorsIn(2, 0);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), first[0], first[2]);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), first[4], second[0]);

        mutatedCalls = 0;
        model.duplicateBar(1);

        const toBars: number[] = [];
        for (const marking of markings()) {
            if (RangeArticulations.isHairpin(marking)) {
                toBars.push(marking.to.bar);
            }
        }

        expect(toBars.sort((left, right) => {
            return left - right;
        })).toEqual([1, 2, 3]);
        expect(mutatedCalls).toBe(1);
    });

    it("removes a removed track's markings and copies a duplicate's", () => {
        const first = noteAnchorsIn(1, 0);
        const second = noteAnchorsIn(1, 1);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), first[0], first[2]);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(1), second[0], second[2]);
        const secondTrackId = trackIdOf(1);

        mutatedCalls = 0;
        model.removeTrack(model.arrangement!.tracks[0]);

        expect(markings().map((marking) => {
            return marking.trackId;
        })).toEqual([secondTrackId]);
        expect(mutatedCalls).toBe(1);

        mutatedCalls = 0;
        const copy = model.duplicateTrack(model.arrangement!.tracks[0]);

        const cloned = markings().find((marking) => {
            return marking.trackId === copy.id;
        });

        expect(markings()).toHaveLength(2);
        expect(cloned).toBeDefined();
        expect(cloned!.id).not.toBe(markings()[0].id);
        expect(mutatedCalls).toBe(1);
    });

    it("drops the markings of a cleared bar and of a cleared track", () => {
        const notes = noteAnchorsIn(1, 0);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), notes[0], notes[2]);

        mutatedCalls = 0;
        model.clearBar(1);
        expect(markings()).toHaveLength(0);
        expect(mutatedCalls).toBe(1);

        const inSecondBar = noteAnchorsIn(2, 0);
        model.insertHairpin(RangeArticulationKind.Crescendo, trackIdOf(0), inSecondBar[0], inSecondBar[2]);

        mutatedCalls = 0;
        model.clearTrack(model.arrangement!.tracks[0]);
        expect(markings()).toHaveLength(0);
        expect(mutatedCalls).toBe(1);
    });
});

/**
 * @param status The HTTP status the backend answers with.
 * @param body The JSON body the backend answers with.
 *
 * @returns A response the model can read, so a test states the status it exercises.
 */
const responseOf = (status: number, body: unknown = {}): Response => {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        json: () => {
            return Promise.resolve(body);
        },
    } as unknown as Response;
};

describe("ScoreBookDataModel — Saving and locking", { concurrent: false }, () => {
    let model: ScoreBookDataModel;
    let authChangedCalls: number;
    let authChangedHandler: () => Promise<boolean>;

    /** What the backend answers a login with, for an account that may edit scores. */
    const sessionBody = {
        token: "test-token",
        user: { id: 1, username: "u", displayName: "U", isAdmin: false },
        capabilities: {
            canEditScores: true, canManageUsers: false, canManageInstruments: false, canExportMP3: false,
        },
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("a", 0, 0)]);

        // A DB-backed id, which puts the model on its "update an existing score" path.
        (model.arrangement as Arrangement).id = 10996;

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

    it("answers the stored content when the backend accepts the save", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(responseOf(200, { success: true }));

        const content = await model.saveArrangement();

        expect(content).toBeTruthy();
    });

    it("claims the missing permission when the backend refuses the save with 403", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(responseOf(403, { error: "Forbidden" }));

        await expect(model.saveArrangement()).rejects.toThrow(/permission/i);
    });

    it("states an ended session when the backend refuses the save with 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(responseOf(401, { error: "Authentication required." }));

        await expect(model.saveArrangement()).rejects.toThrow(/log in again/i);
    });

    it("states the backend's own reason when the save fails for another status", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(responseOf(500, { error: "Database is gone" }));

        await expect(model.saveArrangement()).rejects.toThrow(/Database is gone/);
    });

    it("reports the status the backend refused a lock with", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(responseOf(401, { error: "Authentication required." }));

        const result = await model.lockScore(10996);

        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
    });

    it("answers a refused request with a token from the refresh cookie", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(responseOf(401, { error: "Authentication required." }))
            .mockResolvedValueOnce(responseOf(200, { token: "fresh-token" }))
            .mockResolvedValueOnce(responseOf(200, { authenticated: true, ...sessionBody }))
            .mockResolvedValueOnce(responseOf(200, { success: true, token: "lock-token" }));

        const result = await model.lockScore(10996);

        expect(result.success).toBe(true);
        expect(result.token).toBe("lock-token");
        expect(model.authenticated).toBe(true);
    });

    it("ends a session the refresh cookie cannot renew", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(responseOf(200, sessionBody));
        await model.login("u", "p");
        expect(model.authenticated).toBe(true);

        authChangedCalls = 0;
        vi.spyOn(globalThis, "fetch").mockResolvedValue(responseOf(401, { error: "No refresh token" }));

        const result = await model.lockScore(10996);

        expect(result.status).toBe(401);
        expect(model.authenticated).toBe(false);
        expect(authChangedCalls).toBe(1);
    });

    it("refreshes the session again after a new login", async () => {
        // A refusal whose refresh fails leaves the model knowing that this path does not work.
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(responseOf(401, { error: "Authentication required." }))
            .mockResolvedValueOnce(responseOf(401, { error: "No refresh token" }));
        await model.lockScore(10996);

        // A login clears that state, so the next refusal is answered with a refresh again.
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(responseOf(200, sessionBody))
            .mockResolvedValueOnce(responseOf(401, { error: "Authentication required." }))
            .mockResolvedValueOnce(responseOf(200, { token: "fresh-token" }))
            .mockResolvedValueOnce(responseOf(200, { authenticated: true, ...sessionBody }))
            .mockResolvedValueOnce(responseOf(200, { success: true, token: "lock-token" }));
        await model.login("u", "p");

        const result = await model.lockScore(10996);

        expect(result.token).toBe("lock-token");
    });
});
