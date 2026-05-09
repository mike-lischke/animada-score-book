/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { Track } from "../../src/core/Track.js";
import { SbDmEntityType, type ISbDmInstrument } from "../../src/core/ScoreBookDataModel.js";
import { ArrangementSnapshotMigrator } from "../../src/core/serialisation/migration/ArrangementSnapshotMigrator.js";
import type { ILegacyArrangementSnapshot } from "../../src/core/serialisation/migration/migration-types.js";
import { getArrangementSnapshot } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot, Mutable } from "../../src/core/types/general.js";

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
        subscribe: () => {
            return () => {
                return undefined;
            };
        },
        unsubscribe: () => {
            return undefined;
        },
    };
};

describe("Arrangement", () => {
    it("removes all obsolete tracks when applying a snapshot", () => {
        const instruments = [
            createInstrument("0", 0, 0),
            createInstrument("1", 1, 1),
            createInstrument("2", 2, 2),
        ];

        const originalSnapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Original",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 4,
            },
            tracks: [
                { id: 100, instrumentId: "0", notes: [], polyrhythms: [] },
                { id: 200, instrumentId: "1", notes: [], polyrhythms: [] },
                { id: 300, instrumentId: "2", notes: [], polyrhythms: [] },
            ]
        };

        const currentOriginalSnapshot = ArrangementSnapshotMigrator.migrate(originalSnapshot, instruments);
        const arrangement = Arrangement.fromSnapshot(currentOriginalSnapshot, instruments);

        const importedSnapshot = ArrangementSnapshotMigrator.migrate({
            ...originalSnapshot,
            title: "Imported",
            tracks: [],
        }, instruments);

        arrangement.applyArrangementSnapshot(importedSnapshot, instruments);

        expect(arrangement.tracks).toHaveLength(0);
    });

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

        const arrangement = Arrangement.fromSnapshot(ArrangementSnapshotMigrator.migrate(snapshot, instruments),
            instruments);
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

        const arrangement = Arrangement.fromSnapshot(ArrangementSnapshotMigrator.migrate(snapshot, instruments),
            instruments);
        const track = arrangement.tracks[0] as Track;

        const stepsPerBar = 16;
        const isPolyrhythmEvent = (event: { duration: { numerator: number; denominator: number; }; }) => {
            return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
        };
        const polyrhythmEvents = track.measures[0].events.filter(isPolyrhythmEvent);
        expect(polyrhythmEvents).toHaveLength(4);
    });

    it("applies v2 measure/event snapshots to track notes", () => {
        const instrument = createInstrument("0", 0, 0);
        const hitStyle = {
            id: "1",
            audioBuffer: null,
            instrument,
        };
        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": hitStyle };

        const snapshot: IArrangementSnapshot = {
            version: 2,
            title: "Measure Events",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 2,
                pulse: "1/4",
                stepResolution: 8,
            },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    measures: [
                        {
                            number: 1,
                            events: [
                                {
                                    start: { numerator: 0, denominator: 1 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "1",
                                },
                                {
                                    start: { numerator: 1, denominator: 8 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                            ],
                        },
                        {
                            number: 2,
                            events: [
                                {
                                    start: { numerator: 0, denominator: 1 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                                {
                                    start: { numerator: 1, denominator: 8 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                                {
                                    start: { numerator: 1, denominator: 4 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                                {
                                    start: { numerator: 3, denominator: 8 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                                {
                                    start: { numerator: 1, denominator: 2 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "1",
                                },
                                {
                                    start: { numerator: 5, denominator: 8 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                                {
                                    start: { numerator: 3, denominator: 4 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                                {
                                    start: { numerator: 7, denominator: 8 },
                                    duration: { numerator: 1, denominator: 8 },
                                    noteStyleId: "0",
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const arrangement = Arrangement.fromSnapshot(snapshot, [instrument]);
        const track = arrangement.tracks[0] as Track;

        expect(track.getNoteAt({ bar: 1, step: 1 })?.noteStyle?.id).toBe("1");
        expect(track.getNoteAt({ bar: 2, step: 5 })?.noteStyle?.id).toBe("1");
        // No non-grid (polyrhythm-shaped) events expected in this snapshot. Sounding grid notes
        // may carry an extended duration (a multiple of the grid step) when they absorb the
        // following rest gap within their pulse.
        const stepsPerBar = 8;
        const allEvents = track.measures.flatMap((measure) => {
            return measure.events;
        });
        const polyrhythmEvents = allEvents.filter((event) => {
            return (event.duration.numerator * stepsPerBar) % event.duration.denominator !== 0;
        });
        expect(polyrhythmEvents).toHaveLength(0);
    });

    it("reconstructs polyrhythms from v2 measure events", () => {
        const instrument = createInstrument("0", 0, 0);
        const hitStyle = {
            id: "1",
            audioBuffer: null,
            instrument,
        };
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

        const sourceArrangement = Arrangement.fromSnapshot(
            ArrangementSnapshotMigrator.migrate(legacySnapshot, [instrument]),
            [instrument],
        );
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
            noteStyle: hitStyle,
        };
        const snapshot = getArrangementSnapshot(sourceArrangement);

        const arrangement = Arrangement.fromSnapshot(snapshot, [instrument]);
        const track = arrangement.tracks[0] as Track;

        const polyrhythmEvents = track.measures[0].events.filter((event) => {
            return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
        });
        expect(polyrhythmEvents).toHaveLength(3);
        expect(polyrhythmEvents[1].noteStyle?.id).toBe("1");
    });
});
