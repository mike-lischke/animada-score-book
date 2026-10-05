/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../../src/core/Arrangement.js";
import { Damping, type ISbDmInstrument } from "../../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../../src/core/serialisation/migration/ArrangementMigrator.js";
import { stringifyPackedArrangement } from "../../../src/core/serialisation/snapshot-packing.js";
import { getArrangementSnapshot, arrangementSnapshotVersion } from "../../../src/core/serialisation/snapshots.js";
import type { IBananaDrumSnapshot } from "../../../src/core/serialisation/migration/BananaDrumMigrator.js";
import type { IArrangementSnapshot, IAudioData, Mutable } from "../../../src/core/types/general.js";
import { RangeArticulationKind } from "../../../src/core/types/general.js";
import { createInstrument } from "../../unit-test-helpers.js";

describe("snapshots", () => {
    it("writes arrangement snapshots at the current version with tuplets instead of polyrhythms", () => {
        const instrument = createInstrument("0", 0, 0);
        const noteStyle = {
            id: "1",
            audioBuffer: null,
            instrument,
            sampleProfile: { builtInDamping: Damping.Open, builtInAccent: false, ghost: false }
        } as IAudioData;

        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": noteStyle };

        const sourceSnapshot: IBananaDrumSnapshot = {
            title: "Source",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 8 },
            tracks: [{
                id: 100,
                instrumentId: "0",
                notes: Array.from({ length: 9 }, () => {
                    return "0";
                }),
                polyrhythms: [{ id: 200, start: 0, end: 1, length: 3 }],
            }],
        };

        const arrangement = ArrangementMigrator.migrateToArrangement(sourceSnapshot, [instrument]).arrangement;
        const firstTrack = arrangement.tracks[0];
        const measure = firstTrack.measures[0];

        // The polyrhythm (3 over 1) becomes a 3:2 tuplet.
        const subdivision = measure.subdivisions.find((candidate) => {
            return candidate.actual === 3 && candidate.normal === 2;
        });
        if (!subdivision) {
            throw new Error("Expected the polyrhythm to migrate to a 3:2 tuplet");
        }

        // Set the second note of the tuplet directly on the measure event (the source of truth).
        measure.events[subdivision.startIndex + 1].noteStyleId = "1";

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.version).toBe(arrangementSnapshotVersion);
        const track = snapshot.tracks[0];
        expect("measures" in track).toBe(true);
        if ("measures" in track) {
            expect("polyrhythms" in track).toBe(false);
            expect(track.measures[0]?.subdivisions).toContainEqual(expect.objectContaining({
                actual: 3,
                normal: 2,
            }));

            expect(track.measures[0]?.events[subdivision.startIndex + 1]?.noteStyleId).toBe("1");
        }
    });

    it("includes scoreId in snapshot when arrangement has a DB-backed ID", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        (arrangement as Mutable<Arrangement>).id = 12345;

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.scoreId).toBe(12345);
    });

    it("omits scoreId from snapshot for local arrangements (id < 10000)", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);

        // emptyArrangement assigns a small ID via getNewId()
        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.scoreId).toBeUndefined();
    });

    it("ArrangementMigrator preserves scoreId from snapshot", () => {
        const instrument = createInstrument("0", 0, 0);
        const snapshot: IArrangementSnapshot = {
            version: arrangementSnapshotVersion,
            title: "Scored",
            scoreId: 12345,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 8 },
            tracks: [],
        };

        const { arrangement } = ArrangementMigrator.migrateToArrangement(snapshot, [instrument]);

        expect(arrangement.id).toBe(12345);
    });

    it("persists note styles from events, independent of the note-event cache", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        const track = arrangement.tracks[0];

        // The runtime note-event cache is empty until a TrackPlayer hydrates it.
        expect(track.measures[0].noteEvents).toHaveLength(0);

        track.measures[0].events[0].noteStyleId = "1";

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.tracks[0].measures[0].events[0].noteStyleId).toBe("1");
    });

    it("keeps unknown extension chunks through a snapshot round trip", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);

        arrangement.applyArrangementSnapshot({
            version: arrangementSnapshotVersion,
            title: "Foreign chunks",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 8 },
            tracks: [],
            extensions: { laterFeature: { nested: [1, 2, 3] }, measureWidths: { 1: 1000 } },
        }, [instrument]);

        expect([...arrangement.measureWidths]).toEqual([[1, 1000]]);

        const snapshot = arrangement.toSnapshot();
        expect(snapshot.extensions).toEqual({
            laterFeature: { nested: [1, 2, 3] },
            measureWidths: { 1: 1000 },
        });
    });

    it("drops measure widths for bars the arrangement does not have", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);

        arrangement.applyArrangementSnapshot({
            version: arrangementSnapshotVersion,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 8 },
            tracks: [],
            extensions: { measureWidths: { 2: 2000, 5: 500, 0: 900 } },
        }, [instrument]);

        expect([...arrangement.measureWidths]).toEqual([[2, 2000]]);
    });

    it("reports measure widths through the undo snapshot as well", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        arrangement.measureWidths.set(1, 1500);

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.extensions).toEqual({ measureWidths: { 1: 1500 } });
    });

    it("keeps the repeat marks of the bars it has", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);

        arrangement.applyArrangementSnapshot({
            version: arrangementSnapshotVersion,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 8 },
            tracks: [],
            extensions: { repeatBars: { 1: { start: true }, 2: { end: true } } },
        }, [instrument]);

        expect(Object.fromEntries(arrangement.repeatBars)).toEqual({ 1: { start: true }, 2: { end: true } });
    });

    it("drops repeat marks for bars the arrangement does not have", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);

        arrangement.applyArrangementSnapshot({
            version: arrangementSnapshotVersion,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 8 },
            tracks: [],
            extensions: {
                repeatBars: { 2: { end: true }, 5: { start: true }, 0: { start: true }, 1: {}, 3: { end: false } },
            },
        }, [instrument]);

        expect(Object.fromEntries(arrangement.repeatBars)).toEqual({ 2: { end: true } });
    });

    it("reports the repeat marks through the undo snapshot as well", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        arrangement.repeatBars.set(2, { end: true });

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.extensions).toEqual({ repeatBars: { 2: { end: true } } });
    });

    it("loads a packed string through the migrator entry point", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        arrangement.tracks[0].measures[0].events[0].noteStyleId = "1";

        const snapshot = getArrangementSnapshot(arrangement);
        const packed = stringifyPackedArrangement(snapshot);

        const { arrangement: restored, migrated } = ArrangementMigrator.migrateToArrangement(packed, [instrument]);

        expect(migrated).toBe(false);
        expect(getArrangementSnapshot(restored)).toEqual(snapshot);
    });

    it("carries a one-bar repeat through the snapshot and the packed round trip", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 2 });
        arrangement.tracks[0].measures[1].simile = true;

        const snapshot = getArrangementSnapshot(arrangement);
        expect(snapshot.tracks[0].measures[1].simile).toBe(true);

        const packed = stringifyPackedArrangement(snapshot);
        const { arrangement: restored, migrated } = ArrangementMigrator.migrateToArrangement(packed, [instrument]);

        expect(migrated).toBe(false);
        expect(restored.tracks[0].measures[1].simile).toBe(true);
        expect(getArrangementSnapshot(restored)).toEqual(snapshot);
    });

    /**
     * @param bars The number of measures to build.
     *
     * @returns A snapshot whose measures each hold two quarter notes and a half rest, which is enough to anchor a
     * hairpin and an f marking.
     */
    const snapshotOfNotes = (bars: number): IArrangementSnapshot => {
        const measures = Array.from({ length: bars }, (entry, index) => {
            return {
                number: index + 1,
                meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                events: [
                    {
                        start: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 4 },
                        noteStyleId: "1",
                    },
                    {
                        start: { numerator: 1, denominator: 4 },
                        duration: { numerator: 1, denominator: 4 },
                        noteStyleId: "1",
                    },
                    { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
                ],
                subdivisions: [],
            };
        });

        return {
            version: arrangementSnapshotVersion,
            title: "Marked notes",
            timeParams: { timeSignature: "4/4", tempo: 120, length: bars, pulse: "1/4", stepResolution: 16 },
            tracks: [{ id: 100, instrumentId: "0", measures }],
        };
    };

    it("carries a hairpin over a barline and an f marking through the packed round trip", () => {
        const instrument = createInstrument("0", 0, 0);
        const { arrangement } = ArrangementMigrator.migrateToArrangement(snapshotOfNotes(2), [instrument]);

        arrangement.rangeArticulations.add(
            {
                id: 9001,
                trackId: arrangement.tracks[0].id,
                kind: RangeArticulationKind.Crescendo,
                from: { bar: 1, start: { numerator: 0, denominator: 1 } },
                to: { bar: 2, start: { numerator: 0, denominator: 1 } },
            },
        );
        arrangement.rangeArticulations.add(
            {
                id: 9002,
                trackId: arrangement.tracks[0].id,
                kind: RangeArticulationKind.Forte,
                at: { bar: 2, start: { numerator: 1, denominator: 2 } },
            },
        );

        const snapshot = getArrangementSnapshot(arrangement);
        expect(snapshot.extensions?.rangeArticulations).toHaveLength(2);

        const packed = stringifyPackedArrangement(snapshot);
        const { arrangement: restored, migrated } = ArrangementMigrator.migrateToArrangement(packed, [instrument]);

        expect(migrated).toBe(false);
        expect(restored.rangeArticulations.all).toEqual(arrangement.rangeArticulations.all);
        expect(getArrangementSnapshot(restored)).toEqual(snapshot);
    });

    it("drops the range articulations a loaded arrangement cannot resolve", () => {
        const instrument = createInstrument("0", 0, 0);
        const snapshot = snapshotOfNotes(2);
        const trackId = 100;

        snapshot.extensions = {
            rangeArticulations: [
                {
                    id: 9001,
                    trackId,
                    kind: RangeArticulationKind.Crescendo,
                    from: { bar: 1, start: { numerator: 0, denominator: 1 } },
                    to: { bar: 1, start: { numerator: 1, denominator: 4 } },
                },
                // The second half of the second measure is a rest, so no hairpin anchors to it.
                {
                    id: 9002,
                    trackId,
                    kind: RangeArticulationKind.Decrescendo,
                    from: { bar: 1, start: { numerator: 0, denominator: 1 } },
                    to: { bar: 2, start: { numerator: 1, denominator: 2 } },
                },
                // A third measure the arrangement does not have.
                {
                    id: 9003,
                    trackId,
                    kind: RangeArticulationKind.Forte,
                    at: { bar: 3, start: { numerator: 0, denominator: 1 } },
                },
                // A track the arrangement does not have.
                {
                    id: 9004,
                    trackId: 999,
                    kind: RangeArticulationKind.Forte,
                    at: { bar: 1, start: { numerator: 1, denominator: 2 } },
                },
            ],
        };

        const { arrangement } = ArrangementMigrator.migrateToArrangement(snapshot, [instrument]);

        expect(arrangement.rangeArticulations.all.map((articulation) => {
            return articulation.id;
        })).toEqual([9001]);
    });
});
