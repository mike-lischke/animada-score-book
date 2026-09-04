/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { createInstrument } from "../unit-test-helpers.js";

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

    it("setGridNote changes and clears a grid cell", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];

        expect(model.setGridNote(track.id, 1, 2, "1")).toBe(true);
        expect(track.measures[0].events.some((event) => {
            return event.noteStyleId === "1";
        })).toBe(true);
        expect(mutatedCalls).toBe(1);

        expect(model.setGridNote(track.id, 1, 2)).toBe(true);
        expect(track.measures[0].events.every((event) => {
            return event.noteStyleId === undefined;
        })).toBe(true);
        expect(mutatedCalls).toBe(2);
    });

    it("setGridNote keeps adjacent same-style notes as separate events", () => {
        const instrument = createInstrument("0", 0, 0);
        model.startNewArrangement([instrument]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        // Two adjacent notes with the same style must remain two distinct hits.
        model.setGridNote(track.id, 1, 0, "1");
        model.setGridNote(track.id, 1, 1, "1");

        const firstNotes = measure.events.filter((event) => {
            return event.noteStyleId === "1";
        });
        expect(firstNotes).toHaveLength(2);

        // A note at the next pulse boundary must not merge with the preceding note either.
        model.setGridNote(track.id, 1, 4, "1");

        const notes = measure.events.filter((event) => {
            return event.noteStyleId === "1";
        });

        expect(notes).toHaveLength(3);
        expect(notes[2].start).toEqual({ numerator: 1, denominator: 4 });
    });

    it("setGridNote targets a subdivision slot by its exact start fraction", () => {
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
        const changed = model.setGridNote(track.id, 1, 2, "2", { numerator: 1, denominator: 6 });

        expect(changed).toBe(true);
        expect(measure.events[3].noteStyleId).toBe("2");
        expect(measure.events[3].start).toEqual({ numerator: 1, denominator: 6 });
        expect(measure.events[3].duration).toEqual({ numerator: 1, denominator: 24 });
        expect(measure.subdivisions).toEqual([{ startIndex: 2, actual: 3, normal: 2, isTuplet: true }]);
        expect(mutatedCalls).toBe(1);
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

    it("clearStepRanges clears a step range and fires arrangementMutated once", () => {
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

        const cleared = model.clearStepRanges([{ trackId: track.id, bar: 1, startStep: 1, endStep: 2 }]);

        expect(cleared).toBe(true);
        // Clearing the middle notes lets the first note absorb the gap up to the next note.
        expect(track.measures[0].events).toHaveLength(3);
        expect(track.measures[0].events[0].noteStyleId).toBe("1");
        expect(track.measures[0].events[0].duration).toEqual({ numerator: 3, denominator: 16 });
        expect(track.measures[0].events[1].noteStyleId).toBe("1");
        expect(track.measures[0].events[2].noteStyleId).toBeUndefined();
        expect(mutatedCalls).toBe(1);
    });

    it("clearStepRanges clears a whole measure including its subdivisions", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events[0].noteStyleId = "1";
        measure.subdivisions.push({ startIndex: 0, actual: 3, normal: 1, isTuplet: true });

        const cleared = model.clearStepRanges([{ trackId: track.id, bar: 1 }]);

        expect(cleared).toBe(true);
        expect(measure.events.every((event) => {
            return event.noteStyleId === undefined;
        })).toBe(true);
        expect(measure.subdivisions).toHaveLength(0);
        expect(mutatedCalls).toBe(1);
    });

    it("clearStepRanges batches ranges across tracks into one arrangementMutated", () => {
        const instruments = [createInstrument("0", 0, 0), createInstrument("1", 1, 1)];
        model.startNewArrangement(instruments);
        const first = model.arrangement!.tracks[0];
        const second = model.arrangement!.tracks[1];

        first.measures[0].events[0].noteStyleId = "1";
        second.measures[0].events[0].noteStyleId = "1";

        const cleared = model.clearStepRanges([
            { trackId: first.id, bar: 1, startStep: 0, endStep: 0 },
            { trackId: second.id, bar: 1, startStep: 0, endStep: 0 },
        ]);

        expect(cleared).toBe(true);
        expect(first.measures[0].events[0].noteStyleId).toBeUndefined();
        expect(second.measures[0].events[0].noteStyleId).toBeUndefined();
        expect(mutatedCalls).toBe(1);
    });

    it("clearStepRanges fires trackChanged for each affected track", () => {
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

        const cleared = model.clearStepRanges([{ trackId: track.id, bar: 1, startStep: 0, endStep: 0 }]);
        requisitions.unregister("trackChanged", trackChangedHandler);

        expect(cleared).toBe(true);
        expect(trackChangedTracks).toEqual([track.id]);
    });

    it("clearStepRanges returns false for ranges without content", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        const cleared = model.clearStepRanges([{ trackId: track.id, bar: 1, startStep: 0, endStep: 0 }]);

        expect(cleared).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("clearStepRanges is a no-op for an empty cell inside a note's span", () => {
        const instruments = [createInstrument("0", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        // A quarter note fills the first pulse; steps 1-3 are its empty rest steps.
        model.setGridNote(track.id, 1, 0, "1");
        mutatedCalls = 0;

        const cleared = model.clearStepRanges([{ trackId: track.id, bar: 1, startStep: 1, endStep: 1 }]);

        expect(cleared).toBe(false);
        expect(mutatedCalls).toBe(0);
    });

    it("clearStepRanges preserves subdivisions when clearing a cell before them", () => {
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

        const cleared = model.clearStepRanges([{ trackId: track.id, bar: 1, startStep: 1, endStep: 1 }]);

        expect(cleared).toBe(true);
        expect(measure.subdivisions).toEqual([{ startIndex: 1, actual: 3, normal: 2, isTuplet: true }]);
        expect(measure.events).toHaveLength(5);
        expect(measure.events[0].noteStyleId).toBe("1");
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 8 });
        expect(measure.events[1].noteStyleId).toBe("1");
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
