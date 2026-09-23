/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { Articulation } from "../core/articulation.js";
import { NoteLength, type INoteValue } from "../core/rest-notation.js";
import { requisitions, type ISubdivisionCreationRequest } from "../supplement/Requisitions.js";
import type { MeasureEditor } from "./MeasureEditor.js";
import type { ISelectionDelta } from "./SelectionSerializer.js";

const noteLengthShortcuts = [
    NoteLength.Whole,
    NoteLength.Half,
    NoteLength.Quarter,
    NoteLength.Eighth,
    NoteLength.Sixteenth,
    NoteLength.ThirtySecond,
];

/** Where a long press started, to tell a press from a drag. */
interface ILongPressOrigin {
    pointerId: number;
    x: number;
    y: number;
}

/**
 * Translates user input into actions of the active measure editor (ADR-0005): pointer and key events
 * become editor actions, and the requisitions of the toolbars are forwarded. The cursor, the entry
 * values and every position live in the editor of the view the user works in.
 */
export class TrackViewerInputController {
    /**
     * The editor that executes the input: the one of the view the user works in. The app reports it
     * whenever the view mode changes, so the controller never branches on the view mode itself.
     */
    public activeEditor?: MeasureEditor;

    private static readonly longPressDuration = 500;
    private static readonly longPressMoveTolerance = 10;

    private longPressTimer?: ReturnType<typeof setTimeout>;
    private longPressOrigin?: ILongPressOrigin;

    public constructor(private readonly eventContainer: HTMLElement) {
    }

    public attach(): void {
        this.eventContainer.addEventListener("pointerdown", this.handlePointerDown);
        this.eventContainer.addEventListener("pointerup", this.handlePointerUp);
        this.eventContainer.addEventListener("pointercancel", this.handlePointerCancel);
        this.eventContainer.addEventListener("pointermove", this.handlePointerMove);
        this.eventContainer.addEventListener("contextmenu", this.handleContextMenu);
        this.eventContainer.addEventListener("keydown", this.handleKeyDown);
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("selectionDeleteRequested", this.handleSelectionDeleteRequested);
        requisitions.register("noteEntryRequested", this.handleNoteEntryRequested);
        requisitions.register("restEntryRequested", this.handleRestEntryRequested);
        requisitions.register("subdivisionCreationRequested", this.handleSubdivisionCreationRequested);
        requisitions.register("noteLengthChanged", this.handleNoteLengthChanged);
        requisitions.register("articulationChanged", this.handleArticulationChanged);
    }

    public dispose(): void {
        this.eventContainer.removeEventListener("pointerdown", this.handlePointerDown);
        this.eventContainer.removeEventListener("pointerup", this.handlePointerUp);
        this.eventContainer.removeEventListener("pointercancel", this.handlePointerCancel);
        this.eventContainer.removeEventListener("pointermove", this.handlePointerMove);
        this.eventContainer.removeEventListener("contextmenu", this.handleContextMenu);
        this.eventContainer.removeEventListener("keydown", this.handleKeyDown);
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("selectionDeleteRequested", this.handleSelectionDeleteRequested);
        requisitions.unregister("noteEntryRequested", this.handleNoteEntryRequested);
        requisitions.unregister("restEntryRequested", this.handleRestEntryRequested);
        requisitions.unregister("subdivisionCreationRequested", this.handleSubdivisionCreationRequested);
        requisitions.unregister("noteLengthChanged", this.handleNoteLengthChanged);
        requisitions.unregister("articulationChanged", this.handleArticulationChanged);
        this.clearLongPress();
        this.activeEditor = undefined;
    }

    private handlePointerDown = (event: PointerEvent): void => {
        const editor = this.activeEditor;
        if (!editor?.hitTest(event.target)) {
            return;
        }

        if (event.pointerType === "mouse" && event.button === 2 && editor.hasNoteActionMenu) {
            editor.openNoteActionMenu();
            event.preventDefault();

            return;
        }

        if (event.pointerType === "touch" && editor.hasNoteActionMenu) {
            this.startLongPress(event);
        }
    };

    private handlePointerUp = (event: PointerEvent): void => {
        this.clearLongPress(event.pointerId);
    };

    private handlePointerCancel = (event: PointerEvent): void => {
        this.clearLongPress(event.pointerId);
    };

    private handlePointerMove = (event: PointerEvent): void => {
        const origin = this.longPressOrigin;
        if (origin?.pointerId !== event.pointerId) {
            return;
        }

        const movedX = Math.abs(event.clientX - origin.x);
        const movedY = Math.abs(event.clientY - origin.y);
        if (movedX > TrackViewerInputController.longPressMoveTolerance
            || movedY > TrackViewerInputController.longPressMoveTolerance) {
            this.clearLongPress(event.pointerId);
        }
    };

    private handleContextMenu = (event: MouseEvent): void => {
        const editor = this.activeEditor;
        if (editor?.hasNoteActionMenu && editor.hitTest(event.target)) {
            event.preventDefault();
        }
    };

    private handleKeyDown = (event: KeyboardEvent): void => {
        const editor = this.activeEditor;
        if (!editor?.editMode) {
            return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
            const handled = event.key === "Backspace" ? editor.deleteBackward() : editor.deleteForward();
            if (handled) {
                event.preventDefault();
            }

            return;
        }

        const shortcutIndex = Number.parseInt(event.key, 10) - 1;

        if ((event.altKey || event.metaKey) && !event.ctrlKey && !event.shiftKey) {
            if (event.key === ".") {
                this.toggleEntryDot(event, editor);

                return;
            }

            const value: INoteValue = {
                length: noteLengthShortcuts[shortcutIndex],
                dotted: editor.entryNoteValue.dotted,
            };
            const applies = shortcutIndex >= 0 && shortcutIndex < noteLengthShortcuts.length
                && editor.canApplyNoteLength(value);
            if (applies) {
                void requisitions.execute("noteLengthChanged", value);
                event.preventDefault();

                return;
            }
        }

        if (!event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
            if (event.key === "0") {
                if (editor.enterRest()) {
                    event.preventDefault();
                }

                return;
            }

            const styles = editor.noteStylesAtCursor();
            if (shortcutIndex >= 0 && shortcutIndex < styles.length) {
                editor.enterNote(styles[shortcutIndex].id);
                event.preventDefault();

                return;
            }
        }
    };

    private handleSelectionChanged = (delta: ISelectionDelta): Promise<boolean> => {
        this.activeEditor?.cursorFromSelection(delta);

        return Promise.resolve(true);
    };

    private handleSelectionDeleteRequested = (): Promise<boolean> => {
        return Promise.resolve(this.activeEditor?.deleteSelectionRequested() ?? false);
    };

    private handleNoteEntryRequested = (noteStyleId: string): Promise<boolean> => {
        return Promise.resolve(this.activeEditor?.enterNote(noteStyleId) ?? false);
    };

    private handleRestEntryRequested = (): Promise<boolean> => {
        return Promise.resolve(this.activeEditor?.enterRest() ?? false);
    };

    private handleSubdivisionCreationRequested = (request: ISubdivisionCreationRequest): Promise<boolean> => {
        return Promise.resolve(this.activeEditor?.createSubdivision(request) ?? false);
    };

    private handleNoteLengthChanged = (value: INoteValue): Promise<boolean> => {
        this.activeEditor?.setNoteLength(value);

        return Promise.resolve(true);
    };

    private handleArticulationChanged = (articulation: Articulation): Promise<boolean> => {
        this.activeEditor?.setArticulation(articulation);

        return Promise.resolve(true);
    };

    /**
     * Switches the augmentation dot of the note value used for entry and applies the result to the
     * selection. Only a value the view can represent is published.
     *
     * @param event The key event, to prevent the default action when the shortcut applies.
     * @param editor The editor that executes the change.
     */
    private toggleEntryDot(event: KeyboardEvent, editor: MeasureEditor): void {
        const entry = editor.entryNoteValue;
        const value: INoteValue = { length: entry.length, dotted: !entry.dotted };

        if (!editor.canApplyNoteLength(value)) {
            return;
        }

        void requisitions.execute("noteLengthChanged", value);
        event.preventDefault();
    }

    private startLongPress(event: PointerEvent): void {
        this.clearLongPress();
        this.longPressOrigin = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        this.longPressTimer = setTimeout(() => {
            this.longPressTimer = undefined;
            this.longPressOrigin = undefined;
            this.activeEditor?.openNoteActionMenu();
        }, TrackViewerInputController.longPressDuration);
    }

    private clearLongPress(pointerId?: number): void {
        if (pointerId !== undefined && this.longPressOrigin?.pointerId !== pointerId) {
            return;
        }

        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }

        this.longPressOrigin = undefined;
    }
}
