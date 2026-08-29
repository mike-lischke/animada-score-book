/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createPool } from "mysql2/promise";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

import type { DbRow, IDatabaseAdapter, IDatabaseConfig, IDbExecuteResult, ITestConnectionResult } from "./database.js";

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
    }

    public isInitialized(): boolean {
        return this.pool !== undefined;
    }

    public async ping(): Promise<boolean> {
        const pool = this.getPoolOrThrow();
        const [rows] = await pool.execute<RowDataPacket[]>("SELECT 1 AS result");

        return rows.length > 0 && (rows[0] as { result: number; }).result === 1;
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
