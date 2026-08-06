/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

/**
 * Database migration runner.
 *
 * Determines the effective database name (branch-specific for feature branches, base name for main),
 * creates the database if needed, and applies all pending migrations in timestamp order.
 * Called once at server startup before the adapter is initialised.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

import type { IDatabaseConfig } from "../src/server/database.js";
import { DatabaseEngine } from "../src/server/database.js";

const migrationsDir = resolve(process.cwd(), "migrations");
const seedPath = resolve(process.cwd(), "build", "seed.sql");

export interface IMigrationRow {
    filename: string;
    checksum: string;
}

/**
 * Parses a migration SQL file and returns only the statements for the given engine.
 * Sections are delimited by `-- \\@mysql` and `-- \\@postgres` markers.
 * SQL before the first marker runs on all engines.
 *
 * @param sql The raw SQL content of the migration file.
 * @param engine The target engine ("mysql" or "postgres").
 *
 * @returns The engine-specific SQL statements concatenated.
 */
export const parseMigrationSql = (sql: string, engine: string): string => {
    const lines = sql.split("\n");
    const sections: Array<{ engine: string | null; lines: string[]; }> = [];
    let currentEngine: string | null = null;
    let currentLines: string[] = [];

    for (const line of lines) {
        const match = line.match(/^-- @(mysql|postgres)\s*$/);

        if (match) {
            if (currentLines.length > 0) {
                sections.push({ engine: currentEngine, lines: currentLines });
            }

            currentEngine = match[1];
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.length > 0) {
        sections.push({ engine: currentEngine, lines: currentLines });
    }

    const resultLines: string[] = [];

    for (const section of sections) {
        if (section.engine === null || section.engine === engine) {
            resultLines.push(...section.lines);
        }
    }

    return resultLines.join("\n");
};

/**
 * Extracts rows from a raw driver query result.
 * mysql2 returns a tuple `[rows, fields]`, while pg returns an object `{ rows, fields }`.
 *
 * @param result The raw query result from either mysql2 or pg.
 *
 * @returns The array of result rows (may be empty).
 */
export const extractRows = <T>(result: unknown): T[] => {
    if (result == null) {
        return [];
    }

    if (Array.isArray(result)) {
        const first: unknown = result[0];

        return Array.isArray(first) ? (first as T[]) : [];
    }

    const obj = result as Record<string, unknown>;

    return Array.isArray(obj.rows) ? (obj.rows as T[]) : [];
};

/**
 * Computes the SHA-256 checksum of a string.
 *
 * @param content The string to hash.
 *
 * @returns The hex-encoded SHA-256 digest.
 */
export const checksum = (content: string): string => {
    return createHash("sha256").update(content).digest("hex");
};

/**
 * Sanitises a Git branch name for use as a database name suffix.
 * Replaces any character that is not alphanumeric, underscore, or hyphen with an underscore.
 *
 * @param branch The raw Git branch name.
 *
 * @returns The sanitised branch name safe for use in a database identifier.
 */
export const sanitizeBranchName = (branch: string): string => {
    return branch.replace(/[^a-zA-Z0-9_-]/g, "_");
};

/**
 * Returns the current Git branch name, or "main" if it cannot be determined.
 *
 * @returns The current Git branch name.
 */
const getCurrentBranch = (): string => {
    try {
        return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    } catch {
        return "main";
    }
};

/**
 * Derives the effective database name.
 * For main and release branches the base name is used as-is.
 * For feature branches the pattern is `<baseName>__<branchName>`.
 *
 * @param baseName The database name from backend-config.json.
 * @param branch The current Git branch name.
 *
 * @returns The effective database name.
 */
export const deriveDbName = (baseName: string, branch: string): string => {
    if (branch === "main" || branch.startsWith("release")) {
        return baseName;
    }

    return `${baseName}__${sanitizeBranchName(branch)}`;
};

/**
 * Runs all pending migrations and returns the effective database name.
 *
 * @param config The database config from backend-config.json.
 *
 * @returns The effective database name (may differ from config.database.database for feature branches).
 */
export const runMigrations = async (config: IDatabaseConfig): Promise<string> => {
    const branch = getCurrentBranch();
    const effectiveDb = deriveDbName(config.database, branch);

    console.log(`Branch: ${branch}, database: ${effectiveDb}`);

    if (config.engine === DatabaseEngine.Postgres) {
        return runPostgresMigrations(config, effectiveDb);
    }

    return runMySqlMigrations(config, effectiveDb);
};

const runMySqlMigrations = async (config: IDatabaseConfig, dbName: string): Promise<string> => {
    const mysql2 = await import("mysql2/promise");
    const serverPool = mysql2.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        waitForConnections: true,
        connectionLimit: 1,
    });

    try {
        // Ensure database exists.
        await serverPool.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);

        // Connect to the target database.
        const dbPool = mysql2.createPool({
            host: config.host,
            port: config.port,
            database: dbName,
            user: config.user,
            password: config.password,
            waitForConnections: true,
            connectionLimit: 1,
            multipleStatements: true,
        });

        try {
            await applyMigrations(dbPool, "mysql");
        } finally {
            await dbPool.end();
        }
    } finally {
        await serverPool.end();
    }

    return dbName;
};

const runPostgresMigrations = async (config: IDatabaseConfig, dbName: string): Promise<string> => {
    const pg = await import("pg");
    const serverPool = new pg.Pool({
        host: config.host,
        port: config.port,
        database: "postgres",
        user: config.user,
        password: config.password,
        max: 1,
    });

    try {
        // Ensure database exists (Postgres has no IF NOT EXISTS for CREATE DATABASE).
        const result = await serverPool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [dbName],
        );

        if (result.rows.length === 0) {
            // Cannot use parameterised identifiers — sanitise the dbName (already derived from our config).
            await serverPool.query(`CREATE DATABASE "${dbName}"`);
        }

        // Connect to the target database.
        const dbPool = new pg.Pool({
            host: config.host,
            port: config.port,
            database: dbName,
            user: config.user,
            password: config.password,
            max: 1,
        });

        try {
            await applyMigrations(dbPool, "postgres");
        } finally {
            await dbPool.end();
        }
    } finally {
        await serverPool.end();
    }

    return dbName;
};

export interface IMigrationPool {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Applies all pending migrations.
 *
 * Works with both mysql2 and pg raw driver pools — each has a compatible `query(sql, params?)` method.
 *
 * @param pool A database pool with a query method.
 * @param engine The database engine ("mysql" or "postgres").
 */
const applyMigrations = async (pool: IMigrationPool, engine: string): Promise<void> => {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS migration_history (
            filename    VARCHAR(255) NOT NULL PRIMARY KEY,
            applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            checksum    VARCHAR(64)  NOT NULL
        )`,
    );

    const appliedResult = await pool.query(
        "SELECT filename, checksum FROM migration_history ORDER BY filename",
    );
    const appliedRows = extractRows<IMigrationRow>(appliedResult);
    const applied = new Map(appliedRows.map((r) => {
        return [r.filename, r.checksum];
    }));

    // Collect migration files in timestamp order.
    if (!existsSync(migrationsDir)) {
        console.log("No migrations directory found — skipping migrations.");

        return;
    }

    const files = readdirSync(migrationsDir)
        .filter((f) => {
            return f.endsWith(".sql");
        })
        .sort();

    if (files.length === 0) {
        console.log("No migration files found.");

        return;
    }

    // Verify checksums of already-applied migrations. A mismatch means the file was
    // changed after being applied — likely from a rebase. The branch DB must be dropped.
    for (const file of files) {
        const storedChecksum = applied.get(file);

        if (storedChecksum !== undefined) {
            const filePath = join(migrationsDir, file);
            const rawSql = readFileSync(filePath, "utf-8");
            const currentChecksum = checksum(rawSql);

            if (currentChecksum !== storedChecksum) {
                throw new Error(
                    `Migration "${file}" was modified after it was applied.\n`
                    + `Drop the branch database and restart the server to re-apply all migrations.`,
                );
            }
        }
    }

    const pending = files.filter((f) => {
        return !applied.has(f);
    });

    if (pending.length === 0) {
        console.log("All migrations already applied.");

        return;
    }

    console.log(`Applying ${pending.length} pending migration(s)...`);

    for (const file of pending) {
        const filePath = join(migrationsDir, file);
        const rawSql = readFileSync(filePath, "utf-8");
        const engineSql = parseMigrationSql(rawSql, engine);
        const fileChecksum = checksum(rawSql);

        console.log(`  Running: ${file}`);
        await pool.query(engineSql);

        await pool.query(
            "INSERT INTO migration_history (filename, checksum) VALUES (?, ?)",
            [file, fileChecksum],
        );

        console.log(`  Done: ${file}`);
    }

    console.log("All migrations applied successfully.");

    // Apply seed data if this is a fresh database (no folders yet).
    if (existsSync(seedPath)) {
        const folderResult = await pool.query("SELECT COUNT(*) AS cnt FROM folders");
        const folderRows = extractRows<{ cnt: number; }>(folderResult);
        const rowCount = folderRows[0]?.cnt ?? 0;

        if (rowCount === 0) {
            console.log("Fresh database detected — applying seed data...");
            const seedSql = readFileSync(seedPath, "utf-8");
            await pool.query(seedSql);

            console.log("Seed data applied.");
        }
    }
};
