/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { EntityType, type Auth } from "./Auth.js";
import type { DbRow, IDatabaseAdapter } from "./database.js";
import type { ITagRow } from "./TagAccess.js";

/** A set list as it is stored. */
export interface ISetListRow extends DbRow {
    id: number;
    name: string;

    /** The saved tag combination, as JSON: an array of AND groups, OR-ed with each other. */
    filters: string;

    /** Bumped by every change, which is how a stale edit is detected instead of overwriting it. */
    revision: number;
}

/** Everyone a list is visible to. The owner is checked on top, because they can use group tags too. */
export interface ISetListAudience {
    /** The groups the list is shared with. */
    groupIds: number[];

    /** Whether the list is readable by everybody, anonymous visitors included. */
    isWorld: boolean;
}

/** What keeps a stored or requested filter from being used. */
export enum SetListFilterProblem {
    /** The value is not a tag combination within the limits. */
    Malformed = "malformed",

    /** A tag of the combination no longer exists. */
    UnavailableTag = "unavailable-tag",

    /** A group-owned tag is used while the list reaches beyond that group. */
    TagScope = "tag-scope",
}

/**
 * The rules of a saved tag combination: how it is read, and which tags it may hold for the people a list is shared
 * with. Routes and the permission endpoint both use them, so a filter and the sharing of its list cannot drift apart.
 */
export class SetListAccess {
    /** The most AND groups a filter may hold. */
    public static readonly maxFilterGroups = 20;

    /** The most tags one AND group may hold. */
    public static readonly maxFilterTagsPerGroup = 32;

    /** The longest name a set list may carry; the `name` column holds exactly this many characters. */
    public static readonly maxNameLength = 255;

    /**
     * Reads the AND groups of a tag combination, from a stored list or a request. Duplicate tags and empty groups
     * carry no condition and drop out; everything outside the limits is rejected instead of being repaired.
     *
     * @param value The combination to read.
     *
     * @returns The AND groups, or undefined when the value is not a combination.
     */
    public static readGroups(value: unknown): number[][] | undefined {
        if (!Array.isArray(value) || value.length > SetListAccess.maxFilterGroups) {
            return undefined;
        }

        const groups: number[][] = [];
        for (const rawGroup of value) {
            if (!Array.isArray(rawGroup) || rawGroup.length > SetListAccess.maxFilterTagsPerGroup) {
                return undefined;
            }

            const group: number[] = [];
            for (const rawTagId of rawGroup) {
                const tagId = Number(rawTagId);
                if (!Number.isInteger(tagId) || tagId <= 0) {
                    return undefined;
                }

                group.push(tagId);
            }

            const distinct = Array.from(new Set(group));
            if (distinct.length > 0) {
                groups.push(distinct);
            }
        }

        return groups;
    }

    /**
     * @param groups The AND groups of a combination.
     *
     * @returns Every tag id the combination names.
     */
    public static tagIds(groups: number[][]): number[] {
        return Array.from(new Set(groups.flat()));
    }

    /**
     * @param adapter The database adapter to query.
     * @param listId The list to read.
     *
     * @returns The stored list, or undefined when there is none with that id.
     */
    public static async find(adapter: IDatabaseAdapter, listId: number): Promise<ISetListRow | undefined> {
        const rows = await adapter.query<ISetListRow>(
            "SELECT id, name, filters, revision FROM set_lists WHERE id = ?", [listId],
        );

        return rows.length > 0 ? rows[0] : undefined;
    }

    /**
     * @param auth The authentication helper, used for the permission rows.
     * @param listId The list to look at.
     *
     * @returns The groups the list is shared with and whether it is readable by everybody.
     */
    public static async audience(auth: Auth, listId: number): Promise<ISetListAudience> {
        const [groups, worldGroupId] = await Promise.all([
            auth.getExplicitEntityGroups(EntityType.SetList, listId),
            auth.getWorldGroupId(),
        ]);

        const groupIds = groups.map((group) => {
            return group.groupId;
        });

        return {
            groupIds: groupIds.filter((groupId) => {
                return groupId !== worldGroupId;
            }),
            isWorld: worldGroupId !== undefined && groupIds.includes(worldGroupId),
        };
    }

    /**
     * @param auth The authentication helper, used for the permission rows.
     * @param listId The list whose sharing changes.
     * @param addGroupIds The groups that receive access.
     * @param removeGroupIds The groups that lose access.
     *
     * @returns The people the list will be visible to once the change is applied.
     */
    public static async plannedAudience(auth: Auth, listId: number, addGroupIds: number[],
        removeGroupIds: number[]): Promise<ISetListAudience> {
        const [current, worldGroupId] = await Promise.all([
            auth.getExplicitEntityGroups(EntityType.SetList, listId),
            auth.getWorldGroupId(),
        ]);

        const groupIds = new Set(current.map((group) => {
            return group.groupId;
        }));

        for (const groupId of removeGroupIds) {
            groupIds.delete(groupId);
        }

        for (const groupId of addGroupIds) {
            groupIds.add(groupId);
        }

        return {
            groupIds: Array.from(groupIds).filter((groupId) => {
                return groupId !== worldGroupId;
            }),
            isWorld: worldGroupId !== undefined && groupIds.has(worldGroupId),
        };
    }

    /**
     * @param problem The reason a combination cannot be used.
     *
     * @returns The sentence the client shows for it.
     */
    public static problemMessage(problem: SetListFilterProblem): string {
        switch (problem) {
            case SetListFilterProblem.UnavailableTag: {
                return "The tag combination names a tag that no longer exists.";
            }

            case SetListFilterProblem.TagScope: {
                return "The tag combination uses a tag that not everybody the list is shared with can use.";
            }

            case SetListFilterProblem.Malformed: {
                return "The tag combination is not valid.";
            }
        }
    }

    /**
     * Checks a combination against the people a list is shared with. Every tag has to exist, and a group-owned tag
     * may only be used while the list reaches no other group and is not readable by everybody: nobody else could
     * see or use it.
     *
     * @param auth The authentication helper, used for the tag and membership rows.
     * @param groups The AND groups of the combination.
     * @param audience The people the list is shared with.
     * @param ownerId The owner of the list, if it has one.
     *
     * @returns The reason the combination cannot be used for this list, if any.
     */
    public static async filterProblem(auth: Auth, groups: number[][],
        audience: ISetListAudience, ownerId: number | undefined): Promise<SetListFilterProblem | undefined> {
        const tagIds = SetListAccess.tagIds(groups);
        if (tagIds.length === 0) {
            return undefined;
        }

        const placeholders = tagIds.map(() => {
            return "?";
        }).join(", ");
        const tags = await auth.adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, group_id AS groupId, system_key AS systemKey "
            + `FROM tags WHERE id IN (${placeholders})`, tagIds,
        );

        const known = new Map(tags.map((tag) => {
            return [tag.id, tag];
        }));

        for (const tagId of tagIds) {
            if (!known.has(tagId)) {
                return SetListFilterProblem.UnavailableTag;
            }
        }

        for (const tag of tags) {
            if (tag.groupId === null) {
                continue;
            }

            // Everybody the list reaches has to be able to use the tag, so a group tag rules out World and every
            // other group. A list shared with nobody but its owner keeps the owner's own tags usable.
            const reachesOtherGroup = audience.isWorld || audience.groupIds.some((groupId) => {
                return groupId !== tag.groupId;
            });
            if (reachesOtherGroup) {
                return SetListFilterProblem.TagScope;
            }

            if (ownerId !== undefined && !(await SetListAccess.canUseGroupTag(auth, ownerId, tag.groupId))) {
                return SetListFilterProblem.TagScope;
            }
        }

        return undefined;
    }

    /**
     * @param auth The authentication helper.
     * @param userId The user in question.
     * @param groupId The group that owns the tag.
     *
     * @returns Whether the user belongs to the group or administers it.
     */
    private static async canUseGroupTag(auth: Auth, userId: number, groupId: number): Promise<boolean> {
        const membership = await auth.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM user_groups WHERE user_id = ? AND group_id = ?", [userId, groupId],
        );

        if ((membership[0]?.cnt ?? 0) > 0) {
            return true;
        }

        const administration = await auth.adapter.query<{ id: number; }>(
            "SELECT id FROM `groups` WHERE id = ? AND admin_id = ?", [groupId, userId],
        );

        return administration.length > 0;
    }
}
