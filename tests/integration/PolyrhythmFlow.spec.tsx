/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { GridMeasureRow } from "../../src/components/ui/Bar/Grid/GridMeasureRow.js";
import {
    ScoreBookDataModel, type ISbDmArrangement, type ISbDmInstrument
} from "../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../src/core/serialisation/migration/ArrangementMigrator.js";
import type { ILegacyArrangementSnapshot } from "../../src/core/serialisation/migration/legacy-snapshot-types.js";
import { Track } from "../../src/core/Track.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";
import type { IRealtimeProvider } from "../../src/ui/AnimationEngine.js";
import { createInstrument } from "../unit-test-helpers.js";

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

        const timeCoordinator = new TimeCoordinator(arrangement.timeParams, createRealtimeProvider());
        const trackPlayer = new TrackPlayer(track, timeCoordinator);

        const stepsPerBar = 16;
        track.measures[0].events.forEach((event, index) => {
            const isPolyrhythmEvent = !(event.duration.numerator === 1
                && event.duration.denominator === stepsPerBar);
            if (!isPolyrhythmEvent) {
                return;
            }

            track.measures[0].events[index] = { ...event, audioData: instrument.noteStyles["1"] };
        });

        const events = trackPlayer.getEvents({ start: 0, end: timeCoordinator.metrics.realTimeLength });
        const audioEvents = events.filter((event) => {
            return event.kind === "audio";
        });

        expect(audioEvents.length).toBe(5);

        trackPlayer.dispose();
    });
});
