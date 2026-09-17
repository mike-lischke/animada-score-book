/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteLengthToolbar } from "../../src/components/ui/Arrangement/NoteLengthToolbar.js";
import type { ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel }
    from "../../src/core/ScoreBookDataModel.js";
import { NoteLength, type INoteValue } from "../../src/core/rest-notation.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import type { ISelectionEntry } from "../../src/ui/SelectionSerializer.js";
import { noteEntry, noteValue } from "../unit-test-helpers.js";

const makeDataModel = (stepResolution: number, stepsPerBar: number): ScoreBookDataModel => {
    return {
        arrangement: {
            timeParams: { stepResolution },
            tracks: [
                { measures: [{ meter: { stepResolution: stepsPerBar }, subdivisions: [] }] },
            ],
        },
    } as unknown as ScoreBookDataModel;
};

interface INoteSpec {
    start: number;
    duration: number;
    rest?: boolean;
}

const makeDataModelWithNotes = (stepResolution: number, stepsPerBar: number,
    notes: INoteSpec[]): ScoreBookDataModel => {
    const arrangement = { timeParams: { stepResolution }, tracks: [] } as unknown as ISbDmArrangement;
    const track = { id: 7, measures: [], arrangement } as unknown as ISbDmTrack;
    const measure = {
        number: 1,
        meter: { stepResolution: stepsPerBar },
        subdivisions: [],
        track,
        events: notes.map((note) => {
            return {
                start: { numerator: note.start, denominator: stepsPerBar },
                duration: { numerator: note.duration, denominator: stepsPerBar },
                noteStyleId: note.rest ? undefined : "1",
            };
        }),
        noteEvents: notes.map((note, index) => {
            return {
                id: 7001 + index,
                start: { numerator: note.start, denominator: stepsPerBar },
                duration: { numerator: note.duration, denominator: stepsPerBar },
                audioData: note.rest ? undefined : { id: "1" },
            };
        }),
    } as unknown as ISbDmTrackMeasure;

    track.measures.push(measure);
    arrangement.tracks.push(track);

    return { arrangement } as unknown as ScoreBookDataModel;
};

/**
 * Builds the selection entry of one cell of the model's first measure.
 *
 * @param dataModel The model the toolbar renders.
 * @param step The zero-based grid step to select.
 *
 * @returns The selection entry addressing that cell.
 */
const noteEntryAt = (dataModel: ScoreBookDataModel, step: number): ISelectionEntry => {
    const measure = dataModel.arrangement!.tracks[0].measures[0];

    return noteEntry(measure, { numerator: step, denominator: measure.meter.stepResolution });
};

/**
 * Selects one note cell, which is all the tests that do not address a model need.
 *
 * @param selectionManager The manager to select in.
 */
const selectSingleNote = (selectionManager: SelectionManager): void => {
    const arrangement = { tracks: [] } as unknown as ISbDmArrangement;
    const track = { id: 7, measures: [], arrangement } as unknown as ISbDmTrack;
    const measure = {
        number: 1,
        meter: { stepResolution: 16 },
        subdivisions: [],
        track,
        events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 16 } }],
        noteEvents: [],
    } as unknown as ISbDmTrackMeasure;

    track.measures.push(measure);
    arrangement.tracks.push(track);
    selectionManager.replaceSelection([noteEntry(measure, { numerator: 0, denominator: 1 })]);
};

describe.sequential("NoteLengthToolbar", () => {
    let renderResult: RenderResult | null;
    let selectionManager: SelectionManager;

    beforeEach(() => {
        renderResult = null;
        selectionManager = new SelectionManager();
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders one button per standard note length", () => {
        renderResult = render(
            <NoteLengthToolbar dataModel={makeDataModel(32, 32)} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteLengthButton")).toHaveLength(6);
    });

    it("marks the duration of the selected note", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 8 }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const selected = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        expect(selected?.getAttribute("data-tooltip")).toBe("Quarter note (Alt/Cmd+3)");
    });

    it("marks the length of a selected rest", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 8, rest: true }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const selected = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        expect(selected?.getAttribute("data-tooltip")).toBe("Quarter note (Alt/Cmd+3)");
    });

    it("renders the dot behind the lengths", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 24 }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll(".noteLengthToolbar button")];

        expect(buttons).toHaveLength(7);
        expect(buttons[6].classList.contains("noteDotButton")).toBe(true);
    });

    it("marks a dotted value with its base length and the dot", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 24 }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        expect(marked?.getAttribute("data-tooltip")).toBe("Half note (Alt/Cmd+2)");
        expect(renderResult.container.querySelector(".noteDotButton.du-btn-primary")).not.toBeNull();
    });

    it("publishes the toggled value when the dot is clicked", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 8 }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const received: INoteValue[] = [];
        const handler = (value: INoteValue): Promise<boolean> => {
            received.push(value);

            return Promise.resolve(true);
        };

        requisitions.register("noteLengthChanged", handler);
        fireEvent.click(renderResult.container.querySelector(".noteDotButton")!);

        expect(received).toEqual([noteValue(NoteLength.Quarter, true)]);

        requisitions.unregister("noteLengthChanged", handler);
    });

    it("applies the dot to the length chosen afterwards", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 24 }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const received: INoteValue[] = [];
        const handler = (value: INoteValue): Promise<boolean> => {
            received.push(value);

            return Promise.resolve(true);
        };

        requisitions.register("noteLengthChanged", handler);
        fireEvent.click(renderResult.container.querySelectorAll(".noteLengthButton")[3]);

        expect(received).toEqual([noteValue(NoteLength.Eighth, true)]);

        requisitions.unregister("noteLengthChanged", handler);
    });

    it("disables a length the dot cannot stretch in the bar", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 24 }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteLengthButton")];

        // The dotted whole note needs more than one bar, so the whole note cannot be chosen.
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[1].disabled).toBe(false);
    });

    it("does not mark a note length when selected notes differ", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [
            { start: 0, duration: 8 },
            { start: 8, duration: 4 },
        ]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0), noteEntryAt(dataModel, 8)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteLengthButton.du-btn-primary")).toHaveLength(0);
    });

    it("marks the length of the current measure when the entry's measure was replaced", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 8, rest: true }]);
        const entry = noteEntryAt(dataModel, 0);
        const track = dataModel.arrangement!.tracks[0];

        // An undo splices new measure objects into the same track, so an entry keeps the old one.
        track.measures[0] = {
            ...track.measures[0],
            events: [{
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 16, denominator: 32 },
            }],
            noteEvents: [{
                id: 8001,
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 16, denominator: 32 },
            }],
        } as unknown as ISbDmTrackMeasure;
        selectionManager.replaceSelection([entry]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const selected = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        expect(selected?.getAttribute("data-tooltip")).toBe("Half note (Alt/Cmd+2)");
    });

    it("does not announce a length when the arrangement is reverted", async () => {
        const dataModel = makeDataModelWithNotes(32, 32, [{ start: 0, duration: 8 }]);
        selectionManager.replaceSelection([noteEntryAt(dataModel, 0)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const received: INoteValue[] = [];
        const handler = (value: INoteValue): Promise<boolean> => {
            received.push(value);

            return Promise.resolve(true);
        };

        requisitions.register("noteLengthChanged", handler);
        await requisitions.execute("arrangementReverted", undefined);

        expect(received).toEqual([]);

        requisitions.unregister("noteLengthChanged", handler);
    });

    it("does not mark a note length when nothing is selected", () => {
        renderResult = render(
            <NoteLengthToolbar dataModel={makeDataModel(32, 32)} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteLengthButton.du-btn-primary")).toHaveLength(0);
    });

    it("disables all buttons when nothing is selected", () => {
        renderResult = render(
            <NoteLengthToolbar dataModel={makeDataModel(32, 32)} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteLengthButton")];

        expect(buttons).toHaveLength(6);
        expect(buttons.every((button) => {
            return button.disabled;
        })).toBe(true);

        const dot = renderResult.container.querySelector<HTMLButtonElement>(".noteDotButton");

        expect(dot?.disabled).toBe(true);
    });

    it("fires noteLengthChanged when a button is clicked", () => {
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar dataModel={makeDataModel(32, 32)} selectionManager={selectionManager} />,
        );

        const received: INoteValue[] = [];
        const handler = (value: INoteValue): Promise<boolean> => {
            received.push(value);

            return Promise.resolve(true);
        };

        requisitions.register("noteLengthChanged", handler);

        const buttons = renderResult.container.querySelectorAll(".noteLengthButton");
        fireEvent.click(buttons[3]);

        expect(received).toEqual([noteValue(NoteLength.Eighth)]);

        requisitions.unregister("noteLengthChanged", handler);
    });

    it("disables note lengths that do not fit a single bar", () => {
        selectSingleNote(selectionManager);

        // 3/4 with 16 steps per whole note: 12 steps per bar, so whole and thirty-second don't fit.
        renderResult = render(
            <NoteLengthToolbar dataModel={makeDataModel(16, 12)} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteLengthButton")];

        expect(buttons.map((button) => {
            return button.disabled;
        })).toEqual([true, false, false, false, false, true]);
    });

    it("disables all note lengths when no arrangement is loaded", () => {
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar dataModel={{} as ScoreBookDataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteLengthButton")];

        expect(buttons).toHaveLength(6);
        expect(buttons.every((button) => {
            return button.disabled;
        })).toBe(true);
    });
});
