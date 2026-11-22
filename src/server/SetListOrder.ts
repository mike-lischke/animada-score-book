/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * The order of one set list: the places of the scores it knows, the scores that start matching later, and the
 * effect of a caller reordering the part of the list it can see. These are pure rules, so the routes only read and
 * write; they never build an order themselves.
 */
export class SetListOrder {
    /**
     * @param storedIds The scores the list knows, in their stored order.
     * @param matchingIds The scores its tag combination matches right now.
     *
     * @returns The canonical order: every known score keeps its place, whether it matches or not, and scores the
     * list does not know yet are appended by ascending id. The tie-breaker is the same for every caller and
     * session, so new matches land in the same order everywhere; they become known scores as soon as somebody with
     * write access stores an order.
     */
    public static merge(storedIds: readonly number[], matchingIds: Iterable<number>): number[] {
        const known = new Set(storedIds);
        const appended: number[] = [];

        for (const scoreId of matchingIds) {
            if (!known.has(scoreId)) {
                appended.push(scoreId);
            }
        }

        appended.sort((left, right) => {
            return left - right;
        });

        return [...storedIds, ...appended];
    }

    /**
     * @param canonicalIds The order of every known score.
     * @param visibleIds The scores the caller sees, in canonical order.
     * @param submittedIds The order the caller wants for exactly those visible scores.
     *
     * @returns The canonical order with the visible scores rearranged among their own places, so scores the caller
     * does not see keep their slots, or undefined when the submitted ids are not exactly the visible ones.
     */
    public static applyVisibleOrder(canonicalIds: readonly number[], visibleIds: readonly number[],
        submittedIds: readonly number[]): number[] | undefined {
        const visible = new Set(visibleIds);
        const submitted = new Set(submittedIds);

        if (submitted.size !== visible.size || submitted.size !== submittedIds.length) {
            return undefined;
        }

        for (const scoreId of submitted) {
            if (!visible.has(scoreId)) {
                return undefined;
            }
        }

        let next = 0;

        return canonicalIds.map((scoreId) => {
            return visible.has(scoreId) ? submittedIds[next++] : scoreId;
        });
    }
}
