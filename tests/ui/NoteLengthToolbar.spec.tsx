/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoteLengthToolbar } from "../../src/components/ui/Arrangement/NoteLengthToolbar.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import type { ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel }
    from "../../src/core/ScoreBookDataModel.js";
import { NoteLength, type INoteValue } from "../../src/core/rest-notation.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import type { IMeasureEvent } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import type { ISelectionEntry } from "../../src/ui/SelectionSerializer.js";
import { noteEntry, noteGroupEntry, noteGroupInSteps, noteValue, trackEntry } from "../unit-test-helpers.js";

const makeDataModel = (stepResolution: number, stepsPerBar: number): ScoreBookDataModel => {
    const arrangement = { timeParams: { stepResolution, pulse: "1/4" }, tracks: [] } as unknown as ISbDmArrangement;
    const track = { id: 7, measures: [], arrangement } as unknown as ISbDmTrack;
    const measure = {
        number: 1,
        meter: { stepResolution: stepsPerBar },
        subdivisions: [],
        track,
        events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 16 } }],
        noteEvents: [],
    } as unknown as ISbDmTrackMeasure;

    track.measures.push(measure);
    arrangement.tracks.push(track);

    return { arrangement } as unknown as ScoreBookDataModel;
};

interface INoteSpec {
    start: number;
    duration: number;
    rest?: boolean;
}

/**
 * Builds a model whose first measure opens with a 3:2 tuplet over two steps: three slots whose
 * duration matches no note value, the middle one a rest. A note fills the remaining bar, so the
 * measure holds both a slot and an event the model can resize.
 *
 * @returns The model with that measure.
 */
const makeDataModelWithTuplet = (): ScoreBookDataModel => {
    const arrangement = { timeParams: { stepResolution: 16, pulse: "1/4" }, tracks: [] } as unknown as ISbDmArrangement;
    const track = { id: 7, measures: [], arrangement } as unknown as ISbDmTrack;
    const slots = [
        { start: { numerator: 0, denominator: 1 }, rest: false },
        { start: { numerator: 1, denominator: 24 }, rest: true },
        { start: { numerator: 1, denominator: 12 }, rest: false },
    ];
    const events: IMeasureEvent[] = [
        ...slots.map((slot) => {
            return {
                start: slot.start,
                duration: { numerator: 1, denominator: 24 },
                noteStyleId: slot.rest ? undefined : "1",
            };
        }),
        { start: { numerator: 1, denominator: 8 }, duration: { numerator: 7, denominator: 8 }, noteStyleId: "2" },
    ];
    const measure = {
        number: 1,
        meter: { stepResolution: 16 },
        subdivisions: [{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }],
        track,
        events,
        noteEvents: events.map((event, index) => {
            return {
                id: 8001 + index,
                start: event.start,
                duration: event.duration,
                audioData: event.noteStyleId === undefined ? undefined : { id: "1" },
            };
        }),
    } as unknown as ISbDmTrackMeasure;

    track.measures.push(measure);
    arrangement.tracks.push(track);

    return { arrangement } as unknown as ScoreBookDataModel;
};

const makeDataModelWithNotes = (stepResolution: number, stepsPerBar: number,
    notes: INoteSpec[]): ScoreBookDataModel => {
    const arrangement = { timeParams: { stepResolution, pulse: "1/4" }, tracks: [] } as unknown as ISbDmArrangement;
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
        vi.restoreAllMocks();
    });

    it("defaults to a quarter note in insert mode and marks it", () => {
        renderResult = render(
            <NoteLengthToolbar
                dataModel={makeDataModel(32, 32)}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");
        expect(marked?.getAttribute("data-tooltip")).toBe("Quarter note (Alt/Cmd+3)");
    });

    it("restores the stored value in insert mode", () => {
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({
            entryNoteValue: { length: NoteLength.Eighth, dotted: true },
        });

        renderResult = render(
            <NoteLengthToolbar
                dataModel={makeDataModel(32, 32)}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");
        expect(marked?.getAttribute("data-tooltip")).toBe("Eighth note (Alt/Cmd+4)");
        expect(renderResult.container.querySelector(".noteDotButton.du-btn-primary")).not.toBeNull();
    });

    it("stores the chosen length and dot", () => {
        const saveSpy = vi.spyOn(AppStorage, "saveSetting").mockImplementation(() => {
            // Keep the test out of localStorage.
        });
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={makeDataModel(32, 32)}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        const buttons = renderResult.container.querySelectorAll(".noteLengthButton");
        fireEvent.click(buttons[3]);

        expect(saveSpy).toHaveBeenCalledWith("entryNoteValue", noteValue(NoteLength.Eighth));

        fireEvent.click(renderResult.container.querySelector(".noteDotButton")!);

        expect(saveSpy).toHaveBeenCalledWith("entryNoteValue", { length: NoteLength.Eighth, dotted: true });
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

    it("keeps the lengths usable in insert mode without a selection", () => {
        renderResult = render(
            <NoteLengthToolbar
                dataModel={makeDataModel(32, 32)}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        // The length only configures the next entry, which needs no cursor to be placed first.
        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteLengthButton")];

        expect(buttons.every((button) => {
            return !button.disabled;
        })).toBe(true);
    });

    it("does not follow the selection in insert mode", async () => {
        const dataModel = makeDataModelWithNotes(32, 16, [{ start: 0, duration: 4 }, { start: 4, duration: 2 }]);
        const measure = dataModel.arrangement!.tracks[0].measures[0];

        selectionManager.replaceSelection([noteEntry(measure, { numerator: 0, denominator: 16 })]);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        const buttons = renderResult.container.querySelectorAll(".noteLengthButton");
        fireEvent.click(buttons[3]);

        // The cursor only marks where the entry goes, so moving it leaves the chosen value alone.
        await act(() => {
            selectionManager.replaceSelection([noteEntry(measure, { numerator: 4, denominator: 16 })]);
        });

        expect(renderResult.container.querySelector(".noteLengthButton.du-btn-primary")).toBe(buttons[3]);
    });

    it("marks the value of the selection when the view switches to overwrite", async () => {
        const dataModel = makeDataModelWithNotes(32, 16, [{ start: 0, duration: 8 }]);
        const measure = dataModel.arrangement!.tracks[0].measures[0];

        selectionManager.replaceSelection([noteEntry(measure, { numerator: 0, denominator: 16 })]);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        const marked = () => {
            const button = renderResult!.container.querySelector(".noteLengthButton.du-btn-primary");

            return button?.getAttribute("data-tooltip");
        };

        // Insert mode marks the value the next entry uses.
        expect(marked()).toBe("Quarter note (Alt/Cmd+3)");

        await act(() => {
            renderResult!.rerender(
                <NoteLengthToolbar
                    dataModel={dataModel}
                    selectionManager={selectionManager}
                    entryMode={EditEntryMode.Overwrite}
                />,
            );
        });

        // The selection carries a half note, so the overwrite mode marks that value.
        expect(marked()).toBe("Half note (Alt/Cmd+2)");
    });

    it("restores the chosen length when the view returns to insert mode", async () => {
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({
            entryNoteValue: { length: NoteLength.Eighth, dotted: false },
        });

        const dataModel = makeDataModelWithNotes(32, 16, [{ start: 0, duration: 8 }]);
        const measure = dataModel.arrangement!.tracks[0].measures[0];

        selectionManager.replaceSelection([noteEntry(measure, { numerator: 0, denominator: 16 })]);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Overwrite}
            />,
        );

        const marked = () => {
            const button = renderResult!.container.querySelector(".noteLengthButton.du-btn-primary");

            return button?.getAttribute("data-tooltip");
        };

        expect(marked()).toBe("Half note (Alt/Cmd+2)");

        await act(() => {
            renderResult!.rerender(
                <NoteLengthToolbar
                    dataModel={dataModel}
                    selectionManager={selectionManager}
                    entryMode={EditEntryMode.Insert}
                />,
            );
        });

        expect(marked()).toBe("Eighth note (Alt/Cmd+4)");
    });

    it("keeps the chosen length in insert mode, where it configures the next entry", () => {
        const dataModel = makeDataModel(32, 32);
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        const buttons = renderResult.container.querySelectorAll(".noteLengthButton");
        fireEvent.click(buttons[3]);

        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");
        expect(marked).toBe(buttons[3]);
    });

    it("takes the mark from the events in overwrite mode", () => {
        const dataModel = makeDataModel(32, 32);
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Overwrite}
            />,
        );

        const buttons = renderResult.container.querySelectorAll(".noteLengthButton");
        fireEvent.click(buttons[3]);

        // The stub model cannot resize the addressed event, so the mark stays on what the events carry
        // instead of following the click.
        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");
        expect(marked).not.toBeNull();
        expect(marked).not.toBe(buttons[3]);
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

        // 3/4 with 16 steps per whole note: 12 steps per bar, so only the whole note does not fit.
        // The thirty-second fits: the staff places any length the meter can express, even between
        // two grid steps.
        renderResult = render(
            <NoteLengthToolbar dataModel={makeDataModel(16, 12)} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteLengthButton")];

        expect(buttons.map((button) => {
            return button.disabled;
        })).toEqual([true, false, false, false, false, false]);
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

    it("marks the value a subdivision slot is drawn with", () => {
        const dataModel = makeDataModelWithTuplet();
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteEntry(measure, { numerator: 0, denominator: 1 })]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const selected = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        // The slot has no value of its own, so the toolbar marks the one its subdivision stands for —
        // the value the staff view draws it with.
        expect(selected?.getAttribute("data-tooltip")).toBe("Eighth note (Alt/Cmd+4)");
    });

    it("marks the value a rest inside a subdivision is drawn with", () => {
        const dataModel = makeDataModelWithTuplet();
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteEntry(measure, { numerator: 1, denominator: 24 })]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const selected = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        expect(selected?.getAttribute("data-tooltip")).toBe("Eighth note (Alt/Cmd+4)");
    });

    it("disables the note lengths for a selection inside a subdivision", () => {
        const dataModel = makeDataModelWithTuplet();
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteEntry(measure, { numerator: 0, denominator: 1 })]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(
            ".noteLengthButton, .noteDotButton",
        )];

        // A slot keeps the length its ratio dictates, so no length is offered for it.
        expect(buttons).toHaveLength(7);
        expect(buttons.every((button) => {
            return button.disabled;
        })).toBe(true);
    });

    it("enables the note lengths for a note next to a subdivision", () => {
        const dataModel = makeDataModelWithTuplet();
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteEntry(measure, { numerator: 1, denominator: 8 })]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(
            ".noteLengthButton, .noteDotButton",
        )];

        expect(buttons.every((button) => {
            return button.disabled;
        })).toBe(false);
    });

    it("keeps the mark on the value the events still carry when a click changes nothing", () => {
        const dataModel = makeDataModelWithTuplet();
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteEntry(measure, { numerator: 1, denominator: 8 })]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteLengthButton")];
        fireEvent.click(buttons[3]);

        const marked = [...renderResult.container.querySelectorAll<HTMLButtonElement>(
            ".noteLengthButton.du-btn-primary",
        )];

        // The click announces a length, but only the model decides: the fixture keeps its durations,
        // so the mark does not jump to the clicked value.
        expect(marked.map((button) => {
            return button.getAttribute("data-tooltip");
        })).not.toContain("Eighth note (Alt/Cmd+4)");
    });

    it("marks and enables the lengths for a group of notes", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [
            { start: 0, duration: 8 },
            { start: 8, duration: 8 },
        ]);
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteGroupInSteps(measure, 0, 8)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(
            ".noteLengthButton, .noteDotButton",
        )];
        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        // A group behaves like any other selection: every member counts for the mark and for whether
        // a length may be picked at all.
        expect(buttons.every((button) => {
            return !button.disabled;
        })).toBe(true);
        expect(marked?.getAttribute("data-tooltip")).toBe("Quarter note (Alt/Cmd+3)");
    });

    it("disables the note lengths for a group that is a subdivision", () => {
        const dataModel = makeDataModelWithTuplet();
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteGroupEntry(measure, measure.events.slice(0, 3))]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(
            ".noteLengthButton, .noteDotButton",
        )];

        // A subdivision is the one group whose members keep the length their ratio dictates.
        expect(buttons).toHaveLength(7);
        expect(buttons.every((button) => {
            return button.disabled;
        })).toBe(true);
    });

    it("marks and enables the lengths for a whole track", () => {
        const notes = Array.from({ length: 16 }, (_, index) => {
            return { start: index, duration: 1 };
        });
        const dataModel = makeDataModelWithNotes(16, 16, notes);
        const track = dataModel.arrangement!.tracks[0];
        selectionManager.replaceSelection([trackEntry(track)]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(
            ".noteLengthButton, .noteDotButton",
        )];
        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        // A whole track takes a length like any other selection: every event of it counts.
        expect(buttons.every((button) => {
            return !button.disabled;
        })).toBe(true);
        expect(marked?.getAttribute("data-tooltip")).toBe("Sixteenth note (Alt/Cmd+5)");
    });

    it("marks the shared length of several selected rests", () => {
        const dataModel = makeDataModelWithNotes(16, 16, [
            { start: 0, duration: 4 },
            { start: 4, duration: 4, rest: true },
            { start: 8, duration: 4, rest: true },
            { start: 12, duration: 4, rest: true },
        ]);
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([
            noteEntry(measure, { numerator: 1, denominator: 4 }),
            noteEntry(measure, { numerator: 2, denominator: 4 }),
            noteEntry(measure, { numerator: 3, denominator: 4 }),
        ]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        // The three quarter rests share their length, so the toolbar marks it.
        expect(marked?.getAttribute("data-tooltip")).toBe("Quarter note (Alt/Cmd+3)");
    });

    it("marks no length when the selection mixes lengths", () => {
        const dataModel = makeDataModelWithNotes(32, 32, [
            { start: 0, duration: 8 },
            { start: 8, duration: 16 },
            { start: 24, duration: 8 },
        ]);
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteGroupEntry(measure, measure.events.slice(0, 2))]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        // Different lengths leave the toolbar without a selection at all.
        expect(renderResult.container.querySelectorAll(".noteLengthButton.du-btn-primary")).toHaveLength(0);
        expect(renderResult.container.querySelector(".noteDotButton.du-btn-primary")).toBeNull();
    });

    it("marks the shared length without a dot when only the dots differ", () => {
        const dataModel = makeDataModelWithNotes(32, 64, [
            { start: 0, duration: 16 },
            { start: 16, duration: 24 },
            { start: 40, duration: 24, rest: true },
        ]);
        const measure = dataModel.arrangement!.tracks[0].measures[0];
        selectionManager.replaceSelection([noteGroupEntry(measure, measure.events.slice(0, 2))]);

        renderResult = render(
            <NoteLengthToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const marked = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        // A quarter and a dotted quarter share their base length, so that length is marked while the
        // dot stays unmarked.
        expect(marked?.getAttribute("data-tooltip")).toBe("Quarter note (Alt/Cmd+3)");
        expect(renderResult.container.querySelector(".noteDotButton.du-btn-primary")).toBeNull();
    });
});
