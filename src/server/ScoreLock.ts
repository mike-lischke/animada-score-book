/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IDatabaseAdapter } from "./database.js";

/** A score is locked to one user while that user edits it. */
export class ScoreLock {
    /** Locks older than this are considered abandoned. */
    public static readonly timeoutMinutes = 30;

    /**
     * @param adapter The database adapter to query.
     * @param scoreId The score in question.
     * @param userId The caller.
     *
     * @returns Whether another user currently holds the score lock.
     */
    public static async heldByOther(adapter: IDatabaseAdapter, scoreId: number, userId: number): Promise<boolean> {
        const rows = await adapter.query<{ userId: number; lockedAt: unknown; }>(
            "SELECT user_id AS userId, locked_at AS lockedAt FROM score_locks WHERE score_id = ?", [scoreId],
        );

        if (rows.length === 0 || rows[0].userId === userId) {
            return false;
        }

        return !ScoreLock.isExpired(rows[0].lockedAt);
    }

    /**
     * @param lockedAt The `locked_at` value as the database returned it.
     *
     * @returns Whether the lock has outlived {@link ScoreLock.timeoutMinutes}.
     */
    public static isExpired(lockedAt: unknown): boolean {
        const timestamp = lockedAt instanceof Date
            ? lockedAt.getTime()
            : new Date(`${String(lockedAt).replace(" ", "T")}Z`).getTime();

        return Date.now() - timestamp > ScoreLock.timeoutMinutes * 60 * 1000;
    }
}
