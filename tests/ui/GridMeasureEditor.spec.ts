/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { GridMeasureEditor } from "../../src/ui/GridMeasureEditor.js";
import { SelectionGranularity, type ISelectionEntry } from "../../src/ui/selection-types.js";
import { createInstrument } from "../unit-test-helpers.js";

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
        editor = new GridMeasureEditor(model);
        mutatedCalls = 0;
        requisitions.register("arrangementMutated", mutationSpy);
    });

    afterEach(() => {
        requisitions.unregister("arrangementMutated", mutationSpy);
    });

    it("clears a single note", () => {
        const track = model.arrangement!.tracks[0];
        track.measures[0].steps[2].noteStyleId = "1";

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: track.id,
            startStep: 2,
            endStep: 2,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        expect(track.measures[0].steps[2].noteStyleId).toBeUndefined();
        expect(mutatedCalls).toBe(1);
    });

    it("clears a note group range", () => {
        const track = model.arrangement!.tracks[0];
        for (let i = 0; i < 4; i++) {
            track.measures[0].steps[i].noteStyleId = "1";
        }

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.NoteGroup,
            bar: 1,
            trackId: track.id,
            startStep: 1,
            endStep: 2,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        expect(track.measures[0].steps[0].noteStyleId).toBe("1");
        expect(track.measures[0].steps[1].noteStyleId).toBeUndefined();
        expect(track.measures[0].steps[2].noteStyleId).toBeUndefined();
        expect(track.measures[0].steps[3].noteStyleId).toBe("1");
    });

    it("clears a track piece (track × measure)", () => {
        const track = model.arrangement!.tracks[0];
        track.measures[0].steps[0].noteStyleId = "1";

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.TrackPiece,
            bar: 1,
            trackId: track.id,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        expect(track.measures[0].steps[0].noteStyleId).toBeUndefined();
    });

    it("clears a whole measure across all tracks", () => {
        for (const track of model.arrangement!.tracks) {
            track.measures[0].steps[0].noteStyleId = "1";
        }

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.Measure,
            bar: 1,
            trackId: model.arrangement!.tracks[0].id,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        for (const track of model.arrangement!.tracks) {
            expect(track.measures[0].steps[0].noteStyleId).toBeUndefined();
        }

        expect(mutatedCalls).toBe(1);
    });

    it("clears a whole track", () => {
        const track = model.arrangement!.tracks[0];
        track.measures[0].steps[0].noteStyleId = "1";

        const entry: ISelectionEntry = {
            granularity: SelectionGranularity.Track,
            bar: 1,
            trackId: track.id,
        };

        expect(editor.clearSelection([entry])).toBe(true);
        expect(track.measures[0].steps[0].noteStyleId).toBeUndefined();
    });
});
