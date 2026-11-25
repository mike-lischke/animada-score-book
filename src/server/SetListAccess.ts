/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { AccessLevel, EntityType, type Auth, type ITokenPayload } from "./Auth.js";
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

/**
 * The rules of a set list: what its tag is, who may select the list and who may change it. The owning scope is the
 * scope of the tag, so a global tag makes the list the administrators' and a group tag makes it the business of that
 * group's administrator. Members of the owning group and of every group the list is shared with may select it, and
 * editing never comes with sharing.
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
            "SELECT id, name, color_index AS colorIndex, group_id AS groupId, system_key AS systemKey "
            + "FROM tags WHERE id = ?", [tagId],
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
     * @returns Whether the caller may select the list, following the score permission model: the owner, a member of
     * a group the list is granted to, or an administrator. There is no World and no anonymous access.
     */
    public static async canRead(auth: Auth, user: ITokenPayload | undefined,
        listId: number): Promise<boolean> {
        if (!user) {
            return false;
        }

        return auth.checkPermission(user, EntityType.SetList, listId, AccessLevel.Read);
    }

    /**
     * @param auth The authentication helper.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param listId The list in question.
     *
     * @returns Whether the caller may rename, delete or share the list, assign its tag and change the order: the
     * owner, a member of a group with write access, or an administrator.
     */
    public static async canEdit(auth: Auth, user: ITokenPayload | undefined,
        listId: number): Promise<boolean> {
        if (!user) {
            return false;
        }

        return auth.checkPermission(user, EntityType.SetList, listId, AccessLevel.Write);
    }
}
