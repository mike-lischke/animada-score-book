/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { edit } from "./edit.js";
import { createPublisher } from "./Publisher.js";
import { applyArrangementSnapshot, createArrangementFromSnapshot } from "./serialisation/snapshot_appliers.js";
import type { EditCommand } from "./types/edit_commands.js";
import type { IAnimadaScoreBook, ILibrary } from "./types/general.js";
import type { ArrangementSnapshot } from "./types/snapshots.js";
import { extractOldValue } from "./undo-redo-utils.js";
import { createUndoRedoStack } from "./UndoRedoStack.js";

export const createAnimadaScoreBook = (library: ILibrary,
    arrangementSnapshot: ArrangementSnapshot): IAnimadaScoreBook => {
    const arrangement = createArrangementFromSnapshot(arrangementSnapshot);
    const undoRedoStack = createUndoRedoStack(arrangement);

    const currentStatePublisher = createPublisher();

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
