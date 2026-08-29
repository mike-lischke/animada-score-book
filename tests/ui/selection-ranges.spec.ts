/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { selectionToClearRanges } from "../../src/ui/selection-ranges.js";
import { SelectionGranularity } from "../../src/ui/selection-types.js";
import { createInstrument, hydrateMeasureEvents } from "../unit-test-helpers.js";

describe("selectionToClearRanges", () => {
    it("expands a note deletion to the note's full duration", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];

        // A note placed at cell 0 fills the whole first pulse (4 steps).
        model.setGridNote(track.id, 1, 0, "1");
        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const noteId = track.measures[0].noteEvents[0].id;

        const ranges = selectionToClearRanges([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: track.id,
            startStep: 0,
            endStep: 0,
            noteId,
        }], model.arrangement);

        expect(ranges).toEqual([{
            trackId: track.id,
            bar: 1,
            start: { numerator: 0, denominator: 1 },
            end: { numerator: 1, denominator: 4 },
        }]);
    });

    it("clearing the expanded range removes the whole note", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        model.setGridNote(track.id, 1, 0, "1");

        const ranges = selectionToClearRanges([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: track.id,
            startStep: 0,
            endStep: 0,
        }], model.arrangement);

        model.clearStepRanges(ranges);

        expect(measure.events.every((event) => {
            return event.noteStyleId === undefined;
        })).toBe(true);
    });

    it("clearing an absorbed rest cell is a no-op", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        // A note at cell 0 fills the first pulse (4 cells); cells 1-3 are absorbed rests.
        model.setGridNote(track.id, 1, 0, "1");

        // Delete the second cell (an absorbed rest, no note id) — this must change nothing.
        const cleared = model.clearStepRanges(selectionToClearRanges([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: track.id,
            startStep: 1,
            endStep: 1,
        }], model.arrangement));

        expect(cleared).toBe(false);
        expect(measure.events).toHaveLength(2);
        expect(measure.events[0].noteStyleId).toBe("1");
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 4 });
    });

    it("clearing the first subdivision note clears only that note", () => {
        const { model, trackId, measure } = buildSubdivisionMeasure();
        const firstNoteId = measure.noteEvents[3].id;

        model.clearStepRanges(selectionToClearRanges([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId,
            startStep: 3,
            noteId: firstNoteId,
        }], model.arrangement));

        expect(measure.events[3].noteStyleId).toBeUndefined();
        expect(measure.events[4].noteStyleId).toBe("1");
        expect(measure.events[5].noteStyleId).toBe("1");
        expect(measure.subdivisions).toEqual([{ startIndex: 3, actual: 2, normal: 1, isTuplet: false }]);
    });

    it("clearing the second subdivision note clears only that note", () => {
        const { model, trackId, measure } = buildSubdivisionMeasure();
        const secondNoteId = measure.noteEvents[4].id;

        model.clearStepRanges(selectionToClearRanges([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId,
            startStep: 4,
            noteId: secondNoteId,
        }], model.arrangement));

        expect(measure.events[3].noteStyleId).toBe("1");
        expect(measure.events[4].noteStyleId).toBeUndefined();
        expect(measure.events[5].noteStyleId).toBe("1");
        expect(measure.subdivisions).toEqual([{ startIndex: 3, actual: 2, normal: 1, isTuplet: false }]);
    });

    it("clearing the second subdivision note keeps the subdivision and clears only that slot", () => {
        const { model, trackId, measure } = buildSubdivisionMeasureWithRestGap();
        const secondNoteId = measure.noteEvents[4].id;

        model.clearStepRanges(selectionToClearRanges([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId,
            startStep: 4,
            noteId: secondNoteId,
        }], model.arrangement));

        expect(measure.subdivisions).toEqual([{ startIndex: 3, actual: 2, normal: 1, isTuplet: false }]);
        expect(measure.events).toHaveLength(12);
        expect(measure.events[3].noteStyleId).toBe("1");
        expect(measure.events[3].duration).toEqual({ numerator: 1, denominator: 32 });
        expect(measure.events[4].noteStyleId).toBeUndefined();
        expect(measure.events[4].duration).toEqual({ numerator: 1, denominator: 32 });
        expect(measure.events[5].noteStyleId).toBeUndefined();
        expect(measure.events[6].noteStyleId).toBe("1");
    });
});

const buildSubdivisionMeasure = (): {
    model: ScoreBookDataModel;
    trackId: number;
    measure: ISbDmTrackMeasure;
} => {
    const model = new ScoreBookDataModel();
    model.startNewArrangement([createInstrument("0", 0, 0)]);
    const track = model.arrangement!.tracks[0];
    const measure = track.measures[0];

    measure.events.splice(0, measure.events.length,
        { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 3, denominator: 16 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
        { start: { numerator: 7, denominator: 32 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 5, denominator: 16 }, duration: { numerator: 11, denominator: 16 } },
    );
    measure.subdivisions.push({ startIndex: 3, actual: 2, normal: 1, isTuplet: false });

    hydrateMeasureEvents(model.arrangement! as Arrangement);

    return { model, trackId: track.id, measure };
};

const buildSubdivisionMeasureWithRestGap = (): {
    model: ScoreBookDataModel;
    trackId: number;
    measure: ISbDmTrackMeasure;
} => {
    const model = new ScoreBookDataModel();
    model.startNewArrangement([createInstrument("0", 0, 0)]);
    const track = model.arrangement!.tracks[0];
    const measure = track.measures[0];

    // Three lead notes, a 2:1 subdivision (two 32nd notes) at step 3, three empty cells, six
    // notes and a closing rest.
    measure.events.splice(0, measure.events.length,
        { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 3, denominator: 16 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
        { start: { numerator: 7, denominator: 32 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 16 } },
        { start: { numerator: 7, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 9, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 5, denominator: 8 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 11, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 3, denominator: 4 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
        { start: { numerator: 13, denominator: 16 }, duration: { numerator: 3, denominator: 16 } },
    );
    measure.subdivisions.push({ startIndex: 3, actual: 2, normal: 1, isTuplet: false });

    hydrateMeasureEvents(model.arrangement! as Arrangement);

    return { model, trackId: track.id, measure };
};
