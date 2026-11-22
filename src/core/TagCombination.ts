/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ITagCombination, ITagInfo } from "./types/tags.js";

/**
 * The rules a tag combination follows: it is an OR of AND groups, so it is kept in one canonical shape before it is
 * stored, compared or sent to the backend.
 */
export class TagCombination {
    /** The combination that matches every score. */
    public static readonly empty: ITagCombination = { groups: [] };

    /**
     * @param combination The combination to canonicalise.
     *
     * @returns The combination with sorted, unique ids per group, no empty group, and the groups in a stable order.
     */
    public static normalize(combination: ITagCombination): ITagCombination {
        const groups: number[][] = [];

        for (const group of combination.groups) {
            const ids = Array.from(new Set(group)).sort((left, right) => {
                return left - right;
            });

            if (ids.length > 0) {
                groups.push(ids);
            }
        }

        groups.sort((left, right) => {
            return left[0] - right[0];
        });

        return { groups };
    }

    /**
     * @param left The first combination.
     * @param right The second combination.
     *
     * @returns Whether both describe the same filter, whatever their order and grouping was.
     */
    public static equals(left: ITagCombination, right: ITagCombination): boolean {
        return JSON.stringify(TagCombination.normalize(left)) === JSON.stringify(TagCombination.normalize(right));
    }

    /**
     * @param left The first combination.
     * @param right The second combination.
     *
     * @returns The combination that matches only what both match, keeping the OR-of-AND shape: every pair of an
     * AND group from each side becomes one AND group of the result. An empty combination matches everything, so it
     * is the identity here.
     */
    public static combine(left: ITagCombination, right: ITagCombination): ITagCombination {
        const leftGroups = TagCombination.normalize(left).groups;
        const rightGroups = TagCombination.normalize(right).groups;

        if (leftGroups.length === 0) {
            return { groups: rightGroups };
        }

        if (rightGroups.length === 0) {
            return { groups: leftGroups };
        }

        const groups: number[][] = [];
        for (const leftGroup of leftGroups) {
            for (const rightGroup of rightGroups) {
                groups.push([...leftGroup, ...rightGroup]);
            }
        }

        return TagCombination.normalize({ groups });
    }

    /**
     * @param combination The combination to test.
     * @param tagIds The tags one score carries.
     *
     * @returns Whether the score satisfies the combination. An empty combination matches every score, otherwise
     * one of its AND groups has to be fully contained in the score's tags.
     */
    public static matches(combination: ITagCombination, tagIds: ReadonlySet<number>): boolean {
        const groups = TagCombination.normalize(combination).groups;

        return groups.length === 0 || groups.some((group) => {
            return group.every((id) => {
                return tagIds.has(id);
            });
        });
    }

    /**
     * Drops the tag ids the current user cannot use, which happens for a stored combination when a tag was deleted
     * or belongs to a group the user left.
     *
     * @param combination The combination to restrict.
     * @param usableIds The tag ids the user can use.
     *
     * @returns The restricted, normalised combination.
     */
    public static restrict(combination: ITagCombination, usableIds: ReadonlySet<number>): ITagCombination {
        return TagCombination.normalize({
            groups: combination.groups.map((group) => {
                return group.filter((id) => {
                    return usableIds.has(id);
                });
            }),
        });
    }

    /**
     * @param combination The combination to describe.
     *
     * @returns Whether it filters anything at all.
     */
    public static isEmpty(combination: ITagCombination): boolean {
        return combination.groups.length === 0;
    }

    /**
     * @param combination The combination to count.
     *
     * @returns The number of OR groups the combination holds.
     */
    public static groupCount(combination: ITagCombination): number {
        return combination.groups.length;
    }

    /**
     * @param combination The combination to describe.
     * @param tags The known tags, from which the captions are resolved.
     *
     * @returns A readable caption like `Caixa AND Surdo OR Tamborim`, with the groups that hold more than one tag
     * in parentheses. Ids without a known tag are left out.
     */
    public static caption(combination: ITagCombination, tags: readonly ITagInfo[]): string {
        const namesById = new Map(tags.map((tag) => {
            return [tag.id, tag.name] as [number, string];
        }));

        const groups = TagCombination.normalize(combination).groups.map((group) => {
            return group.map((id) => {
                return namesById.get(id);
            }).filter((name) => {
                return name !== undefined;
            }).join(" AND ");
        }).filter((caption) => {
            return caption.length > 0;
        });

        return groups.map((caption) => {
            return groups.length > 1 && caption.includes(" AND ") ? `(${caption})` : caption;
        }).join(" OR ");
    }
}
