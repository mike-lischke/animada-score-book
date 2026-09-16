/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { NoteLength } from "../../src/core/rest-notation.js";
import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { addFractions, compareFractions } from "../../src/core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction, IMeasureEvent } from "../../src/core/types/general.js";
import { StaffMeasureEditor, type IStaffEditorPosition } from "../../src/ui/StaffMeasureEditor.js";
import { createInstrument, hydrateMeasureEvents, runEntry } from "../unit-test-helpers.js";

/**
 * Replaces the events of the first measure and re-derives the note events from them.
 *
 * @param model The model holding the arrangement.
 * @param events The events the measure should hold.
 *
 * @returns The measure that was written.
 */
const setEvents = (model: ScoreBookDataModel, events: IMeasureEvent[]): ISbDmTrackMeasure => {
    const measure = model.arrangement!.tracks[0].measures[0];
    measure.events.splice(0, measure.events.length, ...events);
    hydrateMeasureEvents(model.arrangement! as Arrangement);

    return measure;
};

/**
 * Returns the note style covering a position of a measure, or undefined for rests.
 *
 * @param measure The measure to inspect.
 * @param start The position as a fraction of the measure.
 *
 * @returns The note style id covering the position, or undefined.
 */
const styleAt = (measure: ISbDmTrackMeasure, start: IFraction): string | undefined => {
    const event = measure.events.find((candidate) => {
        return compareFractions(candidate.start, start) <= 0
            && compareFractions(start, addFractions(candidate.start, candidate.duration)) < 0;
    });

    return event?.noteStyleId;
};

/**
 * Returns the duration of the event that starts exactly at a position.
 *
 * @param measure The measure to inspect.
 * @param start The position as a fraction of the measure.
 *
 * @returns The duration of the event starting there, or undefined when no event starts there.
 */
const durationAt = (measure: ISbDmTrackMeasure, start: IFraction): IFraction | undefined => {
    const event = measure.events.find((candidate) => {
        return compareFractions(candidate.start, start) === 0;
    });

    return event === undefined ? undefined : { ...event.duration };
};

describe.sequential("StaffMeasureEditor", () => {
    let model: ScoreBookDataModel;
    let editor: StaffMeasureEditor;
    let trackId: number;
    let measure: ISbDmTrackMeasure;
    let position: IStaffEditorPosition;

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        editor = new StaffMeasureEditor(model);
        measure = model.arrangement!.tracks[0].measures[0];
        trackId = measure.track.id;
        model.arrangement!.tracks[0].instrument.noteStyles["1"] = { id: "1" } as IAudioData;
        model.arrangement!.tracks[0].instrument.noteStyles["2"] = { id: "2" } as IAudioData;
        position = { bar: 1, trackId, start: { numerator: 0, denominator: 1 } };
    });

    it("writes a note of the selected length into a rest", () => {
        const duration = editor.noteLengthDuration(NoteLength.Quarter, position)!;

        const inserted = editor.insertNoteWithShift(position, duration, "1");

        expect(inserted?.duration).toEqual({ numerator: 1, denominator: 4 });
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBe("1");
        expect(styleAt(measure, { numerator: 1, denominator: 4 })).toBeUndefined();
    });

    it("keeps the selected length and shifts the following note", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 } },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "2" },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
        ]);

        const inserted = editor.insertNoteWithShift(position, { numerator: 1, denominator: 2 }, "1");

        // The rest run only offers a quarter, so the written note is grown to the requested half
        // afterwards, which moves the following note behind it instead of cutting the request.
        expect(inserted?.duration).toEqual({ numerator: 1, denominator: 2 });
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 2 });
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBe("1");
        expect(styleAt(measure, { numerator: 1, denominator: 2 })).toBe("2");
        expect(styleAt(measure, { numerator: 3, denominator: 4 })).toBeUndefined();
    });

    it("keeps the addressed duration when only the style changes", () => {
        setEvents(model, [{
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 2 },
            noteStyleId: "1",
        }]);

        const style = editor.setNote(position, "2");

        expect(style?.id).toBe("2");
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 2 });
    });

    it("clears the run the position addresses", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);

        expect(editor.clearNote(position)).toBe(true);
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBeUndefined();
        expect(styleAt(measure, { numerator: 1, denominator: 8 })).toBeUndefined();
    });

    it("resizes the addressed note through the selection and ripples the following notes", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "2" },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
        ]);
        const entries = [runEntry(measure, measure.events[0])];

        expect(editor.resizeSelection(entries, NoteLength.Half)).toBe(true);
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 2 });
        expect(styleAt(measure, { numerator: 1, denominator: 2 })).toBe("2");
    });

    it("removes the event at the position and pulls the following events left", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "2" },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
        ]);

        expect(editor.deleteEventWithShift(position)).toBe(true);
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBe("2");
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 4 });
    });

    it("reports whether a note starts at the addressed position", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 2 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
        ]);

        expect(editor.hasNoteAt(position)).toBe(true);
        expect(editor.hasNoteAt({ bar: 1, trackId, start: { numerator: 1, denominator: 2 } })).toBe(false);
    });

    it("recognises a subdivision slot by its exact start", () => {
        expect(editor.isSubdivisionSlot(position)).toBe(false);

        model.createSubdivision(trackId, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 8 }, 3, 2);

        expect(editor.isSubdivisionSlot(position)).toBe(true);
    });

    it("rejects note lengths the data model cannot address", () => {
        // A thirty-second does not land on a whole step in this meter, so the model could not store
        // it — the editor never hands such a value to the model.
        expect(editor.noteLengthDuration(NoteLength.ThirtySecond, position)).toBeUndefined();
        expect(editor.noteLengthDuration(NoteLength.Sixteenth, position)).toEqual({ numerator: 1, denominator: 16 });
    });
});
