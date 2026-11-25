/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { TagCombination } from "../core/TagCombination.js";
import { type Auth, type ITokenPayload } from "./Auth.js";
import { TagAccess, type ITagRow } from "./TagAccess.js";

/** What keeps a requested filter from being used. */
export enum TagFilterProblem {
    /** The value is not a tag combination within the limits. */
    Malformed = "malformed",

    /** A tag of the combination no longer exists. */
    UnavailableTag = "unavailable-tag",

    /** A tag of the combination belongs to a scope the caller may not use. */
    NotUsable = "not-usable",
}

/**
 * The rules of the manual tag filter: an OR of AND groups. It narrows what a caller sees but never widens it, so a
 * tag the caller cannot use turns the request into an explicit rejection instead of being dropped silently. The
 * score collection and the set-list routes both read a filter through here, so they cannot drift apart.
 */
export class TagFilter {
    /** The filter that matches every score. */
    public static readonly empty: number[][] = [];

    /**
     * Reads the AND groups of a requested filter. Duplicate tags and empty groups carry no condition and drop out;
     * everything outside the limits is rejected instead of being repaired.
     *
     * @param value The combination to read.
     *
     * @returns The AND groups, or undefined when the value is not a combination.
     */
    public static readGroups(value: unknown): number[][] | undefined {
        if (!Array.isArray(value) || value.length > TagCombination.maxGroups) {
            return undefined;
        }

        const groups: number[][] = [];
        for (const rawGroup of value) {
            if (!Array.isArray(rawGroup) || rawGroup.length > TagCombination.maxTagsPerGroup) {
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
     * @param problem The reason a filter cannot be used.
     *
     * @returns The sentence the client shows for it.
     */
    public static problemMessage(problem: TagFilterProblem): string {
        switch (problem) {
            case TagFilterProblem.UnavailableTag: {
                return "The filter names a tag that no longer exists.";
            }

            case TagFilterProblem.NotUsable: {
                return "The filter names a tag you cannot use.";
            }

            case TagFilterProblem.Malformed: {
                return "The tag filter is not valid.";
            }
        }
    }

    /**
     * Checks a requested filter against the tags the caller may use. An unknown tag and a tag of a scope the caller
     * cannot use are reported separately, because the client can offer different remedies for them.
     *
     * @param auth The authentication helper, used for the tag rows.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param groups The AND groups of the filter.
     *
     * @returns The reason the filter cannot be used, if any.
     */
    public static async problem(auth: Auth, user: ITokenPayload | undefined,
        groups: number[][]): Promise<TagFilterProblem | undefined> {
        const tagIds = TagFilter.tagIds(groups);
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
        const context = await TagAccess.contextFor(auth, user);

        for (const tagId of tagIds) {
            const tag = known.get(tagId);

            if (tag === undefined) {
                return TagFilterProblem.UnavailableTag;
            }

            if (!TagAccess.canUse(context, tag)) {
                return TagFilterProblem.NotUsable;
            }
        }

        return undefined;
    }
}
