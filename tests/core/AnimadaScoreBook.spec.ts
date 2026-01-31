/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import type { ISbDmInstrument, ISbDmNote } from "../../src/core/ScoreBookDataModel.js";
import type { EditCommand } from "../../src/core/types/edit_commands.js";
import type { IArrangementSnapshot } from "../../src/core/types/snapshots.js";
import { UndoManager } from "../../src/core/UndoManager.js";

vi.mock("../../src/core/edit.js", () => {
    const edit = vi.fn(() => {
        return true;
    });

    return { edit };
});

vi.mock("../../src/core/UndoRedoStack.js", () => {
    class TestPublisher {
        private subs: Array<(...args: unknown[]) => void> = [];

        public subscribe(cb: (...args: unknown[]) => void) {
            this.subs.push(cb);
        }

        public unsubscribe(cb: (...args: unknown[]) => void) {
            this.subs = this.subs.filter((s) => {
                return s !== cb;
            });
        }

        public publish(): void {
            this.subs.forEach((cb) => {
                cb();
            });
        }
    }

    const stackRef: { instance?: MockUndoRedoStack; } = {};
    class MockUndoRedoStack {
        public canUndo = false;
        public canRedo = false;
        public topics = { canUndo: new TestPublisher(), canRedo: new TestPublisher() };
        public currentState = { title: "Snapshot" } as unknown as IArrangementSnapshot;
        public handleEdit = vi.fn((_cmd: EditCommand, _old?: unknown) => {
            this.canUndo = true;
            this.topics.canUndo.publish();
        });
        public goBack = vi.fn(() => {
            this.canRedo = true;
            this.topics.canRedo.publish();
        });
        public goForward = vi.fn(() => {
            /* no-op */
        });
        public constructor(public arrangement: unknown) {
            stackRef.instance = this;
        }
    }

    return { UndoRedoStack: MockUndoRedoStack, stackRef };
});

interface UndoRedoMock {
    stackRef: {
        instance?: {
            canUndo: boolean;
            canRedo: boolean;
            handleEdit: ReturnType<typeof vi.fn>;
            goBack: ReturnType<typeof vi.fn>;
            goForward: ReturnType<typeof vi.fn>;
        };
    };
}

interface EditModuleMock { edit: ReturnType<typeof vi.fn>; }

const undoRedo = (
    await import("../../src/core/UndoRedoStack.js")
) as unknown as UndoRedoMock;
const editModule = (
    await import("../../src/core/edit.js")
) as unknown as EditModuleMock;

describe("AnimadaScoreBook", () => {
    const snapshot: IArrangementSnapshot = {
        title: "Initial",
        timeParams: {
            timeSignature: "4/4",
            tempo: 120,
            length: 1,
            pulse: "1/4",
            stepResolution: 8
        },
        tracks: []
    };

    const arrangement = Arrangement.fromSnapshot(snapshot, []);
    arrangement.applyArrangementSnapshot = vi.fn();

    let manager: UndoManager;
    beforeEach(() => {
        manager = new UndoManager(arrangement, []);
        // reset mocks
        vi.clearAllMocks();
        if (undoRedo.stackRef.instance) {
            undoRedo.stackRef.instance.canUndo = false;
            undoRedo.stackRef.instance.canRedo = false;
            undoRedo.stackRef.instance.handleEdit.mockClear();
            undoRedo.stackRef.instance.goBack.mockClear();
            undoRedo.stackRef.instance.goForward.mockClear();
        }
    });

    it("initialises with arrangement and library", () => {
        expect(manager.arrangement.title).toBe("Initial");
        expect(manager.canUndo).toBe(false);
        expect(manager.canRedo).toBe(false);
        expect(manager.currentState.title).toBe("Snapshot");
    });

    it("records edits that cause changes and publishes current state", () => {
        const publishSpy = vi.fn();
        manager.topics.currentState.subscribe(publishSpy);
        // Use a note edit to exercise oldValue extraction.
        const cmd: EditCommand = {
            type: "EditCommand_Note",
            note: { noteStyle: { id: "ns", audioBuffer: null, instrument: {} as ISbDmInstrument } } as ISbDmNote,
        };
        manager.edit(cmd);
        expect(editModule.edit).toHaveBeenCalledOnce();
        const stack1 = undoRedo.stackRef.instance;
        expect(stack1).toBeDefined();
        expect(stack1!.handleEdit).toHaveBeenCalledOnce();
        expect(publishSpy).toHaveBeenCalledOnce();
    });

    it("does not record when no changes happen", () => {
        editModule.edit.mockReturnValueOnce(false);
        const publishSpy = vi.fn();
        manager.topics.currentState.subscribe(publishSpy);
        const cmd: EditCommand = {
            type: "EditCommand_ArrangementTitle",
            arrangement: manager.arrangement,
            newTitle: "X"
        };
        manager.edit(cmd);
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it("undo applies snapshot when available", () => {
        manager.undo();
        const stack3 = undoRedo.stackRef.instance;
        expect(stack3).toBeDefined();
        expect(stack3!.goBack).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(arrangement.applyArrangementSnapshot).toHaveBeenCalled();
    });

    it("redo applies snapshot when available", () => {
        manager.redo();
        const stack4 = undoRedo.stackRef.instance;
        expect(stack4).toBeDefined();
        expect(stack4!.goForward).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(arrangement.applyArrangementSnapshot).toHaveBeenCalled();
    });
});
