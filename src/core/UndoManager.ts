/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { edit } from "./edit.js";
import { FaviconDirtyService } from "./FavIconDirtyService.js";
import { Publisher } from "./Publisher.js";
import type { ScoreBookDataModel } from "./ScoreBookDataModel.js";
import type { EditCommand } from "./types/edit_commands.js";
import type { INoteStyle } from "./types/general.js";
import { UndoRedoStack } from "./UndoRedoStack.js";

/** Encapsulates the application-level undo/redo management. */
export class UndoManager {
    private readonly undoRedoStack;
    private readonly currentStatePublisher = new Publisher();

    /**
     * Creates a new score book from an arrangement snapshot.
     *
     * @param dataModel The data model containing the arrangement and instruments to manage.
     */
    public constructor(private dataModel: ScoreBookDataModel) {
        this.undoRedoStack = new UndoRedoStack(this.dataModel.arrangement!);
        this.updateDirtyState();
    }

    /**
     * Current arrangement snapshot, reflecting the latest title from the live arrangement.
     *
     * @returns The current `IArrangementSnapshot`.
     */
    public get currentState() {
        return this.undoRedoStack.currentState;
    }

    /**
     * Whether an undo is currently possible.
     *
     * @returns True if undo is available.
     */
    public get canUndo() {
        return this.undoRedoStack.canUndo;
    }

    /**
     * Whether a redo is currently possible.
     *
     * @returns True if redo is available.
     */
    public get canRedo() {
        return this.undoRedoStack.canRedo;
    }

    /**
     * Applies an edit to the arrangement and records it in history if anything changed.
     * Publishes a current-state change for UI updates.
     *
     * @param command The edit to apply.
     */
    public edit(command: EditCommand): void {
        const oldValue = this.extractOldValue(command);
        const anythingHasChanged = edit(command);
        if (anythingHasChanged) {
            this.undoRedoStack.handleEdit(command, oldValue);
            this.currentStatePublisher.publish();
            this.updateDirtyState();
        }
    }

    /**
     * Reverts the most recent change if possible and publishes a current-state change.
     */
    public undo = (): void => {
        if (!this.undoRedoStack.canUndo) {
            return;
        }

        this.undoRedoStack.goBack();
        this.dataModel.arrangement!.applyArrangementSnapshot(this.undoRedoStack.currentState,
            this.dataModel.instruments);
        this.currentStatePublisher.publish();
        this.updateDirtyState();
    };

    /**
     * Reapplies the next change if possible and publishes a current-state change.
     */
    public redo = (): void => {
        if (!this.undoRedoStack.canRedo) {
            return;
        }

        this.undoRedoStack.goForward();
        this.dataModel.arrangement!.applyArrangementSnapshot(this.undoRedoStack.currentState,
            this.dataModel.instruments);
        this.currentStatePublisher.publish();
        this.updateDirtyState();
    };

    /**
     * Publishers for UI subscriptions to state changes.
     *
     * @returns An object with publishers for `canUndo`, `canRedo`, and `currentState`.
     */
    public get topics() {
        return {
            canUndo: this.undoRedoStack.topics.canUndo,
            canRedo: this.undoRedoStack.topics.canRedo,
            currentState: this.currentStatePublisher,
        };
    }

    private extractOldValue(command: EditCommand): INoteStyle | undefined {
        const targetNote = command.type === "EditCommand_Note" ? command.note : undefined;

        return targetNote ? targetNote.noteStyle : undefined;
    }

    private updateDirtyState() {
        void FaviconDirtyService.setDirty(this.canUndo);
    }
}
