/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createPool } from "mysql2/promise";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

import type { DbRow, IDatabaseAdapter, IDatabaseConfig, IDbExecuteResult, ITestConnectionResult } from "./database.js";

// KEEP IN SYNC with createTablesSQL in postgres-adapter.ts — same tables, same columns, same nullability.
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

    `CREATE TABLE IF NOT EXISTS users (
        id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
        username           VARCHAR(255) NOT NULL,
        password_hash      VARCHAR(512) NOT NULL,
        refresh_token_hash VARCHAR(256) NULL,
        auth_type          VARCHAR(16)  NULL,
        group_id           INT UNSIGNED NULL,
        display_name       VARCHAR(255) NOT NULL,
        last_login    TIMESTAMP    NULL,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_users_username (username)
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS login_audit (
        id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id    INT UNSIGNED NOT NULL,
        event      ENUM('login', 'group_login', 'refresh', 'logout') NOT NULL,
        group_id   INT UNSIGNED NULL,
        ip_address VARCHAR(45) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_audit_user_time (user_id, created_at),
        CONSTRAINT fk_audit_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS \`groups\` (
        id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
        name          VARCHAR(255) NOT NULL,
        description   TEXT NULL,
        color         VARCHAR(7)   NOT NULL DEFAULT '#808080',
        password_hash VARCHAR(512) NULL,
        admin_id      INT UNSIGNED NULL,
        last_login    TIMESTAMP    NULL,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_groups_name (name),
        CONSTRAINT fk_groups_admin
            FOREIGN KEY (admin_id) REFERENCES users(id)
            ON DELETE SET NULL
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS user_groups (
        user_id  INT UNSIGNED NOT NULL,
        group_id INT UNSIGNED NOT NULL,
        PRIMARY KEY (user_id, group_id),
        CONSTRAINT fk_user_groups_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE,
        CONSTRAINT fk_user_groups_group
            FOREIGN KEY (group_id) REFERENCES \`groups\`(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS permissions (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        entity_type VARCHAR(32)  NOT NULL,
        entity_id   INT UNSIGNED NULL,
        owner_id    INT UNSIGNED NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_permissions_entity (entity_type, entity_id),
        CONSTRAINT fk_permissions_owner
            FOREIGN KEY (owner_id) REFERENCES users(id)
            ON DELETE SET NULL
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS entity_groups (
        entity_type VARCHAR(32)  NOT NULL,
        entity_id   INT UNSIGNED NOT NULL,
        group_id    INT UNSIGNED NOT NULL,
        writable    TINYINT(1)   NOT NULL DEFAULT 0,
        PRIMARY KEY (entity_type, entity_id, group_id),
        CONSTRAINT fk_entity_groups_group
            FOREIGN KEY (group_id) REFERENCES \`groups\`(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB`,
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

            // Migration: add refresh_token_hash column for token rotation.
            try {
                await connection.execute(
                    "ALTER TABLE users ADD COLUMN refresh_token_hash VARCHAR(256) NULL",
                );
            } catch {
                // Column may already exist — safe to ignore.
            }

            // Migration: add color column to groups.
            try {
                await connection.execute(
                    "ALTER TABLE `groups` ADD COLUMN color VARCHAR(7) NOT NULL DEFAULT '#808080'",
                );
            } catch {
                // Column may already exist — safe to ignore.
            }
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
