/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { UndoManager } from "../../src/core/UndoManager.js";
import { createInstrument } from "../unit-test-helpers.js";

describe("UndoManager subdivision invalidation", () => {
    let model: ScoreBookDataModel;
    let manager: UndoManager;

    beforeEach(() => {
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("tamborim", 0, 0)]);
        manager = new UndoManager(model);
    });

    afterEach(() => {
        manager.dispose();
    });

    it("reports no subdivision change for a plain edit", () => {
        model.setGridNote(model.arrangement!.tracks[0].id, 1, 0, "note");

        expect(manager.undo()).toBe(false);
    });

    it("reports a subdivision change when undoing and redoing a subdivision edit", () => {
        const track = model.arrangement!.tracks[0];

        model.replaceMeasureContent([{
            trackId: track.id,
            bar: 1,
            start: { numerator: 0, denominator: 1 },
            end: { numerator: 1, denominator: 4 },
            events: [
                { start: { numerator: 0, denominator: 12 }, duration: { numerator: 1, denominator: 12 } },
                { start: { numerator: 1, denominator: 12 }, duration: { numerator: 1, denominator: 12 } },
                { start: { numerator: 2, denominator: 12 }, duration: { numerator: 1, denominator: 12 } },
            ],
            subdivisions: [{ startIndex: 0, actual: 3, normal: 4, isTuplet: true }],
        }]);

        expect(manager.undo()).toBe(true);
        expect(manager.redo()).toBe(true);
    });
});
