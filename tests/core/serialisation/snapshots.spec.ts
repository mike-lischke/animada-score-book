/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../../src/core/Arrangement.js";
import { SbDmEntityType, type ISbDmInstrument } from "../../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../../src/core/serialisation/migration/ArrangementMigrator.js";
import { getArrangementSnapshot } from "../../../src/core/serialisation/snapshots.js";
import type { ILegacyArrangementSnapshot } from "../../../src/core/serialisation/migration/legacy-snapshot-types.js";
import type { INoteStyle, Mutable } from "../../../src/core/types/general.js";
import { TimeCoordinator } from "../../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../../src/player/TrackPlayer.js";

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

describe("snapshots", () => {
    it("writes arrangement snapshots as version 2 without legacy polyrhythm fields", () => {
        const instrument = createInstrument("0", 0, 0);
        const noteStyle = {
            id: "1",
            audioBuffer: null,
            instrument,
        } as INoteStyle;
        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": noteStyle };

        const sourceSnapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Source",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 8,
            },
            tracks: [{
                id: 100,
                instrumentId: "0",
                notes: Array.from({ length: 9 }, () => {
                    return "0";
                }),
                polyrhythms: [{
                    id: 200,
                    start: 0,
                    end: 1,
                    length: 3,
                }],
            }],
        };

        const arrangement = ArrangementMigrator.migrateToArrangement(sourceSnapshot, [instrument]).arrangement;
        hydrateMeasureEvents(arrangement);
        const firstTrack = arrangement.tracks[0];

        // Polyrhythm-shaped events have a duration whose denominator differs from stepsPerBar (here 8).
        const stepsPerBar = 8;
        const polyrhythmEventIndex = firstTrack.measures[0].events.findIndex((event) => {
            return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
        });

        if (polyrhythmEventIndex === -1) {
            throw new Error("Expected polyrhythm event in migrated arrangement");
        }

        // Set the second polyrhythm event's noteStyle directly on the measure event.
        const secondPolyrhythmEventIndex = polyrhythmEventIndex + 1;
        firstTrack.measures[0].events[secondPolyrhythmEventIndex] = {
            ...firstTrack.measures[0].events[secondPolyrhythmEventIndex],
            noteStyle,
        };

        const snapshot = getArrangementSnapshot(arrangement);

        expect(snapshot.version).toBe(2);
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
});
