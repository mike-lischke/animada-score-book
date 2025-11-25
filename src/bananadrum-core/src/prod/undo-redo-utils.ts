/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { EditCommand, EditCommand_Note } from "./types/edit_commands.js";
import type { NoteStyle } from "./types/general.js";
import type { HistoryState } from "./UndoRedoStack.js";

interface NoteCycleStack {
    start: number;
    distance: number; // distance = endIndex - startIndex. It is like 'length', but exclusive
}

const lookbackTime = 180_000; // 3 minutes
const noteCycleTime = 2000; // 2 seconds

// Currently the only purpose of this is to track what NoteStyle a Note had before the user cycled it
export const extractOldValue = (command: EditCommand): NoteStyle | undefined => {
    const targetNote = command.type === "EditCommand_Note" ? command.note : undefined;
    if (targetNote) {
        return targetNote.noteStyle;
    }

    return undefined;
};

// We look back into recent history, and "squash" any sequences of commands where the user was just cycling
// a single note. We only do this after a reasonable delay, so the user probably doesn't want to undo all those clicks.
// They want to undo the entire change to that note.
//
// There are some subtleties:
// If the note-cycle-stack didn't actually cause any changes, we remove it entirely from history...
// ...unless it's at the beginning of history, in which, removing it would cause the undo button to turn off
// It's a bit random what we do in this case, so we just don't squash it at all. Do nothing.
export const squashRecentNoteCycling = (history: HistoryState[]): void => {
    for (const stack of findRecentNoteCycleStacks(history)) {
        if (noteCycleStackCausedChange(history, stack)) {
            squash(history, stack, "leave last element");
        } else if (stack.start !== 1) {
            // Nothing changed, but it's the first thing in history.
            squash(history, stack, "obliterate");
        }
    }
};

// Must return stacks in reverse order, and stacks must be 2 or more elements
const findRecentNoteCycleStacks = (history: HistoryState[]): NoteCycleStack[] => {
    const noteCycleStacks: NoteCycleStack[] = [];
    const currentTime = Date.now();
    let historyIndex = history.length - 1;

    // A note-cycle-stack is at least 2 elements long
    while (historyIndex > 1) {
        const historyEntry = history[historyIndex];

        // To avoid reading the whole stack every time, we only look a little ways back in time
        // Hopefully, we've already examined everything before the cutoff already
        if (currentTime - historyEntry.timestamp > lookbackTime) {
            break;
        }

        // We must check if this command was even a note-cycle command
        const targetNote = historyEntry.lastCommand?.type === "EditCommand_Note"
            ? historyEntry.lastCommand.note
            : undefined;
        if (targetNote) {
            // We may have found the top of a stack, now we search for the bottom
            const start = findBottomOfStack(history, historyIndex);
            const distance = historyIndex - start;

            // We want at least two clicks to consider this for squashing
            if (distance > 0) {
                noteCycleStacks.push({ start, distance });
            }
            historyIndex = start - 1;
        } else {
            historyIndex--;
        }
    }

    return noteCycleStacks;
};

// Precondition: This really is the top of a cycle stack, and therefore history[searchStart].lastCommand.note exists
const findBottomOfStack = (history: HistoryState[], searchStart: number): number => {
    const stackNote = (history[searchStart].lastCommand as EditCommand_Note).note;
    let searchIndex = searchStart - 1;

    while (searchIndex >= 0) {
        const historyEntry = history[searchIndex];
        const targetNoteAtIndex = (historyEntry.lastCommand as EditCommand_Note).note;
        if (targetNoteAtIndex !== stackNote) {
            break;
        } // This also rules out commands which are not note-cycling

        const timeBetweenCommands = history[searchIndex + 1].timestamp - historyEntry.timestamp;
        if (timeBetweenCommands > noteCycleTime) {
            break;
        }

        searchIndex--;
    }

    return searchIndex + 1;
};

const noteCycleStackCausedChange = (history: HistoryState[], stack: NoteCycleStack): boolean => {
    const startNoteStyle = history[stack.start].oldValue;
    const endNoteStyle = (history[stack.start + stack.distance].lastCommand as EditCommand_Note).noteStyle;

    return startNoteStyle !== endNoteStyle;
};

type SquashMode = "leave last element" | "obliterate";

const squash = (history: HistoryState[], stack: NoteCycleStack, mode: SquashMode): void => {
    switch (mode) {
        case "leave last element":
            history.splice(stack.start, stack.distance);
            break;
        case "obliterate":
            history.splice(stack.start, stack.distance + 1);
    }
};
