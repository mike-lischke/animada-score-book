/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createPool } from "mysql2/promise";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

import type { DbRow, IDatabaseAdapter, IDatabaseConfig, IDbExecuteResult, ITestConnectionResult } from "./database.js";

const createTablesSQL = [
    `CREATE TABLE IF NOT EXISTS folders (
        id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
        parentid INT UNSIGNED NULL,
        name     VARCHAR(255) NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_folders_parent
            FOREIGN KEY (parentid)
            REFERENCES folders(id)
            ON UPDATE CASCADE
            ON DELETE SET NULL
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS scores (
        id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
        folderid INT UNSIGNED NULL,
        name     VARCHAR(255) NOT NULL,
        content  MEDIUMTEXT    NOT NULL,
        notes    TEXT          NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_scores_folder
            FOREIGN KEY (folderid)
            REFERENCES folders(id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
    ) ENGINE=InnoDB, AUTO_INCREMENT = 10000`,

    `CREATE TABLE IF NOT EXISTS instruments (
        id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
        name          VARCHAR(255) NOT NULL,
        description   TEXT,
        imageurl      VARCHAR(512),
        articulations JSON NOT NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB, AUTO_INCREMENT = 20000`,

    `CREATE TABLE IF NOT EXISTS instrument_images (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        instrumentid INT UNSIGNED NOT NULL,
        filepath     VARCHAR(255) NOT NULL,
        alttext      VARCHAR(255) NULL,
        mimetype     VARCHAR(100) NOT NULL,
        width        INT NULL,
        height       INT NULL,
        filesize     INT NULL,
        CONSTRAINT fk_instrument_images_instrument
            FOREIGN KEY (instrumentid) REFERENCES instruments(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB, AUTO_INCREMENT = 30000`,
];

export class MySqlAdapter implements IDatabaseAdapter {
    private pool: Pool | undefined;

    public async testConnection(config: IDatabaseConfig): Promise<ITestConnectionResult> {
        let testPool: Pool | undefined;

        try {
            // Connect without specifying a database — the database may not exist yet.
            testPool = createPool({
                host: config.host,
                port: config.port,
                user: config.user,
                password: config.password,
                waitForConnections: true,
                connectionLimit: 1,
                connectTimeout: 5000,
            });

            const [rows] = await testPool.execute<RowDataPacket[]>("SELECT 1 AS result");

            return { success: rows.length > 0 && (rows[0] as { result: number; }).result === 1 };
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
        const initPool = createPool({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            waitForConnections: true,
            connectionLimit: 1,
            connectTimeout: 10000,
        });

        await initPool.execute(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
        await initPool.end();

        // Now connect to the target database and create tables.
        this.pool = createPool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            waitForConnections: true,
            connectionLimit: 10,
            connectTimeout: 10000,
        });

        const connection = await this.pool.getConnection();

        try {
            for (const stmt of createTablesSQL) {
                await connection.execute(stmt);
            }

            // Migration: allow scores at root level (folderid nullable).
            await connection.execute(
                "ALTER TABLE scores MODIFY folderid INT UNSIGNED NULL",
            );
        } finally {
            connection.release();
        }
    }

    public isInitialized(): boolean {
        return this.pool !== undefined;
    }

    public async query<T extends DbRow = DbRow>(sql: string, params?: unknown[]): Promise<T[]> {
        const pool = this.getPoolOrThrow();
        const [rows] = await pool.execute<RowDataPacket[]>(sql, params);

        return rows as T[];
    }

    public async execute(sql: string, params?: unknown[]): Promise<IDbExecuteResult> {
        const pool = this.getPoolOrThrow();
        const [result] = await pool.execute<ResultSetHeader>(sql, params);

        return { affectedRows: result.affectedRows, insertId: result.insertId };
    }

    public async insertReturningId(sql: string, params?: unknown[]): Promise<IDbExecuteResult> {
        return this.execute(sql, params);
    }

    public async executeMultiple(sql: string): Promise<void> {
        const pool = this.getPoolOrThrow();
        const connection = await pool.getConnection();

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
                await connection.execute(stmt);
            }
        } finally {
            connection.release();
        }
    }

    public async shutdown(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = undefined;
        }
    }

    private getPoolOrThrow(): Pool {
        if (!this.pool) {
            throw new Error("Database not initialised. Call initialize() first.");
        }

        return this.pool;
    }
}
