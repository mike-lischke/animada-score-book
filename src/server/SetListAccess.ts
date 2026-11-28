/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { EntityType, type Auth, type ITokenPayload } from "./Auth.js";
import type { DbRow, IDatabaseAdapter } from "./database.js";
import { TagAccess, type ITagRow } from "./TagAccess.js";

/** A set list as it is stored; its name and tag scope are those of its tag. */
export interface ISetListRow extends DbRow {
    id: number;

    /** The tag that defines the list: membership is the tag assignment, the name and scope come from the tag. */
    tagId: number;

    /** Bumped by every change, which is how a stale edit is detected instead of overwriting it. */
    revision: number;
}

/** A stored list together with the tag that defines it. */
export interface ISetListEntry {
    row: ISetListRow;
    tag: ITagRow;
}

/** What one caller may do with one set list. */
export interface ISetListRights {
    /**
     * The caller may select the list and read its order: its owner, a member of a group it is shared with, or an
     * administrator.
     */
    readable: boolean;

    /**
     * The caller may rename, delete or share the list, assign its tag and change the order: its owner or an
     * administrator.
     */
    editable: boolean;
}

/**
 * The rules of a set list: what its tag is, who may select the list and who may change it. A list belongs to the
 * administrator who created it, sharing it with a group grants reading only, and the administrators of the instance
 * reach every list - private ones included, because running the installation includes its lists.
 */
export class SetListAccess {
    /** The longest name a set list may carry; the name is the tag's name, so the tag limit applies. */
    public static readonly maxNameLength = TagAccess.maxNameLength;

    /**
     * @param adapter The database adapter to query.
     * @param listId The list to read.
     *
     * @returns The stored list, or undefined when there is none with that id.
     */
    public static async find(adapter: IDatabaseAdapter, listId: number): Promise<ISetListRow | undefined> {
        const rows = await adapter.query<ISetListRow>(
            "SELECT id, tag_id AS tagId, revision FROM set_lists WHERE id = ?", [listId],
        );

        return rows.length > 0 ? rows[0] : undefined;
    }

    /**
     * @param adapter The database adapter to query.
     * @param tagId The tag in question.
     *
     * @returns The tag row, or undefined when there is no tag with that id.
     */
    public static async findTag(adapter: IDatabaseAdapter, tagId: number): Promise<ITagRow | undefined> {
        const rows = await adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, owner_user_id AS ownerUserId, "
            + "owner_group_id AS ownerGroupId, system_key AS systemKey FROM tags WHERE id = ?", [tagId],
        );

        return rows.length > 0 ? rows[0] : undefined;
    }

    /**
     * @param adapter The database adapter to query.
     * @param listId The list to read.
     *
     * @returns The list with its tag, or undefined when the list does not exist any more.
     */
    public static async load(adapter: IDatabaseAdapter, listId: number): Promise<ISetListEntry | undefined> {
        const row = await SetListAccess.find(adapter, listId);
        if (row === undefined) {
            return undefined;
        }

        const tag = await SetListAccess.findTag(adapter, row.tagId);

        return tag === undefined ? undefined : { row, tag };
    }

    /**
     * @param adapter The database adapter to query.
     * @param tagId The tag in question.
     *
     * @returns The list that this tag defines, or undefined for an ordinary tag.
     */
    public static async forTag(adapter: IDatabaseAdapter, tagId: number): Promise<ISetListRow | undefined> {
        const rows = await adapter.query<ISetListRow>(
            "SELECT id, tag_id AS tagId, revision FROM set_lists WHERE tag_id = ?", [tagId],
        );

        return rows.length > 0 ? rows[0] : undefined;
    }

    /**
     * @param adapter The database adapter to query.
     *
     * @returns The list id of every set-list tag, keyed by tag id. The tag catalogue uses it to mark those tags.
     */
    public static async listIdsByTag(adapter: IDatabaseAdapter): Promise<Map<number, number>> {
        const rows = await adapter.query<{ id: number; tagId: number; }>(
            "SELECT id, tag_id AS tagId FROM set_lists", [],
        );

        return new Map(rows.map((row) => {
            return [row.tagId, row.id] as [number, number];
        }));
    }

    /**
     * @param auth The authentication helper, used for the sharing rows.
     * @param listId The list in question.
     *
     * @returns The groups the list is shared with, as the permission rows hold them.
     */
    public static async sharedGroups(auth: Auth,
        listId: number): Promise<Array<{ groupId: number; writable: boolean; }>> {
        return auth.getExplicitEntityGroups(EntityType.SetList, listId);
    }

    /**
     * @param auth The authentication helper.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param listId The list in question.
     *
     * @returns Whether the caller may select the list: its owner, a member of a group it is shared with, or an
     * administrator. There is no World and no anonymous access.
     */
    public static async canRead(auth: Auth, user: ITokenPayload | undefined,
        listId: number): Promise<boolean> {
        if (!user) {
            return false;
        }

        const rights = await SetListAccess.rights(auth, user, [listId]);

        return rights.get(listId)?.readable === true;
    }

    /**
     * @param auth The authentication helper.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param listId The list in question.
     *
     * @returns Whether the caller may rename, delete or share the list, assign its tag and change its order. Sharing
     * a list grants reading only, so only its owner and an administrator of the installation may change it.
     */
    public static async canEdit(auth: Auth, user: ITokenPayload | undefined,
        listId: number): Promise<boolean> {
        if (!user) {
            return false;
        }

        const rights = await SetListAccess.rights(auth, user, [listId]);

        return rights.get(listId)?.editable === true;
    }

    /**
     * @param adapter The database adapter to query.
     * @param name The name a list is to carry.
     * @param groupIds The groups it is shared with.
     * @param exceptListId The list that is being renamed, which must not conflict with itself.
     *
     * @returns The name of the first group that already holds a set list of that name, or undefined when all of them
     * are free of it. A group's lists are what its members select, so two of one name would be indistinguishable
     * there.
     */
    public static async sharedNameConflict(adapter: IDatabaseAdapter, name: string, groupIds: readonly number[],
        exceptListId?: number): Promise<string | undefined> {
        if (groupIds.length === 0) {
            return undefined;
        }

        const placeholders = groupIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await adapter.query<{ groupName: string; }>(
            "SELECT g.name AS groupName FROM entity_groups eg "
            + "JOIN set_lists l ON l.id = eg.entity_id "
            + "JOIN tags t ON t.id = l.tag_id "
            + "JOIN `groups` g ON g.id = eg.group_id "
            + `WHERE eg.entity_type = ? AND eg.group_id IN (${placeholders}) AND t.name = ? AND l.id != ?`,
            [EntityType.SetList, ...groupIds, name, exceptListId ?? 0],
        );

        return rows.length > 0 ? rows[0].groupName : undefined;
    }

    /**
     * @param auth The authentication helper.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param listIds The lists to judge.
     *
     * @returns What the caller may do with each list, read with one query per permission table. A list the caller
     * has nothing to do with is missing from the map, which reads as no rights at all.
     */
    public static async rights(auth: Auth, user: ITokenPayload | undefined,
        listIds: readonly number[]): Promise<Map<number, ISetListRights>> {
        const rights = new Map<number, ISetListRights>();

        if (!user || listIds.length === 0) {
            return rights;
        }

        const placeholders = listIds.map(() => {
            return "?";
        }).join(", ");
        const [ownerRows, groupRows, context] = await Promise.all([
            auth.adapter.query<{ entityId: number; ownerId: number | null; }>(
                `SELECT entity_id AS entityId, owner_id AS ownerId FROM permissions WHERE entity_type = ? `
                + `AND entity_id IN (${placeholders})`, [EntityType.SetList, ...listIds],
            ),
            auth.adapter.query<{ entityId: number; groupId: number; }>(
                `SELECT entity_id AS entityId, group_id AS groupId FROM entity_groups WHERE entity_type = ? `
                + `AND entity_id IN (${placeholders})`, [EntityType.SetList, ...listIds],
            ),
            TagAccess.contextFor(auth, user),
        ]);

        const owners = new Map<number, number | null>();
        for (const row of ownerRows) {
            owners.set(row.entityId, row.ownerId);
        }

        const grants = new Map<number, Set<number>>();
        for (const row of groupRows) {
            const groups = grants.get(row.entityId) ?? new Set<number>();
            groups.add(row.groupId);
            grants.set(row.entityId, groups);
        }

        const memberGroupIds = new Set(context.memberGroupIds);
        for (const listId of listIds) {
            const isOwner = owners.get(listId) === user.userId;
            const shared = grants.get(listId) ?? new Set<number>();
            const inSharedGroup = Array.from(shared).some((groupId) => {
                return memberGroupIds.has(groupId);
            });

            // An administrator answers for the whole installation, so a private list is theirs as well.
            if (context.isAdmin || isOwner || inSharedGroup) {
                rights.set(listId, { readable: true, editable: context.isAdmin || isOwner });
            }
        }

        return rights;
    }
}
