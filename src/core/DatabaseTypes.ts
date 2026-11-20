/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmPermissionInfo } from "./ScoreBookDataModel.js";

/**
 * Types used for database entries.
 */

/** Structure of a sound lib FS entry as returned from the REST endpoint. */
export interface ISoundLibFsNode {
    name: string;
    path: string;
    isDir: boolean;
    children?: ISoundLibFsNode[];
}

/** Structure of a score entry as the score list endpoint returns it. */
export interface IScoreListEntry {
    id: number;
    name: string;

    /** The tag ids of the score, restricted to the tags the caller can use. */
    tagIds: number[];

    perm: ISbDmPermissionInfo;
}
