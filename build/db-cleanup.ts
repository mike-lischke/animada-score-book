/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

/**
 * Scans for orphaned branch-specific databases and reports them.
 * Run with: npx tsx build/db-cleanup.ts
 *
 * An orphaned database is one whose branch name suffix no longer matches any local Git branch.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface IBackendConfig {
    database: {
        engine: string;
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
    };
}

const configPath = resolve(process.cwd(), "backend-config.json");

const loadConfig = (): IBackendConfig | undefined => {
    if (!existsSync(configPath)) {
        console.log("No backend-config.json found. Nothing to clean up.");

        return undefined;
    }

    return JSON.parse(readFileSync(configPath, "utf-8")) as IBackendConfig;
};

const getLocalBranches = (): Set<string> => {
    try {
        const output = execSync("git branch --format='%(refname:short)'", { encoding: "utf-8" });

        return new Set(output.trim().split("\n").filter(Boolean));
    } catch {
        console.log("Could not determine local Git branches.");

        return new Set();
    }
};

const main = async (): Promise<void> => {
    const config = loadConfig();

    if (!config) {
        return;
    }

    const { engine, host, port, user, password, database: baseName } = config.database;

    const localBranches = getLocalBranches();

    // Build the expected set of database names from local branches.
    const expectedDbs = new Set<string>();
    expectedDbs.add(baseName); // main/release database

    for (const branch of localBranches) {
        if (branch !== "main" && !branch.startsWith("release")) {
            const sanitized = branch.replace(/[^a-zA-Z0-9_-]/g, "_");
            expectedDbs.add(`${baseName}__${sanitized}`);
        }
    }

    const prefix = `${baseName}__`;

    if (engine === "postgres") {
        const pg = await import("pg");
        const pool = new pg.Pool({
            host,
            port,
            database: "postgres",
            user,
            password,
            max: 1,
        });

        try {
            const result = await pool.query(
                "SELECT datname FROM pg_database WHERE datname LIKE $1",
                [`${baseName}%`],
            );
            const dbNames = (result.rows as Array<{ datname: string; }>).map((r) => {
                return r.datname;
            });

            checkOrphans(dbNames, expectedDbs, prefix);
        } finally {
            await pool.end();
        }
    } else {
        const mysql2 = await import("mysql2/promise");
        const pool = mysql2.createPool({
            host,
            port,
            user,
            password,
            waitForConnections: true,
            connectionLimit: 1,
        });

        try {
            const [rows] = await pool.execute(
                "SHOW DATABASES LIKE ?",
                [`${baseName}%`],
            );
            const dbNames = (rows as Array<{ Database: string; }>).map((r) => {
                return r.Database;
            });

            checkOrphans(dbNames, expectedDbs, prefix);
        } finally {
            await pool.end();
        }
    }
};

const checkOrphans = (
    dbNames: string[],
    expectedDbs: Set<string>,
    prefix: string,
): void => {
    const orphans: string[] = [];

    for (const dbName of dbNames) {
        // Only check branch-specific databases (those with the __ prefix).
        if (dbName.includes("__") && !expectedDbs.has(dbName)) {
            orphans.push(dbName);
        }
    }

    if (orphans.length === 0) {
        console.log("No orphaned branch databases found.");

        return;
    }

    console.log("Orphaned branch databases (branch no longer exists locally):");

    for (const db of orphans) {
        console.log(`  - ${db}`);
    }

    console.log(
        "\nTo drop these databases manually, run:\n"
        + orphans.map((db) => {
            return "  echo 'DROP DATABASE `" + db + "`;' | mysql -u root -p";
        }).join("\n"),
    );
};

main().catch((e: unknown) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
});
