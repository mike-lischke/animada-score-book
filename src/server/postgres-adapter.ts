/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import pg from "pg";

import type { DbRow, IDatabaseAdapter, IDatabaseConfig, IDbExecuteResult, ITestConnectionResult } from "./database.js";

const createTablesSQL = [
    `CREATE TABLE IF NOT EXISTS folders (
        id       SERIAL PRIMARY KEY,
        parentid INT NULL REFERENCES folders(id) ON UPDATE CASCADE ON DELETE SET NULL,
        name     VARCHAR(255) NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS scores (
        id       SERIAL PRIMARY KEY,
        folderid INT NOT NULL REFERENCES folders(id) ON UPDATE CASCADE ON DELETE CASCADE,
        name     VARCHAR(255) NOT NULL,
        content  TEXT NOT NULL,
        notes    TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS instruments (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        description   TEXT,
        imageurl      VARCHAR(512),
        articulations JSONB NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS instrument_images (
        id           SERIAL PRIMARY KEY,
        instrumentid INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
        filepath     VARCHAR(255) NOT NULL,
        alttext      VARCHAR(255),
        mimetype     VARCHAR(100) NOT NULL,
        width        INT,
        height       INT,
        filesize     INT
    )`,

    `CREATE TABLE IF NOT EXISTS users (
        id                 SERIAL PRIMARY KEY,
        username           VARCHAR(255) NOT NULL UNIQUE,
        password_hash      VARCHAR(512) NOT NULL,
        refresh_token_hash VARCHAR(256),
        display_name       VARCHAR(255) NOT NULL,
        last_login    TIMESTAMP,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS groups (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(255) NOT NULL UNIQUE,
        description   TEXT,
        color         VARCHAR(7)   NOT NULL DEFAULT '#808080',
        password_hash VARCHAR(512),
        admin_id      INT REFERENCES users(id) ON DELETE SET NULL,
        last_login    TIMESTAMP,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS user_groups (
        user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, group_id)
    )`,

    `CREATE TABLE IF NOT EXISTS permissions (
        id          SERIAL PRIMARY KEY,
        entity_type VARCHAR(32)  NOT NULL,
        entity_id   INT NULL,
        owner_id    INT NULL REFERENCES users(id) ON DELETE SET NULL,
        group_id    INT NULL REFERENCES groups(id) ON DELETE SET NULL,
        perm_bits   INT NOT NULL DEFAULT 0,
        UNIQUE (entity_type, entity_id)
    )`,
];

/**
 * PostgreSQL uses $1, $2, ... placeholders. Convert ? placeholders to $n.
 *
 * @param sql The SQL string with ? placeholders.
 * @returns The SQL string with $n placeholders.
 */
const convertPlaceholders = (sql: string): string => {
    let index = 0;

    return sql.replace(/\?/g, () => {
        index++;

        return `$${index}`;
    });
};

export class PostgresAdapter implements IDatabaseAdapter {
    private pool: pg.Pool | undefined;

    public async testConnection(config: IDatabaseConfig): Promise<ITestConnectionResult> {
        let testPool: pg.Pool | undefined;

        try {
            // Connect to the default 'postgres' database — the target DB may not exist yet.
            testPool = new pg.Pool({
                host: config.host,
                port: config.port,
                database: "postgres",
                user: config.user,
                password: config.password,
                max: 1,
                connectionTimeoutMillis: 5000,
            });

            const result = await testPool.query("SELECT 1 AS result");

            return {
                success: result.rows.length > 0 && (result.rows[0] as { result: number; }).result === 1,
            };
        } catch (e: unknown) {
            return { success: false, error: String(e) };
        } finally {
            if (testPool) {
                await testPool.end();
            }
        }
    }

    public async initialize(config: IDatabaseConfig): Promise<void> {
        if (this.pool) {
            await this.pool.end();
        }

        // First, create the database if it does not exist.
        const initPool = new pg.Pool({
            host: config.host,
            port: config.port,
            database: "postgres",
            user: config.user,
            password: config.password,
            max: 1,
            connectionTimeoutMillis: 10000,
        });

        const dbName = config.database.replace(/"/g, '""');

        try {
            await initPool.query(`CREATE DATABASE "${dbName}"`);
        } catch {
            // Database may already exist — that is fine.
        }

        await initPool.end();

        // Now connect to the target database and create tables.
        this.pool = new pg.Pool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            max: 10,
            connectionTimeoutMillis: 10000,
        });

        const client = await this.pool.connect();

        try {
            for (const stmt of createTablesSQL) {
                await client.query(stmt);
            }

            // Migration: add refresh_token_hash column for token rotation.
            try {
                await client.query(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(256)",
                );
            } catch {
                // Safe to ignore.
            }

            // Migration: add color column to groups.
            try {
                await client.query(
                    "ALTER TABLE groups ADD COLUMN IF NOT EXISTS color VARCHAR(7) NOT NULL DEFAULT '#808080'",
                );
            } catch {
                // Safe to ignore.
            }
        } finally {
            client.release();
        }
    }

    public isInitialized(): boolean {
        return this.pool !== undefined;
    }

    public async query<T extends DbRow = DbRow>(sql: string, params?: unknown[]): Promise<T[]> {
        const pool = this.getPoolOrThrow();
        const result = await pool.query<T>(convertPlaceholders(sql), params);

        return result.rows;
    }

    public async execute(sql: string, params?: unknown[]): Promise<IDbExecuteResult> {
        const pool = this.getPoolOrThrow();
        const result = await pool.query(convertPlaceholders(sql), params);

        return {
            affectedRows: result.rowCount ?? 0,
            insertId: 0, // PostgreSQL uses RETURNING id for this
        };
    }

    /**
     * Executes an INSERT and returns the generated id via RETURNING.
     *
     * @param sql    The INSERT statement (without RETURNING clause; it will be appended).
     * @param params The statement parameters.
     * @returns Affected rows and the generated id.
     */
    public async insertReturningId(sql: string, params?: unknown[]): Promise<IDbExecuteResult> {
        const pool = this.getPoolOrThrow();

        // Append RETURNING id if not already present.
        const returningSql = sql.includes("RETURNING") ? sql : `${sql} RETURNING id`;
        const result = await pool.query<{ id: number; }>(convertPlaceholders(returningSql), params);

        return {
            affectedRows: result.rowCount ?? 0,
            insertId: result.rows[0]?.id ?? 0,
        };
    }

    public async executeMultiple(sql: string): Promise<void> {
        const pool = this.getPoolOrThrow();
        const client = await pool.connect();

        try {
            const statements = sql
                .split(";")
                .map((s) => {
                    return s.trim();
                })
                .filter((s) => {
                    return s.length > 0;
                });

            for (const stmt of statements) {
                await client.query(stmt);
            }
        } finally {
            client.release();
        }
    }

    public async shutdown(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = undefined;
        }
    }

    private getPoolOrThrow(): pg.Pool {
        if (!this.pool) {
            throw new Error("Database not initialised. Call initialize() first.");
        }

        return this.pool;
    }
}
