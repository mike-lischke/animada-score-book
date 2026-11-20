/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IDatabaseAdapter } from "./database.js";
import { TagAccess } from "./TagAccess.js";

/**
 * The instrument tags of a score are derived from the instruments its tracks use, so the owner of a score never
 * assigns them by hand. The backend derives them on every save and is the authority the catalogue shows.
 */
export class InstrumentTags {
    /**
     * Reads the instrument type ids of a packed arrangement.
     *
     * @param content The stored score content.
     *
     * @returns The distinct instrument type ids, or an empty list when the content is not a packed arrangement.
     */
    public static readTypeIds(content: string): string[] {
        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch {
            return [];
        }

        if (typeof parsed !== "object" || parsed === null) {
            return [];
        }

        const tracks = (parsed as { k?: unknown; }).k;
        if (!Array.isArray(tracks)) {
            return [];
        }

        const typeIds = new Set<string>();
        for (const track of tracks) {
            if (!Array.isArray(track)) {
                continue;
            }

            const typeId: unknown = track[1];
            if (typeof typeId === "string" && typeId.length > 0) {
                typeIds.add(typeId);
            }
        }

        return Array.from(typeIds);
    }

    /**
     * Brings the instrument tags of a score in line with its content: missing ones are assigned, tags of instruments
     * the score no longer uses are removed.
     *
     * @param adapter The database adapter to work with.
     * @param scoreId The score to sync.
     * @param content The content the score was just saved with.
     */
    public static async sync(adapter: IDatabaseAdapter, scoreId: number, content: string): Promise<void> {
        const systemTags = await adapter.query<{ id: number; systemKey: string; }>(
            "SELECT id, system_key AS systemKey FROM tags WHERE system_key LIKE ?",
            [`${TagAccess.instrumentSystemKeyPrefix}%`],
        );

        const tagIdPerType = new Map<string, number>();
        for (const tag of systemTags) {
            const typeId = tag.systemKey.slice(TagAccess.instrumentSystemKeyPrefix.length);
            tagIdPerType.set(typeId, tag.id);
        }

        const assigned = await adapter.query<{ tagId: number; }>(
            "SELECT st.tag_id AS tagId FROM score_tags st JOIN tags t ON t.id = st.tag_id " +
            "WHERE st.score_id = ? AND t.system_key LIKE ?",
            [scoreId, `${TagAccess.instrumentSystemKeyPrefix}%`],
        );

        const instrumentTagIds = new Set(tagIdPerType.values());
        const current = new Set(assigned.map((row) => {
            return row.tagId;
        }).filter((tagId) => {
            return instrumentTagIds.has(tagId);
        }));

        const desired = new Set<number>();
        for (const typeId of InstrumentTags.readTypeIds(content)) {
            const tagId = tagIdPerType.get(typeId);

            if (tagId !== undefined) {
                desired.add(tagId);
            }
        }

        for (const tagId of current) {
            if (!desired.has(tagId)) {
                await adapter.execute("DELETE FROM score_tags WHERE score_id = ? AND tag_id = ?", [scoreId, tagId]);
            }
        }

        for (const tagId of desired) {
            if (!current.has(tagId)) {
                await adapter.execute("INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES (?, ?)",
                    [scoreId, tagId]);
            }
        }
    }

    /**
     * @param adapter The database adapter to query.
     * @param scoreId The score in question.
     * @param tagId An instrument tag.
     *
     * @returns Whether the score still uses the instrument the tag stands for.
     */
    public static async isInUse(adapter: IDatabaseAdapter, scoreId: number, tagId: number): Promise<boolean> {
        const rows = await adapter.query<{ content: string; }>(
            "SELECT content FROM scores WHERE id = ?", [scoreId],
        );

        if (rows.length === 0) {
            return false;
        }

        const tags = await adapter.query<{ systemKey: string | null; }>(
            "SELECT system_key AS systemKey FROM tags WHERE id = ?", [tagId],
        );

        if (tags.length === 0 || tags[0].systemKey === null) {
            return false;
        }

        const systemKey = tags[0].systemKey;
        if (!systemKey.startsWith(TagAccess.instrumentSystemKeyPrefix)) {
            return false;
        }

        const typeId = systemKey.slice(TagAccess.instrumentSystemKeyPrefix.length);

        return InstrumentTags.readTypeIds(rows[0].content).includes(typeId);
    }
}
