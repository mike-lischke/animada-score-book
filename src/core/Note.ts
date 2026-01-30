/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import { SbDmEntityType, type ISbDmNote, type ISbDmTrack, type ITiming } from "./ScoreBookDataModel.js";
import type { INoteStyle, IPolyrhythm } from "./types/general.js";
import { getNewId } from "./utils.js";

export class Note extends Publisher implements ISbDmNote {
    public readonly type = SbDmEntityType.Note;
    public readonly id = getNewId();
    public readonly state = {
        initialized: true,
        isLeaf: true,
        expanded: false,
        expandedOnce: false,
    };

    private style?: INoteStyle;

    public constructor(public track: ISbDmTrack, public timing: ITiming, public polyrhythm?: IPolyrhythm) {
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
