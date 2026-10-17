/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackPieceToolbar } from "../../src/components/ui/Arrangement/TrackPieceToolbar.js";
import { ScoreBookDataModel, type ISbDmTrack, type ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { createInstrument, trackPieceEntry } from "../unit-test-helpers.js";

const simileTooltip = "One-bar repeat (simile)";
const unavailableTooltip = "Simile is not applicable in the first bar";

describe("TrackPieceToolbar", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;
    let selectionManager: SelectionManager;
    let dataModel: ScoreBookDataModel;
    let track: ISbDmTrack;

    const measure = (bar: number): ISbDmTrackPiece => {
        return track.measures[bar - 1];
    };

    const renderToolbar = (pieces: ISbDmTrackPiece[]): RenderResult => {
        selectionManager.replaceSelection(pieces.map((piece) => {
            return trackPieceEntry(track, piece);
        }));
        renderResult = render(<TrackPieceToolbar dataModel={dataModel} selectionManager={selectionManager} />);

        return renderResult;
    };

    const selectPieces = (result: RenderResult, pieces: ISbDmTrackPiece[]): void => {
        selectionManager.replaceSelection(pieces.map((piece) => {
            return trackPieceEntry(track, piece);
        }));
        result.rerender(<TrackPieceToolbar dataModel={dataModel} selectionManager={selectionManager} />);
    };

    const actionButton = (result: RenderResult, tooltip: string): HTMLButtonElement => {
        return result.container.querySelector<HTMLButtonElement>(`.selection-toolbar-action[title="${tooltip}"]`)!;
    };

    beforeEach(() => {
        renderResult = null;
        selectionManager = new SelectionManager();
        dataModel = new ScoreBookDataModel();
        dataModel.startNewArrangement([createInstrument("0", 0, 0)], { length: 3 });
        track = dataModel.arrangement!.tracks[0];
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        selectionManager.dispose();
        vi.restoreAllMocks();
    });

    it("names the instrument and the measure of the selected piece", () => {
        const result = renderToolbar([measure(2)]);

        expect(result.container.querySelector(".selection-toolbar-instrument")?.textContent)
            .toBe(track.instrument.displayName);
        expect(result.container.querySelector(".selection-toolbar-position")?.textContent).toBe("Measure 2");
        expect(result.container.querySelectorAll(".selection-toolbar-action")).toHaveLength(2);
        expect(result.container.querySelector(".selection-toolbar-section")).toBeNull();
    });

    it("names the range of measures the selection covers", () => {
        const result = renderToolbar([measure(2), measure(3)]);

        expect(result.container.querySelector(".selection-toolbar-position")?.textContent).toBe("Measures 2 – 3");
    });

    it("offers the one-bar repeat from the second measure on", () => {
        const result = renderToolbar([measure(1)]);

        expect(actionButton(result, unavailableTooltip).disabled).toBe(true);

        selectPieces(result, [measure(2)]);

        expect(actionButton(result, simileTooltip).disabled).toBe(false);
    });

    it("toggles the mark of the addressed pieces", () => {
        const result = renderToolbar([measure(2)]);

        fireEvent.click(actionButton(result, simileTooltip));

        expect(measure(2).simile).toBe(true);
        expect(actionButton(result, simileTooltip).classList.contains("du-btn-primary")).toBe(true);

        fireEvent.click(actionButton(result, simileTooltip));

        expect(measure(2).simile).toBeUndefined();
    });

    it("asks for the deletion of the addressed pieces", () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const result = renderToolbar([measure(2)]);

        fireEvent.click(actionButton(result, "Clear track piece"));

        expect(executeSpy).toHaveBeenCalledWith("selectionDeleteRequested", undefined);
    });
});
