/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { GridMeasureRow } from "../../src/components/ui/Bar/Grid/GridMeasureRow.js";
import { Arrangement } from "../../src/core/Arrangement.js";
import {
    ScoreBookDataModel, type ISbDmArrangement, type ISbDmInstrument
} from "../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../src/core/serialisation/migration/ArrangementMigrator.js";
import type {
    ILegacyArrangementSnapshot, ILegacyArrangementSnapshotV3
} from "../../src/core/serialisation/migration/legacy-snapshot-types.js";
import { migrateV3ToV4 } from "../../src/core/serialisation/migration/v3-to-v4.js";
import { TimeParams } from "../../src/core/TimeParams.js";
import { Track } from "../../src/core/Track.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";
import type { IRealtimeProvider } from "../../src/ui/AnimationEngine.js";
import { ScoreElementKind, ScoreElementRegistry } from "../../src/ui/ScoreElementRegistry.js";
import { selectionToClearRanges } from "../../src/ui/selection-ranges.js";
import { SelectionGranularity } from "../../src/ui/selection-types.js";
import { createInstrument, hydrateMeasureEvents } from "../unit-test-helpers.js";

class TestScoreBookDataModel extends ScoreBookDataModel {
    private readonly testArrangement: ISbDmArrangement;
    private readonly testInstruments: ISbDmInstrument[];

    public constructor(arrangement: ISbDmArrangement, instruments: ISbDmInstrument[]) {
        super();
        this.testArrangement = arrangement;
        this.testInstruments = instruments;
    }

    public override get arrangement(): ISbDmArrangement {
        return this.testArrangement;
    }

    public override get instruments(): ISbDmInstrument[] {
        return this.testInstruments;
    }
}

const createInstrumentWithNoteStyle = (typeId: string, id: number, displayOrder: number): ISbDmInstrument => {
    const instrument = createInstrument(typeId, id, displayOrder);

    instrument.noteStyles["1"] = {
        id: "1",
        audioBuffer: null,
        instrument,
        sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }
    } as IAudioData;

    return instrument;
};

const createRealtimeProvider = (): IRealtimeProvider => {
    return {
        state: "stopped",
        currentTime: -1,
    };
};

describe.sequential("Polyrhythm UI Integration", () => {
    afterEach(() => {
        cleanup();
    });

    it("renders existing polyrhythms in bar view", () => {
        const instrument = createInstrumentWithNoteStyle("1", 0, 0);

        const snapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Display",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "1",
                notes: Array.from({ length: 16 }, () => {
                    return "1";
                }),
                polyrhythms: [{ id: 901, start: 0, end: 3, length: 7 }],
            }],
        };

        const arrangement = ArrangementMigrator.migrateToArrangement(snapshot, [instrument]).arrangement;
        const track = arrangement.tracks[0] as Track;

        const dataModel = new TestScoreBookDataModel(arrangement, [instrument]);

        const result = render(<GridMeasureRow measure={track.measures[0]} track={track} dataModel={dataModel} />);

        const subdivisions = result.container.querySelectorAll(".grid-measure-row .subdivision");
        expect(subdivisions.length).toBe(1);
    });

    it("plays polyrhythm note events through TrackPlayer", () => {
        const instrument = createInstrumentWithNoteStyle("0", 0, 0);

        const snapshot: ILegacyArrangementSnapshot = {
            version: 1,
            title: "Playback",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "0",
                notes: Array.from({ length: 16 }, () => {
                    return "0";
                }),
                polyrhythms: [{ id: 902, start: 0, end: 3, length: 5 }],
            }],
        };

        const arrangement = ArrangementMigrator.migrateToArrangement(snapshot, [instrument]).arrangement;
        const track = arrangement.tracks[0] as Track;

        const stepsPerBar = 16;
        track.measures[0].events.forEach((event, index) => {
            const isPolyrhythmEvent = (event.duration.numerator * stepsPerBar) % event.duration.denominator !== 0;
            if (!isPolyrhythmEvent) {
                return;
            }

            track.measures[0].events[index].noteStyleId = "1";
        });

        const timeCoordinator = new TimeCoordinator(arrangement.timeParams, createRealtimeProvider());
        const trackPlayer = new TrackPlayer(track, timeCoordinator);

        const events = trackPlayer.getEvents({ start: 0, end: timeCoordinator.metrics.realTimeLength });
        const audioEvents = events.filter((event) => {
            return event.kind === "audio";
        });

        expect(audioEvents.length).toBe(5);

        trackPlayer.dispose();
    });

    it("renders a subdivision note over grid rests without overflowing its container", () => {
        const instrument = createInstrumentWithNoteStyle("1", 0, 0);

        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "1",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    steps: [
                        { index: 0 },
                        { index: 1 },
                        { index: 2, noteStyleId: "1" },
                        ...Array.from({ length: 14 }, (element, index) => {
                            return { index: index + 3 };
                        }),
                    ],
                    subdivisions: [{ id: 1, startStep: 0, actual: 3, normal: 2, isTuplet: true }],
                }],
            }],
        };

        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", 16);
        arrangement.applyArrangementSnapshot(migrateV3ToV4(snapshot), [instrument]);

        const track = arrangement.tracks[0] as Track;
        const dataModel = new TestScoreBookDataModel(arrangement, [instrument]);

        const result = render(<GridMeasureRow measure={track.measures[0]} track={track} dataModel={dataModel} />);

        const row = result.container.querySelector(".grid-measure-row");
        const subdivision = row?.querySelector(".subdivision");

        expect(subdivision).not.toBeNull();
        expect(subdivision!.querySelectorAll(":scope > .note-viewer")).toHaveLength(3);
        expect(row!.querySelectorAll(":scope > .note-viewer")).toHaveLength(14);
    });

    it("renders each subdivision note as a single slot cell", () => {
        const instrument = createInstrumentWithNoteStyle("1", 0, 0);

        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "1",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    steps: [
                        { index: 0, noteStyleId: "1" },
                        { index: 1, noteStyleId: "1" },
                        ...Array.from({ length: 13 }, (element, index) => {
                            return { index: index + 2 };
                        }),
                    ],
                    subdivisions: [{ id: 1, startStep: 0, actual: 2, normal: 3, isTuplet: false }],
                }],
            }],
        };

        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", 16);
        arrangement.applyArrangementSnapshot(migrateV3ToV4(snapshot), [instrument]);

        const track = arrangement.tracks[0] as Track;
        const dataModel = new TestScoreBookDataModel(arrangement, [instrument]);
        const scoreElementRegistry = new ScoreElementRegistry();

        const result = render(<GridMeasureRow
            measure={track.measures[0]}
            track={track}
            dataModel={dataModel}
            barNumber={1}
            scoreElementRegistry={scoreElementRegistry}
        />);

        const row = result.container.querySelector(".grid-measure-row");
        const subdivision = row?.querySelector(".subdivision");

        expect(subdivision).not.toBeNull();
        expect(subdivision!.querySelectorAll(":scope > .note-viewer")).toHaveLength(2);
        expect(row!.querySelectorAll(":scope > .note-viewer")).toHaveLength(13);
    });

    it("keeps subdivision slot step indices within the subdivision's grid range", () => {
        const instrument = createInstrumentWithNoteStyle("1", 0, 0);

        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "1",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    steps: [
                        { index: 0 },
                        { index: 1 },
                        { index: 2 },
                        { index: 3, noteStyleId: "1" },
                        { index: 4, noteStyleId: "1" },
                        { index: 5, noteStyleId: "1" },
                        ...Array.from({ length: 11 }, (element, index) => {
                            return { index: index + 6 };
                        }),
                    ],
                    subdivisions: [{ id: 1, startStep: 3, actual: 2, normal: 1, isTuplet: false }],
                }],
            }],
        };

        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", 16);
        arrangement.applyArrangementSnapshot(migrateV3ToV4(snapshot), [instrument]);

        const track = arrangement.tracks[0] as Track;
        const dataModel = new TestScoreBookDataModel(arrangement, [instrument]);
        const scoreElementRegistry = new ScoreElementRegistry();

        const result = render(<GridMeasureRow
            measure={track.measures[0]}
            track={track}
            dataModel={dataModel}
            barNumber={1}
            scoreElementRegistry={scoreElementRegistry}
        />);

        const row = result.container.querySelector(".grid-measure-row");
        const subdivision = row?.querySelector(".subdivision");

        expect(subdivision).not.toBeNull();

        // Both slots map to the subdivision's grid start step (3), never to the following cell (4),
        // so they cannot collide with the grid note right after the subdivision.
        const slotSteps = [...subdivision!.querySelectorAll<HTMLElement>(":scope > .note-viewer")].map((cell) => {
            return scoreElementRegistry.getLocation(cell)?.step;
        });
        expect(slotSteps).toEqual([3, 3]);

        // The grid note after the subdivision is the only element at step 4.
        expect(scoreElementRegistry.findElements(ScoreElementKind.GridCell, 1, track.id)
            .filter((cell) => {
                return scoreElementRegistry.getLocation(cell)?.step === 4;
            })).toHaveLength(1);
    });

    it("keeps a cleared subdivision slot individually selectable", () => {
        const instrument = createInstrumentWithNoteStyle("1", 0, 0);

        const snapshot: ILegacyArrangementSnapshotV3 = {
            version: 2,
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "1",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    steps: [
                        { index: 0 },
                        { index: 1 },
                        { index: 2 },
                        { index: 3, noteStyleId: "1" },
                        { index: 4, noteStyleId: "1" },
                        ...Array.from({ length: 12 }, (element, index) => {
                            return { index: index + 5 };
                        }),
                    ],
                    subdivisions: [{ id: 1, startStep: 3, actual: 2, normal: 1, isTuplet: false }],
                }],
            }],
        };

        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", 16);
        arrangement.applyArrangementSnapshot(migrateV3ToV4(snapshot), [instrument]);

        const track = arrangement.tracks[0] as Track;
        const dataModel = new TestScoreBookDataModel(arrangement, [instrument]);
        const scoreElementRegistry = new ScoreElementRegistry();

        hydrateMeasureEvents(arrangement);
        const secondNoteId = track.measures[0].noteEvents[2].id;

        // Delete the second slot (the note at the subdivision's second slot).
        dataModel.clearStepRanges(selectionToClearRanges([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: track.id,
            startStep: 3,
            noteId: secondNoteId,
        }], dataModel.arrangement));

        const result = render(<GridMeasureRow
            measure={track.measures[0]}
            track={track}
            dataModel={dataModel}
            barNumber={1}
            scoreElementRegistry={scoreElementRegistry}
        />);

        const row = result.container.querySelector(".grid-measure-row");
        const subdivision = row?.querySelector(".subdivision");
        const slots = subdivision
            ? [...subdivision.querySelectorAll<HTMLElement>(":scope > .note-viewer")]
            : [];

        expect(slots).toHaveLength(2);

        // The cleared slot is now a rest, but it still carries a unique id so it can be
        // selected independently from the first slot.
        const firstSlotId = scoreElementRegistry.getLocation(slots[0])?.noteId;
        const secondSlotId = scoreElementRegistry.getLocation(slots[1])?.noteId;

        expect(secondSlotId).toBeDefined();
        expect(secondSlotId).not.toBe(firstSlotId);
        expect(secondSlotId).toBeLessThan(0);
    });
});
