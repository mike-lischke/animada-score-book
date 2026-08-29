/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Damping } from "../../../../src/core/ScoreBookDataModel.js";
import type {
    ILegacyArrangementSnapshotV3,
} from "../../../../src/core/serialisation/migration/legacy-snapshot-types.js";
import { migrateV3ToV4 } from "../../../../src/core/serialisation/migration/v3-to-v4.js";
import { arrangementSnapshotVersion } from "../../../../src/core/serialisation/snapshots.js";

describe("migrateV3ToV4", () => {
    it("converts a grid-only measure to events and preserves metadata", () => {
        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            title: "Grid",
            scoreId: 42,
            measureLabels: { 1: "Intro" },
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 4 },
            tracks: [{
                id: 1,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 4, beatGroups: [4] },
                    steps: [
                        { index: 0, noteStyleId: "a" },
                        { index: 1 },
                        { index: 2, noteStyleId: "b" },
                        { index: 3 },
                    ],
                    subdivisions: [],
                }],
            }],
        };

        const migrated = migrateV3ToV4(snapshot);

        expect(migrated.version).toBe(arrangementSnapshotVersion);
        expect(migrated.title).toBe("Grid");
        expect(migrated.scoreId).toBe(42);
        expect(migrated.measureLabels).toEqual({ 1: "Intro" });

        const measure = migrated.tracks[0].measures[0];
        expect(measure.subdivisions).toEqual([]);

        const events = measure.events;
        expect(events).toHaveLength(4);
        expect(events[0]).toMatchObject({
            start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "a",
        });
        expect(events[1]).toMatchObject({
            start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 },
        });
        expect(events[2]).toMatchObject({
            start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "b",
        });
        expect(events[3]).toMatchObject({
            start: { numerator: 3, denominator: 4 }, duration: { numerator: 1, denominator: 4 },
        });
        expect(events[1].noteStyleId).toBeUndefined();
        expect(events[3].noteStyleId).toBeUndefined();
    });

    it("converts an asymmetric subdivision into a tuplet group", () => {
        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 8 },
            tracks: [{
                id: 1,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 8, beatGroups: [4, 4] },
                    steps: Array.from({ length: 9 }, (element, index) => {
                        return { index, noteStyleId: "x" };
                    }),
                    subdivisions: [{ id: 1, startStep: 0, actual: 3, normal: 2, isTuplet: true }],
                }],
            }],
        };

        const migrated = migrateV3ToV4(snapshot);
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

    it("keeps non-grid rests as independent events", () => {
        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 8 },
            tracks: [{
                id: 1,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 8, beatGroups: [4, 4] },
                    steps: Array.from({ length: 9 }, (element, index) => {
                        return index === 1 ? { index } : { index, noteStyleId: "x" };
                    }),
                    subdivisions: [{ id: 1, startStep: 0, actual: 3, normal: 2, isTuplet: true }],
                }],
            }],
        };

        const migrated = migrateV3ToV4(snapshot);
        const measure = migrated.tracks[0].measures[0];

        expect(measure.subdivisions).toEqual([{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);

        const events = measure.events;
        expect(events).toHaveLength(9);
        expect(events[1].noteStyleId).toBeUndefined();
        expect(events[1].duration).toEqual({ numerator: 1, denominator: 12 });
    });

    it("does not let a subdivision note absorb following grid rests", () => {
        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 1,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    steps: [
                        { index: 0 },
                        { index: 1 },
                        { index: 2, noteStyleId: "a" },
                        ...Array.from({ length: 14 }, (element, index) => {
                            return { index: index + 3 };
                        }),
                    ],
                    subdivisions: [{ id: 1, startStep: 0, actual: 3, normal: 2, isTuplet: true }],
                }],
            }],
        };

        const migrated = migrateV3ToV4(snapshot);
        const measure = migrated.tracks[0].measures[0];

        expect(measure.subdivisions).toEqual([{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);

        const events = measure.events;
        expect(events).toHaveLength(4);
        expect(events[2].noteStyleId).toBe("a");
        expect(events[2].duration).toEqual({ numerator: 1, denominator: 24 });
        expect(events[3].noteStyleId).toBeUndefined();
        expect(events[3].duration).toEqual({ numerator: 7, denominator: 8 });
    });

    it("carries articulation onto migrated events", () => {
        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 4 },
            tracks: [{
                id: 1,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 4, beatGroups: [4] },
                    steps: [
                        {
                            index: 0,
                            noteStyleId: "a",
                            articulation: { damping: Damping.Muted, accent: true, ghost: false },
                        },
                        { index: 1 },
                        { index: 2 },
                        { index: 3 },
                    ],
                    subdivisions: [],
                }],
            }],
        };

        const migrated = migrateV3ToV4(snapshot);
        const events = migrated.tracks[0].measures[0].events;

        expect(events[0].articulation).toEqual({ damping: Damping.Muted, accent: true, ghost: false });
    });
});
