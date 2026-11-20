/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Creates a SQL dump of the scores, the global tags and their assignments from the database.
 *
 * Usage: npx tsx build/dump-seed.ts
 */

/* eslint-disable no-restricted-syntax */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfig } from "../src/server/config.js";
import { InstrumentTags } from "../src/server/InstrumentTags.js";
import { TagAccess } from "../src/server/TagAccess.js";
import { resolveDatabaseName } from "./migration.js";
import { createSeedSql, type ISeedScore, type ISeedScoreTag, type ISeedTag } from "./seed.js";

interface IScoreRow {
    id: number;
    name: string;
    content: string;
}

interface ITagRow {
    id: number;
    name: string;
    colorIndex: number;
}

interface IAssignmentRow {
    scoreId: number;
    tagId: number;
    systemKey: string | null;
    groupId: number | null;
}

const main = async (): Promise<void> => {
    const config = loadConfig();
    const { host, port, user, password, database: baseName } = config.database;
    const database = resolveDatabaseName(baseName);

    const mysql2 = await import("mysql2/promise");
    const pool = mysql2.createPool({ host, port, database, user, password, connectionLimit: 1 });

    try {
        console.log(`Collecting from ${database}…`);

        const [scoreRows] = await pool.query("SELECT id, name, content FROM scores");
        const [tagRows] = await pool.query(
            "SELECT id, name, color_index AS colorIndex FROM tags WHERE system_key IS NULL AND group_id IS NULL",
        );
        const [assignmentRows] = await pool.query(
            "SELECT st.score_id AS scoreId, st.tag_id AS tagId, t.system_key AS systemKey, "
            + "t.group_id AS groupId FROM score_tags st JOIN tags t ON t.id = st.tag_id",
        );

        const scores = scoreRows as IScoreRow[];
        const tags = tagRows as ITagRow[];
        const assignments = assignmentRows as IAssignmentRow[];

        const seedScores: ISeedScore[] = scores.map((score) => {
            return { id: score.id, name: score.name, content: score.content };
        });
        const seedTags: ISeedTag[] = tags.map((tag) => {
            return { id: tag.id, name: tag.name, colorIndex: tag.colorIndex };
        });

        const seedAssignments: ISeedScoreTag[] = [];

        for (const assignment of assignments) {
            if (assignment.systemKey !== null) {
                seedAssignments.push({ scoreId: assignment.scoreId, systemKey: assignment.systemKey });

                continue;
            }

            if (assignment.groupId === null) {
                seedAssignments.push({ scoreId: assignment.scoreId, tagId: assignment.tagId });

                continue;
            }

            console.warn(
                `Skipping a tag of group ${assignment.groupId} on score ${assignment.scoreId}: `
                + "a dump only carries global tags.",
            );
        }

        // A score may have been stored before its instrument tags were derived, so they are completed here.
        for (const score of scores) {
            for (const typeId of InstrumentTags.readTypeIds(score.content)) {
                const systemKey = TagAccess.instrumentSystemKey(typeId);

                if (assignments.some((assignment) => {
                    return assignment.scoreId === score.id && assignment.systemKey === systemKey;
                })) {
                    continue;
                }

                seedAssignments.push({ scoreId: score.id, systemKey });
            }
        }

        const seedSql = createSeedSql(seedScores, seedTags, seedAssignments);
        const dumpPath = resolve(process.cwd(), "build", "seed.sql");

        writeFileSync(dumpPath, seedSql, "utf-8");
        console.log(
            `Dump written: ${dumpPath} (${seedScores.length} scores, ${seedTags.length} tags, `
            + `${seedAssignments.length} assignments)`,
        );
    } finally {
        await pool.end();
    }
};

void main();
