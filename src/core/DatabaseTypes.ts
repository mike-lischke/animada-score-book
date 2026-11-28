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

    /** Tempo, meter, length and bar count, as the score's content states them. */
    meta: IScoreMeta;

    perm: ISbDmPermissionInfo;

    /**
     * The description the entry carries in the set list it was read from, if it has one. The description belongs to
     * the entry, not to the score, so the same score may read differently in two lists.
     */
    note?: string;

    /** The icon the entry shows, as a key of the icon catalogue; absent while its author picked none. */
    icon?: string;
}

/** How long the description of a set-list entry may be; the backend refuses anything longer. */
export const setListEntryNoteLimit = 500;

/**
 * The metadata a score's content states about itself. Every field is absent when the content cannot be read, so a
 * card shows only what is known instead of guessing.
 */
export interface IScoreMeta {
    /** The tempo the score is written at, in beats per minute. */
    bpm?: number;

    /** The meter, as `beatsPerBar/beatUnit`, for example `4/4`. */
    timeSignature?: string;

    /** How many bars the score is written with. */
    barCount?: number;

    /** How long the written bars last at the stated tempo, in seconds. */
    durationSeconds?: number;
}

/** A set list as the backend describes it: one private tag and the caller's rights on the list it defines. */
export interface ISetListInfo {
    readonly id: number;
    readonly name: string;

    /** The tag whose assignment decides membership; it carries the name and belongs to no catalogue. */
    readonly tagId: number;

    /** Bumped by every change, so a stale edit is rejected instead of overwriting a newer one. */
    readonly revision: number;

    /** How many member scores the caller may read. */
    readonly memberCount: number;

    /** The groups the list is granted to, with the write flag the permission rows hold. */
    readonly groups: Array<{ groupId: number; writable: boolean; }>;

    /** The owner of the list, exactly as a score has one. */
    readonly ownerId?: number;
    readonly ownerName?: string;

    /** Whether the caller may rename, delete or share the list and change its order. */
    readonly editable: boolean;

    /** Whether the caller may grant the list to groups: its owner and the administrators, exactly as with a score. */
    readonly managesAccess: boolean;
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
