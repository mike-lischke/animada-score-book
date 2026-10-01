/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SubdivisionToolbar } from "../../src/components/ui/Arrangement/SubdivisionToolbar.js";
import type { ISbDmArrangement, ISbDmTrack, ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import type { IFraction } from "../../src/core/types/general.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { createInstrument, noteEntry, runEntry, trackPieceEntry } from "../unit-test-helpers.js";

const triggerButton = (container: Element): HTMLButtonElement => {
    return container.querySelector<HTMLButtonElement>("button")!;
};

/**
 * The one-bar repeat toggle, which follows the tuplet dropdown in the same group.
 *
 * @param container The rendered toolbar.
 *
 * @returns The toggle button.
 */
const repeatButton = (container: Element): HTMLButtonElement => {
    return container.querySelectorAll<HTMLButtonElement>("button")[1];
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
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
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
});
