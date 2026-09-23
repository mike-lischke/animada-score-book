/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Articulation } from "../../src/core/articulation.js";
import { NoteLength, type INoteValue } from "../../src/core/rest-notation.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import type { MeasureEditor } from "../../src/ui/MeasureEditor.js";
import { TrackViewerInputController } from "../../src/ui/TrackViewerInputController.js";

/**
 * Builds a stand-in for the active editor that records every action the input sends it.
 *
 * @returns The editor stand-in.
 */
const createEditorStub = () => {
    return {
        editMode: true,
        hasNoteActionMenu: true,
        entryNoteValue: { length: NoteLength.Quarter, dotted: false },
        hitTest: vi.fn((): boolean => {
            return true;
        }),
        openNoteActionMenu: vi.fn(),
        noteStylesAtCursor: vi.fn((): IAudioData[] => {
            return [{ id: "1" } as IAudioData, { id: "2" } as IAudioData];
        }),
        canApplyNoteLength: vi.fn((): boolean => {
            return true;
        }),
        enterNote: vi.fn((): boolean => {
            return true;
        }),
        enterRest: vi.fn((): boolean => {
            return true;
        }),
        deleteBackward: vi.fn((): boolean => {
            return true;
        }),
        deleteForward: vi.fn((): boolean => {
            return true;
        }),
        createSubdivision: vi.fn((): boolean => {
            return true;
        }),
        deleteSelectionRequested: vi.fn((): boolean => {
            return true;
        }),
        cursorFromSelection: vi.fn(),
        setNoteLength: vi.fn(),
        setArticulation: vi.fn(),
    };
};

type EditorStub = ReturnType<typeof createEditorStub>;

describe.sequential("TrackViewerInputController", () => {
    let container: HTMLElement;
    let controller: TrackViewerInputController;
    let editor: EditorStub;

    beforeEach(() => {
        vi.restoreAllMocks();
        container = document.createElement("div");
        editor = createEditorStub();
        controller = new TrackViewerInputController(container);
        controller.activeEditor = editor as unknown as MeasureEditor;
        controller.attach();
    });

    afterEach(() => {
        controller.dispose();
    });

    /**
     * Sends a key press to the container.
     *
     * @param key The key to press.
     * @param altKey Whether the alt key is held while pressing.
     *
     * @returns The dispatched event.
     */
    const press = (key: string, altKey = false): KeyboardEvent => {
        const event = new KeyboardEvent("keydown", { key, altKey, bubbles: true, cancelable: true });
        container.dispatchEvent(event);

        return event;
    };

    it("writes the note style of the pressed digit", () => {
        const event = press("2");

        expect(editor.enterNote).toHaveBeenCalledWith("2");
        expect(event.defaultPrevented).toBe(true);
    });

    it("writes a rest for the zero key", () => {
        press("0");

        expect(editor.enterRest).toHaveBeenCalledTimes(1);
    });

    it("removes the content for the delete keys", () => {
        press("Delete");
        press("Backspace");

        expect(editor.deleteForward).toHaveBeenCalledTimes(1);
        expect(editor.deleteBackward).toHaveBeenCalledTimes(1);
    });

    it("publishes the note length of an alt digit", async () => {
        const lengths: INoteValue[] = [];
        const listener = (value: INoteValue): Promise<boolean> => {
            lengths.push(value);

            return Promise.resolve(true);
        };

        requisitions.register("noteLengthChanged", listener);

        const event = press("2", true);

        await expect.poll(() => {
            return lengths.length;
        }).toBe(1);

        expect(lengths[0]).toEqual({ length: NoteLength.Half, dotted: false });
        expect(event.defaultPrevented).toBe(true);

        requisitions.unregister("noteLengthChanged", listener);
    });

    it("keeps the entry value when the view cannot represent it", () => {
        editor.canApplyNoteLength.mockReturnValue(false);
        const listener = vi.fn((): Promise<boolean> => {
            return Promise.resolve(true);
        });
        requisitions.register("noteLengthChanged", listener);

        const event = press("2", true);

        expect(listener).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);

        requisitions.unregister("noteLengthChanged", listener);
    });

    it("ignores input outside the edit mode", () => {
        editor.editMode = false;

        press("1");
        press("Delete");

        expect(editor.enterNote).not.toHaveBeenCalled();
        expect(editor.deleteForward).not.toHaveBeenCalled();
    });

    it("forwards the requests of the toolbars to the active editor", async () => {
        await expect(requisitions.execute("noteEntryRequested", "1")).resolves.toBe(true);
        await expect(requisitions.execute("restEntryRequested", undefined)).resolves.toBe(true);
        await expect(requisitions.execute("subdivisionCreationRequested", { actual: 3, normal: 2 }))
            .resolves.toBe(true);
        await expect(requisitions.execute("selectionDeleteRequested", undefined)).resolves.toBe(true);
        await expect(requisitions.execute("articulationChanged", Articulation.Accent)).resolves.toBe(true);
        await expect(requisitions.execute("noteLengthChanged", { length: NoteLength.Quarter, dotted: true }))
            .resolves.toBe(true);

        expect(editor.enterNote).toHaveBeenCalledWith("1");
        expect(editor.enterRest).toHaveBeenCalledTimes(1);
        expect(editor.createSubdivision).toHaveBeenCalledWith({ actual: 3, normal: 2 });
        expect(editor.deleteSelectionRequested).toHaveBeenCalledTimes(1);
        expect(editor.setArticulation).toHaveBeenCalledWith(Articulation.Accent);
        expect(editor.setNoteLength).toHaveBeenCalledWith({ length: NoteLength.Quarter, dotted: true });
    });

    it("follows a selection change", async () => {
        await requisitions.execute("selectionChanged", { added: [], removed: [] });

        expect(editor.cursorFromSelection).toHaveBeenCalledWith({ added: [], removed: [] });
    });
});
