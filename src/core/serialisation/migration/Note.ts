/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../../Publisher.js";
import { SbDmEntityType, type ISbDmTrack, type ITiming } from "../../ScoreBookDataModel.js";
import type { INoteStyle } from "../../types/general.js";
import type { IPolyrhythm } from "./migration-types.js";
import { getNewId } from "../../utils.js";

/**
 * Note class used by the V1 → V2 snapshot migration only. Runtime code uses
 * {@link ISbDmNoteEvent} directly (see {@link Track} and {@link MigrationTrack}).
 */
export class Note extends Publisher {
    public readonly type = SbDmEntityType.Note;
    public readonly id: number;
    public readonly state = {
        initialized: true,
        isLeaf: true,
        expanded: false,
        expandedOnce: false,
    };

    private style?: INoteStyle;

    public constructor(public track: ISbDmTrack, public timing: ITiming, public polyrhythm?: IPolyrhythm,
        id: number = getNewId()) {
        super();
        this.id = id;
    }

    public get noteStyle(): INoteStyle | undefined {
        return this.style;
    }

    public set noteStyle(newNoteStyle: INoteStyle | undefined) {
        this.style = newNoteStyle;
        this.publish();
    }
};
