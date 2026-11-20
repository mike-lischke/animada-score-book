/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** A score row of the seed data. */
export interface ISeedScore {
    id: number;
    name: string;
    content: string;
}

/** A tag a user created. The seed cannot refer to a group, so a dumped tag is always global. */
export interface ISeedTag {
    id: number;
    name: string;

    /** The index of the tag's colour in the fixed palette. */
    colorIndex: number;
}

/**
 * An assignment of a tag to a score. A system tag is named by its `system_key`, because the seed must not depend on
 * the ids the baseline happens to generate for them.
 */
export interface ISeedScoreTag {
    scoreId: number;

    /** The id of a dumped tag. */
    tagId?: number;

    /** The `system_key` of a system tag instead of a dumped one. */
    systemKey?: string;
}

/**
 * Escapes a value as MySQL string literal. MySQL reads a backslash as an escape character, so quotes and
 * backslashes both need one.
 *
 * @param value The raw value.
 *
 * @returns The value as MySQL string literal, including the quotes.
 */
const asLiteral = (value: string): string => {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
};

/**
 * @param comment The section headline.
 * @param statement The insert statement, without values.
 * @param values The formatted value rows.
 *
 * @returns The lines of a multi-row insert, or a placeholder comment when there are no rows.
 */
const insertSection = (comment: string, statement: string, values: string[]): string[] => {
    if (values.length === 0) {
        return [comment, "-- No rows.", ""];
    }

    return [comment, statement, `${values.join(",\n")};`, ""];
};

const tagSection = (tags: ISeedTag[]): string[] => {
    const values = tags.map((tag) => {
        return `  (${tag.id}, ${asLiteral(tag.name)}, ${tag.colorIndex})`;
    });

    return insertSection("-- Tags", "INSERT IGNORE INTO tags (id, name, color_index) VALUES", values);
};

const scoreSection = (scores: ISeedScore[]): string[] => {
    const values = scores.map((score) => {
        return `  (${score.id}, ${asLiteral(score.name)}, ${asLiteral(score.content)})`;
    });

    return insertSection("-- Scores", "INSERT INTO scores (id, name, content) VALUES", values);
};

/**
 * @param scoreTags The assignments to write.
 *
 * @returns The lines of the assignment section, each one resolving a system tag through its key.
 */
const scoreTagSection = (scoreTags: ISeedScoreTag[]): string[] => {
    const lines: string[] = ["-- Score tags"];

    if (scoreTags.length === 0) {
        lines.push("-- No rows.", "");

        return lines;
    }

    for (const assignment of scoreTags) {
        if (assignment.systemKey !== undefined) {
            lines.push(`INSERT IGNORE INTO score_tags (score_id, tag_id) SELECT ${assignment.scoreId}, id FROM tags ` +
                `WHERE system_key = ${asLiteral(assignment.systemKey)};`);

            continue;
        }

        lines.push(`INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES ` +
            `(${assignment.scoreId}, ${String(assignment.tagId)});`);
    }

    lines.push("");

    return lines;
};

/**
 * Writes the seed data as a SQL script that the backend imports into an empty database.
 *
 * @param scores The score rows to write.
 * @param tags The tags a user created, all of them global.
 * @param scoreTags The tag assignments to write.
 *
 * @returns The seed script.
 */
export const createSeedSql = (scores: ISeedScore[], tags: ISeedTag[], scoreTags: ISeedScoreTag[]): string => {
    const lines: string[] = [
        "-- Seed data for Animada Score Book",
        `-- Generated: ${new Date().toISOString()}`,
        "",
        ...tagSection(tags),
        ...scoreSection(scores),
        ...scoreTagSection(scoreTags),
    ];

    return lines.join("\n");
};
