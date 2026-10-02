/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { bateriaInstruments } from "../../../../src/bateria-instruments.js";
import { Damping, type ISbDmInstrument } from "../../../../src/core/ScoreBookDataModel.js";
import {
    BananaDrumMigrator, type IBananaDrumPolyrhythmSnapshot, type IBananaDrumSnapshot
} from "../../../../src/core/serialisation/migration/BananaDrumMigrator.js";
import { arrangementSnapshotVersion } from "../../../../src/core/serialisation/snapshots.js";
import type { IAudioData, Mutable } from "../../../../src/core/types/general.js";
import { createInstrument } from "../../../unit-test-helpers.js";
import { MockInstrument } from "../../mocks/MockInstrument.js";

const instruments = bateriaInstruments.map((meta) => {
    return new MockInstrument(meta);
});

/**
 * Builds the arrangement of a share link with a single measure: one entry per note of the flattened
 * track, "0" standing for a rest.
 *
 * @param timeSignature The time signature of the arrangement.
 * @param stepResolution The step resolution of the arrangement.
 * @param notes The note style id of every note, in order.
 * @param polyrhythms The polyrhythms laid over these notes.
 * @param instrumentId The instrument the track plays.
 *
 * @returns The share-link arrangement.
 */
const shareLink = (timeSignature: string, stepResolution: number, notes: string[],
    polyrhythms: IBananaDrumPolyrhythmSnapshot[] = [], instrumentId = "0"): IBananaDrumSnapshot => {
    return {
        title: "Share Link",
        timeParams: { timeSignature, tempo: 120, length: 1, pulse: "1/4", stepResolution },
        tracks: [{ id: 1, instrumentId, notes, polyrhythms }],
    };
};

/**
 * @param typeId The instrument type the notes are played on.
 * @param noteStyles The note styles to offer, keyed by note style id.
 *
 * @returns An instrument of the given type that plays the given note styles.
 */
const instrumentWithNoteStyles = (
    typeId: string,
    noteStyles: Record<string, Partial<IAudioData>>,
): ISbDmInstrument => {
    const instrument = createInstrument(typeId, 0, 0);

    (instrument as Mutable<ISbDmInstrument>).noteStyles = Object.fromEntries(
        Object.entries(noteStyles).map(([id, style]) => {
            return [id, {
                id,
                instrument,
                audioBuffer: null,
                sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false },
                ...style,
            } as IAudioData];
        }),
    );

    return instrument;
};

describe("BananaDrumMigrator - share link decoding", () => {
    it("decodes the Bolero 3 share link", () => {
        const params = new URLSearchParams("t=Bolero%203&a2=6-8.50.1.3-8.8.319ihbrp-4UX1WbY5oS");

        const decoded = BananaDrumMigrator.decodeShareLink(params, instruments)!;

        expect(decoded.title).toBe("Bolero 3");
        expect(decoded.timeParams).toEqual({
            timeSignature: "6/8",
            tempo: 50,
            length: 1,
            pulse: "3/8",
            stepResolution: 8,
        });
        expect(decoded.tracks).toHaveLength(1);

        const track = decoded.tracks[0];
        expect(track.instrumentId).toBe("3");
        // Six grid steps plus one extra note per polyrhythm (3, 3 and 4 notes over 1 step each).
        expect(track.notes).toHaveLength(13);
        expect(track.polyrhythms.map((polyrhythm) => {
            return polyrhythm.length;
        })).toEqual([3, 3, 4]);
    });

    it("preserves imported titles verbatim", () => {
        const params = new URLSearchParams(
            "t=Beija%20Flor%202004%20%20-%20%20Bossa%201%20(H-Break)&a2=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const decoded = BananaDrumMigrator.decodeShareLink(params, instruments)!;

        expect(decoded.title).toEqual("Beija Flor 2004  -  Bossa 1 (H-Break)");
    });

    it("decodes the Repi Solo share link", () => {
        /* cspell:disable */
        const params = new URLSearchParams(
            "t=Repi%20Solo%20Gabriel%20Policarpo%20(3%20extra%20Schl%C3%A4ge)" +
            "&a2=4-4.120.13.1-4.16.3w0w0w0w0YD9YD9U0ENPU88v089YD11YD89YD11U0br331Prr1roooero08o1308oee88o11308o" +
            "3108o30oYDAU8o1308oee88o11308o80-2OewGGYWgHHzHhoG0U.3MMM00600MMM00066MMS660666MMMS66MMS06MS0000066MMS" +
            "660066M0000000.8g__LH32dfi3a0W~J6nInt4qwCvXtcPbR0LgWAHCzXe~DzXNWT5bQGt~.9drFHcHu~CY5FUQX1GaQs0S3A1~n" +
            "hyCTb4ybOeMH73m6PPjB4En3PUu"
        );
        /* cspell:enable */

        const decoded = BananaDrumMigrator.decodeShareLink(params, instruments)!;

        expect(decoded.timeParams.timeSignature).toBe("4/4");
        expect(decoded.timeParams.tempo).toBe(120);
        expect(decoded.timeParams.length).toBe(13);
        expect(decoded.timeParams.stepResolution).toBe(16);
        expect(decoded.tracks).toHaveLength(4);

        // 16 steps per bar over 13 bars, plus one extra note per polyrhythm note.
        expect(decoded.tracks[0].instrumentId).toBe("3");
        expect(decoded.tracks[0].notes).toHaveLength(214);
        expect(decoded.tracks[0].polyrhythms).toHaveLength(4);

        expect(decoded.tracks[1].notes).toHaveLength(208);
        expect(decoded.tracks[1].polyrhythms).toHaveLength(0);
        expect(decoded.tracks[2].instrumentId).toBe("8");
        expect(decoded.tracks[3].instrumentId).toBe("9");
    });

    it("returns undefined for params without a share-link payload", () => {
        expect(BananaDrumMigrator.decodeShareLink(new URLSearchParams("t=Demo"), instruments)).toBeUndefined();
    });
});

describe("BananaDrumMigrator - migration to the current schema", () => {
    it("converts a grid-only share link to one event per step", () => {
        const snapshot = shareLink("4/4", 4, ["a", "0", "b", "0"]);
        const migrated = BananaDrumMigrator.toSnapshot(snapshot, []);

        expect(migrated.version).toBe(arrangementSnapshotVersion);
        expect(migrated.title).toBe("Share Link");

        const measure = migrated.tracks[0].measures[0];
        expect(measure.subdivisions).toEqual([]);

        const events = measure.events;
        expect(events).toHaveLength(4);
        expect(events[0]).toMatchObject({
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 4 },
            noteStyleId: "a",
        });
        expect(events[1]).toMatchObject({
            start: { numerator: 1, denominator: 4 },
            duration: { numerator: 1, denominator: 4 },
        });
        expect(events[1].noteStyleId).toBeUndefined();
        expect(events[2]).toMatchObject({
            start: { numerator: 1, denominator: 2 },
            duration: { numerator: 1, denominator: 4 },
            noteStyleId: "b",
        });
        expect(events[3].noteStyleId).toBeUndefined();
    });

    it("converts an asymmetric subdivision into a tuplet group", () => {
        const notes = Array.from({ length: 9 }, () => {
            return "x";
        });
        const snapshot = shareLink("4/4", 8, notes, [{ id: 1, start: 0, end: 1, length: 3 }]);

        const migrated = BananaDrumMigrator.toSnapshot(snapshot, []);
        const measure = migrated.tracks[0].measures[0];

        expect(measure.subdivisions).toEqual([{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);

        const events = measure.events;
        expect(events).toHaveLength(9);
        const nonGridEvents = events.filter((event) => {
            return (event.duration.numerator * 8) % event.duration.denominator !== 0;
        });
        expect(nonGridEvents).toHaveLength(3);
        expect(events[0].duration).toEqual({ numerator: 1, denominator: 12 });
        expect(events[3].duration).toEqual({ numerator: 1, denominator: 8 });
    });

    it("keeps a rest inside a subdivision as an independent event", () => {
        const notes = Array.from({ length: 9 }, () => {
            return "x";
        });
        notes[1] = "0";
        const snapshot = shareLink("4/4", 8, notes, [{ id: 1, start: 0, end: 1, length: 3 }]);

        const migrated = BananaDrumMigrator.toSnapshot(snapshot, []);
        const measure = migrated.tracks[0].measures[0];

        expect(measure.subdivisions).toEqual([{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);

        const events = measure.events;
        expect(events).toHaveLength(9);
        expect(events[1].noteStyleId).toBeUndefined();
        expect(events[1].duration).toEqual({ numerator: 1, denominator: 12 });
    });

    it("does not let a subdivision note absorb following grid rests", () => {
        const notes = Array.from({ length: 17 }, () => {
            return "0";
        });
        notes[2] = "a";
        const snapshot = shareLink("4/4", 16, notes, [{ id: 1, start: 0, end: 1, length: 3 }]);

        const migrated = BananaDrumMigrator.toSnapshot(snapshot, []);
        const measure = migrated.tracks[0].measures[0];

        expect(measure.subdivisions).toEqual([{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);

        const events = measure.events;
        expect(events).toHaveLength(5);
        expect(events[2].noteStyleId).toBe("a");
        expect(events[2].duration).toEqual({ numerator: 1, denominator: 24 });
        expect(events[3].noteStyleId).toBeUndefined();
        expect(events[3].duration).toEqual({ numerator: 3, denominator: 4 });
        expect(events[4].noteStyleId).toBeUndefined();
        expect(events[4].duration).toEqual({ numerator: 1, denominator: 8 });
    });

    it("derives the articulation of a note from its instrument's sample profile", () => {
        const instrument = instrumentWithNoteStyles("ag", {
            accent: { sampleProfile: { builtInDamping: Damping.Open, builtInAccent: true, ghost: false } },
            muted: { sampleProfile: { builtInDamping: Damping.Muted, builtInAccent: false, ghost: false } },
        });
        const snapshot = shareLink("4/4", 8, ["accent", "0", "muted", "0"], [], "ag");

        const migrated = BananaDrumMigrator.toSnapshot(snapshot, [instrument]);
        const notes = migrated.tracks[0].measures[0].events.filter((event) => {
            return event.noteStyleId !== undefined;
        });

        expect(notes).toHaveLength(2);
        expect(notes[0].articulation).toEqual({ damping: Damping.Open, accent: true, ghost: false });
        expect(notes[1].articulation).toEqual({ damping: Damping.Muted, accent: false, ghost: false });
    });
});
