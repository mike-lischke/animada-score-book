/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { Articulation } from "../../src/core/articulation.js";
import { NoteLength } from "../../src/core/rest-notation.js";
import {
    Damping, ExcitationMode, NoteDisplayType, ScoreBookDataModel, StickTechnique, type ISbDmTrackMeasure,
} from "../../src/core/ScoreBookDataModel.js";
import { addFractions, compareFractions } from "../../src/core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction, IMeasureEvent } from "../../src/core/types/general.js";
import { StaffMeasureEditor, type IStaffEditorPosition } from "../../src/ui/StaffMeasureEditor.js";
import { createInstrument, hydrateMeasureEvents, noteValue, runEntry } from "../unit-test-helpers.js";

/**
 * Builds a note style of one voice, so an accent variant can be found for it.
 *
 * @param id The style id.
 * @param accent Whether the style carries an accent.
 *
 * @returns The note style.
 */
const makeNoteStyle = (id: string, accent: boolean): IAudioData => {
    return {
        id,
        characteristics: {
            excitationMode: ExcitationMode.Struck,
            stickTechnique: StickTechnique.Normal,
            mainDisplayType: NoteDisplayType.Oval,
        },
        sampleProfile: { builtInDamping: Damping.Open, builtInAccent: accent, ghost: false },
        audioBuffer: null,
    } as unknown as IAudioData;
};

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
        const duration = editor.noteValueDuration(noteValue(NoteLength.Quarter), position)!;

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

        // The written note keeps the requested length, and everything behind it gives way by it, so the
        // note behind the rest lands on the third beat instead of being cut.
        expect(inserted?.duration).toEqual({ numerator: 1, denominator: 2 });
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 2 });
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBe("1");
        expect(styleAt(measure, { numerator: 1, denominator: 2 })).toBeUndefined();
        expect(styleAt(measure, { numerator: 3, denominator: 4 })).toBe("2");
        expect(durationAt(measure, { numerator: 3, denominator: 4 })).toEqual({ numerator: 1, denominator: 4 });
    });

    it("writes a rest of the selected length and shifts the following note", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);

        const inserted = editor.insertRestWithShift(position, { numerator: 1, denominator: 2 });

        // The rest takes the first half of the bar, so the note behind it starts on the third beat.
        expect(inserted?.duration).toEqual({ numerator: 1, denominator: 2 });
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBeUndefined();
        expect(styleAt(measure, { numerator: 1, denominator: 2 })).toBe("1");
        expect(durationAt(measure, { numerator: 1, denominator: 2 })).toEqual({ numerator: 1, denominator: 4 });
    });

    it("replaces the addressed element with a rest and shifts the following note", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "2" },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
        ]);

        expect(editor.setRest(position, { numerator: 1, denominator: 2 })).toBe(true);

        // The rest is twice as long as the note it replaced, so the note behind it gives way by a quarter.
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBeUndefined();
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 2 });
        expect(styleAt(measure, { numerator: 1, denominator: 2 })).toBe("2");
        expect(durationAt(measure, { numerator: 1, denominator: 2 })).toEqual({ numerator: 1, denominator: 4 });
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

    it("applies an articulation to the addressed note and keeps its duration", () => {
        const noteStyles = model.arrangement!.tracks[0].instrument.noteStyles;
        noteStyles["1"] = makeNoteStyle("1", false);
        noteStyles["2"] = makeNoteStyle("2", true);

        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
        ]);

        const changed = editor.setSelectionArticulation([runEntry(measure, measure.events[0])], Articulation.Accent);

        expect(changed).toBe(true);
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBe("2");
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 4 });
        expect(styleAt(measure, { numerator: 1, denominator: 4 })).toBe("1");
    });

    it("leaves notes alone when the instrument offers no variant for the articulation", () => {
        const noteStyles = model.arrangement!.tracks[0].instrument.noteStyles;
        noteStyles["1"] = makeNoteStyle("1", false);
        noteStyles["2"] = makeNoteStyle("2", false);

        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);

        const changed = editor.setSelectionArticulation([runEntry(measure, measure.events[0])], Articulation.Accent);

        expect(changed).toBe(false);
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBe("1");
    });

    it("resolves the element an exact position addresses in the model", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);

        const address = editor.eventAddressAt({ bar: 1, trackId, start: { numerator: 1, denominator: 4 } });

        expect(address?.measure.number).toBe(1);
        expect(address?.event.start).toEqual({ numerator: 1, denominator: 4 });

        // A position inside an event addresses no element of its own.
        expect(editor.eventAddressAt({ bar: 1, trackId, start: { numerator: 1, denominator: 8 } })).toBeUndefined();
    });

    it("deletes an empty subdivision whose slots the selection covers", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 } },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);
        model.createSubdivision(trackId, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 },
            3, 4);
        const measure = model.arrangement!.tracks[0].measures[0];
        const slots = [0, 1, 2].map((index) => {
            return runEntry(measure, measure.events[index]);
        });

        // The edit addresses the model, so the staff view deletes the same block the grid view would.
        expect(editor.deleteEmptySubdivisionsForSelection(slots)).toBe(true);
        expect(measure.subdivisions).toHaveLength(0);
    });

    it("keeps a subdivision whose slots are not all selected", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 } },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);
        model.createSubdivision(trackId, 1, { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 4 },
            3, 4);
        const measure = model.arrangement!.tracks[0].measures[0];

        expect(editor.deleteEmptySubdivisionsForSelection([runEntry(measure, measure.events[0])])).toBe(false);
        expect(measure.subdivisions).toHaveLength(1);
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

        expect(editor.resizeSelection(entries, noteValue(NoteLength.Half))).toBe(true);
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 2 });
        expect(styleAt(measure, { numerator: 1, denominator: 2 })).toBe("2");
    });

    it("resizes the addressed rest and moves the following events", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 } },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 }, noteStyleId: "2" },
        ]);
        const restEntry = runEntry(measure, measure.events[1]);

        expect(editor.resizeSelection([restEntry], noteValue(NoteLength.Eighth))).toBe(true);
        expect(durationAt(measure, { numerator: 1, denominator: 4 })).toEqual({ numerator: 1, denominator: 8 });

        // The note behind the rest moves left by the length the rest gave up.
        expect(styleAt(measure, { numerator: 3, denominator: 8 })).toBe("2");
    });

    it("grows an addressed rest by the augmentation dot", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 } },
            { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "2" },
        ]);
        const restEntry = runEntry(measure, measure.events[1]);

        expect(editor.resizeSelection([restEntry], noteValue(NoteLength.Quarter, true))).toBe(true);

        // The dot makes the rest a dotted quarter, wherever it stands: no pulse or grid position
        // splits the value, so the note behind the rest moves right by an eighth.
        expect(durationAt(measure, { numerator: 1, denominator: 4 })).toEqual({ numerator: 3, denominator: 8 });
        expect(styleAt(measure, { numerator: 5, denominator: 8 })).toBe("2");
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

    it("creates a subdivision over the selected notes", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 8 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 1, denominator: 8 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);
        const entries = [runEntry(measure, measure.events[0]), runEntry(measure, measure.events[1])];

        expect(editor.createSubdivisionForSelection(entries, 3)).toBe(true);

        // Two eighths cover four sixteenth steps, so the triplet replaces them with three slot eighths.
        expect(measure.subdivisions).toHaveLength(1);
        expect(measure.subdivisions[0].actual).toBe(3);
        expect(measure.subdivisions[0].normal).toBe(4);
        expect(durationAt(measure, { numerator: 0, denominator: 1 })).toEqual({ numerator: 1, denominator: 12 });
        expect(styleAt(measure, { numerator: 0, denominator: 1 })).toBe("1");
        expect(styleAt(measure, { numerator: 1, denominator: 12 })).toBe("1");
        expect(styleAt(measure, { numerator: 1, denominator: 6 })).toBeUndefined();
    });

    it("rejects a subdivision span that does not cover whole grid steps", () => {
        setEvents(model, [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 32 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
        ]);
        const entries = [runEntry(measure, measure.events[1])];

        // A single thirty-second spans half a step, which no subdivision can replace.
        expect(editor.createSubdivisionForSelection(entries, 2)).toBe(false);
        expect(measure.subdivisions).toHaveLength(0);
    });

    it("accepts a note value that lands between two grid steps", () => {
        // The staff has no raster: a thirty-second is a plain length, written where it fits.
        const thirtySecond = { numerator: 1, denominator: 32 };

        expect(editor.noteValueDuration(noteValue(NoteLength.ThirtySecond), position)).toEqual(thirtySecond);
        expect(editor.noteValueDuration(noteValue(NoteLength.Whole, true), position)).toBeUndefined();

        const inserted = editor.insertNoteWithShift({ ...position, start: { numerator: 1, denominator: 16 } },
            thirtySecond, "1");

        expect(inserted?.duration).toEqual(thirtySecond);
        expect(styleAt(measure, { numerator: 1, denominator: 16 })).toBe("1");
        expect(durationAt(measure, { numerator: 1, denominator: 16 })).toEqual(thirtySecond);
    });
});
