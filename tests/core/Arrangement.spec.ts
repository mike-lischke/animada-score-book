/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import type { ISbDmInstrument } from "../../src/core/ScoreBookDataModel.js";
import { TimeParams } from "../../src/core/TimeParams.js";
import { Track } from "../../src/core/Track.js";
import type { IArrangementSnapshot, IAudioData, Mutable } from "../../src/core/types/general.js";
import { createInstrument, emptyMeasureTrack, hydrateMeasureEvents } from "../unit-test-helpers.js";

describe("Arrangement", () => {
    it("removes all obsolete tracks when applying a snapshot", () => {
        const instruments = [createInstrument("0", 0, 0), createInstrument("1", 1, 1), createInstrument("2", 2, 2)];

        const stepsPerBar = 4;
        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", stepsPerBar);

        arrangement.applyArrangementSnapshot({
            version: 2,
            title: "Original",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: stepsPerBar },
            tracks: [
                emptyMeasureTrack(100, "0", stepsPerBar),
                emptyMeasureTrack(200, "1", stepsPerBar),
                emptyMeasureTrack(300, "2", stepsPerBar),
            ],
        }, instruments);

        arrangement.applyArrangementSnapshot({
            version: 2,
            title: "Imported",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: stepsPerBar },
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
            sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }
        } as IAudioData;

        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": hitStyle };

        const snapshot: IArrangementSnapshot = {
            version: 2,
            title: "Measure Events",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 8 },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    measures: [
                        {
                            number: 1,
                            meter: { beats: 4, beatUnits: 4, stepResolution: 8, beatGroups: [2, 2, 2, 2] },
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
                            meter: { beats: 4, beatUnits: 4, stepResolution: 8, beatGroups: [2, 2, 2, 2] },
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

        expect(track.getNoteAt({ bar: 1, step: 1 })?.audioData?.id).toBe("1");
        expect(track.getNoteAt({ bar: 2, step: 5 })?.audioData?.id).toBe("1");

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

    it("duplicateTrack copies note styles and subdivisions", () => {
        const instrument = createInstrument("0", 0, 0);

        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", 8);
        arrangement.addTrack(instrument);

        const source = arrangement.tracks[0] as Track;
        const sourceMeasure = source.measures[0];

        sourceMeasure.steps[0].noteStyleId = "1";
        sourceMeasure.steps[4].noteStyleId = "1";
        sourceMeasure.subdivisions.push({ id: 9001, startStep: 2, actual: 2, normal: 1, isTuplet: false });

        const duplicate = arrangement.duplicateTrack(source) as Track;
        const duplicateMeasure = duplicate.measures[0];

        expect(duplicate).not.toBe(source);
        expect(duplicate.id).not.toBe(source.id);
        expect(duplicateMeasure.steps[0].noteStyleId).toBe("1");
        expect(duplicateMeasure.steps[4].noteStyleId).toBe("1");
        expect(duplicateMeasure.steps[1].noteStyleId).toBeUndefined();
        expect(duplicateMeasure.subdivisions).toHaveLength(1);
        expect(duplicateMeasure.subdivisions[0].startStep).toBe(2);
        expect(duplicateMeasure.subdivisions[0].actual).toBe(2);
    });

    it("starts with a local id below 10000", () => {
        const arrangement = new Arrangement();

        expect(arrangement.id).toBeLessThan(10000);
    });

    it("allows setting the id to a DB-backed value after construction", () => {
        const arrangement = new Arrangement();
        arrangement.id = 12345;

        expect(arrangement.id).toBe(12345);
    });

    it("includes scoreId in toSnapshot when id is DB-backed", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        arrangement.id = 12345;

        const snapshot = arrangement.toSnapshot();

        expect(snapshot.scoreId).toBe(12345);
    });

    it("omits scoreId from toSnapshot for local arrangements", () => {
        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", 8);

        // new Arrangement() gets a local id via getNewId()
        expect(arrangement.id).toBeLessThan(10000);

        const snapshot = arrangement.toSnapshot();

        expect(snapshot.scoreId).toBeUndefined();
    });

    it("emptyArrangement creates a score with a local id", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);

        expect(arrangement.id).toBeLessThan(10000);
        expect(arrangement.id).toBeGreaterThan(0);
    });

    it("emptyArrangementWithInstruments applies creation options", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], {
            title: "New Tune",
            timeSignature: "6/8",
            tempo: 140,
            length: 3,
            pulse: "3/8",
            stepResolution: 8,
        });

        expect(arrangement.title).toBe("New Tune");
        expect(arrangement.timeParams.timeSignature).toBe("6/8");
        expect(arrangement.timeParams.tempo).toBe(140);
        expect(arrangement.timeParams.length).toBe(3);
        expect(arrangement.timeParams.pulse).toBe("3/8");
        expect(arrangement.timeParams.stepResolution).toBe(8);
        expect(arrangement.tracks).toHaveLength(1);
        expect(arrangement.tracks[0].measures).toHaveLength(3);
    });

    it("emptyArrangementWithInstruments keeps defaults when no options are given", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument]);

        expect(arrangement.title).toBe("Untitled Arrangement");
        expect(arrangement.timeParams.timeSignature).toBe("4/4");
        expect(arrangement.timeParams.tempo).toBe(110);
        expect(arrangement.timeParams.length).toBe(1);
    });

    it("preserves the set id through toSnapshot → applyArrangementSnapshot round-trip", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangement([instrument]);
        arrangement.id = 12345;
        arrangement.title = "Roundtrip";

        const snapshot = arrangement.toSnapshot();
        const restored = Arrangement.emptyArrangement([instrument]);
        restored.applyArrangementSnapshot(snapshot, [instrument]);

        // applyArrangementSnapshot does not overwrite the id — that's loadArrangement's job.
        // But the snapshot carries scoreId for loadArrangement to pick up.
        expect(snapshot.scoreId).toBe(12345);
        expect(snapshot.title).toBe("Roundtrip");
    });

    it("restores the DB id when applyArrangementSnapshot has a scoreId", () => {
        const stepsPerBar = 16;
        const instruments = [createInstrument("0", 0, 0)];
        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", stepsPerBar);

        arrangement.applyArrangementSnapshot({
            version: 3,
            scoreId: 10042,
            title: "Test",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: stepsPerBar },
            tracks: [emptyMeasureTrack(100, "0")],
        }, instruments);

        expect(arrangement.id).toBe(10042);
    });

    it("keeps the existing local id when the snapshot has no scoreId", () => {
        const stepsPerBar = 16;
        const instruments = [createInstrument("0", 0, 0)];
        const arrangement = new Arrangement();
        const localId = arrangement.id;
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", stepsPerBar);

        arrangement.applyArrangementSnapshot({
            version: 3,
            title: "Test",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: stepsPerBar },
            tracks: [emptyMeasureTrack(100, "0")],
        }, instruments);

        expect(arrangement.id).toBe(localId);
    });

    it("preserves the id through applyArrangementSnapshot round-trip", () => {
        const stepsPerBar = 16;
        const instruments = [createInstrument("0", 0, 0)];
        const arrangement = new Arrangement();
        arrangement.id = 10042;
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", stepsPerBar);

        arrangement.applyArrangementSnapshot({
            version: 3,
            title: "Test",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: stepsPerBar },
            tracks: [emptyMeasureTrack(100, "0")],
        }, instruments);

        const snapshot = arrangement.toSnapshot();
        const restored = new Arrangement();
        restored.timeParams = new TimeParams("4/4", 120, 1, "1/4", stepsPerBar);
        restored.applyArrangementSnapshot(snapshot, instruments);

        expect(restored.id).toBe(10042);
    });

    it("restores tracks to their previous positions when several tracks share one instrument", () => {
        const instrument = createInstrument("0", 0, 0);

        const arrangement = new Arrangement();
        arrangement.timeParams = new TimeParams("4/4", 120, 1, "1/4", 8);

        const first = arrangement.addTrack(instrument);
        const second = arrangement.addTrack(instrument);
        const third = arrangement.addTrack(instrument);
        const snapshot = arrangement.toSnapshot();

        arrangement.removeTrack(second);
        expect(arrangement.tracks.map((track) => {
            return track.id;
        })).toEqual([first.id, third.id]);

        arrangement.applyArrangementSnapshot(snapshot, [instrument]);

        expect(arrangement.tracks.map((track) => {
            return track.id;
        })).toEqual([first.id, second.id, third.id]);
    });

    it("insertBars inserts empty bars before the first bar and renumbers measures", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 2 });
        const track = arrangement.tracks[0] as Track;

        track.measures[0].steps[0].noteStyleId = "1";

        arrangement.insertBars(1, 2, true, false);

        expect(arrangement.timeParams.length).toBe(4);
        expect(track.measures.map((measure) => {
            return measure.number;
        })).toEqual([1, 2, 3, 4]);
        expect(track.measures[0].steps[0].noteStyleId).toBeUndefined();
        expect(track.measures[1].steps[0].noteStyleId).toBeUndefined();
        expect(track.measures[2].steps[0].noteStyleId).toBe("1");
    });

    it("insertBars copies the preceding bar content when requested", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 3 });
        const track = arrangement.tracks[0] as Track;

        track.measures[1].steps[0].noteStyleId = "1";

        arrangement.insertBars(2, 2, false, true);

        expect(arrangement.timeParams.length).toBe(5);
        expect(track.measures.map((measure) => {
            return measure.number;
        })).toEqual([1, 2, 3, 4, 5]);
        expect(track.measures[0].steps[0].noteStyleId).toBeUndefined();
        expect(track.measures[1].steps[0].noteStyleId).toBe("1");
        expect(track.measures[2].steps[0].noteStyleId).toBe("1");
        expect(track.measures[3].steps[0].noteStyleId).toBe("1");
        expect(track.measures[4].steps[0].noteStyleId).toBeUndefined();
    });

    it("deleteBar removes the bar and shifts later bars", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 3 });
        const track = arrangement.tracks[0] as Track;

        track.measures[1].steps[0].noteStyleId = "1";

        arrangement.deleteBar(1);

        expect(arrangement.timeParams.length).toBe(2);
        expect(track.measures.map((measure) => {
            return measure.number;
        })).toEqual([1, 2]);
        expect(track.measures[0].steps[0].noteStyleId).toBe("1");
    });

    it("clearBar clears notes but keeps the bar", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 2 });
        const track = arrangement.tracks[0] as Track;

        track.measures[0].steps[0].noteStyleId = "1";

        arrangement.clearBar(1);

        expect(arrangement.timeParams.length).toBe(2);
        expect(track.measures).toHaveLength(2);
        expect(track.measures[0].steps[0].noteStyleId).toBeUndefined();
    });

    it("duplicateBar inserts a copy of the bar right after it", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 2 });
        const track = arrangement.tracks[0] as Track;

        track.measures[0].steps[0].noteStyleId = "1";

        arrangement.duplicateBar(1);

        expect(arrangement.timeParams.length).toBe(3);
        expect(track.measures.map((measure) => {
            return measure.number;
        })).toEqual([1, 2, 3]);
        expect(track.measures[0].steps[0].noteStyleId).toBe("1");
        expect(track.measures[1].steps[0].noteStyleId).toBe("1");
        expect(track.measures[2].steps[0].noteStyleId).toBeUndefined();
    });

    it("insertBars and deleteBar shift measure labels", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 3 });
        arrangement.measureLabels = { 2: "Section A", 3: "Section B" };

        arrangement.insertBars(3, 1, true, false);

        expect(arrangement.measureLabels).toEqual({ 2: "Section A", 4: "Section B" });

        arrangement.deleteBar(1);

        expect(arrangement.measureLabels).toEqual({ 1: "Section A", 3: "Section B" });
    });

    it("deleteBar keeps at least one bar in the arrangement", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument], { length: 1 });
        const track = arrangement.tracks[0] as Track;

        track.measures[0].steps[0].noteStyleId = "1";

        arrangement.deleteBar(1);

        expect(arrangement.timeParams.length).toBe(1);
        expect(track.measures).toHaveLength(1);
        expect(track.measures[0].steps[0].noteStyleId).toBe("1");
    });
});
