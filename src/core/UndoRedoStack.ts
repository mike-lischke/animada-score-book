/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import { getArrangementSnapshot } from "./serialisation/snapshots.js";
import type { EditCommand, EditCommand_ArrangementTitle, EditCommand_Note } from "./types/edit_commands.js";
import type { IArrangementSnapshot, INoteStyle, ISubscribable } from "./types/general.js";
import type { ISbDmArrangement } from "./ScoreBookDataModel.js";
import { exists } from "./utils.js";

export interface IHistoryState {
    arrangementSnapshot: IArrangementSnapshot;
    lastCommand?: EditCommand;
    oldValue?: INoteStyle;
    timestamp: number;
}

/**
 * Manages undo/redo history for an arrangement.
 *
 * - Stores a timeline of arrangement snapshots as `past` and `future`.
 * - Publishes when `canUndo`/`canRedo` changes for UI controls.
 * - Ignores `EditCommand_ArrangementTitle` changes (title is always read live).
 * - Squashes rapid note-style cycling via a deferred timeout to keep history clean.
 */
export class UndoRedoStack {
    private readonly canUndoPublisher = new Publisher();
    private readonly canRedoPublisher = new Publisher();

    private past: IHistoryState[];
    private future: IHistoryState[] = [];
    private queuedSquashTimeout?: ReturnType<typeof setTimeout>;
    private squashIsQueued = false;
    private readonly lookBackTime = 180_000; // 3 minutes
    private readonly noteCycleTime = 2000; // 2 seconds

    /**
     * Creates a new undo/redo stack bound to an arrangement.
     * Initializes history with the current arrangement snapshot as the present state.
     *
     * @param arrangementView The arrangement to track and snapshot.
     */
    public constructor(private readonly arrangementView: Readonly<ISbDmArrangement>) {
        // Past must always contain at least one element, which is the present state
        // We initialise it with edit-command {}, which is meant as an EditCommand_LoadPage
        this.past = [this.getNewHistoryState(this.arrangementView)];
    }

    /**
     * Whether there exists at least one prior history state to revert to.
     *
     * @returns True if undo is possible, otherwise false.
     */
    public get canUndo(): boolean {
        return this.past.length > 1;
    }

    /**
     * Whether there exists at least one future history state to advance to.
     *
     * @returns True if redo is possible, otherwise false.
     */
    public get canRedo(): boolean {
        return this.future.length > 0;
    }

    /**
     * The current arrangement snapshot for applying state (e.g., after undo/redo).
     * The snapshot's `title` is always taken from the live arrangement to avoid title edits in history.
     *
     * @returns The current `IArrangementSnapshot` including the live title.
     */
    public get currentState(): IArrangementSnapshot {
        return {
            ...this.past[this.past.length - 1].arrangementSnapshot,
            title: this.arrangementView.title // Title is ignored in undo/redo, so we just pull the current title
        };
    }

    /**
     * Records an edit into history and updates undo/redo availability.
     * Title changes are ignored and do not create history entries.
     * Clears the `future` on any new edit and queues a squash for rapid note-style cycling.
     *
     * @param command The edit that was applied.
     * @param oldValue Optional note-style being replaced, used by squash heuristics.
     */
    public handleEdit(command: EditCommand, oldValue?: INoteStyle): void {
        if (exists((command as EditCommand_ArrangementTitle).newTitle)) {
            return; // Title is ignored in undo/redo, so we don't react to it changing at all
        }

        this.past.push(this.getNewHistoryState(this.arrangementView, command, oldValue));

        if (this.future.length) {
            this.future.splice(0);
            this.canRedoPublisher.publish(); // No longer anything to redo, the future has been deleted
        }

        if (this.past.length === 2) {
            this.canUndoPublisher.publish();
        } // Used to be 1, so now we have a past to return to

        this.queueStackSquash();
    }

    /**
     * Moves the current history state into `future` (undo) and updates publishers.
     * Re-queues squash if a squash was already pending.
     */
    public goBack(): void {
        if (this.past.length < 2) {
            return;
        }

        this.future.push(this.past.pop()!);

        if (this.past.length === 1) {
            this.canUndoPublisher.publish();
        } // Reached the beginning of history, so can't go back any more
        if (this.future.length === 1) {
            this.canRedoPublisher.publish();
        } // Didn't used to have a future, now we do

        // We don't want to simplify history in the middle of undoing some stuff
        // So if a squash is queued, we push it back. But if not, we wouldn't want to queue it for no reason
        if (this.squashIsQueued) {
            this.queueStackSquash();
        }
    }

    /**
     * Moves the next `future` state back into `past` (redo) and updates publishers.
     */
    public goForward(): void {
        if (this.future.length === 0) {
            return;
        }

        this.past.push(this.future.pop()!);

        if (this.past.length === 2) {
            this.canUndoPublisher.publish();
        } // Used to be 1, so now we have a past to return to
        if (this.future.length === 0) {
            this.canRedoPublisher.publish();
        } // We've reached the end of the future

        // We may have hit undo a bunch before squashing
        this.queueStackSquash();
    }

    /**
     * Exposes publishers to subscribe to changes in undo/redo availability.
     *
     * @returns An object with `canUndo` and `canRedo` publishers.
     */
    public get topics(): { canUndo: ISubscribable; canRedo: ISubscribable; } {
        return {
            canUndo: this.canUndoPublisher,
            canRedo: this.canRedoPublisher,
        };
    }

    /**
     * Defers a squash of rapid note-style cycling edits to keep history compact.
     * Replaces any pending squash with a new one, running after ~2.5 seconds of inactivity.
     */
    private queueStackSquash(): void {
        clearTimeout(this.queuedSquashTimeout);
        this.queuedSquashTimeout = setTimeout(() => {
            this.squashRecentNoteCycling(this.past);
            this.squashIsQueued = false;
        }, 2500);
        this.squashIsQueued = true;
    }

    private isNoteCommand(command: EditCommand | undefined): command is EditCommand_Note {
        return !!command && command.type === "EditCommand_Note";
    }

    private getNewHistoryState(arrangementView: Readonly<ISbDmArrangement>, lastCommand?: EditCommand,
        oldValue?: INoteStyle): IHistoryState {
        return {
            arrangementSnapshot: getArrangementSnapshot(arrangementView),
            lastCommand,
            oldValue,
            timestamp: Date.now()
        };
    }

    // Squash recent note-style cycling to keep history compact.
    private squashRecentNoteCycling(history: IHistoryState[]): void {
        for (const stack of this.findRecentNoteCycleStacks(history)) {
            if (this.noteCycleStackCausedChange(history, stack)) {
                this.squash(history, stack, "leave last element");
            } else if (stack.start !== 1) {
                // Nothing changed, but it's the first thing in history. Don't squash the initial state.
                this.squash(history, stack, "obliterate");
            }
        }
    }

    // Must return stacks in reverse order, and stacks must be 2 or more elements
    private findRecentNoteCycleStacks(history: IHistoryState[]): Array<{ start: number; distance: number; }> {
        const noteCycleStacks: Array<{ start: number; distance: number; }> = [];
        const currentTime = Date.now();
        let historyIndex = history.length - 1;

        // A note-cycle-stack is at least 2 elements long
        while (historyIndex > 1) {
            const historyEntry = history[historyIndex];

            // Only look a little ways back in time
            if (currentTime - historyEntry.timestamp > this.lookBackTime) {
                break;
            }

            // Check if this command was a note-cycle command
            const targetNote = historyEntry.lastCommand?.type === "EditCommand_Note"
                ? historyEntry.lastCommand.note
                : undefined;
            if (targetNote) {
                // Search for the bottom of the stack
                const start = this.findBottomOfStack(history, historyIndex);
                const distance = historyIndex - start;

                // Require at least two clicks to consider this for squashing
                if (distance > 0) {
                    noteCycleStacks.push({ start, distance });
                }
                historyIndex = start - 1;
            } else {
                historyIndex--;
            }
        }

        return noteCycleStacks;
    }

    // Precondition: This really is the top of a cycle stack
    private findBottomOfStack(history: IHistoryState[], searchStart: number): number {
        const topCommand = history[searchStart].lastCommand;
        if (!this.isNoteCommand(topCommand)) {
            return searchStart;
        }
        const stackNote = topCommand.note;
        let searchIndex = searchStart - 1;

        while (searchIndex >= 0) {
            const historyEntry = history[searchIndex];
            const command = historyEntry.lastCommand;
            if (!this.isNoteCommand(command)) {
                break;
            }
            const targetNoteAtIndex = command.note;
            if (targetNoteAtIndex !== stackNote) {
                break;
            }

            const timeBetweenCommands = history[searchIndex + 1].timestamp - historyEntry.timestamp;
            if (timeBetweenCommands > this.noteCycleTime) {
                break;
            }

            searchIndex--;
        }

        return searchIndex + 1;
    }

    private noteCycleStackCausedChange(history: IHistoryState[], stack: { start: number; distance: number; }): boolean {
        const startNoteStyle = history[stack.start].oldValue;
        const endCommand = history[stack.start + stack.distance].lastCommand;
        const endNoteStyle = this.isNoteCommand(endCommand) ? endCommand.noteStyle : undefined;

        return startNoteStyle !== endNoteStyle;
    }

    private squash(history: IHistoryState[], stack: { start: number; distance: number; },
        mode: "leave last element" | "obliterate"): void {
        switch (mode) {
            case "leave last element":
                history.splice(stack.start, stack.distance);
                break;
            case "obliterate":
                history.splice(stack.start, stack.distance + 1);
        }
    }
}
