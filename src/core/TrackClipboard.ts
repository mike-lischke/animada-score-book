/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmNoteEvent, ITiming } from "./ScoreBookDataModel.js";
import type { INoteStyle } from "./types/general.js";
import { isSameTiming } from "./utils.js";

interface ITrackWithNotes {
    readonly notes: ISbDmNoteEvent[];
}

interface ICopyRequest {
    start: ITiming,
    end: ITiming;
}

interface IPasteRequest {
    start: ITiming,
    end?: ITiming;
}

export class TrackClipboard {
    private buffer: Array<INoteStyle | undefined> = [];

    public constructor(private track: ITrackWithNotes) {
    }

    public get length() {
        return this.buffer.length;
    }

    public copy({ start, end }: ICopyRequest) {
        const notes = this.track.notes;
        const startIndex = notes.findIndex((n) => {
            return isSameTiming(n.timing, start);
        });
        const endIndex = notes.findIndex((n) => {
            return isSameTiming(n.timing, end);
        });

        this.buffer = [];

        if (startIndex < 0) {
            return;
        }

        const lastIndex = endIndex >= 0 ? endIndex : notes.length - 1;
        for (let i = startIndex; i <= lastIndex && i < notes.length; i++) {
            this.buffer.push(notes[i].noteStyle);
        }
    }

    public paste({ start, end }: IPasteRequest) {
        const notes = this.track.notes;
        const startIndex = notes.findIndex((n) => {
            return isSameTiming(n.timing, start);
        });

        if (startIndex < 0) {
            return;
        }

        for (let i = 0; i < this.buffer.length; i++) {
            const trackPos = startIndex + i;
            if (trackPos >= notes.length) {
                break;
            }
            const note = notes[trackPos];
            note.noteStyle = this.buffer[i];
            if (end && isSameTiming(note.timing, end)) {
                break;
            }
        }
    }
}
