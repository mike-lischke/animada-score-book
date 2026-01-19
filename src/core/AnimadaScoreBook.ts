/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { edit } from "./edit.js";
import { getLibrary } from "./Library.js";
import { Publisher } from "./Publisher.js";
import { applyArrangementSnapshot, createArrangementFromSnapshot } from "./serialisation/snapshot_appliers.js";
import type { EditCommand } from "./types/edit_commands.js";
import type { IAnimadaScoreBook, INoteStyle } from "./types/general.js";
import type { IArrangementSnapshot } from "./types/snapshots.js";
import { UndoRedoStack } from "./UndoRedoStack.js";

/**
 * Encapsulates the application-level score book state and operations:
 * - Holds the arrangement and instrument library
 * - Manages edit history via `UndoRedoStack`
 * - Publishes current-state changes for UI updates
 */
export class AnimadaScoreBook implements IAnimadaScoreBook {
    public readonly library = getLibrary();
    public readonly arrangement;
    private readonly undoRedoStack;
    private readonly currentStatePublisher = new Publisher();

    /**
     * Creates a new score book from an arrangement snapshot.
     *
     * @param arrangementSnapshot The snapshot to initialise the arrangement from.
     */
    public constructor(arrangementSnapshot: IArrangementSnapshot) {
        this.arrangement = createArrangementFromSnapshot(arrangementSnapshot);
        this.undoRedoStack = new UndoRedoStack(this.arrangement);
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
        }
    }

    /**
     * Reverts the most recent change if possible and publishes a current-state change.
     */
    public undo(): void {
        if (!this.undoRedoStack.canUndo) {
            return;
        }

        this.undoRedoStack.goBack();
        applyArrangementSnapshot(this.arrangement, this.undoRedoStack.currentState);
        this.currentStatePublisher.publish();
    }

    /**
     * Reapplies the next change if possible and publishes a current-state change.
     */
    public redo(): void {
        if (!this.undoRedoStack.canRedo) {
            return;
        }

        this.undoRedoStack.goForward();
        applyArrangementSnapshot(this.arrangement, this.undoRedoStack.currentState);
        this.currentStatePublisher.publish();
    }

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
}
