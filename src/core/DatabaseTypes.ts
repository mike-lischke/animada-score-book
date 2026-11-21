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

    /** The tracks with their instruments, as the score card shows them. */
    lineup: IScoreLineup;

    perm: ISbDmPermissionInfo;
}

/** What a score's stored content allows the list to say about its lineup. */
export enum ScoreLineupStatus {
    /** The content is a packed arrangement this build reads. */
    Ok = "ok",

    /** The content is a packed arrangement of a schema version this build does not read. */
    Unsupported = "unsupported",

    /** The content is not a packed arrangement at all, for example content from before the compact format. */
    Unreadable = "unreadable",
}

/** One track of a score lineup. Track and instrument stay apart, so two tracks of one instrument stay distinct. */
export interface IScoreLineupTrack {
    trackId: number;

    /** The type id of the instrument the track plays. */
    instrumentTypeId: string;
}

/** The lineup of a score: its tracks in score order, or the reason it holds none. */
export interface IScoreLineup {
    /** Whether the tracks are readable, or why they are not. */
    status: ScoreLineupStatus;

    /** The tracks in score order; empty unless the status is ok. */
    tracks: IScoreLineupTrack[];
}
