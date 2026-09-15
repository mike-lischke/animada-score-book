/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { selectionToClearRanges } from "../../src/ui/selection-ranges.js";
import { createInstrument, hydrateMeasureEvents, noteEntry, setCellNote } from "../unit-test-helpers.js";

describe("selectionToClearRanges", () => {
    it("clears the whole note when a cell inside its duration is selected", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];

        // The note spans four grid cells; selecting the second one still addresses the whole note.
        model.setNoteAt(track.id, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 }, "1");
        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const measure = track.measures[0];
        const ranges = selectionToClearRanges([noteEntry(measure, { numerator: 1, denominator: 16 })]);

        expect(ranges).toEqual([{
            trackId: track.id,
            bar: 1,
            start: { numerator: 0, denominator: 1 },
            end: { numerator: 1, denominator: 4 },
        }]);
    });

    it("expands a note deletion to the note's full duration", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];

        // A note placed at cell 0 occupies a single cell (1/16).
        setCellNote(model, track.id, 1, 0, "1");
        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const ranges = selectionToClearRanges([noteEntry(track.measures[0], { numerator: 0, denominator: 1 })]);

        expect(ranges).toEqual([{
            trackId: track.id,
            bar: 1,
            start: { numerator: 0, denominator: 1 },
            end: { numerator: 1, denominator: 16 },
        }]);
    });

    it("clearing the expanded range removes the whole note", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        setCellNote(model, track.id, 1, 0, "1");

        const ranges = selectionToClearRanges([noteEntry(measure, { numerator: 0, denominator: 1 })]);

        model.clearRanges(ranges);

        expect(measure.events.every((event) => {
            return event.noteStyleId === undefined;
        })).toBe(true);
    });

    it("clearing a rest cell is a no-op", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        // A note at cell 0 occupies one cell; the rest of the bar is a single combined rest.
        setCellNote(model, track.id, 1, 0, "1");

        // Delete the second cell (a rest, no note id) — this must change nothing.
        const cleared = model.clearRanges(selectionToClearRanges([
            noteEntry(measure, { numerator: 1, denominator: 16 }),
        ]));

        expect(cleared).toBe(false);
        expect(measure.events).toHaveLength(3);
        expect(measure.events[0].noteStyleId).toBe("1");
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 16 });
    });

    it("clearing the first subdivision note clears only that note", () => {
        const { model, measure } = buildSubdivisionMeasure();

        model.clearRanges(selectionToClearRanges([noteEntry(measure, { numerator: 3, denominator: 16 })]));

        expect(measure.events[3].noteStyleId).toBeUndefined();
        expect(measure.events[4].noteStyleId).toBe("1");
        expect(measure.events[5].noteStyleId).toBe("1");
        expect(measure.subdivisions).toEqual([{ startIndex: 3, actual: 2, normal: 1, isTuplet: false }]);
    });

    it("clearing the second subdivision note clears only that note", () => {
        const { model, measure } = buildSubdivisionMeasure();

        model.clearRanges(selectionToClearRanges([noteEntry(measure, { numerator: 7, denominator: 32 })]));

        expect(measure.events[3].noteStyleId).toBe("1");
        expect(measure.events[4].noteStyleId).toBeUndefined();
        expect(measure.events[5].noteStyleId).toBe("1");
        expect(measure.subdivisions).toEqual([{ startIndex: 3, actual: 2, normal: 1, isTuplet: false }]);
    });

    it("clearing the second subdivision note keeps the subdivision and clears only that slot", () => {
        const { model, measure } = buildSubdivisionMeasureWithRestGap();

        model.clearRanges(selectionToClearRanges([noteEntry(measure, { numerator: 7, denominator: 32 })]));

        expect(measure.subdivisions).toEqual([{ startIndex: 3, actual: 2, normal: 1, isTuplet: false }]);
        expect(measure.events).toHaveLength(13);
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
