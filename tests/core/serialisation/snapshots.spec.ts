/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../../src/core/Arrangement.js";
import type { ISbDmInstrument } from "../../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../../src/core/serialisation/migration/ArrangementMigrator.js";
import { stringifyPackedArrangement } from "../../../src/core/serialisation/snapshot-packing.js";
import { getArrangementSnapshot } from "../../../src/core/serialisation/snapshots.js";
import type { ILegacyArrangementSnapshot } from "../../../src/core/serialisation/migration/legacy-snapshot-types.js";
import type { IArrangementSnapshot, IAudioData, Mutable } from "../../../src/core/types/general.js";
import { createInstrument } from "../../unit-test-helpers.js";

describe("snapshots", () => {
    it("writes arrangement snapshots as version 4 with tuplets instead of polyrhythms", () => {
        const instrument = createInstrument("0", 0, 0);
        const noteStyle = {
            id: "1",
            audioBuffer: null,
            instrument,
            sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }
        } as IAudioData;

        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": noteStyle };

        const sourceSnapshot: ILegacyArrangementSnapshot = {
            version: 1,
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

        expect(snapshot.version).toBe(4);
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
            version: 2,
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

    it("loads a packed v4 string through the migrator entry point", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        arrangement.tracks[0].measures[0].events[0].noteStyleId = "1";

        const snapshot = getArrangementSnapshot(arrangement);
        const packed = stringifyPackedArrangement(snapshot);

        const { arrangement: restored, migrated } = ArrangementMigrator.migrateToArrangement(packed, [instrument]);

        expect(migrated).toBe(false);
        expect(getArrangementSnapshot(restored)).toEqual(snapshot);
    });
});
