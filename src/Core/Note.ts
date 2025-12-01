/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { INote, INoteStyle, IPolyrhythm, ITiming, ITrack } from "./types/general.js";
import { Publisher } from "./Publisher.js";

let noteCount = 0;

export class Note extends Publisher implements INote {
    public readonly id = `${++noteCount}`;
    private style: INoteStyle | undefined;

    public constructor(public track: ITrack, public timing: ITiming, public polyrhythm?: IPolyrhythm) {
        super();
    }

    public get noteStyle(): INoteStyle | undefined {
        return this.style;
    }

    public set noteStyle(newNoteStyle: INoteStyle | undefined) {
        this.style = newNoteStyle;
        this.publish();
    }
};
