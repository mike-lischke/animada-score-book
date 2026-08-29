/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect, vi } from "vitest";

import { SbDmEntityType, type ISbDmArrangement, type ISbDmTimeParams } from "../../src/core/ScoreBookDataModel.js";
import { UndoRedoStack } from "../../src/core/UndoRedoStack.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";

// Mock getArrangementSnapshot to return a simple snapshot
vi.mock("../../src/core/serialisation/snapshots.js", () => {
    return {
        getArrangementSnapshot: (_arr: ISbDmArrangement) => {
            const snapshot: IArrangementSnapshot = {
                version: 2,
                title: _arr.title,
                timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "quarter", stepResolution: 16 },
                tracks: []
            };

            return snapshot;
        }
    };
});

const stubTimeParams: ISbDmTimeParams = {
    timeSignature: "4/4",
    tempo: 120,
    length: 1,
    pulse: "quarter",
    stepResolution: 16,
    isValid: () => {
        return true;
    },
    timings: [{ bar: 1, step: 1 }],
};

const makeArrangement = (title: string): ISbDmArrangement => {
    return {
        type: SbDmEntityType.Arrangement,
        id: 1,
        title,
        timeParams: stubTimeParams,
        tracks: [],
        mainVolume: 1,
        loop: false,
        useMetronome: false,
        countIn: false,
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        duplicateTrack: vi.fn(),
        applyArrangementSnapshot: vi.fn(),
        measureLabels: {},
    };
};

describe("UndoRedoStack (class)", () => {
    it("initializes with present state and no undo/redo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        expect(stack.canUndo).toBe(false);
        expect(stack.canRedo).toBe(false);
        expect(stack.currentState.title).toBe("A");
    });

    it("recordSnapshot adds to history and publishes canUndo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        requisitions.register("undoStackChanged", onCanUndo);

        stack.recordSnapshot();

        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(false);
        expect(onCanUndo).toHaveBeenCalled();
        requisitions.unregister("undoStackChanged", onCanUndo);
    });

    it("title change is tracked in history", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        requisitions.register("undoStackChanged", onCanUndo);

        arrangement.title = "B";
        stack.recordSnapshot();

        expect(stack.canUndo).toBe(true);
        expect(onCanUndo).toHaveBeenCalled();
        requisitions.unregister("undoStackChanged", onCanUndo);
    });

    it("goBack moves current to future and publishes canRedo/canUndo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onStackChanged = vi.fn();
        requisitions.register("undoStackChanged", onStackChanged);

        stack.recordSnapshot();
        expect(stack.canUndo).toBe(true);

        stack.goBack();
        expect(onStackChanged).toHaveBeenCalled();
        expect(stack.canUndo).toBe(false);
        expect(stack.canRedo).toBe(true);
        requisitions.unregister("undoStackChanged", onStackChanged);
    });

    it("goForward returns to present and publishes canUndo/canRedo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onStackChanged = vi.fn();
        requisitions.register("undoStackChanged", onStackChanged);

        stack.recordSnapshot();
        stack.goBack();
        expect(stack.canRedo).toBe(true);

        stack.goForward();
        expect(onStackChanged).toHaveBeenCalled();
        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(false);
        requisitions.unregister("undoStackChanged", onStackChanged);
    });

    it("recordSnapshot after undo clears future and publishes canRedo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanRedo = vi.fn();
        requisitions.register("undoStackChanged", onCanRedo);

        stack.recordSnapshot();
        stack.goBack();
        expect(stack.canRedo).toBe(true);

        stack.recordSnapshot();
        expect(stack.canRedo).toBe(false);
        expect(onCanRedo).toHaveBeenCalled();
        requisitions.unregister("undoStackChanged", onCanRedo);
    });

    it("currentState title reflects arrangement.title", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        expect(stack.currentState.title).toBe("A");
    });

    it("reset drops history and restores the baseline as the current state", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onStackChanged = vi.fn();
        requisitions.register("undoStackChanged", onStackChanged);

        stack.recordSnapshot();
        arrangement.title = "B";
        stack.recordSnapshot();
        stack.goBack();
        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(true);

        stack.reset();

        expect(stack.canUndo).toBe(false);
        expect(stack.canRedo).toBe(false);
        expect(stack.currentState.title).toBe("A");
        expect(onStackChanged).toHaveBeenCalled();
        requisitions.unregister("undoStackChanged", onStackChanged);
    });
});
