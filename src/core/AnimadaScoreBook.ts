/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { edit } from "./edit.js";
import { getLibrary } from "./Library.js";
import { Publisher } from "./Publisher.js";
import { applyArrangementSnapshot, createArrangementFromSnapshot } from "./serialisation/snapshot_appliers.js";
import type { EditCommand } from "./types/edit_commands.js";
import type { IAnimadaScoreBook } from "./types/general.js";
import type { IArrangementSnapshot } from "./types/snapshots.js";
import type { INoteStyle } from "./types/general.js";
import { UndoRedoStack } from "./UndoRedoStack.js";

export const createAnimadaScoreBook = (arrangementSnapshot: IArrangementSnapshot): IAnimadaScoreBook => {
    const arrangement = createArrangementFromSnapshot(arrangementSnapshot);
    const undoRedoStack = new UndoRedoStack(arrangement);

    const extractOldValue = (command: EditCommand): INoteStyle | undefined => {
        const targetNote = command.type === "EditCommand_Note" ? command.note : undefined;
        if (targetNote) {
            return targetNote.noteStyle;
        }

        return undefined;
    };

    const currentStatePublisher = new Publisher();
    const library = getLibrary();

    return {
        library, arrangement,
        get currentState() {
            return undoRedoStack.currentState;
        },
        get canUndo() {
            return undoRedoStack.canUndo;
        },
        get canRedo() {
            return undoRedoStack.canRedo;
        },
        edit: (command: EditCommand) => {
            const oldValue = extractOldValue(command);
            const anythingHasChanged = edit(command);
            if (anythingHasChanged) {
                undoRedoStack.handleEdit(command, oldValue);
                currentStatePublisher.publish();
            }
        },
        undo: () => {
            if (!undoRedoStack.canUndo) {
                return;
            }

            undoRedoStack.goBack();
            applyArrangementSnapshot(arrangement, undoRedoStack.currentState);
            currentStatePublisher.publish();
        },
        redo: () => {
            if (!undoRedoStack.canRedo) {
                return;
            }

            undoRedoStack.goForward();
            applyArrangementSnapshot(arrangement, undoRedoStack.currentState);
            currentStatePublisher.publish();
        },
        topics: {
            canUndo: undoRedoStack.topics.canUndo,
            canRedo: undoRedoStack.topics.canRedo,
            currentState: currentStatePublisher
        }
    };
};
