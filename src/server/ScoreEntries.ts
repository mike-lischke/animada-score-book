/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ScoreLineup } from "../core/ScoreLineup.js";
import { ScoreMeta } from "../core/ScoreMeta.js";
import { ScoreLineupStatus, type IScoreLineup, type IScoreMeta } from "../core/DatabaseTypes.js";
import { EntityType, type Auth, type IPermissionSummary, type ITokenPayload } from "./Auth.js";
import { TagAccess, type ITagRow } from "./TagAccess.js";

/** A score as the collection receives it: the card's identity, tags, lineup, metadata and the caller's access. */
export interface IScoreEntryJson {
    id: number;
    name: string;
    tagIds: number[];
    lineup: IScoreLineup;
    meta: IScoreMeta;
    perm: IPermissionSummary;
}

/** What one query of the stored contents yields for the cards. */
interface IContentReading {
    lineups: Map<number, IScoreLineup>;
    metas: Map<number, IScoreMeta>;
}

/**
 * Builds the compact score entries the collection shows. Both the manual-filter list and a set list's members are
 * described here, so a card looks the same whichever way the score reached the list, and a score the caller cannot
 * read never leaves this module.
 */
export class ScoreEntries {
    /**
     * @param auth The authentication helper, used for the permission rows.
     * @param user The authenticated caller, or undefined for a visitor.
     * @param scoreIds The scores to describe, in the order the result should follow.
     *
     * @returns One entry per readable score, in the given order; unreadable or vanished scores are left out.
     */
    public static async list(auth: Auth, user: ITokenPayload | undefined,
        scoreIds: readonly number[]): Promise<IScoreEntryJson[]> {
        if (scoreIds.length === 0) {
            return [];
        }

        const placeholders = scoreIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await auth.adapter.query<{ id: number; name: string; }>(
            `SELECT id, name FROM scores WHERE id IN (${placeholders})`, [...scoreIds],
        );
        const names = new Map(rows.map((row) => {
            return [row.id, row.name] as [number, string];
        }));

        const summaries = await auth.getPermissionSummaries(user, EntityType.Score, [...scoreIds]);
        const readableIds = scoreIds.filter((scoreId) => {
            return names.has(scoreId) && summaries.get(scoreId)?.canRead === true;
        });

        if (readableIds.length === 0) {
            return [];
        }

        const context = await TagAccess.contextFor(auth, user);
        const tags = await ScoreEntries.tags(auth);
        const usableIds = new Set(tags.filter((tag) => {
            return TagAccess.canUse(context, tag);
        }).map((tag) => {
            return tag.id;
        }));
        const visibleIds = await ScoreEntries.usableTagIdsOf(auth, readableIds, usableIds);
        const contents = await ScoreEntries.readContents(auth, readableIds);

        return readableIds.map((scoreId) => {
            return {
                id: scoreId,
                name: names.get(scoreId)!,
                tagIds: visibleIds.get(scoreId) ?? [],
                lineup: contents.lineups.get(scoreId)!,
                meta: contents.metas.get(scoreId) ?? {},
                perm: summaries.get(scoreId)!,
            };
        });
    }

    /**
     * @param auth The authentication helper.
     *
     * @returns Every tag row, which the caller's scope is checked against.
     */
    private static async tags(auth: Auth): Promise<ITagRow[]> {
        return auth.adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, group_id AS groupId, system_key AS systemKey FROM tags", [],
        );
    }

    /**
     * @param auth The authentication helper.
     * @param scoreIds The scores to look at.
     * @param usableIds The tag ids the caller can use; everything else stays invisible.
     *
     * @returns The usable tag ids of every score.
     */
    private static async usableTagIdsOf(auth: Auth, scoreIds: readonly number[],
        usableIds: Set<number>): Promise<Map<number, number[]>> {
        const result = new Map<number, number[]>();

        const placeholders = scoreIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await auth.adapter.query<{ scoreId: number; tagId: number; }>(
            `SELECT score_id AS scoreId, tag_id AS tagId FROM score_tags WHERE score_id IN (${placeholders})`,
            [...scoreIds],
        );

        for (const row of rows) {
            if (!usableIds.has(row.tagId)) {
                continue;
            }

            const ids = result.get(row.scoreId) ?? [];
            ids.push(row.tagId);
            result.set(row.scoreId, ids);
        }

        return result;
    }

    /**
     * Reads the content of every listed score once and derives both the lineup and the metadata from it.
     *
     * @param auth The authentication helper.
     * @param scoreIds The scores whose content the cards describe.
     *
     * @returns The lineup and the metadata of every score, keyed by id. A score whose content cannot be read keeps
     * an unreadable lineup and no metadata instead of dropping out of the list.
     */
    private static async readContents(auth: Auth, scoreIds: readonly number[]): Promise<IContentReading> {
        const lineups = new Map<number, IScoreLineup>();
        const metas = new Map<number, IScoreMeta>();

        for (const scoreId of scoreIds) {
            lineups.set(scoreId, { status: ScoreLineupStatus.Unreadable, tracks: [] });
            metas.set(scoreId, {});
        }

        const placeholders = scoreIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await auth.adapter.query<{ id: number; content: string; }>(
            `SELECT id, content FROM scores WHERE id IN (${placeholders})`, [...scoreIds],
        );

        for (const row of rows) {
            lineups.set(row.id, ScoreLineup.read(row.content));
            metas.set(row.id, ScoreMeta.read(row.content));
        }

        return { lineups, metas };
    }
}
