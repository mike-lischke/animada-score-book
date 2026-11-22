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
     * Every score the list knows, in canonical order. It also holds scores the caller cannot read, because their
     * places belong to the list and survive a change of access.
     */
    canonical: number[];

    /** The scores the caller may read and that currently match, in canonical order. */
    visible: number[];
}

/**
 * Membership of a set list is never stored: it follows from its saved tag combination and the current tags of the
 * scores. These rules combine that with the caller's read access and the list's order, without ever returning a
 * score or a count the caller cannot see.
 */
export class SetListMembership {
    /**
     * @param auth The authentication helper, used for the score access checks.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param storedIds The scores the list knows, in their stored order.
     * @param groups The combination that decides membership; the saved one, combined with an extra filter.
     *
     * @returns The canonical order and the part of it the caller may see.
     */
    public static async resolve(auth: Auth, user: ITokenPayload | undefined, storedIds: readonly number[],
        groups: number[][]): Promise<ISetListMembership> {
        const matching = await SetListMembership.matchingScoreIds(auth.adapter, groups);
        const canonical = SetListOrder.merge(storedIds, matching);
        const summaries = await auth.getPermissionSummaries(user, EntityType.Score, Array.from(matching));

        const visible = canonical.filter((scoreId) => {
            return matching.has(scoreId) && summaries.get(scoreId)?.canRead === true;
        });

        return { canonical, visible };
    }

    /**
     * @param adapter The database adapter to query.
     * @param groups The AND groups of the combination, OR-ed with each other.
     *
     * @returns The ids of the scores that carry the tags of at least one group, or every score for an empty
     * combination.
     */
    private static async matchingScoreIds(adapter: IDatabaseAdapter, groups: number[][]): Promise<Set<number>> {
        const [scores, tags] = await Promise.all([
            adapter.query<{ id: number; }>("SELECT id FROM scores", []),
            adapter.query<{ scoreId: number; tagId: number; }>(
                "SELECT score_id AS scoreId, tag_id AS tagId FROM score_tags", [],
            ),
        ]);

        const tagsByScore = new Map<number, Set<number>>();
        for (const row of tags) {
            const tagIds = tagsByScore.get(row.scoreId) ?? new Set<number>();
            tagIds.add(row.tagId);
            tagsByScore.set(row.scoreId, tagIds);
        }

        const combination = { groups };

        return new Set(scores.filter((score) => {
            return TagCombination.matches(combination, tagsByScore.get(score.id) ?? new Set<number>());
        }).map((score) => {
            return score.id;
        }));
    }
}
