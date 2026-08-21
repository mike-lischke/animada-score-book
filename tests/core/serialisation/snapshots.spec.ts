/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../../src/core/Arrangement.js";
import type { ISbDmInstrument } from "../../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../../src/core/serialisation/migration/ArrangementMigrator.js";
import { getArrangementSnapshot } from "../../../src/core/serialisation/snapshots.js";
import type { ILegacyArrangementSnapshot } from "../../../src/core/serialisation/migration/legacy-snapshot-types.js";
import type { IArrangementSnapshot, IAudioData, Mutable } from "../../../src/core/types/general.js";
import { createInstrument, hydrateMeasureEvents } from "../../unit-test-helpers.js";

describe("snapshots", () => {
    it("writes arrangement snapshots as version 2 without legacy polyrhythm fields", () => {
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
        hydrateMeasureEvents(arrangement);
        const firstTrack = arrangement.tracks[0];

        // Set the second polyrhythm note directly on the measure step (the source of truth).
        firstTrack.measures[0].steps[1].noteStyleId = "1";

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.version).toBe(3);
        const track = snapshot.tracks[0];
        expect("measures" in track).toBe(true);
        if ("measures" in track) {
            expect("polyrhythms" in track).toBe(false);
            expect(track.measures[0]?.subdivisions).toContainEqual(expect.objectContaining({
                startStep: 0,
                actual: 3,
                normal: 2,
                isTuplet: true,
            }));

            expect(track.measures[0]?.steps.slice(0, 3)).toEqual([
                { index: 0, noteStyleId: undefined },
                { index: 1, noteStyleId: "1" },
                { index: 2, noteStyleId: undefined },
            ]);
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

    it("preserves note styles when runtime events are not yet materialized", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        const track = arrangement.tracks[0];

        // Simulate a freshly loaded score: notes live on the steps, events are empty until a TrackPlayer hydrates them.
        track.measures[0].steps[0].noteStyleId = "1";
        expect(track.measures[0].events).toHaveLength(0);

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.tracks[0].measures[0].steps[0].noteStyleId).toBe("1");
    });
});
