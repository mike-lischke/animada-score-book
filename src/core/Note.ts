/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { INote, INoteStyle, IPolyrhythm, ITiming, ITrack } from "./types/general.js";
import { createPublisher } from "./Publisher.js";

let noteCount = 0;

export const createNote = (track: ITrack, timing: ITiming, polyrhythm?: IPolyrhythm): INote => {
    const publisher = createPublisher();
    const id = `${++noteCount}`;
    let noteStyle: INoteStyle | undefined;

    return {
        id, timing, track, polyrhythm,
        subscribe: publisher.subscribe, unsubscribe: publisher.unsubscribe,
        get noteStyle(): INoteStyle | undefined {
            return noteStyle;
        },
        set noteStyle(newNoteStyle: INoteStyle) {
            noteStyle = newNoteStyle;
            publisher.publish();
        }
    };
};
