/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

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

/** Permission summary for the current user on a score or folder, as returned by the backend. */
export interface IPermissionDBEntry {
    isOwner: boolean;
    isGroup: boolean;
    isWorld: boolean;
    permBits: number;
}

/** Structure of a score lib folder entry as returned by the REST endpoint. */
export interface IScoreLibFolderDBEntry {
    id: number;
    parentid: number;
    name: string;
    hasChildren: boolean;
    perm: IPermissionDBEntry;
}

/** Structure of a score lib snippet entry as returned by the REST endpoint. */
export interface IScoreLibScoreDBEntry {
    id: number;
    folderid: number;
    name: string;
    content: string;
    perm: IPermissionDBEntry;
}

/** Structure of an entry returned by the folder list API. */
export interface IScoreDBEntry {
    folders: IScoreLibFolderDBEntry[];
    scores: IScoreLibScoreDBEntry[];
}
