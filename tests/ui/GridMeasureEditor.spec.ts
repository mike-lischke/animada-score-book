/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { MeasureProjection, ProjectedItemKind, modelEventAt } from "../../src/core/MeasureProjection.js";
import { NoteLength } from "../../src/core/rest-notation.js";
import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { addFractions, compareFractions } from "../../src/core/serialisation/numeric-functions.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import type { IRadialMenuItem, IRadialMenuHost } from "../../src/components/ui/framework/RadialMenu.js";
import { GridMeasureEditor } from "../../src/ui/GridMeasureEditor.js";
import type { IMeasureEditorInput } from "../../src/ui/MeasureEditor.js";
import { ScoreElementKind } from "../../src/ui/ScoreElementRegistry.js";
import { SelectionGranularity, SelectionSerializer, type ISelectionEntry } from "../../src/ui/SelectionSerializer.js";
import {
    createEditorInput, createGridEditor, createInstrument, hydrateMeasureEvents, measureEntry, noteEntry,
    noteGroupEntry, noteValue, setCellNote, trackEntry, trackPieceEntry,
} from "../unit-test-helpers.js";

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
        editor = createGridEditor(model);
        mutatedCalls = 0;
        requisitions.register("arrangementMutated", mutationSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutationSpy);
    });

    it("clears a single note", () => {
        const track = model.arrangement!.tracks[0];
        setCellNote(model, track.id, 1, 2, "1");
        mutatedCalls = 0;

        const entry = noteEntry(track.measures[0], { numerator: 2, denominator: 16 });

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
            setCellNote(model, track.id, 1, i, "1");
        }

        const measure = track.measures[0];
        const entry = noteGroupEntry(measure, measure.events.slice(1, 3));

        expect(editor.clearSelection([entry])).toBe(true);

        // The cleared middle cells become a combined rest; the surrounding notes keep their durations.
        const notes = track.measures[0].events.filter((event) => {
            return event.noteStyleId !== undefined;
        });
        expect(notes).toHaveLength(2);
        expect(notes[0].start).toEqual({ numerator: 0, denominator: 1 });
        expect(notes[0].duration).toEqual({ numerator: 1, denominator: 16 });
        expect(notes[1].start).toEqual({ numerator: 3, denominator: 16 });
    });

    it("clears a track piece (track × measure)", () => {
        const track = model.arrangement!.tracks[0];
        setCellNote(model, track.id, 1, 0, "1");

        const entry = trackPieceEntry(track, track.measures[0]);

        expect(editor.clearSelection([entry])).toBe(true);
        expect(noteAtStep(track.measures[0], 0)).toBeUndefined();
    });

    it("clears a whole measure across all tracks", () => {
        for (const track of model.arrangement!.tracks) {
            setCellNote(model, track.id, 1, 0, "1");
        }

        mutatedCalls = 0;

        const entry = measureEntry(model.arrangement!.tracks[0].measures[0]);

        expect(editor.clearSelection([entry])).toBe(true);
        for (const track of model.arrangement!.tracks) {
            expect(noteAtStep(track.measures[0], 0)).toBeUndefined();
        }

        expect(mutatedCalls).toBe(1);
    });

    it("clears a whole track", () => {
        const track = model.arrangement!.tracks[0];
        setCellNote(model, track.id, 1, 0, "1");

        const entry = trackEntry(track);

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
        editor = createGridEditor(model);
        mutatedCalls = 0;
        requisitions.register("arrangementMutated", mutationSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutationSpy);
    });

    it("sets the note style across all selected cells of one track", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        const entries = [0, 1, 2].map((step) => {
            return noteEntry(measure, { numerator: step, denominator: measure.meter.stepResolution });
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

        const entries = [trackA, trackB].map((track) => {
            return noteEntry(track.measures[0], { numerator: 0, denominator: 1 });
        });

        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(true);
        expect(noteAtStep(trackA.measures[0], 0)).toBe("1");
        expect(noteAtStep(trackB.measures[0], 0)).toBe("1");
    });

    it("does not apply when selected cells use different instruments", () => {
        const trackA = model.arrangement!.tracks[0];
        const trackB = model.arrangement!.tracks[1];

        const entries = [trackA, trackB].map((track) => {
            return noteEntry(track.measures[0], { numerator: 0, denominator: 1 });
        });

        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(false);
        expect(noteAtStep(trackA.measures[0], 0)).toBeUndefined();
        expect(noteAtStep(trackB.measures[0], 0)).toBeUndefined();
        expect(mutatedCalls).toBe(0);
    });

    it("returns false when the style is already applied to all cells", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        const entries = [0, 1].map((step) => {
            return noteEntry(measure, { numerator: step, denominator: measure.meter.stepResolution });
        });

        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(true);
        expect(editor.setSelectionNoteStyle(entries, "1")).toBe(false);
    });

    it("refreshSelection re-resolves the model event of every selected cell", () => {
        const track = model.arrangement!.tracks[0];
        track.instrument.noteStyles["1"] = { id: "1" } as IAudioData;

        // A note placed at step 0 occupies a single cell; the following cells are rest space.
        setCellNote(model, track.id, 1, 0, "1");
        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const measure = track.measures[0];
        const stepsPerBar = measure.meter.stepResolution;
        const entries: ISelectionEntry[] = [0, 1, 2].map((step) => {
            return noteEntry(measure, { numerator: step, denominator: stepsPerBar });
        });

        const refreshed = editor.refreshSelection(entries);

        expect(refreshed).toHaveLength(3);
        expect(refreshed.map((entry) => {
            return SelectionSerializer.coordinatesOf(entry).start;
        })).toEqual([
            { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 16 },
            { numerator: 1, denominator: 8 },
        ]);
    });
});

describe.sequential("GridMeasureEditor note length entry", () => {
    let model: ScoreBookDataModel;
    let editor: GridMeasureEditor;

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        editor = createGridEditor(model);
    });

    it("resolves the duration of every note length on the current meter", () => {
        const track = model.arrangement!.tracks[0];
        const position = { bar: 1, trackId: track.id, step: 0 };

        expect(editor.noteValueDuration(noteValue(NoteLength.Whole), position))
            .toEqual({ numerator: 1, denominator: 1 });
        expect(editor.noteValueDuration(noteValue(NoteLength.Half), position))
            .toEqual({ numerator: 1, denominator: 2 });
        expect(editor.noteValueDuration(noteValue(NoteLength.Quarter), position))
            .toEqual({ numerator: 1, denominator: 4 });
        expect(editor.noteValueDuration(noteValue(NoteLength.Eighth), position))
            .toEqual({ numerator: 1, denominator: 8 });
        expect(editor.noteValueDuration(noteValue(NoteLength.Sixteenth), position))
            .toEqual({ numerator: 1, denominator: 16 });
        expect(editor.noteValueDuration(noteValue(NoteLength.ThirtySecond), position)).toBeUndefined();

        // The dot adds half of the value, and a dotted whole note does not fit into a bar.
        expect(editor.noteValueDuration(noteValue(NoteLength.Quarter, true), position))
            .toEqual({ numerator: 3, denominator: 8 });
        expect(editor.noteValueDuration(noteValue(NoteLength.Whole, true), position)).toBeUndefined();
    });

    it("inserts a note spanning the selected duration", () => {
        const track = model.arrangement!.tracks[0];
        track.instrument.noteStyles["1"] = { id: "1" } as IAudioData;
        const position = { bar: 1, trackId: track.id, step: 0 };
        const duration = editor.noteValueDuration(noteValue(NoteLength.Quarter), position)!;

        const style = editor.insertNote(position, duration, "1");

        expect(style?.id).toBe("1");
        expect(noteAtStep(track.measures[0], 0)).toBe("1");
        expect(noteAtStep(track.measures[0], 3)).toBe("1");
        expect(noteAtStep(track.measures[0], 4)).toBeUndefined();
    });

    it("keeps a rest's length when a length is applied to a rest cell", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        const rest = measure.events[0];
        expect(rest.noteStyleId).toBeUndefined();

        const entry = noteEntry(measure, { numerator: 0, denominator: 1 });

        // The grid addresses cells of its raster, so a rest keeps its length: the space a longer
        // rest would need can only come from the staff, which has free positions.
        expect(editor.resizeSelection([entry], noteValue(NoteLength.Half))).toBe(false);
        expect(measure.events).toHaveLength(1);
        expect(measure.events[0].duration).toEqual({ numerator: 1, denominator: 1 });
    });

    it("rejects a note that would extend past the bar", () => {
        const track = model.arrangement!.tracks[0];
        track.instrument.noteStyles["1"] = { id: "1" } as IAudioData;
        const position = { bar: 1, trackId: track.id, step: 13 };

        expect(editor.insertNote(position, { numerator: 1, denominator: 4 }, "1")).toBeUndefined();
    });

    it("keeps the length of an event that sits inside a step", () => {
        const track = model.arrangement!.tracks[0];
        track.instrument.noteStyles["1"] = { id: "1" } as IAudioData;
        const measure = track.measures[0];
        measure.events.splice(0, measure.events.length,
            {
                start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 32 },
                noteStyleId: "1"
            },
            { start: { numerator: 1, denominator: 32 }, duration: { numerator: 1, denominator: 32 } },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
        );
        hydrateMeasureEvents(model.arrangement! as Arrangement);

        // The part of the step keeps its own length, so the thirty-second pair stays intact, while a
        // style written into a whole cell still takes the step's length.
        const position = { bar: 1, trackId: track.id, step: 0, start: { numerator: 1, denominator: 32 } };
        const style = editor.setNote(position, "1");

        expect(style?.id).toBe("1");
        expect(measure.events.slice(0, 2).map((event) => {
            return `${event.start.numerator}/${event.start.denominator}`
                + `+${event.duration.numerator}/${event.duration.denominator}:${event.noteStyleId}`;
        })).toEqual(["0/1+1/32:1", "1/32+1/32:1"]);
    });
});

describe.sequential("GridMeasureEditor subdivision editing", () => {
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
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        editor = createGridEditor(model);
        mutatedCalls = 0;
        requisitions.register("arrangementMutated", mutationSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutationSpy);
    });

    it("creates a triplet over the given range", () => {
        const track = model.arrangement!.tracks[0];

        const created = model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 3, 2);

        expect(created).toBe(true);
        expect(track.measures[0].subdivisions).toEqual([{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);
        expect(mutatedCalls).toBe(1);
    });

    it("creates a nested subdivision within the selected parent slot", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 3, denominator: 16 }, 4, 3);

        const parentSlotStart = { ...measure.events[1].start };
        const parentSlotDuration = { ...measure.events[1].duration };

        const created = editor.createSubdivisionAtCursor({
            bar: 1,
            trackId: track.id,
            step: 0,
            start: parentSlotStart,
        }, 2, 3);

        expect(created).toBe(true);
        expect(measure.subdivisions).toHaveLength(2);
        expect(measure.subdivisions).toContainEqual({ startIndex: 0, actual: 4, normal: 3, isTuplet: true });
        expect(measure.subdivisions).toContainEqual({ startIndex: 1, actual: 2, normal: 1, isTuplet: false });
        expect(measure.events[1].start).toEqual(parentSlotStart);
        expect(measure.events[1].duration).toEqual({
            numerator: parentSlotDuration.numerator,
            denominator: parentSlotDuration.denominator * 2,
        });
    });

    it("preserves nested subdivision rendering when an inner slot changes", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 2 }, 3, 8);
        const parentSlotStart = { ...measure.events[1].start };
        editor.createSubdivisionAtCursor({
            bar: 1,
            trackId: track.id,
            step: 0,
            start: parentSlotStart,
        }, 2, 3);

        const childSlotStart = { ...measure.events[2].start };
        const childSlotEnd = addFractions(childSlotStart, measure.events[2].duration);
        expect(model.setNoteAt(track.id, 1, childSlotStart, { numerator: 1, denominator: 16 }, "test"))
            .toBe(true);

        const projected = MeasureProjection.project(measure);
        const parent = projected[0];
        expect(parent.kind).toBe(ProjectedItemKind.Subdivision);
        if (parent.kind !== ProjectedItemKind.Subdivision) {
            return;
        }

        expect(parent.actual).toBe(3);
        expect(parent.normal).toBe(8);
        expect(parent.items[1].kind).toBe(ProjectedItemKind.Subdivision);
        if (parent.items[1].kind === ProjectedItemKind.Subdivision) {
            expect(parent.items[1]).toMatchObject({ actual: 2, normal: 1 });
        }

        expect(model.clearRanges([{
            trackId: track.id,
            bar: 1,
            start: childSlotStart,
            end: childSlotEnd,
        }])).toBe(true);

        const projectedAfterClear = MeasureProjection.project(measure);
        const parentAfterClear = projectedAfterClear[0];
        expect(parentAfterClear.kind).toBe(ProjectedItemKind.Subdivision);
        if (parentAfterClear.kind === ProjectedItemKind.Subdivision) {
            expect(parentAfterClear).toMatchObject({ actual: 3, normal: 8 });
            expect(parentAfterClear.items[1]).toMatchObject({
                kind: ProjectedItemKind.Subdivision,
                actual: 2,
                normal: 1,
            });
        }
    });

    it("deletes a fully selected empty subdivision", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 3, 2);

        const entries: ISelectionEntry[] = [0, 1, 2].map((index) => {
            const start = { numerator: index, denominator: 24 };

            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: track.id,
                startStep: 0,
                endStep: 0,
                start,
                target: {
                    granularity: SelectionGranularity.Note, measure, event: measure.events[index], start,
                },
            };
        });

        const deleted = editor.deleteEmptySubdivisionsForSelection(entries);

        expect(deleted).toBe(true);
        expect(measure.subdivisions).toHaveLength(0);
    });

    it("does not delete an empty subdivision when only part is selected", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 3, 2);

        const deleted = editor.deleteEmptySubdivisionsForSelection([{
            granularity: SelectionGranularity.Note,
            target: {
                granularity: SelectionGranularity.Note,
                measure,
                event: measure.events[0],
                start: { numerator: 0, denominator: 24 },
            },
        }]);

        expect(deleted).toBe(false);
        expect(measure.subdivisions).toHaveLength(1);
    });

    it("copies selected note values into the first subdivision slots", () => {
        const track = model.arrangement!.tracks[0];
        const measure = track.measures[0];
        setCellNote(model, track.id, 1, 0, "low");
        setCellNote(model, track.id, 1, 1, "mid");
        setCellNote(model, track.id, 1, 2, "high");

        const entries: ISelectionEntry[] = [0, 1, 2].map((step) => {
            return noteEntry(measure, { numerator: step, denominator: measure.meter.stepResolution });
        });

        const created = editor.createSubdivisionForSelection(entries, 5);

        expect(created).toBe(true);
        expect(measure.events.slice(0, 5).map((event) => {
            return event.noteStyleId;
        })).toEqual(["low", "mid", "high", undefined, undefined]);
    });

    it("deleteSubdivisionAt removes the subdivision at a step position", () => {
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 3, 2);
        mutatedCalls = 0;

        const deleted = editor.deleteSubdivisionAt({ bar: 1, trackId: track.id, step: 0 });

        expect(deleted).toBe(true);
        expect(track.measures[0].subdivisions).toHaveLength(0);
        expect(mutatedCalls).toBe(1);
    });

    it("deleteSubdivisionAt honours an exact subdivision-slot start", () => {
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1,
            { numerator: 0, denominator: 1 }, { numerator: 1, denominator: 8 }, 3, 2);
        mutatedCalls = 0;

        const deleted = editor.deleteSubdivisionAt({
            bar: 1, trackId: track.id, step: 0, start: { numerator: 0, denominator: 1 },
        });

        expect(deleted).toBe(true);
        expect(track.measures[0].subdivisions).toHaveLength(0);
    });
});

describe.sequential("GridMeasureEditor input", () => {
    let model: ScoreBookDataModel;
    let editor: GridMeasureEditor;
    let input: IMeasureEditorInput;
    let trackId: number;

    beforeEach(() => {
        vi.restoreAllMocks();
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        trackId = model.arrangement!.tracks[0].id;
        model.arrangement!.tracks[0].instrument.noteStyles["1"] = { id: "1" } as IAudioData;
        model.arrangement!.tracks[0].instrument.noteStyles["2"] = { id: "2" } as IAudioData;
        input = createEditorInput(model);
        editor = new GridMeasureEditor(model, input);
        editor.editMode = true;
    });

    /**
     * Builds the rendered measure row the way the grid renderer registers it: one cell per step.
     *
     * @returns The row element, holding its cells in step order.
     */
    const renderRow = (): HTMLElement => {
        const measure = model.arrangement!.tracks[0].measures[0];
        const stepsPerBar = measure.meter.stepResolution;
        const row = document.createElement("div");
        row.className = "grid-measure-row";
        input.scoreElementRegistry.createRef({
            kind: ScoreElementKind.TrackRow, bar: 1, trackId, measure,
        })(row);

        for (let step = 0; step < stepsPerBar; step++) {
            const start = { numerator: step, denominator: stepsPerBar };
            const cell = document.createElement("div");
            cell.className = "note-viewer";
            row.append(cell);
            input.scoreElementRegistry.createRef({
                kind: ScoreElementKind.GridCell, bar: 1, trackId, step, start, measure,
            }, modelEventAt(measure, start))(cell);
        }

        return row;
    };

    it("writes the selected length at the cell a hit test addressed", () => {
        const measure = model.arrangement!.tracks[0].measures[0];
        const cells = [...renderRow().querySelectorAll<HTMLElement>(".note-viewer")];

        expect(editor.hitTest(cells[2])).toBe(true);
        editor.setNoteLength(noteValue(NoteLength.Quarter));

        expect(editor.enterNote("1")).toBe(true);
        expect(noteAtStep(measure, 2)).toBe("1");
        expect(noteAtStep(measure, 5)).toBe("1");
        expect(noteAtStep(measure, 6)).toBeUndefined();
    });

    it("follows a selection change to place the cursor", () => {
        const measure = model.arrangement!.tracks[0].measures[0];

        editor.cursorFromSelection({
            added: [noteEntry(measure, { numerator: 1, denominator: 16 })],
            removed: [],
        });
        editor.setNoteLength(noteValue(NoteLength.Quarter));
        editor.enterNote("1");

        expect(noteAtStep(measure, 1)).toBe("1");
        expect(noteAtStep(measure, 4)).toBe("1");
        expect(noteAtStep(measure, 5)).toBeUndefined();
    });

    it("drops the cursor when the selection is cleared", () => {
        const measure = model.arrangement!.tracks[0].measures[0];
        editor.cursorFromSelection({ added: [noteEntry(measure, { numerator: 1, denominator: 16 })], removed: [] });

        editor.cursorFromSelection({ added: [], removed: [] });
        editor.setNoteLength(noteValue(NoteLength.Quarter));

        // Without a cursor no cell is addressed, so nothing is written.
        expect(editor.enterNote("1")).toBe(false);
        expect(noteAtStep(measure, 1)).toBeUndefined();
    });

    it("removes the note of the cell before the cursor", () => {
        const measure = model.arrangement!.tracks[0].measures[0];
        setCellNote(model, trackId, 1, 2, "1");
        setCellNote(model, trackId, 1, 3, "1");
        const cells = [...renderRow().querySelectorAll<HTMLElement>(".note-viewer")];

        expect(editor.hitTest(cells[3])).toBe(true);
        expect(editor.deleteBackward()).toBe(true);

        expect(noteAtStep(measure, 2)).toBeUndefined();
        expect(noteAtStep(measure, 3)).toBe("1");
    });

    it("opens the note action menu for the addressed cell and writes the picked style", () => {
        const measure = model.arrangement!.tracks[0].measures[0];
        setCellNote(model, trackId, 1, 2, "1");
        const opened: IRadialMenuItem[][] = [];
        const menu: IRadialMenuHost = {
            open: (anchorRect, placement, items) => {
                opened.push(items);
            },
        };
        editor = new GridMeasureEditor(model, { ...input, noteActionMenu: menu });
        editor.editMode = true;
        const cells = [...renderRow().querySelectorAll<HTMLElement>(".note-viewer")];

        expect(editor.hasNoteActionMenu).toBe(true);
        expect(editor.hitTest(cells[2])).toBe(true);
        editor.openNoteActionMenu();

        expect(opened).toHaveLength(1);
        expect(opened[0].map((item) => {
            return item.id;
        })).toEqual(["1", "2"]);

        opened[0][1].onClick?.();

        expect(noteAtStep(measure, 2)).toBe("2");
    });

    it("rejects a hit test outside the edit mode", () => {
        const cells = [...renderRow().querySelectorAll<HTMLElement>(".note-viewer")];
        editor.editMode = false;

        expect(editor.hitTest(cells[2])).toBe(false);
    });
});
