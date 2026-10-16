/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoteToolbar } from "../../src/components/ui/Arrangement/NoteToolbar.js";
import {
    Damping, ExcitationMode, NoteDisplayType, ScoreBookDataModel, StickTechnique, type ISbDmInstrument,
    type ISbDmTrack, type ISbDmTrackPiece,
} from "../../src/core/ScoreBookDataModel.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { EditEntryMode, TrackViewMode } from "../../src/core/types/general.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import type { ISelectionEntry } from "../../src/ui/SelectionSerializer.js";
import {
    createInstrument, measureEntry, noteEntry, noteGroupEntry, setCellNote, trackEntry, trackPieceEntry,
} from "../unit-test-helpers.js";

/**
 * Builds a note style that names itself, so the style bar can draw and label it.
 *
 * @param id The style id.
 *
 * @returns The note style.
 */
const makeNoteStyle = (id: string): IAudioData => {
    return {
        id,
        symbol: { shortDescription: "Low", description: "Lowest drum" },
        audioBuffer: null,
        instrument: {} as ISbDmInstrument,
        characteristics: {
            excitationMode: ExcitationMode.Struck,
            stickTechnique: StickTechnique.Normal,
            mainDisplayType: NoteDisplayType.Oval,
        },
        sampleProfile: { builtInDamping: Damping.Open, builtInAccent: false, ghost: false },
    } as unknown as IAudioData;
};

/** The start of the note the fixture writes into the first bar. */
const noteStart = { numerator: 0, denominator: 1 };

describe("NoteToolbar", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;
    let selectionManager: SelectionManager;
    let dataModel: ScoreBookDataModel;
    let track: ISbDmTrack;
    let measure: ISbDmTrackPiece;

    const renderToolbar = (entries: ISelectionEntry[], trackViewMode = TrackViewMode.Staff): RenderResult => {
        selectionManager.replaceSelection(entries);
        renderResult = render(
            <NoteToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                trackViewMode={trackViewMode}
                entryMode={EditEntryMode.Overwrite}
            />,
        );

        return renderResult;
    };

    const sectionLabels = (result: RenderResult): Array<string | null> => {
        return [...result.container.querySelectorAll(".selectionToolbarSection")].map((element) => {
            return element.textContent;
        });
    };

    const sectionRows = (result: RenderResult): HTMLElement[] => {
        return [...result.container.querySelectorAll<HTMLElement>(".selectionToolbarActions")];
    };

    beforeEach(() => {
        renderResult = null;
        dataModel = new ScoreBookDataModel();
        dataModel.startNewArrangement([createInstrument("0", 0, 0)], { length: 2 });
        track = dataModel.arrangement!.tracks[0];
        measure = track.measures[0];
        track.instrument.noteStyles["1"] = makeNoteStyle("1");
        setCellNote(dataModel, track.id, 1, 0, "1");
        selectionManager = new SelectionManager(dataModel);
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        selectionManager.dispose();
        vi.restoreAllMocks();
    });

    it("names the instrument and the measure of the addressed note", () => {
        const result = renderToolbar([noteEntry(measure, noteStart)]);

        expect(result.container.querySelector(".selectionToolbarInstrument")?.textContent)
            .toBe(track.instrument.displayName);
        expect(result.container.querySelector(".selectionToolbarPosition")?.textContent).toBe("Measure 1");
    });

    it("captions the sections of a note selection and keeps the styles on a tray of their own", () => {
        const result = renderToolbar([noteEntry(measure, noteStart)]);

        expect(sectionLabels(result)).toEqual([
            "Note style & technique", "Note value / duration", "Articulation", "Tuplets",
        ]);
        expect(result.container.querySelector(".selectionToolbarBadge")?.textContent).toBe("Percussion");

        // Each row carries the class of its own section, and only the styles sit on the card's tray.
        const rows = sectionRows(result);
        expect(rows).toHaveLength(4);
        expect(rows[0].classList.contains("noteStyleBar")).toBe(true);
        expect(rows[1].classList.contains("noteLengthToolbar")).toBe(true);
        expect(rows[2].classList.contains("articulationToolbar")).toBe(true);
        expect(rows[3].classList.contains("subdivisionToolbar")).toBe(true);
        expect(rows.map((row) => {
            return row.classList.contains("selectionToolbarTray");
        })).toEqual([true, false, false, false]);
        expect(result.container.querySelectorAll(".selectionToolbarGroup.is-tray")).toHaveLength(1);
    });

    it("leaves the note values out of the grid view", () => {
        const result = renderToolbar([noteEntry(measure, noteStart)], TrackViewMode.Grid);

        expect(sectionLabels(result)).toEqual(["Note style & technique", "Articulation", "Tuplets"]);
        expect(result.container.querySelector(".noteLengthToolbar")).toBeNull();
    });

    it("leaves the tuplets out while the selection reaches beyond note cells", () => {
        // A subdivision is cut out of note cells, so a selection that also names a whole track piece cannot take
        // one. The card states that rule itself: the selection manager resolves to one granularity, so a mix is
        // handed to it directly, the way a restored or mixed-hit-test selection would be.
        const entries = [noteEntry(measure, noteStart), trackPieceEntry(track, measure)];
        const mixedSelection = {
            currentSelection: new Map(entries.map((entry, index) => {
                return [String(index), entry];
            })),
            hasSelection: true,
            replaceSelection: vi.fn(),
        } as unknown as SelectionManager;

        renderResult = render(
            <NoteToolbar
                dataModel={dataModel}
                selectionManager={mixedSelection}
                trackViewMode={TrackViewMode.Staff}
                entryMode={EditEntryMode.Overwrite}
            />,
        );

        expect(sectionLabels(renderResult)).toEqual([
            "Note style & technique", "Note value / duration", "Articulation",
        ]);
        expect(renderResult.container.querySelector(".subdivisionToolbar")).toBeNull();
    });

    it("carries the note tools for notes and note groups alone", () => {
        expect(NoteToolbar.carriesTools([noteEntry(measure, noteStart)])).toBe(true);
        expect(NoteToolbar.carriesTools([noteGroupEntry(measure, [measure.events[0]])])).toBe(true);

        expect(NoteToolbar.carriesTools([trackPieceEntry(track, measure)])).toBe(false);
        expect(NoteToolbar.carriesTools([measureEntry(measure)])).toBe(false);
        expect(NoteToolbar.carriesTools([trackEntry(track)])).toBe(false);
        expect(NoteToolbar.carriesTools([])).toBe(false);
    });
});
