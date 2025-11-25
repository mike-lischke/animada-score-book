/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { Note, NoteStyle, Timing, Track } from "./types/general.js";
import { isSameTiming } from "./utils.js";

interface CopyRequest {
    start: Timing,
    end: Timing;
}

interface PasteRequest {
    start: Timing,
    end?: Timing;
}

export class TrackClipboard {
    private track: Track;
    private buffer: NoteStyle[] = [];

    public constructor(track: Track) {
        this.track = track;

        return this;
    }

    public get length() {
        return this.buffer.length;
    }

    public copy({ start, end }: CopyRequest) {
        const notes = this.track.notes;
        let note: Note | undefined = this.track.getNoteAt(start);
        let index = note === undefined ? -1 : notes.indexOf(note);
        this.buffer = [];

        while (true) {
            if (note?.noteStyle) {
                this.buffer.push(note.noteStyle);
                if (isSameTiming(note.timing, end)) {
                    // Reached end of region to copy.
                    return;
                }
            }
            index++;
            if (index >= notes.length) {
                // Reached end of track.
                return;
            }
            note = notes[index];
        }
    }

    public paste({ start, end }: PasteRequest) {
        const notes = this.track.notes;
        let note = this.track.getNoteAt(start);
        let trackIndex = note === undefined ? -1 : notes.indexOf(note);
        let bufferIndex = 0;
        let noteStyleToPaste = this.buffer[0];

        while (true) {
            if (note) {
                note.noteStyle = noteStyleToPaste;
                if (end && isSameTiming(note.timing, end)) {
                    return;
                }
            }

            bufferIndex++;
            if (bufferIndex >= this.buffer.length) {
                return;
            } // Reached end of clipboard
            noteStyleToPaste = this.buffer[bufferIndex];

            trackIndex++;
            if (trackIndex >= notes.length) {
                return;
            } // Reached end of track
            note = notes[trackIndex];
        }
    }
}
