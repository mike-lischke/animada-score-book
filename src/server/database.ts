/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** Supported database engine types for the backend. */
export enum DatabaseEngine {
    MySQL = "mysql",
    MariaDB = "mariadb",
    Postgres = "postgres",
}

export interface IDatabaseConfig {
    engine: DatabaseEngine;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

/** Generic row type returned by queries. */
export type DbRow = Record<string, unknown>;

/** Result of an INSERT/UPDATE/DELETE operation. */
export interface IDbExecuteResult {
    affectedRows: number;
    insertId: number;
}

/** Result of a connection test. */
export interface ITestConnectionResult {
    success: boolean;
    error?: string;
}

/**
 * Abstraction over different database engines (MySQL, MariaDB, PostgreSQL).
 */
export interface IDatabaseAdapter {
    /**
     * Tests a connection with the given config.
     *
     * @param config The database connection configuration.
     * @returns The test result with optional error message.
     */
    testConnection(config: IDatabaseConfig): Promise<ITestConnectionResult>;

    /**
     * Initialises the connection pool and creates all required tables.
     *
     * @param config The database connection configuration.
     */
    initialize(config: IDatabaseConfig): Promise<void>;

    /**
     * @returns Whether the adapter has been initialised.
     */
    isInitialized(): boolean;

    /**
     * Lightweight connectivity check using the existing pool. Runs SELECT 1 and returns
     * true if the database is reachable. Throws with a descriptive error on failure.
     *
     * @returns True if the database responded.
     */
    ping(): Promise<boolean>;

    /**
     * Executes a SELECT-like query and returns rows.
     *
     * @param sql    The SQL query.
     * @param params The query parameters.
     * @returns The result rows.
     */
    query<T extends DbRow = DbRow>(sql: string, params?: unknown[]): Promise<T[]>;

    /**
     * Executes an INSERT/UPDATE/DELETE statement.
     *
     * @param sql    The SQL statement.
     * @param params The statement parameters.
     * @returns Affected rows and the last insert id.
     */
    execute(sql: string, params?: unknown[]): Promise<IDbExecuteResult>;

    /**
     * Executes an INSERT statement and returns the generated id.
     * For MySQL this delegates to execute(); for Postgres it appends RETURNING id.
     *
     * @param sql    The INSERT statement.
     * @param params The statement parameters.
     * @returns Affected rows and the generated id.
     */
    insertReturningId(sql: string, params?: unknown[]): Promise<IDbExecuteResult>;

    /**
     * Executes a multi-statement SQL string (e.g. a dump file) statement by statement.
     *
     * @param sql The SQL string containing multiple statements.
     */
    executeMultiple(sql: string): Promise<void>;

    /**
     * Closes the connection pool.
     */
    shutdown(): Promise<void>;
}
