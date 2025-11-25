/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { Note, NoteStyle, Polyrhythm, Timing, Track } from "./types/general.js";
import { createPublisher } from "./Publisher.js";

let noteCount = 0;

export const createNote = (track: Track, timing: Timing, polyrhythm?: Polyrhythm): Note => {
    const publisher = createPublisher();
    const id = `${++noteCount}`;
    let noteStyle: NoteStyle | undefined;

    return {
        id, timing, track, polyrhythm,
        subscribe: publisher.subscribe, unsubscribe: publisher.unsubscribe,
        get noteStyle(): NoteStyle | undefined {
            return noteStyle;
        },
        set noteStyle(newNoteStyle: NoteStyle) {
            noteStyle = newNoteStyle;
            publisher.publish();
        }
    };
};
