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

import { createSeedSql, type ISeedFolder, type ISeedScore } from "./seed.js";

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

const main = async (): Promise<void> => {
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

    // The folder list API names the root level -1, which the seed script replaces by NULL.
    const seedFolders: ISeedFolder[] = folders.map((folder) => {
        const isRoot = folder.parentid === null || folder.parentid === -1;

        return { id: folder.id, parentid: isRoot ? null : folder.parentid, name: folder.name };
    });

    const seedScores: ISeedScore[] = scores.map((score) => {
        return { id: score.id, folderid: score.folderid, name: score.name, content: score.content };
    });

    const seedSql = createSeedSql(seedFolders, seedScores);
    const dumpPath = resolve(process.cwd(), "build", "seed.sql");

    writeFileSync(dumpPath, seedSql, "utf-8");
    console.log(`Dump written: ${dumpPath} (${folders.length} folders, ${scores.length} scores)`);
};

void main();
