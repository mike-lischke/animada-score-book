/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { TagCombination } from "../core/TagCombination.js";
import { EntityType, type Auth, type ITokenPayload } from "./Auth.js";
import type { IDatabaseAdapter } from "./database.js";
import { SetListOrder } from "./SetListOrder.js";

/** What one caller gets to see of a set list's scores. */
export interface ISetListMembership {
    /**
     * Every score that carries the list's tag, in the list's order. It also holds scores the caller cannot read,
     * because their places belong to the list and survive a change of access.
     */
    canonical: number[];
    /** The scores the caller may read that also match the manual filter, in the list's order. */
    visible: number[];
}

/**
 * Membership of a set list is the assignment of its tag: a score belongs to the list while the tag is on it. These
 * rules combine that with an independent manual filter and the caller's read access, without ever returning a score
 * or a count the caller cannot see.
 */
export class SetListMembership {
    /**
     * @param auth The authentication helper, used for the score access checks.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param storedIds The scores the list knows, in the saved order.
     * @param tagId The tag of the list; a score carrying it is a member.
     * @param extraGroups The independent manual filter, which narrows the members further.
     *
     * @returns The canonical order and the part of it the caller may see.
     */
    public static async resolve(auth: Auth, user: ITokenPayload | undefined, storedIds: readonly number[],
        tagId: number, extraGroups: number[][]): Promise<ISetListMembership> {
        const matching = await SetListMembership.matchingScoreIds(auth.adapter, tagId, extraGroups);
        const known = storedIds.filter((scoreId) => {
            return matching.has(scoreId);
        });
        const canonical = SetListOrder.merge(known, matching);
        const summaries = await auth.getPermissionSummaries(user, EntityType.Score, Array.from(matching));

        const visible = canonical.filter((scoreId) => {
            return matching.has(scoreId) && summaries.get(scoreId)?.canRead === true;
        });

        return { canonical, visible };
    }

    /**
     * @param adapter The database adapter to query.
     * @param tagId The tag of the list.
     * @param extraGroups The AND groups of the manual filter, OR-ed with each other; empty for no extra condition.
     *
     * @returns The ids of the scores that carry the list's tag and satisfy the manual filter.
     */
    private static async matchingScoreIds(adapter: IDatabaseAdapter, tagId: number,
        extraGroups: number[][]): Promise<Set<number>> {
        const tagged = await adapter.query<{ scoreId: number; }>(
            "SELECT score_id AS scoreId FROM score_tags WHERE tag_id = ?", [tagId],
        );
        const candidates = tagged.map((row) => {
            return row.scoreId;
        });

        if (extraGroups.length === 0 || candidates.length === 0) {
            return new Set(candidates);
        }

        const placeholders = candidates.map(() => {
            return "?";
        }).join(", ");
        const tags = await adapter.query<{ scoreId: number; tagId: number; }>(
            `SELECT score_id AS scoreId, tag_id AS tagId FROM score_tags WHERE score_id IN (${placeholders})`,
            candidates,
        );

        const tagsByScore = new Map<number, Set<number>>();
        for (const row of tags) {
            const tagIds = tagsByScore.get(row.scoreId) ?? new Set<number>();
            tagIds.add(row.tagId);
            tagsByScore.set(row.scoreId, tagIds);
        }

        const combination = { groups: extraGroups };

        return new Set(candidates.filter((scoreId) => {
            return TagCombination.matches(combination, tagsByScore.get(scoreId) ?? new Set<number>());
        }));
    }
}
