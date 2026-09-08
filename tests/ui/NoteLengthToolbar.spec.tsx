/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteLengthToolbar } from "../../src/components/ui/Arrangement/NoteLengthToolbar.js";
import type { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { NoteLength } from "../../src/core/rest-notation.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { SelectionGranularity } from "../../src/ui/selection-types.js";

const makeDataModel = (stepResolution: number, stepsPerBar: number): ScoreBookDataModel => {
    return {
        arrangement: {
            timeParams: { stepResolution },
            tracks: [
                { measures: [{ meter: { stepResolution: stepsPerBar } }] },
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
    return {
        arrangement: {
            timeParams: { stepResolution },
            tracks: [
                {
                    id: 7,
                    measures: [{
                        number: 1,
                        meter: { stepResolution: stepsPerBar },
                        noteEvents: notes.map((note, index) => {
                            return {
                                id: 7001 + index,
                                start: { numerator: note.start, denominator: stepsPerBar },
                                duration: { numerator: note.duration, denominator: stepsPerBar },
                                audioData: note.rest ? undefined : { id: "1" },
                            };
                        }),
                    }],
                },
            ],
        },
    } as unknown as ScoreBookDataModel;
};

const selectSingleNote = (selectionManager: SelectionManager): void => {
    selectionManager.selectSingleNote({
        granularity: SelectionGranularity.Note,
        bar: 1,
        trackId: 7,
        startStep: 0,
        endStep: 0,
    });
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
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={makeDataModelWithNotes(32, 32, [{ start: 0, duration: 8 }])}
                selectionManager={selectionManager}
            />,
        );

        const selected = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        expect(selected?.getAttribute("data-tooltip")).toBe("Quarter note");
    });

    it("marks the length of a selected rest", () => {
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={makeDataModelWithNotes(32, 32, [{ start: 0, duration: 8, rest: true }])}
                selectionManager={selectionManager}
            />,
        );

        const selected = renderResult.container.querySelector(".noteLengthButton.du-btn-primary");

        expect(selected?.getAttribute("data-tooltip")).toBe("Quarter note");
    });

    it("does not mark a note length when selected notes differ", () => {
        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, startStep: 0, endStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, startStep: 8, endStep: 8 },
        ]);

        renderResult = render(
            <NoteLengthToolbar
                dataModel={makeDataModelWithNotes(32, 32, [
                    { start: 0, duration: 8 },
                    { start: 8, duration: 4 },
                ])}
                selectionManager={selectionManager}
            />,
        );

        expect(renderResult.container.querySelectorAll(".noteLengthButton.du-btn-primary")).toHaveLength(0);
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
    });

    it("fires noteLengthChanged when a button is clicked", () => {
        selectSingleNote(selectionManager);

        renderResult = render(
            <NoteLengthToolbar dataModel={makeDataModel(32, 32)} selectionManager={selectionManager} />,
        );

        const received: NoteLength[] = [];
        const handler = (length: NoteLength): Promise<boolean> => {
            received.push(length);

            return Promise.resolve(true);
        };

        requisitions.register("noteLengthChanged", handler);

        const buttons = renderResult.container.querySelectorAll(".noteLengthButton");
        fireEvent.click(buttons[3]);

        expect(received).toEqual([NoteLength.Eighth]);

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
