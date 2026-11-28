/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { EntityType, type Auth, type ITokenPayload } from "./Auth.js";
import { SetListAccess } from "./SetListAccess.js";
import { TagAccess, type ITagRow } from "./TagAccess.js";

/** What one caller may do with one tag. */
export interface ITagRights {
    /** The caller may see and use the tag: in the catalogue, in a completed name, on a score and in a filter. */
    readable: boolean;

    /** The caller may rename or delete the tag and put it on a score. */
    editable: boolean;
}

/**
 * The complete rights of a caller on a tag, one answer per tag for a whole request. `TagAccess` holds the rules that
 * a tag states about itself - system tags, owners, groups. What it cannot state is who else was granted the tag, and
 * a set-list tag is governed by its list instead: both need stored rows, which is what this authority reads.
 */
export class TagRights {
    /**
     * @param auth The authentication helper, used for the stored grants.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param tags The tags to judge.
     *
     * @returns The rights of the caller on each tag. A tag that is missing from the map is one the caller has no
     * rights on at all.
     */
    public static async of(auth: Auth, user: ITokenPayload | undefined,
        tags: readonly ITagRow[]): Promise<Map<number, ITagRights>> {
        const rights = new Map<number, ITagRights>();

        if (!user || tags.length === 0) {
            return rights;
        }

        const context = await TagAccess.contextFor(auth, user);
        const memberGroupIds = new Set([...context.memberGroupIds, ...context.adminGroupIds]);
        const shares = await TagRights.shares(auth, tags.map((tag) => {
            return tag.id;
        }));
        const listIds = await SetListAccess.listIdsByTag(auth.adapter);
        const listRights = await SetListAccess.rights(auth, user, tags.map((tag) => {
            return listIds.get(tag.id);
        }).filter((listId) => {
            return listId !== undefined;
        }));

        for (const tag of tags) {
            const listId = listIds.get(tag.id);
            if (listId !== undefined) {
                const onList = listRights.get(listId);
                const readable = onList?.readable === true;
                const editable = onList?.editable === true;

                if (readable || editable) {
                    rights.set(tag.id, { readable, editable });
                }

                continue;
            }

            const sharedWith = shares.get(tag.id) ?? [];
            const granted = sharedWith.some((groupId) => {
                return memberGroupIds.has(groupId);
            });
            const readable = granted || TagAccess.canUse(context, tag);
            const editable = TagAccess.canManage(context, tag);

            if (readable || editable) {
                rights.set(tag.id, { readable, editable });
            }
        }

        return rights;
    }

    /**
     * @param auth The authentication helper, used for the stored grants.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param tags The tags to judge.
     *
     * @returns The tags the caller may see and use.
     */
    public static async readable(auth: Auth, user: ITokenPayload | undefined,
        tags: readonly ITagRow[]): Promise<ITagRow[]> {
        const rights = await TagRights.of(auth, user, tags);

        return tags.filter((tag) => {
            return rights.get(tag.id)?.readable === true;
        });
    }

    /**
     * @param auth The authentication helper.
     * @param tagIds The tags whose grants are wanted.
     *
     * @returns The groups each tag is shared with, keyed by tag id.
     */
    private static async shares(auth: Auth, tagIds: readonly number[]): Promise<Map<number, number[]>> {
        const shares = new Map<number, number[]>();

        if (tagIds.length === 0) {
            return shares;
        }

        const placeholders = tagIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await auth.adapter.query<{ entityId: number; groupId: number; }>(
            "SELECT entity_id AS entityId, group_id AS groupId FROM entity_groups "
            + `WHERE entity_type = ? AND entity_id IN (${placeholders})`, [EntityType.Tag, ...tagIds],
        );

        for (const row of rows) {
            const groups = shares.get(row.entityId) ?? [];
            groups.push(row.groupId);
            shares.set(row.entityId, groups);
        }

        return shares;
    }
}
