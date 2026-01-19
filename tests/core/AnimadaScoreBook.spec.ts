/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnimadaScoreBook } from "../../src/core/AnimadaScoreBook.js";
import type { IArrangementSnapshot } from "../../src/core/types/snapshots.js";
import type { EditCommand } from "../../src/core/types/edit_commands.js";

// Mocks for dependencies used inside AnimadaScoreBook
vi.mock("../../src/core/serialisation/snapshot_appliers.js", () => {
    const applyCalls: unknown[][] = [];

    const applyArrangementSnapshot = vi.fn((arr, snap) => {
        applyCalls.push([arr, snap]);
    });

    const createArrangementFromSnapshot = vi.fn((_snap: IArrangementSnapshot) => {
        return {
            title: "Initial",
            timeParams: {
                subscribe: () => {
                    /* no-op */
                },
                unsubscribe: () => {
                    /* no-op */
                },
                isValid: () => {
                    return true;
                },
                timings: [],
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 8,
            }
        } as unknown as object;
    });

    return { applyArrangementSnapshot, createArrangementFromSnapshot, __applyCalls: applyCalls };
});

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

vi.mock("../../src/core/Library.js", () => {
    const getLibrary = vi.fn(() => {
        return { instrumentMetas: [], getInstrument: vi.fn(), load: vi.fn() };
    });

    return { getLibrary };
});

// Use mocked exports with static imports
// Bring in the mock internals for assertions via dynamic imports to access test-only exports
interface SnapshotAppliersMock {
    applyArrangementSnapshot: ReturnType<typeof vi.fn>;
    createArrangementFromSnapshot: ReturnType<typeof vi.fn>;
    applyCalls: unknown[][];
}

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

const snapshotAppliers = (
    await import("../../src/core/serialisation/snapshot_appliers.js")
) as unknown as SnapshotAppliersMock;
const undoRedo = (
    await import("../../src/core/UndoRedoStack.js")
) as unknown as UndoRedoMock;
const editModule = (
    await import("../../src/core/edit.js")
) as unknown as EditModuleMock;

describe("AnimadaScoreBook", () => {
    const snapshot: IArrangementSnapshot = {
        title: "Test",
        timeParams: {
            timeSignature: "4/4",
            tempo: 120,
            length: 1,
            pulse: "1/4",
            stepResolution: 8
        },
        tracks: []
    } as unknown as IArrangementSnapshot;

    let book: AnimadaScoreBook;
    beforeEach(() => {
        book = new AnimadaScoreBook(snapshot);
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
        expect(book.arrangement.title).toBe("Initial");
        expect(book.library).toBeDefined();
        expect(book.canUndo).toBe(false);
        expect(book.canRedo).toBe(false);
        expect(book.currentState.title).toBe("Snapshot");
    });

    it("records edits that cause changes and publishes current state", () => {
        const publishSpy = vi.fn();
        book.topics.currentState.subscribe(publishSpy);
        // Use a note edit to exercise oldValue extraction.
        const cmd = {
            type: "EditCommand_Note",
            note: { noteStyle: { id: "ns", audioBuffer: null, instrument: {} } }
        } as unknown as EditCommand;
        book.edit(cmd);
        expect(editModule.edit).toHaveBeenCalledOnce();
        const stack1 = undoRedo.stackRef.instance;
        expect(stack1).toBeDefined();
        expect(stack1!.handleEdit).toHaveBeenCalledOnce();
        expect(publishSpy).toHaveBeenCalledOnce();
    });

    it("does not record when no changes happen", () => {
        editModule.edit.mockReturnValueOnce(false);
        const publishSpy = vi.fn();
        book.topics.currentState.subscribe(publishSpy);
        const cmd = {
            type: "EditCommand_ArrangementTitle",
            arrangement: book.arrangement,
            newTitle: "X"
        } as unknown as EditCommand;
        book.edit(cmd);
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it("undo applies snapshot when available", () => {
        book.undo();
        const stack3 = undoRedo.stackRef.instance;
        expect(stack3).toBeDefined();
        expect(stack3!.goBack).toHaveBeenCalled();
        expect(snapshotAppliers.applyArrangementSnapshot).toHaveBeenCalled();
    });

    it("redo applies snapshot when available", () => {
        book.redo();
        const stack4 = undoRedo.stackRef.instance;
        expect(stack4).toBeDefined();
        expect(stack4!.goForward).toHaveBeenCalled();
        expect(snapshotAppliers.applyArrangementSnapshot).toHaveBeenCalled();
    });
});
