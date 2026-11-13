/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** A folder row of the seed data. */
export interface ISeedFolder {
    id: number;
    parentid: number | null;
    name: string;
}

/** A score row of the seed data. */
export interface ISeedScore {
    id: number;
    folderid: number | null;
    name: string;
    content: string;
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

const folderSection = (folders: ISeedFolder[]): string[] => {
    const values = folders.map((folder) => {
        const parentId = folder.parentid === null ? "NULL" : String(folder.parentid);

        return `  (${folder.id}, ${parentId}, ${asLiteral(folder.name)})`;
    });

    return insertSection("-- Folders", "INSERT INTO folders (id, parentid, name) VALUES", values);
};

const scoreSection = (scores: ISeedScore[]): string[] => {
    const values = scores.map((score) => {
        const folderId = score.folderid === null ? "NULL" : String(score.folderid);

        return `  (${score.id}, ${folderId}, ${asLiteral(score.name)}, ${asLiteral(score.content)})`;
    });

    return insertSection("-- Scores", "INSERT INTO scores (id, folderid, name, content) VALUES", values);
};

/**
 * Writes the seed data as a SQL script that the backend imports into an empty database.
 *
 * @param folders The folder rows to write.
 * @param scores The score rows to write.
 *
 * @returns The seed script.
 */
export const createSeedSql = (folders: ISeedFolder[], scores: ISeedScore[]): string => {
    const lines: string[] = [
        "-- Seed data for Animada Score Book",
        `-- Generated: ${new Date().toISOString()}`,
        "",
        ...folderSection(folders),
        ...scoreSection(scores),
    ];

    return lines.join("\n");
};
