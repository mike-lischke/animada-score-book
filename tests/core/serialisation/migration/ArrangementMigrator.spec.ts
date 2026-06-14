/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../../../src/core/Arrangement.js";
import { Track } from "../../../../src/core/Track.js";
import { SbDmEntityType, type ISbDmInstrument } from "../../../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../../../src/core/serialisation/migration/ArrangementMigrator.js";
import type { ILegacyArrangementSnapshot } from "../../../../src/core/serialisation/migration/legacy-snapshot-types.js";
import { getArrangementSnapshot } from "../../../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot, IAudioData, Mutable } from "../../../../src/core/types/general.js";
import { TimeCoordinator } from "../../../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../../../src/player/TrackPlayer.js";

/**
 * Creates a live Arrangement from a V2 snapshot via the public API.
 *
 * @param snapshot    The V2 arrangement snapshot.
 * @param instruments The available instruments.
 * @returns A fully constructed arrangement.
 */
const createArrangement = (snapshot: IArrangementSnapshot, instruments: ISbDmInstrument[]): Arrangement => {
    return ArrangementMigrator.migrateToArrangement(snapshot, instruments).arrangement;
};

/**
 * Migrates a legacy snapshot to a live Arrangement.
 *
 * @param _snapshot   The legacy (V1) arrangement snapshot.
 * @param instruments The available instruments.
 * @returns A fully constructed arrangement.
 */
const migrateLegacy = (_snapshot: ILegacyArrangementSnapshot, instruments: ISbDmInstrument[]): Arrangement => {
    // @ts-expect-error: accessing private migrate for testing
    return ArrangementMigrator.migrate(_snapshot, instruments);
};

const createInstrument = (typeId: string, id: number, displayOrder: number): ISbDmInstrument => {
    return {
        type: SbDmEntityType.Instrument,
        id,
        typeId,
        displayOrder,
        displayName: `Instrument ${typeId}`,
        image: { type: SbDmEntityType.InstrumentImage, id: id + 1000, filePath: "" },
        color: "",
        range: [0, 0],
        state: {
            initialized: true,
            isLeaf: true,
            expanded: false,
            expandedOnce: false,
        },
        noteStyles: {},
    };
};

const hydrateMeasureEvents = (arrangement: Arrangement): void => {
    const timeCoordinator = new TimeCoordinator(arrangement.timeParams, {
        state: "stopped",
        get currentTime() {
            return -1;
        },
    });
    const players = arrangement.tracks.map((track) => {
        return new TrackPlayer(track, timeCoordinator);
    });
    players.forEach((player) => {
        player.dispose();
    });
};

describe("ArrangementMigrator", () => {
    it("splits cross-bar polyrhythms when loading a snapshot", () => {
        const instruments = [
            createInstrument("0", 0, 0),
        ];

        const snapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Cross Bar",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 2,
                pulse: "1/4",
                stepResolution: 16,
            },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    notes: Array.from<string>({ length: 35 }).fill("0"),
                    polyrhythms: [
                        {
                            id: 999,
                            start: 14,
                            end: 18,
                            length: 8,
                        },
                    ],
                },
            ]
        };

        const arrangement = migrateLegacy(snapshot, instruments);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        // After migration the runtime Track only carries measures. The cross-bar polyrhythm has
        // been split into one polyrhythm per bar; each bar therefore contains a sequence of
        // non-grid (polyrhythm) events with non-1/stepsPerBar duration.
        const stepsPerBar = 16;
        const isPolyrhythmEvent = (event: { duration: { numerator: number; denominator: number; }; }) => {
            return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
        };
        const bar1Polyrhythm = track.measures[0].events.filter(isPolyrhythmEvent);
        const bar2Polyrhythm = track.measures[1].events.filter(isPolyrhythmEvent);
        expect(bar1Polyrhythm).toHaveLength(3);
        expect(bar2Polyrhythm).toHaveLength(5);
    });

    it("keeps already single-bar polyrhythms unchanged", () => {
        const instruments = [
            createInstrument("0", 0, 0),
        ];

        const snapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Already Normalized",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 2,
                pulse: "1/4",
                stepResolution: 16,
            },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    notes: Array.from<string>({ length: 33 }).fill("0"),
                    polyrhythms: [
                        {
                            id: 200,
                            start: 10,
                            end: 12,
                            length: 4,
                        },
                    ],
                },
            ]
        };

        const arrangement = migrateLegacy(snapshot, instruments);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        const stepsPerBar = 16;
        const isPolyrhythmEvent = (event: { duration: { numerator: number; denominator: number; }; }) => {
            return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
        };

        const polyrhythmEvents = track.measures[0].events.filter(isPolyrhythmEvent);
        expect(polyrhythmEvents).toHaveLength(4);
    });

    it("reconstructs polyrhythms from v2 measure events", () => {
        const instrument = createInstrument("0", 0, 0);
        const hitStyle = {
            id: "1",
            audioBuffer: null,
            instrument,

            sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }

        } as IAudioData;
        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": hitStyle };

        const legacySnapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Measure Events With Polyrhythm",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 8,
            },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    notes: Array.from({ length: 9 }, () => {
                        return "0";
                    }),
                    polyrhythms: [{
                        id: 900,
                        start: 0,
                        end: 1,
                        length: 3,
                    }],
                },
            ],
        };

        const sourceArrangement = migrateLegacy(legacySnapshot, [instrument]);
        hydrateMeasureEvents(sourceArrangement);
        const sourceTrack = sourceArrangement.tracks[0] as Track;

        // Set the second polyrhythm event's noteStyle directly on the measure event.
        const stepsPerBar = 8;
        const sourcePolyrhythmEvents = sourceTrack.measures[0].events.filter((event) => {
            return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
        });

        expect(sourcePolyrhythmEvents).toHaveLength(3);
        const targetEventIndex = sourceTrack.measures[0].events.indexOf(sourcePolyrhythmEvents[1]);
        sourceTrack.measures[0].events[targetEventIndex] = {
            ...sourcePolyrhythmEvents[1],
            audioData: hitStyle,
        };
        const snapshot = getArrangementSnapshot(sourceArrangement);

        const arrangement = createArrangement(snapshot, [instrument]);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        const polyrhythmEvents = track.measures[0].events.filter((event) => {
            return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
        });

        expect(polyrhythmEvents).toHaveLength(3);
        expect(polyrhythmEvents[1].audioData?.id).toBe("1");
    });

    it("treats undefined parentSubdivisionId as top-level when rebuilding runtime events", () => {
        const instrument = createInstrument("3", 3, 3);
        const hitStyle = {
            id: "1",
            audioBuffer: null,
            instrument,

            sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }

        } as IAudioData;
        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": hitStyle };

        const snapshot: IArrangementSnapshot = {
            version: 2,
            title: "Tuplet Null Parent",
            timeParams: {
                timeSignature: "6/8",
                tempo: 50,
                length: 1,
                pulse: "3/8",
                stepResolution: 8,
            },
            tracks: [{
                id: 497,
                instrumentId: "3",
                measures: [{
                    number: 1,
                    meter: {
                        beats: 6,
                        beatUnits: 8,
                        stepResolution: 6,
                        beatGroups: [3, 3],
                    },
                    steps: Array.from({ length: 8 }, (_, index) => {
                        return { index, noteStyleId: "1" };
                    }),
                    subdivisions: [{
                        id: 496,
                        startStep: 1,
                        actual: 3,
                        normal: 1,
                        isTuplet: false, // 6/8 S={3}, 3∈{3} → not a tuplet
                        parentSubdivisionId: undefined,
                    }],
                }],
            }],
        };

        const arrangement = createArrangement(snapshot, [instrument]);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;
        const events = track.measures[0].events;

        expect(events).toHaveLength(8);
        const nonGridEvents = events.filter((event) => {
            return (event.duration.numerator * 6) % event.duration.denominator !== 0;
        });
        expect(nonGridEvents).toHaveLength(3);
    });

    it("links nested legacy tuplets to their parent when migrating v1 snapshots", () => {
        const instrument = createInstrument("3", 3, 3);
        (instrument as Mutable<ISbDmInstrument>).noteStyles = {
            "1": {
                id: "1", audioBuffer: null, instrument,
                sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }
            } as IAudioData,
        };

        const snapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Nested Tuplet Parent",
            timeParams: {
                timeSignature: "6/8",
                tempo: 50,
                length: 1,
                pulse: "3/8",
                stepResolution: 8,
            },
            tracks: [{
                id: 531,
                instrumentId: "3",
                notes: Array.from({ length: 9 }, () => {
                    return "1";
                }),
                polyrhythms: [
                    { id: 529, start: 1, end: 1, length: 3 },
                    { id: 530, start: 3, end: 3, length: 2 },
                ],
            }],
        };

        const migrated = migrateLegacy(snapshot, [instrument]);
        const subdivisions = migrated.tracks[0]?.measures[0]?.subdivisions ?? [];

        // The sequential overlay model may collapse the parent when a child
        // completely overwrites it.  The child still references the parent via
        // parentSubdivisionId, even if the parent isn't in the same measure.
        expect(subdivisions.length).toBeGreaterThanOrEqual(1);

        const childSubdivision = subdivisions.find((s) => {
            return s.id === 530;
        });
        expect(childSubdivision).toBeDefined();
        expect(childSubdivision?.parentSubdivisionId).toBe(529);
    });

    it("plays all 3 tuplets of Bolero 3 correctly: 3rd must produce 4 events, not 2", () => {
        // Bolero 3 structure (6/8, stepsPerBar=6, 13 visible steps):
        //   Base step 0: 1 regular note
        //   T1 (id=1, startStep=1, actual=3, normal=1): top-level triplet at base step 1
        //     T2 (id=2, startStep=3, actual=3, normal=1, parent=T1): nested triplet at T1's slot 2
        //   Base step 2–3: 2 regular notes
        //   T3 (id=3, startStep=8, actual=4, normal=1): independent 4-tuplet at base step 4
        //   Base step 5: 1 regular note
        // Without the totalVisibleSteps fix, absIdx advanced by T1.actual(=3) and missed T3 at absIdx=8.
        const instrument = createInstrument("x", 99, 1);
        const hitStyle = {
            id: "h", audioBuffer: null, instrument,

            sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }

        } as IAudioData;
        (instrument as Mutable<ISbDmInstrument>).noteStyles = { h: hitStyle };

        const snapshot: IArrangementSnapshot = {
            version: 2,
            title: "Bolero 3",
            timeParams: {
                timeSignature: "6/8",
                tempo: 50,
                length: 1,
                pulse: "3/8",
                stepResolution: 8,
            },
            tracks: [{
                id: 1,
                instrumentId: "x",
                measures: [{
                    number: 1,
                    meter: {
                        beats: 6,
                        beatUnits: 8,
                        stepResolution: 6,
                        beatGroups: [3, 3],
                    },
                    steps: Array.from({ length: 13 }, (_, index) => {
                        return { index, noteStyleId: "h" };
                    }),
                    subdivisions: [
                        { id: 1, startStep: 1, actual: 3, normal: 1, isTuplet: false },
                        {
                            id: 2, startStep: 3, actual: 3, normal: 1,
                            parentSubdivisionId: 1, isTuplet: false
                        },
                        { id: 3, startStep: 8, actual: 4, normal: 1, isTuplet: true },
                    ],
                }],
            }],
        };

        const arrangement = createArrangement(snapshot, [instrument]);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;
        const events = track.measures[0].events;

        // Total events must equal the 13 visible steps (all notes are hits).
        expect(events).toHaveLength(13);

        // Non-grid events come from T1 (2 slots), T2 (3 sub-notes), T3 (4 sub-notes).
        // Check: (dur.numerator * stepsPerBar) % dur.denominator !== 0
        const nonGridEvents = events.filter((event) => {
            return (event.duration.numerator * 6) % event.duration.denominator !== 0;
        });

        // T1 produces 2 non-grid (slots 0–1), T2 produces 3 non-grid, T3 produces 4 non-grid → 9 total.
        expect(nonGridEvents).toHaveLength(9);
    });

    it("migrates v2 snapshots to v3 by adding articulation to steps", () => {
        const instrument = createInstrument("ag", 1, 0);
        const accentedStyle = {
            id: "accent", audioBuffer: null, instrument,
            sampleProfile: { builtInDamping: 0, builtInAccent: true, ghost: false },
        } as IAudioData;
        const mutedStyle = {
            id: "muted", audioBuffer: null, instrument,
            sampleProfile: { builtInDamping: 1, builtInAccent: false, ghost: false },
        } as IAudioData;
        (instrument as Mutable<ISbDmInstrument>).noteStyles = { accent: accentedStyle, muted: mutedStyle };

        const v2Snapshot: IArrangementSnapshot = {
            version: 2,
            title: "V2→V3 Test",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 8 },
            tracks: [{
                id: 1,
                instrumentId: "ag",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 8, beatGroups: [4, 4] },
                    steps: [
                        { index: 0, noteStyleId: "accent" },
                        { index: 1 },
                        { index: 2, noteStyleId: "muted" },
                        { index: 3 },
                        { index: 4, noteStyleId: "accent" },
                        { index: 5 },
                        { index: 6 },
                        { index: 7 },
                    ],
                    subdivisions: [],
                }],
            }],
        };

        const arrangement = createArrangement(v2Snapshot, [instrument]);
        const track = arrangement.tracks[0];
        const steps = track.measures[0].steps;

        // Steps without noteStyleId should not have articulation.
        expect(steps[1]).toEqual({ index: 1 });
        expect(steps[3]).toEqual({ index: 3 });
        expect(steps[5]).toEqual({ index: 5 });
        expect(steps[6]).toEqual({ index: 6 });
        expect(steps[7]).toEqual({ index: 7 });

        // Accented step: damping=Open (0), accent=true, ghost=false.
        expect(steps[0]).toEqual({
            index: 0, noteStyleId: "accent",
            articulation: { damping: 0, accent: true, ghost: false },
        });
        expect(steps[4]).toEqual({
            index: 4, noteStyleId: "accent",
            articulation: { damping: 0, accent: true, ghost: false },
        });

        // Muted step: damping=Muted (1), accent=false, ghost=false.
        expect(steps[2]).toEqual({
            index: 2, noteStyleId: "muted",
            articulation: { damping: 1, accent: false, ghost: false },
        });

        // Verify snapshot version is bumped.
        expect(arrangement.toSnapshot().version).toBe(3);
    });
});

import { bateriaInstruments } from "../../../../src/bateria-instruments.js";
import { MockInstrument } from "../../mocks/MockInstrument.js";

const bdInstruments = bateriaInstruments.map((meta) => {
    return new MockInstrument(meta);
});

describe("ArrangementMigrator - BananaDrum URL migration", () => {
    it("migrates the provided BananaDrum song to the expected v2 structure", () => {
        const params = new URLSearchParams(
            "a2=4-4.100.4.1-4.16.ancT9sB~3cD5eiVZCPtZ8-g0q8s2zbqX1uH.1wkTlpVed1IXUvNs1E"
        );

        const { arrangement: migrated } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);
        expect(migrated.title).toEqual("Untitled Arrangement");
        expect({
            timeSignature: migrated.timeParams.timeSignature,
            tempo: migrated.timeParams.tempo,
            length: migrated.timeParams.length,
            pulse: migrated.timeParams.pulse,
            stepResolution: migrated.timeParams.stepResolution,
        }).toEqual({
            timeSignature: "4/4",
            tempo: 100,
            length: 4,
            pulse: "1/4",
            stepResolution: 16,
        });
        expect(migrated.tracks).toHaveLength(2);

        const agogoTrack = migrated.tracks.find((track) => {
            return track.instrument.typeId === "a";
        });
        const chocalhoTrack = migrated.tracks.find((track) => {
            return track.instrument.typeId === "1";
        });

        expect(agogoTrack).toBeDefined();
        expect(chocalhoTrack).toBeDefined();

        expect(agogoTrack!.measures.map((measure) => {
            return measure.steps.length;
        })).toEqual([12, 14, 12, 14]);

        expect(agogoTrack!.measures[1].subdivisions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                startStep: 0,
                actual: 6,
                normal: 8,
                isTuplet: true,
            })
        ]));

        expect(agogoTrack!.measures[1].steps.map((step) => {
            return step.noteStyleId ?? "0";
        })).toEqual([
            "1",
            "0",
            "2",
            "0",
            "3",
            "0",
            "4",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
            "0",
        ]);

        expect(chocalhoTrack!.measures.map((measure) => {
            return measure.steps.length;
        })).toEqual([16, 16, 16, 16]);
        expect(chocalhoTrack!.measures.every((measure) => {
            return measure.subdivisions.length === 0;
        })).toBe(true);
    });

    it("migrates 6/8 with nested + unnested subdivisions", () => {
        const params = new URLSearchParams("t=Bolero%203&a2=6-8.50.1.3-8.8.319ihbrp-4UX1WbY5oS");

        const { arrangement, migrated } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);
        expect(migrated).toBeTruthy();
        expect(arrangement.title).toEqual("Bolero 3");
        expect(arrangement.tracks).toHaveLength(1);

        const track = arrangement.tracks[0];
        expect(track.measures).toHaveLength(1);
        const measure = track.measures[0];

        expect(measure.meter.beats).toBe(6);
        expect(measure.meter.beatUnits).toBe(8);
        expect(measure.meter.stepResolution).toBe(6);
        expect(measure.meter.beatGroups).toEqual([3, 3]);

        expect(measure.steps).toEqual([
            { index: 0, noteStyleId: "1", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 1, noteStyleId: "1", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 2, noteStyleId: "1", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 3, noteStyleId: "2", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 4, noteStyleId: "2", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 5, noteStyleId: "2", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 6, noteStyleId: "1", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 7, noteStyleId: "1", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 8, noteStyleId: "3", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 9, noteStyleId: "3", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 10, noteStyleId: "3", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 11, noteStyleId: "3", articulation: { accent: false, damping: 0, ghost: false } },
            { index: 12, noteStyleId: "1", articulation: { accent: false, damping: 0, ghost: false } },
        ]);

        expect(measure.subdivisions.length).toBe(3);

        const sub1 = measure.subdivisions[0];
        expect(sub1).toEqual(expect.objectContaining({
            startStep: 1,
            actual: 3,
            normal: 1,
            isTuplet: false, // 6/8 S={3}, 3∈{3} → not a tuplet
            parentSubdivisionId: undefined,
        }));

        const sub2 = measure.subdivisions[1];
        expect(sub2).toEqual(expect.objectContaining({
            startStep: 3,
            actual: 3,
            normal: 1,
            isTuplet: false, // 6/8 S={3}, 3∈{3} → not a tuplet
            parentSubdivisionId: sub1.id, // Nested in sub1's slot 2.
        }));

        const sub3 = measure.subdivisions[2];
        expect(sub3).toEqual(expect.objectContaining({
            startStep: 8,
            actual: 4,
            normal: 1,
            isTuplet: true, // 6/8 S={4}, 4∉{3} → tuplet
            parentSubdivisionId: undefined, // Independent from sub1 and sub2.
        }));
    });

    it("Repi Solo: all subdivisions are non-tuplet binary divisions", () => {
        /* cspell:disable */
        const params = new URLSearchParams(
            "t=Repi%20Solo%20Gabriel%20Policarpo%20(3%20extra%20Schl%C3%A4ge)" +
            "&a2=4-4.120.13.1-4.16.3w0w0w0w0YD9YD9U0ENPU88v089YD11YD89YD11U0br331Prr1roooero08o1308oee88o11308o" +
            "3108o30oYDAU8o1308oee88o11308o80-2OewGGYWgHHzHhoG0U.3MMM00600MMM00066MMS660666MMMS66MMS06MS0000066MMS" +
            "660066M0000000.8g__LH32dfi3a0W~J6nInt4qwCvXtcPbR0LgWAHCzXe~DzXNWT5bQGt~.9drFHcHu~CY5FUQX1GaQs0S3A1~n" +
            "hyCTb4ybOeMH73m6PPjB4En3PUu"
        );
        /* cspell:enable */

        const { arrangement: snapshot } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);

        // Collect all subdivisions from all tracks.
        const allSubdivisions = snapshot.tracks.flatMap((track) => {
            return track.measures.flatMap((measure) => {
                return measure.subdivisions;
            });
        });

        expect(allSubdivisions.length).toBeGreaterThan(0);

        // All subdivisions in this song are binary (powers of 2) and non-tuplet.
        for (const sub of allSubdivisions) {
            expect(sub.isTuplet).toBe(false);
        }

        // Verify specific subdivisions: 2:1 in bars 6-7, 4:2 in bars 8 and 12 (1-indexed).
        const mainTrack = snapshot.tracks[0]; // First track has the subdivisions.
        expect(mainTrack.measures[5].subdivisions).toHaveLength(1);
        expect(mainTrack.measures[5].subdivisions[0]).toEqual(expect.objectContaining({
            actual: 2, normal: 1, isTuplet: false,
        }));
        expect(mainTrack.measures[6].subdivisions).toHaveLength(1);
        expect(mainTrack.measures[6].subdivisions[0]).toEqual(expect.objectContaining({
            actual: 2, normal: 1, isTuplet: false,
        }));
        expect(mainTrack.measures[7].subdivisions).toHaveLength(1);
        expect(mainTrack.measures[7].subdivisions[0]).toEqual(expect.objectContaining({
            actual: 4, normal: 2, isTuplet: false,
        }));
        expect(mainTrack.measures[11].subdivisions).toHaveLength(1);
        expect(mainTrack.measures[11].subdivisions[0]).toEqual(expect.objectContaining({
            actual: 4, normal: 2, isTuplet: false,
        }));
    });

    describe("Beija Flor 2004 - Bossa 2 (I-Break)", () => {
        /* cspell:disable */
        const params = new URLSearchParams(
            "t=Beija%20Flor%202004%20-%20Bossa%202%20(%22I-Break%22)" +
            "&a2=4-4.100.11.1-4.16.0eLNZGdzHEukDW9iGstavnTEZUV~gx4QgRGV2ig2i-AG0BSC8_NqZz1YtDPGa" +
            ".158qP0XXR2KFVaHV84dLQ4di6C~_Ts0FbjnisDTPZgLnroRU" +
            ".2dZ2OpKo50EqVkKFk2FC7IXGgwUu_eARKL6M7ox~mTQ-iiWslWxOwWg~~12" +
            ".3avauavauavauavauavauavauavauavauavauavauavauavauavauavauavauavau8o8o8rR6avauavauavauavau" +
            ".5u8i8jex4f0UkFPcfCKddB~zWd9cyoyAcQet8gNFJV~kdqGZEn42xpgq0WlLsJsZ9yKx3" +
            ".71FWocgPOxWBZDTBGyXUo3YpiP0xvlLX4_wmzM71D-8w06YquxgSrTHpBtZbZOpPc7zrkC" +
            ".81UEKcy2prthJcmKyWqDRGNc~GnCuDIJ~EQ~lPBv_Q-8w06YquxgSrTHpBtZbZOpPc7zrkC" +
            ".91vkkI9HbCqb9Pm42rNj_sLroJbVPl0NDRujYBCwC-8w06YquxgSrTHpBtZbZOpPc7zrkC"
        );
        /* cspell:enable */

        const { arrangement, migrated } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);
        expect(migrated).toBe(true);
        const agogo = arrangement.tracks.find((t) => {
            return t.instrument.typeId === "0";
        })!;

        it("migrates successfully", () => {
            expect(arrangement).toBeDefined();
        });

        it("has correct version and title", () => {
            expect(arrangement.title).toEqual('Beija Flor 2004 - Bossa 2 ("I-Break")');
        });

        it("has correct time parameters", () => {
            expect(arrangement.timeParams).toEqual(expect.objectContaining({
                timeSignature: "4/4",
                tempo: 100,
                length: 11,
                pulse: "1/4",
                stepResolution: 16,
            }));
        });

        it("has 8 tracks", () => {
            expect(arrangement.tracks.length).toBe(8);
        });

        it("has 11 measures in every track", () => {
            for (const track of arrangement.tracks) {
                expect(track.measures).toHaveLength(11);
            }
        });

        describe("Agogô", () => {
            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                const totalNotes = [...agogo.notes].length;
                expect(totalNotes).toBe(97);
            });

            it("bar 1: no subdivisions, 16 grid steps with a specific pattern", () => {
                const bar = agogo.measures[0];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "2", "2", "0", "1", "0",
                    "1", "0", "2", "0", "2", "0", "0", "0",
                ]);
            });

            it("bar 2: 3:4 tuplet at the end", () => {
                const bar = agogo.measures[1];
                expect(bar.steps).toHaveLength(15);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "2", "2", "2", "2", "2", "0", "1", "0",
                    "2", "0", "0", "0", "0", "0", "1",
                ]);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 12,
                    actual: 3,
                    normal: 4,
                    isTuplet: true,
                }));
            });

            it("bar 3: single 12:16 tuplet over the full bar", () => {
                const bar = agogo.measures[2];
                expect(bar.steps).toHaveLength(12);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "2", "2", "0", "1",
                    "1", "0", "2", "2", "0", "1",
                ]);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0,
                    actual: 12,
                    normal: 16,
                    isTuplet: true,
                }));
            });

            it("bar 4: two 6:8 tuplets", () => {
                const bar = agogo.measures[3];
                expect(bar.steps).toHaveLength(12);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "2", "2", "0", "0",
                    "1", "1", "1", "1", "1", "1",
                ]);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0,
                    actual: 6,
                    normal: 8,
                    isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 6,
                    actual: 6,
                    normal: 8,
                    isTuplet: true,
                }));
            });

            it("bar 5: single 12:16 tuplet over the full bar", () => {
                const bar = agogo.measures[4];
                expect(bar.steps).toHaveLength(12);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "2", "2", "0", "1",
                    "1", "0", "2", "2", "0", "1",
                ]);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0,
                    actual: 12,
                    normal: 16,
                    isTuplet: true,
                }));
            });

            it("bar 6: single 12:16 tuplet over the full bar", () => {
                const bar = agogo.measures[5];
                expect(bar.steps).toHaveLength(12);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "2", "2", "0", "0",
                    "1", "1", "1", "1", "1", "1",
                ]);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0,
                    actual: 12,
                    normal: 16,
                    isTuplet: true,
                }));
            });

            it("bar 7: single 12:16 tuplet over the full bar", () => {
                const bar = agogo.measures[6];
                expect(bar.steps).toHaveLength(12);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "2", "2", "0", "1",
                    "1", "0", "2", "2", "0", "1",
                ]);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0,
                    actual: 12,
                    normal: 16,
                    isTuplet: true,
                }));
            });

            it("bar 8: single 12:16 tuplet over the full bar", () => {
                const bar = agogo.measures[7];
                expect(bar.steps).toHaveLength(12);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "2", "2", "0", "0",
                    "1", "1", "1", "1", "1", "1",
                ]);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0,
                    actual: 12,
                    normal: 16,
                    isTuplet: true,
                }));
            });

            it("bar 9: single sounding grid note at step 0, rest silent", () => {
                const bar = agogo.measures[8];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "0", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bar 10: all rests, no subdivisions", () => {
                const bar = agogo.measures[9];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.every((s) => {
                    return (s.noteStyleId ?? "0") === "0";
                })).toBe(true);
            });

            it("bar 11: no subdivisions, same step pattern as bar 1", () => {
                const bar = agogo.measures[10];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "2", "2", "0", "1", "0",
                    "1", "0", "2", "0", "2", "0", "0", "0",
                ]);
            });
        });

        describe("Chocalho", () => {
            const chocalho = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "1";
            })!;

            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                const totalNotes = [...chocalho.notes].length;
                expect(totalNotes).toBe(76);
            });

            it("has no subdivisions in any bar", () => {
                for (const measure of chocalho.measures) {
                    expect(measure.subdivisions).toHaveLength(0);
                }
            });

            it("has 16 grid steps in every bar", () => {
                for (const measure of chocalho.measures) {
                    expect(measure.steps).toHaveLength(16);
                }
            });

            it("bar 1: dense pattern with styles 1 and 2", () => {
                expect(chocalho.measures[0].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "2", "2", "2", "1", "2", "2", "2",
                    "1", "2", "2", "2", "1", "2", "2", "2",
                ]);
            });

            it("bar 2: mixed pattern, rests in second half", () => {
                expect(chocalho.measures[1].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "2", "2", "2", "1", "0", "1", "0",
                    "1", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bars 3-8: sparse pattern, style 1 on each beat", () => {
                const pattern = [
                    "1", "0", "0", "0", "1", "0", "0", "0",
                    "1", "0", "0", "0", "1", "0", "0", "0",
                ];

                for (let i = 2; i <= 7; i++) {
                    expect(chocalho.measures[i].steps.map((s) => {
                        return s.noteStyleId ?? "0";
                    })).toEqual(pattern);
                }
            });

            it("bar 9: single style 1 at step 0", () => {
                expect(chocalho.measures[8].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "0", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bar 10: dense pattern starting at step 4", () => {
                expect(chocalho.measures[9].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "0", "0", "0", "0", "1", "2", "2", "2",
                    "1", "2", "2", "2", "1", "2", "2", "2",
                ]);
            });

            it("bar 11: dense pattern, same as bar 1", () => {
                expect(chocalho.measures[10].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "2", "2", "2", "1", "2", "2", "2",
                    "1", "2", "2", "2", "1", "2", "2", "2",
                ]);
            });
        });

        describe("Tamborim", () => {
            const tamborim = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "2";
            })!;

            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                expect([...tamborim.notes].length).toBe(106);
            });

            it("all bars have 16 grid steps except polyrhythm bars", () => {
                expect(tamborim.measures[0].steps).toHaveLength(16);
                expect(tamborim.measures[1].steps).toHaveLength(16);
                expect(tamborim.measures[2].steps).toHaveLength(12);
                expect(tamborim.measures[3].steps).toHaveLength(14);
                expect(tamborim.measures[4].steps).toHaveLength(12);
                expect(tamborim.measures[5].steps).toHaveLength(14);
                expect(tamborim.measures[6].steps).toHaveLength(12);
                expect(tamborim.measures[7].steps).toHaveLength(14);
                expect(tamborim.measures[8].steps).toHaveLength(16);
                expect(tamborim.measures[9].steps).toHaveLength(16);
                expect(tamborim.measures[10].steps).toHaveLength(16);
            });

            const densePattern = [
                "1", "2", "2", "1", "1", "2", "2", "1",
                "1", "2", "2", "1", "1", "2", "2", "1",
            ];

            it("bar 1: dense pattern, no subdivisions", () => {
                const bar = tamborim.measures[0];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual(densePattern);
            });

            it("bar 2: mixed pattern with rests in second half", () => {
                const bar = tamborim.measures[1];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "1", "1", "1", "1", "0", "1", "0",
                    "1", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bars 3 and 5 and 7: 12:16 tuplet over full bar", () => {
                const pattern = ["0", "0", "1", "1", "0", "0", "0", "0", "1", "1", "0", "0"];

                for (const i of [2, 4, 6]) {
                    const bar = tamborim.measures[i];
                    expect(bar.subdivisions).toHaveLength(1);
                    expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                        startStep: 0, actual: 12, normal: 16, isTuplet: true,
                    }));
                    expect(bar.steps.map((s) => {
                        return s.noteStyleId ?? "0";
                    })).toEqual(pattern);
                }
            });

            it("bars 4 and 6 and 8: partial 6:8 tuplet", () => {
                const pattern = ["0", "0", "1", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];

                for (const i of [3, 5, 7]) {
                    const bar = tamborim.measures[i];
                    expect(bar.subdivisions).toHaveLength(1);
                    expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                        startStep: 0, actual: 6, normal: 8, isTuplet: true,
                    }));
                    expect(bar.steps.map((s) => {
                        return s.noteStyleId ?? "0";
                    })).toEqual(pattern);
                }
            });

            it("bar 9: single style 1 at step 0", () => {
                const bar = tamborim.measures[8];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "0", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bar 10: dense pattern starting at step 4", () => {
                const bar = tamborim.measures[9];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "0", "0", "0", "0", "1", "2", "2", "1",
                    "1", "2", "2", "1", "1", "2", "2", "1",
                ]);
            });

            it("bar 11: dense pattern, same as bar 1", () => {
                const bar = tamborim.measures[10];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual(densePattern);
            });
        });

        describe("Repinique", () => {
            const repinique = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "3";
            })!;

            const mainPattern = [
                "1", "2", "3", "7", "1", "2", "3", "6",
                "1", "2", "3", "7", "1", "2", "3", "6",
            ];

            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                expect([...repinique.notes].length).toBe(170);
            });

            it("has no subdivisions in any bar", () => {
                for (const measure of repinique.measures) {
                    expect(measure.subdivisions).toHaveLength(0);
                }
            });

            it("bars 1-8 and 10-11: main repeating pattern", () => {
                for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]) {
                    expect(repinique.measures[i].steps.map((s) => {
                        return s.noteStyleId ?? "0";
                    })).toEqual(mainPattern);
                }
            });

            it("bar 9: unique pattern with different note styles", () => {
                expect(repinique.measures[8].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "3", "0", "1", "0", "3", "0",
                    "1", "0", "3", "3", "6", "5", "0", "6",
                ]);
            });
        });

        describe("Caixa", () => {
            const caixa = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "5";
            })!;

            const densePattern = [
                "1", "2", "2", "1", "1", "2", "2", "1",
                "1", "2", "2", "1", "1", "2", "2", "1",
            ];

            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                expect([...caixa.notes].length).toBe(157);
            });

            it("has no subdivisions in any bar", () => {
                for (const measure of caixa.measures) {
                    expect(measure.subdivisions).toHaveLength(0);
                }
            });

            it("bars 1-8: dense repeating pattern", () => {
                for (let i = 0; i <= 7; i++) {
                    expect(caixa.measures[i].steps.map((s) => {
                        return s.noteStyleId ?? "0";
                    })).toEqual(densePattern);
                }
            });

            it("bar 9: single style 1 at step 0", () => {
                expect(caixa.measures[8].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "0", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bar 10: dense pattern starting at step 4", () => {
                expect(caixa.measures[9].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "0", "0", "0", "0", "1", "2", "2", "1",
                    "1", "2", "2", "1", "1", "2", "2", "1",
                ]);
            });

            it("bar 11: same dense pattern as bars 1-8", () => {
                expect(caixa.measures[10].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual(densePattern);
            });
        });

        describe("High Surdo", () => {
            const highSurdo = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "7";
            })!;

            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                expect([...highSurdo.notes].length).toBe(86);
            });

            it("bar 1: sparse pattern, no subdivisions", () => {
                const bar = highSurdo.measures[0];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "0", "0", "0", "0", "1", "0", "1", "0",
                    "0", "0", "0", "0", "1", "1", "0", "1",
                ]);
            });

            it("bar 2: 3:4 tuplet at the end", () => {
                const bar = highSurdo.measures[1];
                expect(bar.steps).toHaveLength(15);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 12, actual: 3, normal: 4, isTuplet: true,
                }));
            });

            it("bar 3: single 12:16 tuplet", () => {
                const bar = highSurdo.measures[2];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "1", "1", "0", "0", "0", "0", "1",
                ]);
            });

            it("bar 4: two 6:8 tuplets", () => {
                const bar = highSurdo.measures[3];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 6, normal: 8, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 6, actual: 6, normal: 8, isTuplet: true,
                }));
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "1", "1", "1", "1", "1", "1",
                ]);
            });

            it("bar 5: single 12:16 tuplet", () => {
                const bar = highSurdo.measures[4];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
            });

            it("bar 6: two subdivisions (3:4 + 6:8)", () => {
                const bar = highSurdo.measures[5];
                expect(bar.steps).toHaveLength(13);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 3, normal: 4, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 7, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bar 7: single 12:16 tuplet", () => {
                const bar = highSurdo.measures[6];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
            });

            it("bar 8: two subdivisions (3:4 + 6:8)", () => {
                const bar = highSurdo.measures[7];
                expect(bar.steps).toHaveLength(13);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 3, normal: 4, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 7, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bars 9-11: grid only, sparse pattern", () => {
                const bar9Pattern = [
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "0", "0", "0", "0", "0", "0", "0", "0",
                ];
                const bar10Pattern = [
                    "0", "0", "0", "0", "1", "0", "1", "0",
                    "0", "0", "0", "0", "1", "1", "0", "1",
                ];

                expect(highSurdo.measures[8].subdivisions).toHaveLength(0);
                expect(highSurdo.measures[8].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual(bar9Pattern);

                expect(highSurdo.measures[9].subdivisions).toHaveLength(0);
                expect(highSurdo.measures[9].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual(bar10Pattern);

                expect(highSurdo.measures[10].subdivisions).toHaveLength(0);
                expect(highSurdo.measures[10].steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual(bar10Pattern);
            });
        });

        describe("Mid Surdo", () => {
            const midSurdo = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "8";
            })!;

            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                expect([...midSurdo.notes].length).toBe(77);
            });

            it("bar 1: two accented grid notes", () => {
                const bar = midSurdo.measures[0];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "1", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bar 2: 3:4 tuplet at the end", () => {
                const bar = midSurdo.measures[1];
                expect(bar.steps).toHaveLength(15);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 12, actual: 3, normal: 4, isTuplet: true,
                }));
            });

            it("bar 3: single 12:16 tuplet", () => {
                const bar = midSurdo.measures[2];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "1", "1", "0", "0", "0", "0", "1",
                ]);
            });

            it("bar 4: two 6:8 tuplets", () => {
                const bar = midSurdo.measures[3];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 6, normal: 8, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 6, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bar 5: single 12:16 tuplet", () => {
                const bar = midSurdo.measures[4];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
            });

            it("bar 6: two subdivisions (3:4 + 6:8)", () => {
                const bar = midSurdo.measures[5];
                expect(bar.steps).toHaveLength(13);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 3, normal: 4, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 7, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bar 7: single 12:16 tuplet", () => {
                const bar = midSurdo.measures[6];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
            });

            it("bar 8: two subdivisions (3:4 + 6:8)", () => {
                const bar = midSurdo.measures[7];
                expect(bar.steps).toHaveLength(13);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 3, normal: 4, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 7, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bar 9: single accented grid note", () => {
                const bar = midSurdo.measures[8];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "0", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bar 10: single accented grid note at step 8", () => {
                const bar = midSurdo.measures[9];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "0", "0", "0", "0", "0", "0", "0", "0",
                    "1", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bar 11: same as bar 1", () => {
                const bar = midSurdo.measures[10];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "1", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });
        });

        describe("Low Surdo", () => {
            const lowSurdo = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "9";
            })!;

            it("has the correct total number of note events", () => {
                hydrateMeasureEvents(arrangement);
                expect([...lowSurdo.notes].length).toBe(77);
            });

            it("bar 1: sparse pattern, two accented grid notes", () => {
                const bar = lowSurdo.measures[0];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "0", "0", "0", "0", "1", "0", "0", "0",
                    "0", "0", "0", "0", "1", "0", "0", "0",
                ]);
            });

            it("bar 2: 3:4 tuplet at the end", () => {
                const bar = lowSurdo.measures[1];
                expect(bar.steps).toHaveLength(15);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 12, actual: 3, normal: 4, isTuplet: true,
                }));
            });

            it("bar 3: single 12:16 tuplet", () => {
                const bar = lowSurdo.measures[2];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "1", "1", "0", "0", "0", "0", "1",
                ]);
            });

            it("bar 4: two 6:8 tuplets", () => {
                const bar = lowSurdo.measures[3];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 6, normal: 8, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 6, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bar 5: single 12:16 tuplet", () => {
                const bar = lowSurdo.measures[4];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
            });

            it("bar 6: two subdivisions (3:4 + 6:8)", () => {
                const bar = lowSurdo.measures[5];
                expect(bar.steps).toHaveLength(13);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 3, normal: 4, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 7, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bar 7: single 12:16 tuplet", () => {
                const bar = lowSurdo.measures[6];
                expect(bar.steps).toHaveLength(12);
                expect(bar.subdivisions).toHaveLength(1);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 12, normal: 16, isTuplet: true,
                }));
            });

            it("bar 8: two subdivisions (3:4 + 6:8)", () => {
                const bar = lowSurdo.measures[7];
                expect(bar.steps).toHaveLength(13);
                expect(bar.subdivisions).toHaveLength(2);
                expect(bar.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 3, normal: 4, isTuplet: true,
                }));
                expect(bar.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 7, actual: 6, normal: 8, isTuplet: true,
                }));
            });

            it("bar 9: single accented grid note", () => {
                const bar = lowSurdo.measures[8];
                expect(bar.subdivisions).toHaveLength(0);
                expect(bar.steps).toHaveLength(16);
                expect(bar.steps.map((s) => {
                    return s.noteStyleId ?? "0";
                })).toEqual([
                    "1", "0", "0", "0", "0", "0", "0", "0",
                    "0", "0", "0", "0", "0", "0", "0", "0",
                ]);
            });

            it("bars 10-11: same sparse pattern as bar 1", () => {
                const pattern = [
                    "0", "0", "0", "0", "1", "0", "0", "0",
                    "0", "0", "0", "0", "1", "0", "0", "0",
                ];

                for (const i of [9, 10]) {
                    const bar = lowSurdo.measures[i];
                    expect(bar.subdivisions).toHaveLength(0);
                    expect(bar.steps).toHaveLength(16);
                    expect(bar.steps.map((s) => {
                        return s.noteStyleId ?? "0";
                    })).toEqual(pattern);
                }
            });
        });

    });
});
