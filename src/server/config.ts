/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DatabaseEngine, type IDatabaseAdapter, type IDatabaseConfig } from "./database.js";
import { MySqlAdapter } from "./mysql-adapter.js";
import { PostgresAdapter } from "./postgres-adapter.js";

export const configPath = resolve(process.cwd(), "backend-config.json");
export const uploadsPath = resolve(process.cwd(), "public", "uploads", "instruments");

export interface IServerConfig {
    host: string;
    port: number;
    database: IDatabaseConfig;
    soundLibPath: string;

    /** Origins allowed for CORS. Undefined = no CORS headers (strictest). */
    allowedOrigins?: string[];

    /** When true, trust x-forwarded-* proxy headers. Default false. */
    trustProxy?: boolean;
}

export const startupStatus = {
    configLoaded: false,
    configError: "",
    dbReachable: false,
    dbError: "",
};

export const loadConfig = (): IServerConfig => {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<IServerConfig>;

    // Parse ALLOWED_ORIGINS env var (comma-separated).
    const allowedOriginsEnv = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((s) => {
            return s.trim();
        }).filter(Boolean)
        : undefined;

    // Environment variables take precedence over saved config.
    const merged: IServerConfig = {
        host: process.env.HOST ?? raw.host ?? "0.0.0.0",
        port: process.env.PORT ? Number(process.env.PORT) : (raw.port ?? 3100),
        allowedOrigins: allowedOriginsEnv ?? raw.allowedOrigins,
        trustProxy: process.env.TRUST_PROXY !== undefined
            ? process.env.TRUST_PROXY === "true"
            : (raw.trustProxy ?? false),
        database: {
            engine: (process.env.DB_ENGINE as DatabaseEngine | undefined)
                ?? raw.database?.engine ?? DatabaseEngine.MySQL,
            host: process.env.DB_HOST ?? raw.database?.host ?? "",
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : (raw.database?.port ?? 0),
            database: process.env.DB_NAME ?? raw.database?.database ?? "",
            user: process.env.DB_USER ?? raw.database?.user ?? "",
            password: process.env.DB_PASSWORD ?? raw.database?.password ?? "",
        },
        soundLibPath: raw.soundLibPath ?? "public/sounds",
    };

    return merged;
};

export const createAdapter = (cfg: IServerConfig): IDatabaseAdapter => {
    const { engine } = cfg.database;

    switch (engine) {
        case DatabaseEngine.Postgres:
            return new PostgresAdapter();

        case DatabaseEngine.MySQL:
        case DatabaseEngine.MariaDB:
        default:
            return new MySqlAdapter();
    }
};

/**
 * Validates the server config for plausibility.
 *
 * @param cfg The config to validate.
 *
 * @returns A list of error messages, or empty if valid.
 */
export const validateConfig = (cfg: IServerConfig): string[] => {
    const errors: string[] = [];
    const { database: db } = cfg;

    if (!db.host || db.host.trim().length === 0) {
        errors.push("Database host is empty.");
    }

    if (!Number.isFinite(db.port) || db.port < 1 || db.port > 65535) {
        errors.push(`Invalid database port: ${db.port}.`);
    }

    if (!db.database || db.database.trim().length === 0) {
        errors.push("Database name is empty.");
    }

    if (!db.user || db.user.trim().length === 0) {
        errors.push("Database user is empty.");
    }

    return errors;
};

/**
 * Classifies a raw database error message into a user-friendly string.
 *
 * @param error The raw error message.
 *
 * @returns A classified, user-friendly error description.
 */
export const classifyDbError = (error: string): string => {
    const lower = error.toLowerCase();

    if (lower.includes("econnrefused") || lower.includes("connect econnrefused")) {
        return "Database server is not reachable. Check host and port.";
    }

    if (lower.includes("enotfound") || lower.includes("getaddrinfo")) {
        return "Database host not found. Check the host setting.";
    }

    if (lower.includes("access denied") || lower.includes("er_access_denied")
        || (lower.includes("password") && lower.includes("authentication"))) {
        return "Database login failed. Check user and password.";
    }

    if (lower.includes("unknown database") || lower.includes("er_bad_db")) {
        return "Database does not exist. Create it first.";
    }

    if (lower.includes("timeout") || lower.includes("etimedout")) {
        return "Database connection timed out. Check host and port.";
    }

    return error;
};
