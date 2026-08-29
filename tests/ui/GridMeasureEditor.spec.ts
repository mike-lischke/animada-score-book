/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { addFractions, compareFractions } from "../../src/core/serialisation/numeric-functions.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { GridMeasureEditor } from "../../src/ui/GridMeasureEditor.js";
import { SelectionGranularity, type ISelectionEntry } from "../../src/ui/selection-types.js";
import { createInstrument, hydrateMeasureEvents } from "../unit-test-helpers.js";

/**
 * Returns the note style id covering the given step of a measure, or undefined for rests.
 *
 * @param measure The measure to inspect.
 * @param step The 0-based grid step to look up.
 * @returns The note style id covering the step, or undefined.
 */
const noteAtStep = (measure: ISbDmTrackMeasure, step: number): string | undefined => {
    const stepsPerBar = measure.meter.stepResolution;
    const start = { numerator: step, denominator: stepsPerBar };

    const event = measure.events.find((candidate) => {
        if (candidate.noteStyleId === undefined) {
            return false;
        }

        const end = addFractions(candidate.start, candidate.duration);

        return compareFractions(candidate.start, start) <= 0 && compareFractions(start, end) < 0;
    });

    return event?.noteStyleId;
};

describe.sequential("GridMeasureEditor clearSelection", () => {
    let model: ScoreBookDataModel;
    let editor: GridMeasureEditor;
    let mutatedCalls: number;

    const mutationSpy = (): Promise<boolean> => {
        mutatedCalls++;

        return Promise.resolve(true);
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0), createInstrument("1", 1, 1)]);
        editor = new GridMeasureEditor(model);
        mutatedCalls = 0;
        requisitions.register("arrangementMutated", mutationSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutationSpy);
    });

    it("clears a single note", () => {
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 2, "1");
        mutatedCalls = 0;

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: track.id,
            startStep: 2,
            endStep: 2,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        expect(noteAtStep(track.measures[0], 2)).toBeUndefined();
        expect(mutatedCalls).toBe(1);
    });

    it("clearNote targets a subdivision slot via its exact start", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];

        measure.events.splice(0, measure.events.length,
            { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 6 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 5, denominator: 24 }, duration: { numerator: 1, denominator: 24 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        );
        measure.subdivisions.push({ startIndex: 2, actual: 3, normal: 2, isTuplet: true });

        const position = {
            bar: 1,
            trackId: track.id,
            step: 2,
            start: { numerator: 1, denominator: 6 },
        };

        expect(editor.clearNote(position)).toBe(true);
        expect(measure.events[3].noteStyleId).toBeUndefined();
        expect(measure.events[3].start).toEqual({ numerator: 1, denominator: 6 });
        expect(measure.subdivisions).toEqual([{ startIndex: 2, actual: 3, normal: 2, isTuplet: true }]);
    });

    it("clears a note group range", () => {
        const track = model.arrangement!.tracks[0];
        for (let i = 0; i < 4; i++) {
            model.setGridNote(track.id, 1, i, "1");
        }

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.NoteGroup,
            bar: 1,
            trackId: track.id,
            startStep: 1,
            endStep: 2,
        };

        expect(editor.clearSelection([entry])).toBe(true);

        // The cleared middle notes are absorbed by the first note, which now spans three steps.
        const notes = track.measures[0].events.filter((event) => {
            return event.noteStyleId !== undefined;
        });
        expect(notes).toHaveLength(2);
        expect(notes[0].start).toEqual({ numerator: 0, denominator: 1 });
        expect(notes[0].duration).toEqual({ numerator: 3, denominator: 16 });
        expect(notes[1].start).toEqual({ numerator: 3, denominator: 16 });
    });

    it("clears a track piece (track × measure)", () => {
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.TrackPiece,
            bar: 1,
            trackId: track.id,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        expect(noteAtStep(track.measures[0], 0)).toBeUndefined();
    });

    it("clears a whole measure across all tracks", () => {
        for (const track of model.arrangement!.tracks) {
            model.setGridNote(track.id, 1, 0, "1");
        }

        mutatedCalls = 0;

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.Measure,
            bar: 1,
            trackId: model.arrangement!.tracks[0].id,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        for (const track of model.arrangement!.tracks) {
            expect(noteAtStep(track.measures[0], 0)).toBeUndefined();
        }

        expect(mutatedCalls).toBe(1);
    });

    it("clears a whole track", () => {
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.Track,
            bar: 1,
            trackId: track.id,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        expect(noteAtStep(track.measures[0], 0)).toBeUndefined();
    });
});

describe.sequential("GridMeasureEditor setSelectionNoteStyle", () => {
    let model: ScoreBookDataModel;
    let editor: GridMeasureEditor;
    let mutatedCalls: number;

    const mutationSpy = (): Promise<boolean> => {
        mutatedCalls++;

        return Promise.resolve(true);
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0), createInstrument("1", 1, 1)]);
        editor = new GridMeasureEditor(model);
        mutatedCalls = 0;
        requisitions.register("arrangementMutated", mutationSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutationSpy);
    });

    it("sets the note style across all selected cells of one track", () => {
        const track = model.arrangement!.tracks[0];
        const entries: ISelectionEntry[] = [0, 1, 2].map((step) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: track.id,
                startStep: step,
                endStep: step,
            };
        });

        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(true);
        expect(noteAtStep(track.measures[0], 0)).toBe("1");
        expect(noteAtStep(track.measures[0], 1)).toBe("1");
        expect(noteAtStep(track.measures[0], 2)).toBe("1");
        expect(mutatedCalls).toBe(1);
    });

    it("sets the note style across multiple tracks with the same instrument", () => {
        const trackA = model.arrangement!.tracks[0];
        const trackB = model.addTrack(trackA.instrument);

        const entries: ISelectionEntry[] = [trackA, trackB].map((track) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: track.id,
                startStep: 0,
                endStep: 0,
            };
        });

        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(true);
        expect(noteAtStep(trackA.measures[0], 0)).toBe("1");
        expect(noteAtStep(trackB.measures[0], 0)).toBe("1");
    });

    it("does not apply when selected cells use different instruments", () => {
        const trackA = model.arrangement!.tracks[0];
        const trackB = model.arrangement!.tracks[1];

        const entries: ISelectionEntry[] = [trackA, trackB].map((track) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: track.id,
                startStep: 0,
                endStep: 0,
            };
        });

        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(false);
        expect(noteAtStep(trackA.measures[0], 0)).toBeUndefined();
        expect(noteAtStep(trackB.measures[0], 0)).toBeUndefined();
        expect(mutatedCalls).toBe(0);
    });

    it("returns false when the style is already applied to all cells", () => {
        const track = model.arrangement!.tracks[0];
        const entries: ISelectionEntry[] = [0, 1].map((step) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: track.id,
                startStep: step,
                endStep: step,
            };
        });

        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(true);
        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(false);
    });

    it("refreshSelection resolves note ids only for note start cells", () => {
        const track = model.arrangement!.tracks[0];
        track.instrument.noteStyles["1"] = { id: "1" } as IAudioData;

        // A note placed at step 0 fills the first pulse (4 steps), so step 0 is a note start while
        // steps 1 and 2 are absorbed grid rests within the note's span.
        model.setGridNote(track.id, 1, 0, "1");
        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [0, 1, 2].map((step) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: track.id,
                startStep: step,
                endStep: step,
            };
        });

        const refreshed = editor.refreshSelection(entries);
        expect(refreshed[0].noteId).toBeDefined();
        expect(refreshed[1].noteId).toBeUndefined();
        expect(refreshed[2].noteId).toBeUndefined();
    });
});
