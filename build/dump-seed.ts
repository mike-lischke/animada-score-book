/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Creates a SQL dump of scores and folders from the database.
 *
 * Usage: npx tsx build/dump-seed.ts
 */

/* eslint-disable no-restricted-syntax */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "http://127.0.0.1:3100/api";

const fetchJson = async (action: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const res = await fetch(`${API}?action=${action}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    return res.json() as Promise<Record<string, unknown>>;
};

interface IFolder {
    id: number;
    parentid: number | null;
    name: string;
}

interface IScore {
    id: number;
    folderid: number | null;
    name: string;
    content: string;
}

const escapeSql = (s: string): string => {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
};

/**
 * Appends a section with a multi-row insert, or a placeholder comment when there are no rows.
 *
 * @param lines The output buffer.
 * @param comment The section headline.
 * @param statement The insert statement, without values.
 * @param values The formatted value rows.
 */
const pushInsert = (lines: string[], comment: string, statement: string, values: string[]): void => {
    lines.push(comment);

    if (values.length === 0) {
        lines.push("-- No rows.");
    } else {
        lines.push(statement);
        lines.push(values.join(",\n") + ";");
    }

    lines.push("");
};

const main = async (): Promise<void> => {
    const lines: string[] = [
        "-- Seed data for Animada Score Book",
        `-- Generated: ${new Date().toISOString()}`,
        "",
    ];

    const folders: IFolder[] = [];
    const scores: IScore[] = [];

    const collect = async (parentId: number | undefined): Promise<void> => {
        const data = await fetchJson("listScoreFolderContent", { parentid: parentId ?? -1 });
        const fs = (data.folders ?? []) as IFolder[];
        const sc = (data.scores ?? []) as IScore[];

        for (const f of fs) {
            folders.push(f);
            await collect(f.id);
        }

        for (const s of sc) {
            scores.push(s);
        }
    };

    console.log("Collecting…");
    await collect(undefined);

    const folderValues = folders.map((f) => {
        const pid = f.parentid === -1 || f.parentid === null ? "NULL" : String(f.parentid);

        return `  (${f.id}, ${pid}, '${escapeSql(f.name)}')`;
    });
    pushInsert(lines, "-- Folders", "INSERT INTO folders (id, parentid, name) VALUES", folderValues);

    const scoreValues = scores.map((s) => {
        const fid = s.folderid === null ? "NULL" : String(s.folderid);

        return `  (${s.id}, ${fid}, '${escapeSql(s.name)}', '${escapeSql(s.content)}')`;
    });
    pushInsert(lines, "-- Scores", "INSERT INTO scores (id, folderid, name, content) VALUES", scoreValues);

    const dumpPath = resolve(process.cwd(), "build", "seed.sql");

    writeFileSync(dumpPath, lines.join("\n"), "utf-8");
    console.log(`Dump written: ${dumpPath} (${folders.length} folders, ${scores.length} scores)`);
};

void main();
