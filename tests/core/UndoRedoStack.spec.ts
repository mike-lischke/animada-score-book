/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { SbDmEntityType, type ISbDmArrangement, type ISbDmTimeParams } from "../../src/core/ScoreBookDataModel.js";
import { UndoRedoStack } from "../../src/core/UndoRedoStack.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import type { EditCommand, EditCommand_ArrangementTitle } from "../../src/core/types/edit_commands.js";

// Mock getArrangementSnapshot to return a simple snapshot
vi.mock("../../src/core/serialisation/snapshots.js", () => {
    return {
        getArrangementSnapshot: (_arr: ISbDmArrangement) => {
            const snapshot: IArrangementSnapshot = {
                version: 2,
                title: _arr.title,
                timeParams: {
                    timeSignature: "4/4",
                    tempo: 120,
                    length: 1,
                    pulse: "quarter",
                    stepResolution: 16,
                },
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
        applyArrangementSnapshot: vi.fn(),
        measureLabels: {},
    };
};

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe("UndoRedoStack (class)", () => {
    it("initializes with present state and no undo/redo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        expect(stack.canUndo).toBe(false);
        expect(stack.canRedo).toBe(false);
        expect(stack.currentState.title).toBe("A");
    });

    it("handleEdit adds to history and publishes canUndo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        requisitions.register("canUndoChanged", onCanUndo);

        const cmd: EditCommand = { type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 130 };
        stack.handleEdit(cmd);

        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(false);
        expect(onCanUndo).toHaveBeenCalled();
        requisitions.unregister("canUndoChanged", onCanUndo);
    });

    it("title change is ignored in history", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        requisitions.register("canUndoChanged", onCanUndo);

        const titleCmd: EditCommand_ArrangementTitle = {
            type: "EditCommand_ArrangementTitle",
            arrangement,
            newTitle: "B"
        };
        stack.handleEdit(titleCmd);

        expect(stack.canUndo).toBe(false);
        expect(onCanUndo).not.toHaveBeenCalled();
        requisitions.unregister("canUndoChanged", onCanUndo);
    });

    it("goBack moves current to future and publishes canRedo/canUndo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        const onCanRedo = vi.fn();
        requisitions.register("canUndoChanged", onCanUndo);
        requisitions.register("canRedoChanged", onCanRedo);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 130 });
        expect(stack.canUndo).toBe(true);

        stack.goBack();
        expect(onCanUndo).toHaveBeenCalled();
        expect(onCanRedo).toHaveBeenCalled();
        expect(stack.canUndo).toBe(false);
        expect(stack.canRedo).toBe(true);
        requisitions.unregister("canUndoChanged", onCanUndo);
        requisitions.unregister("canRedoChanged", onCanRedo);
    });

    it("goForward returns to present and publishes canUndo/canRedo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        const onCanRedo = vi.fn();
        requisitions.register("canUndoChanged", onCanUndo);
        requisitions.register("canRedoChanged", onCanRedo);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 130 });
        stack.goBack();
        expect(stack.canRedo).toBe(true);

        stack.goForward();
        expect(onCanUndo).toHaveBeenCalled();
        expect(onCanRedo).toHaveBeenCalled();
        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(false);
        requisitions.unregister("canUndoChanged", onCanUndo);
        requisitions.unregister("canRedoChanged", onCanRedo);
    });

    it("handleEdit after undo clears future and publishes canRedo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanRedo = vi.fn();
        requisitions.register("canRedoChanged", onCanRedo);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 125 });
        stack.goBack();
        expect(stack.canRedo).toBe(true);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 140 });
        expect(stack.canRedo).toBe(false);
        expect(onCanRedo).toHaveBeenCalled();
        requisitions.unregister("canRedoChanged", onCanRedo);
    });

    it("currentState title reflects arrangement.title", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        expect(stack.currentState.title).toBe("A");
    });
});
