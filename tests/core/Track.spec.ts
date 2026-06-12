/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { Track } from "../../src/core/Track.js";
import { SbDmEntityType, type ISbDmInstrument } from "../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../src/core/serialisation/migration/ArrangementMigrator.js";
import type { ILegacyArrangementSnapshot } from "../../src/core/serialisation/migration/legacy-snapshot-types.js";
import type { INoteStyle } from "../../src/core/types/general.js";
import { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";

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

describe("Track", () => {
    it("derives sparse measures and synthesises rests for empty slots", () => {
        const instrument = createInstrument("0", 0, 0);
        const noteStyle = {
            id: "accent",
            instrument,
            audioBuffer: null,
        } as INoteStyle;
        instrument.noteStyles[noteStyle.id] = noteStyle;

        const snapshot: ILegacyArrangementSnapshot = {
            version: 1,
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 2,
                pulse: "1/4",
                stepResolution: 16,
            },
            tracks: [{
                id: 100,
                instrumentId: "0",
                // Sounding notes at bar 1 step 1, bar 1 step 9, bar 2 step 5; everything else rests.
                notes: Array.from({ length: 32 }, (_, index) => {
                    if (index === 0 || index === 8 || index === 16 + 4) {
                        return noteStyle.id;
                    }

                    return "0";
                }),
                polyrhythms: [],
            }],
        };

        const arrangement = ArrangementMigrator.migrateToArrangement(snapshot, [instrument]).arrangement;
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        expect(track.measures).toHaveLength(2);
        const [firstMeasure, secondMeasure] = track.measures;

        // Only sounding notes are stored. Empty grid slots are not persisted.
        expect(firstMeasure.events).toHaveLength(2);
        expect(secondMeasure.events).toHaveLength(1);

        expect(firstMeasure.events[0]).toMatchObject({
            measureNumber: 1,
            start: { numerator: 0, denominator: 1 },
            // Note absorbs the rest gap up to the next pulse boundary (1/4) → quarter note.
            duration: { numerator: 1, denominator: 4 },
        });

        expect(firstMeasure.events[1]).toMatchObject({
            measureNumber: 1,
            start: { numerator: 1, denominator: 2 },
            // Note on a pulse start with no following event extends to the next pulse boundary.
            duration: { numerator: 1, denominator: 4 },
        });

        expect(secondMeasure.events[0]).toMatchObject({
            measureNumber: 2,
            start: { numerator: 1, denominator: 4 },
            duration: { numerator: 1, denominator: 4 },
        });

        // getNoteAt synthesises rest events on demand for empty grid slots.
        const restAtBar1Step2 = track.getNoteAt({ bar: 1, step: 2 });
        expect(restAtBar1Step2).toMatchObject({
            measureNumber: 1,
            start: { numerator: 1, denominator: 16 },
            duration: { numerator: 1, denominator: 16 },
            noteStyle: undefined,
        });

        // getNoteAt finds stored sounding events.
        expect(track.getNoteAt({ bar: 1, step: 1 })?.noteStyle?.id).toBe(noteStyle.id);
        expect(track.getNoteAt({ bar: 2, step: 5 })?.noteStyle?.id).toBe(noteStyle.id);
    });

    it("includes sounding polyrhythm notes in derived measures", () => {
        const instrument = createInstrument("0", 0, 0);
        const noteStyle = {
            id: "accent",
            instrument,
            audioBuffer: null,
        } as INoteStyle;
        instrument.noteStyles[noteStyle.id] = noteStyle;

        // Build the polyrhythm via the V1 legacy snapshot path so the migration produces the
        // expected non-grid measure events.
        const notes = Array.from<string>({ length: 16 }).fill("0");
        notes[0] = noteStyle.id;
        const snapshot: ILegacyArrangementSnapshot = {
            version: 1,
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 16,
            },
            tracks: [{
                id: 100,
                instrumentId: "0",
                notes,
                polyrhythms: [{
                    id: 555,
                    start: 0,
                    end: 3,
                    length: 3,
                }],
            }],
        };

        // Mark the polyrhythm's three sub-notes as sounding by modifying the result post-migration:
        // the migrator emits one event per polyrhythm note; we then set their noteStyle directly.
        const arrangement = ArrangementMigrator.migrateToArrangement(
            snapshot, [instrument],
        ).arrangement;
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        const stepsPerBar = 16;
        const polyrhythmEventIndices = track.measures[0].events
            .map((event, index) => {
                return { event, index };
            })
            .filter(({ event }) => {
                return !(event.duration.numerator === 1 && event.duration.denominator === stepsPerBar);
            })
            .map(({ index }) => {
                return index;
            });
        expect(polyrhythmEventIndices).toHaveLength(3);
        for (const index of polyrhythmEventIndices) {
            track.measures[0].events[index] = {
                ...track.measures[0].events[index],
                noteStyle,
            };
        }

        expect(track.measures).toHaveLength(1);
        const soundingEvents = track.measures[0].events.filter((event) => {
            return event.noteStyle?.id === noteStyle.id;
        });
        expect(soundingEvents).toHaveLength(3);
        expect(soundingEvents.map((event) => {
            return event.start;
        })).toEqual([
            { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 12 },
            { numerator: 1, denominator: 6 },
        ]);
    });
});
