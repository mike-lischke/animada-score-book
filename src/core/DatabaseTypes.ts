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

/** Structure of a score lib folder entry as returned by the REST endpoint. */
export interface IScoreLibFolderDBEntry {
    id: number;
    parentid: number;
    name: string;
    hasChildren: boolean;
    perm: ISbDmPermissionInfo;
}

/** Structure of a score lib snippet entry as returned by the REST endpoint. */
export interface IScoreLibScoreDBEntry {
    id: number;
    folderid: number;
    name: string;
    content: string;
    perm: ISbDmPermissionInfo;
}

/** Structure of an entry returned by the folder list API. */
export interface IScoreDBEntry {
    folders: IScoreLibFolderDBEntry[];
    scores: IScoreLibScoreDBEntry[];
}
