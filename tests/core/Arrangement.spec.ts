/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { SbDmEntityType, type ISbDmInstrument } from "../../src/core/ScoreBookDataModel.js";
import { TimeParams } from "../../src/core/TimeParams.js";
import { Track } from "../../src/core/Track.js";
import type { IArrangementSnapshot, INoteStyle, ITrackSnapshot, Mutable } from "../../src/core/types/general.js";
import { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";

/**
 * Builds a minimal V2 track snapshot with a single empty measure.
 *
 * @param id           The track id.
 * @param instrumentId The instrument type id.
 * @param stepsPerBar  Steps per bar for the measure.
 * @returns A minimal track snapshot.
 */
const emptyMeasureTrack = (id: number, instrumentId: string, stepsPerBar: number): ITrackSnapshot => {
    return {
        id,
        instrumentId,
        measures: [
            {
                number: 1,
                meter: {
                    beats: stepsPerBar,
                    beatUnits: 4,
                    stepResolution: stepsPerBar,
                    beatGroups: Array.from({ length: stepsPerBar }, () => {
                        return 1;
                    }),
                },
                steps: Array.from({ length: stepsPerBar }, (_, i) => {
                    return { index: i };
                }),
                subdivisions: [],
            },
        ],
    };
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

describe("Arrangement", () => {
    it("removes all obsolete tracks when applying a snapshot", () => {
        const instruments = [
            createInstrument("0", 0, 0),
            createInstrument("1", 1, 1),
            createInstrument("2", 2, 2),
        ];

        const stepsPerBar = 4;
        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", stepsPerBar);

        arrangement.applyArrangementSnapshot({
            version: 2,
            title: "Original",
            timeParams: {
                timeSignature: "4/4", tempo: 120, length: 1,
                pulse: "1/4", stepResolution: stepsPerBar,
            },
            tracks: [
                emptyMeasureTrack(100, "0", stepsPerBar),
                emptyMeasureTrack(200, "1", stepsPerBar),
                emptyMeasureTrack(300, "2", stepsPerBar),
            ],
        }, instruments);

        arrangement.applyArrangementSnapshot({
            version: 2,
            title: "Imported",
            timeParams: {
                timeSignature: "4/4", tempo: 120, length: 1,
                pulse: "1/4", stepResolution: stepsPerBar,
            },
            tracks: [],
        }, instruments);

        expect(arrangement.tracks).toHaveLength(0);
    });

    it("applies v2 snapshots to track notes", () => {
        const instrument = createInstrument("0", 0, 0);
        const hitStyle = {
            id: "1",
            audioBuffer: null,
            instrument,
        } as INoteStyle;
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
                            meter: {
                                beats: 4,
                                beatUnits: 4,
                                stepResolution: 8,
                                beatGroups: [2, 2, 2, 2],
                            },
                            steps: [
                                { index: 0, noteStyleId: "1" },
                                { index: 1 },
                                { index: 2 },
                                { index: 3 },
                                { index: 4 },
                                { index: 5 },
                                { index: 6 },
                                { index: 7 },
                            ],
                            subdivisions: [],
                        },
                        {
                            number: 2,
                            meter: {
                                beats: 4,
                                beatUnits: 4,
                                stepResolution: 8,
                                beatGroups: [2, 2, 2, 2],
                            },
                            steps: [
                                { index: 0 },
                                { index: 1 },
                                { index: 2 },
                                { index: 3 },
                                { index: 4, noteStyleId: "1" },
                                { index: 5 },
                                { index: 6 },
                                { index: 7 },
                            ],
                            subdivisions: [],
                        },
                    ],
                },
            ],
        };

        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 2, "1/4", 8);
        arrangement.applyArrangementSnapshot(snapshot, [instrument]);
        hydrateMeasureEvents(arrangement);
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
});
