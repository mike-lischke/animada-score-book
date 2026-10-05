/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubdivisionToolbar } from "../../src/components/ui/Arrangement/SubdivisionToolbar.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import type { ISbDmArrangement, ISbDmTrack, ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import type { IFraction } from "../../src/core/types/general.js";
import { RepeatMark } from "../../src/core/types/general.js";
import { requisitions, RangeArticulationTool } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { createInstrument, measureEntry, noteEntry, runEntry, trackPieceEntry } from "../unit-test-helpers.js";

const triggerButton = (container: Element): HTMLButtonElement => {
    return container.querySelector<HTMLButtonElement>("button")!;
};

/**
 * Resolves a button of the toolbar by the tooltip that names it, so a new button in a group does not shift it.
 *
 * @param container The rendered toolbar.
 * @param tooltip The tooltip the button carries.
 *
 * @returns The button.
 */
const buttonWithTooltip = (container: Element, tooltip: string): HTMLButtonElement => {
    return container.querySelector<HTMLButtonElement>(`button[data-tooltip="${tooltip}"]`)!;
};

/**
 * Resolves a button of the toolbar by the tooltip that names it, or null when the toolbar does not carry it.
 *
 * @param container The rendered toolbar.
 * @param tooltip The tooltip the button carries.
 *
 * @returns The button, or null when it is not rendered.
 */
const buttonOrNull = (container: Element, tooltip: string): HTMLButtonElement | null => {
    return container.querySelector<HTMLButtonElement>(`button[data-tooltip="${tooltip}"]`);
};

/**
 * The one-bar repeat toggle, which follows the tuplet dropdown in the same group.
 *
 * @param container The rendered toolbar.
 *
 * @returns The toggle button.
 */
const repeatButton = (container: Element): HTMLButtonElement => {
    return buttonWithTooltip(container, "One-bar repeat (simile)");
};

/**
 * The button that marks the barline a repeated section opens at.
 *
 * @param container The rendered toolbar.
 *
 * @returns The toggle button.
 */
const startButton = (container: Element): HTMLButtonElement => {
    return buttonWithTooltip(container, "Repeat start");
};

/**
 * The button that marks the barline a repeated section closes at.
 *
 * @param container The rendered toolbar.
 *
 * @returns The toggle button.
 */
const endButton = (container: Element): HTMLButtonElement => {
    return buttonWithTooltip(container, "Repeat end");
};

/**
 * Builds a one-bar measure whose events start at the given positions. The toolbar resolves a
 * selected note through the model objects a selection entry holds, so entries need a measure.
 *
 * @param trackId The track identity.
 * @param starts The positions of the measure's events.
 * @param duration The length every event gets.
 * @param measureNumber The one-based measure number; defaults to 1.
 *
 * @returns The measure to address in selection entries.
 */
const makeMeasure = (trackId: number, starts: IFraction[],
    duration: IFraction = { numerator: 1, denominator: 16 }, measureNumber = 1): ISbDmTrackPiece => {
    const arrangement = { tracks: [] } as unknown as ISbDmArrangement;
    const track = { id: trackId, measures: [], arrangement } as unknown as ISbDmTrack;
    const measure = {
        number: measureNumber,
        track,
        meter: { stepResolution: 16 },
        subdivisions: [],
        events: starts.map((start) => {
            return { start, duration };
        }),
    } as unknown as ISbDmTrackPiece;

    track.measures.push(measure);
    arrangement.tracks.push(track);

    return measure;
};

const cell = (step: number): IFraction => {
    return { numerator: step, denominator: 16 };
};

describe.sequential("SubdivisionToolbar", () => {
    let renderResult: RenderResult | null;
    let selectionManager: SelectionManager;
    let dataModel: ScoreBookDataModel;

    beforeEach(() => {
        renderResult = null;
        selectionManager = new SelectionManager();
        dataModel = new ScoreBookDataModel();

        // The repeat and dynamics controls belong to the staff view, so the spec runs in it by default.
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        });
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        vi.restoreAllMocks();
    });

    it("enables the dropdown for a note inside one tuplet but not inside a nested one", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];

        // A triplet over a quarter and, inside it, a triplet over two of its slots: the second level.
        model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 4 }, 3, 2);
        const measure = track.measures[0];
        selectionManager.replaceSelection([noteEntry(measure, { numerator: 1, denominator: 12 })]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(false);

        model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 6 }, 3, 2);
        selectionManager.replaceSelection([noteEntry(measure, { numerator: 1, denominator: 18 })]);
        renderResult.rerender(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        // A note in the second level has no room for another bracket.
        expect(triggerButton(renderResult.container).disabled).toBe(true);
    });

    it("disables the dropdown when the selection mixes tuplet levels", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const track = model.arrangement!.tracks[0];
        model.createSubdivision(track.id, 1, { numerator: 0, denominator: 1 },
            { numerator: 1, denominator: 4 }, 3, 2);
        const measure = track.measures[0];

        // One slot of the triplet and one note outside it: the levels differ.
        selectionManager.replaceSelection([
            noteEntry(measure, { numerator: 0, denominator: 1 }),
            noteEntry(measure, { numerator: 1, denominator: 2 }),
            noteEntry(measure, { numerator: 3, denominator: 4 }),
        ]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(true);
    });

    it("renders a disabled creation dropdown when nothing is selected", () => {
        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(true);
    });

    it("enables the dropdown for a single note selection", () => {
        const measure = makeMeasure(7, [cell(0)]);
        selectionManager.replaceSelection([noteEntry(measure, cell(0))]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(false);

        const dropdownItems = [...renderResult.container.querySelectorAll<HTMLAnchorElement>("a")];
        const duplet = dropdownItems.find((item) => {
            return item.textContent === "Duplet";
        });
        const triplet = dropdownItems.find((item) => {
            return item.textContent === "Triplet";
        });

        expect(duplet?.getAttribute("aria-disabled")).toBeNull();
        expect(triplet?.getAttribute("aria-disabled")).toBe("true");
    });

    it("allows tuplets that fit inside a selected subdivision slot", () => {
        const slotStart: IFraction = { numerator: 1, denominator: 24 };
        const measure = makeMeasure(7, [slotStart]);
        selectionManager.replaceSelection([noteEntry(measure, slotStart)]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        const dropdownItems = [...renderResult.container.querySelectorAll<HTMLAnchorElement>("a")];
        const triplet = dropdownItems.find((item) => {
            return item.textContent === "Triplet";
        });

        expect(triplet?.getAttribute("aria-disabled")).toBeNull();
    });

    it("enables the dropdown for a contiguous selection within one track", () => {
        const measure = makeMeasure(7, [cell(0), cell(1)]);
        const entries = [0, 1].map((step) => {
            return noteEntry(measure, cell(step));
        });

        selectionManager.replaceSelection(entries);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(false);
    });

    it("disables the dropdown for a selection that spans multiple tracks", () => {
        const first = makeMeasure(7, [cell(0)]);
        const second = makeMeasure(8, [cell(0)]);
        const entries = [first, second].map((measure) => {
            return noteEntry(measure, cell(0));
        });

        selectionManager.replaceSelection(entries);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(true);
    });

    it("disables subdivisions whose slots would be shorter than a thirty-second", () => {
        const measure = makeMeasure(7, [cell(0), cell(1), cell(2)]);
        const entries = [0, 1, 2].map((step) => {
            return noteEntry(measure, cell(step));
        });

        selectionManager.replaceSelection(entries);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        const dropdownItems = [...renderResult.container.querySelectorAll<HTMLAnchorElement>("a")];
        const nontuplet = dropdownItems.find((item) => {
            return item.textContent === "Nontuplet";
        });
        const triplet = dropdownItems.find((item) => {
            return item.textContent === "Triplet";
        });

        expect(nontuplet?.getAttribute("aria-disabled")).toBe("true");
        expect(triplet?.getAttribute("aria-disabled")).toBeNull();
    });

    it("sizes the limit by the selected note length", () => {
        // A quarter note holds eight thirty-seconds, so a 4:1 split is offered for it.
        const measure = makeMeasure(7, [{ numerator: 0, denominator: 1 }], { numerator: 1, denominator: 4 });
        selectionManager.replaceSelection([runEntry(measure, measure.events[0])]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        const dropdownItems = [...renderResult.container.querySelectorAll<HTMLAnchorElement>("a")];
        const quadruplet = dropdownItems.find((item) => {
            return item.textContent === "Quadruplet";
        });
        const nontuplet = dropdownItems.find((item) => {
            return item.textContent === "Nontuplet";
        });

        expect(quadruplet?.getAttribute("aria-disabled")).toBeNull();
        expect(nontuplet?.getAttribute("aria-disabled")).toBe("true");
    });

    it("disables the one-bar repeat unless the whole selection is track pieces", () => {
        const measure = makeMeasure(7, [cell(0)], undefined, 2);
        selectionManager.replaceSelection([noteEntry(measure, cell(0))]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(repeatButton(renderResult.container).disabled).toBe(true);
    });

    it("enables the one-bar repeat for a track piece beyond the first measure", () => {
        const measure = makeMeasure(7, [cell(0)], undefined, 2);
        selectionManager.replaceSelection([trackPieceEntry(measure.track, measure)]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        const button = repeatButton(renderResult.container);
        expect(button.disabled).toBe(false);
        expect(button.classList.contains("du-btn-primary")).toBe(false);
    });

    it("disables the one-bar repeat on the first measure", () => {
        const measure = makeMeasure(7, [cell(0)]);
        selectionManager.replaceSelection([trackPieceEntry(measure.track, measure)]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(repeatButton(renderResult.container).disabled).toBe(true);
    });

    it("marks the one-bar repeat when every selected track piece carries it", () => {
        const measure = makeMeasure(7, [cell(0)], undefined, 2);
        measure.simile = true;
        selectionManager.replaceSelection([trackPieceEntry(measure.track, measure)]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(repeatButton(renderResult.container).classList.contains("du-btn-primary")).toBe(true);
    });

    it("disables the repeat marks unless the whole selection is whole bars", () => {
        const measure = makeMeasure(7, [cell(0)]);
        selectionManager.replaceSelection([noteEntry(measure, cell(0))]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={dataModel} />,
        );

        expect(startButton(renderResult.container).disabled).toBe(true);
        expect(endButton(renderResult.container).disabled).toBe(true);
    });

    it("enables the repeat marks for whole bars and toggles the mark on them", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        model.insertBars(1, 2, false, false);
        const measure = model.arrangement!.tracks[0].measures[1];
        selectionManager.replaceSelection([measureEntry(measure)]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />,
        );

        const start = startButton(renderResult.container);
        expect(start.disabled).toBe(false);
        expect(endButton(renderResult.container).disabled).toBe(false);
        expect(start.classList.contains("du-btn-primary")).toBe(false);

        start.click();
        expect(model.arrangement!.repeatBars?.get(2)).toEqual({ start: true });

        // The button follows the model, so pressing it again takes the mark off with one undo step.
        renderResult.rerender(<SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />);
        const marked = startButton(renderResult.container);
        expect(marked.classList.contains("du-btn-primary")).toBe(true);

        marked.click();
        expect(model.arrangement!.repeatBars?.size).toBe(0);
    });

    it("disables the repeat mark that nothing can pair with on the first and the last bar", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        model.insertBars(1, 2, false, false);
        const measures = model.arrangement!.tracks[0].measures;

        // The first bar can open a repeated section but not close one: no bar precedes it to open the repeat.
        selectionManager.replaceSelection([measureEntry(measures[0])]);
        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />,
        );

        expect(startButton(renderResult.container).disabled).toBe(false);
        expect(endButton(renderResult.container).disabled).toBe(true);

        // The last bar is the other way round: no bar follows it that could close a repeat it opens.
        selectionManager.replaceSelection([measureEntry(measures[2])]);
        renderResult.rerender(<SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />);

        expect(startButton(renderResult.container).disabled).toBe(true);
        expect(endButton(renderResult.container).disabled).toBe(false);

        // A bar with bars on both sides can do both.
        selectionManager.replaceSelection([measureEntry(measures[1])]);
        renderResult.rerender(<SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />);

        expect(startButton(renderResult.container).disabled).toBe(false);
        expect(endButton(renderResult.container).disabled).toBe(false);
    });

    it("does not light the repeat mark a bar cannot be given", () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        model.insertBars(1, 2, false, false);
        const measures = model.arrangement!.tracks[0].measures;

        // A score may carry the mark of a section opening on its last bar, where no repeat can follow it.
        model.setRepeatBars([measures[2].number], RepeatMark.Start, true);
        selectionManager.replaceSelection([measureEntry(measures[2])]);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />,
        );

        const start = startButton(renderResult.container);
        expect(start.disabled).toBe(true);
        expect(start.classList.contains("du-btn-primary")).toBe(false);
    });

    it("announces the placing tool of a clicked button", async () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const announced: RangeArticulationTool[] = [];
        const spy = (tool: RangeArticulationTool): Promise<boolean> => {
            announced.push(tool);

            return Promise.resolve(true);
        };

        requisitions.register("rangeArticulationToolChanged", spy);
        try {
            renderResult = render(<SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />);
            void requisitions.execute("trackViewModeToggled", "staff");
            await Promise.resolve();

            buttonWithTooltip(renderResult.container, "Draw crescendo / decrescendo hairpin").click();
            buttonWithTooltip(renderResult.container, "Place forte (f)").click();

            expect(announced).toEqual([RangeArticulationTool.Hairpin, RangeArticulationTool.Forte]);
        } finally {
            requisitions.unregister("rangeArticulationToolChanged", spy);
        }
    });

    it("keeps the repeat and dynamics controls out of the grid view", async () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);

        renderResult = render(<SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />);

        // The staff view offers the whole toolbar: the repeat marks and the dynamics it draws.
        expect(buttonWithTooltip(renderResult.container, "Draw crescendo / decrescendo hairpin").disabled).toBe(false);
        expect(buttonWithTooltip(renderResult.container, "One-bar repeat (simile)")).toBeTruthy();

        void requisitions.execute("trackViewModeToggled", "grid");
        await Promise.resolve();

        // The grid keeps the tuplet dropdown alone and drops the controls whose marks it does not draw.
        expect(buttonOrNull(renderResult.container, "Draw crescendo / decrescendo hairpin")).toBeNull();
        expect(buttonOrNull(renderResult.container, "Place forte (f)")).toBeNull();
        expect(buttonOrNull(renderResult.container, "One-bar repeat (simile)")).toBeNull();
        expect(buttonOrNull(renderResult.container, "Repeat start")).toBeNull();
        expect(buttonOrNull(renderResult.container, "Repeat end")).toBeNull();
        expect(buttonOrNull(renderResult.container, "Add subdivision")).not.toBeNull();
        expect(renderResult.container.querySelectorAll(".subdivisionToolbar")).toHaveLength(1);
    });

    it("ends a placing mode when the toolbar goes away", async () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        const announced: RangeArticulationTool[] = [];
        const spy = (tool: RangeArticulationTool): Promise<boolean> => {
            announced.push(tool);

            return Promise.resolve(true);
        };

        requisitions.register("rangeArticulationToolChanged", spy);
        try {
            renderResult = render(<SubdivisionToolbar selectionManager={selectionManager} dataModel={model} />);
            void requisitions.execute("trackViewModeToggled", "staff");
            await Promise.resolve();

            buttonWithTooltip(renderResult.container, "Place forte (f)").click();
            await Promise.resolve();

            renderResult.unmount();
            renderResult = null;

            expect(announced).toEqual([RangeArticulationTool.Forte, RangeArticulationTool.None]);
        } finally {
            requisitions.unregister("rangeArticulationToolChanged", spy);
        }
    });
});
