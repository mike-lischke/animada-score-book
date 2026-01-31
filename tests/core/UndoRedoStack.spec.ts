/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { UndoRedoStack } from "../../src/core/UndoRedoStack.js";
import type { IArrangementView, ITimeParamsView } from "../../src/core/types/general.js";
import type { EditCommand, EditCommand_ArrangementTitle } from "../../src/core/types/edit_commands.js";

// Mock getArrangementSnapshot to return a simple snapshot
vi.mock("../../src/core/serialisation/snapshots.js", () => {
    return {
        getArrangementSnapshot: (_arr: IArrangementView) => {
            return {
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
        }
    };
});

const stubTimeParams: ITimeParamsView = {
    timeSignature: "4/4",
    tempo: 120,
    length: 1,
    pulse: "quarter",
    stepResolution: 16,
    isValid: () => {
        return true;
    },
    timings: [{ bar: 1, step: 1 }],
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
};

const makeArrangement = (title: string): IArrangementView => {
    return {
        title,
        timeParams: stubTimeParams,
        tracks: [],
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
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
        stack.topics.canUndo.subscribe(onCanUndo);

        const cmd: EditCommand = { type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 130 };
        stack.handleEdit(cmd);

        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(false);
        expect(onCanUndo).toHaveBeenCalled();
    });

    it("title change is ignored in history", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        stack.topics.canUndo.subscribe(onCanUndo);

        const titleCmd: EditCommand_ArrangementTitle = {
            type: "EditCommand_ArrangementTitle",
            arrangement,
            newTitle: "B"
        };
        stack.handleEdit(titleCmd);

        expect(stack.canUndo).toBe(false);
        expect(onCanUndo).not.toHaveBeenCalled();
    });

    it("goBack moves current to future and publishes canRedo/canUndo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        const onCanRedo = vi.fn();
        stack.topics.canUndo.subscribe(onCanUndo);
        stack.topics.canRedo.subscribe(onCanRedo);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 130 });
        expect(stack.canUndo).toBe(true);

        stack.goBack();
        expect(onCanUndo).toHaveBeenCalled();
        expect(onCanRedo).toHaveBeenCalled();
        expect(stack.canUndo).toBe(false);
        expect(stack.canRedo).toBe(true);
    });

    it("goForward returns to present and publishes canUndo/canRedo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanUndo = vi.fn();
        const onCanRedo = vi.fn();
        stack.topics.canUndo.subscribe(onCanUndo);
        stack.topics.canRedo.subscribe(onCanRedo);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 130 });
        stack.goBack();
        expect(stack.canRedo).toBe(true);

        stack.goForward();
        expect(onCanUndo).toHaveBeenCalled();
        expect(onCanRedo).toHaveBeenCalled();
        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(false);
    });

    it("handleEdit after undo clears future and publishes canRedo", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        const onCanRedo = vi.fn();
        stack.topics.canRedo.subscribe(onCanRedo);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 125 });
        stack.goBack();
        expect(stack.canRedo).toBe(true);

        stack.handleEdit({ type: "EditCommand_TimeParamsTempo", timeParams: stubTimeParams, tempo: 140 });
        expect(stack.canRedo).toBe(false);
        expect(onCanRedo).toHaveBeenCalled();
    });

    it("currentState title reflects arrangement.title", () => {
        const arrangement = makeArrangement("A");
        const stack = new UndoRedoStack(arrangement);
        expect(stack.currentState.title).toBe("A");
    });
});
