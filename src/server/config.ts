/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DatabaseEngine, isValidDatabaseEngine, type IDatabaseConfig } from "./database.js";

const configPath = resolve(process.cwd(), "backend-config.json");
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

    /** When true, the startup applies pending migrations. Default false: the browser offers `Initialize Database`. */
    autoMigrate: boolean;
}

/** Whether the loaded configuration holds a usable database connection. */
export interface IConfigStatus {
    loaded: boolean;

    /** What is missing or unreadable, for the setup dialog. Undefined when the configuration is usable. */
    error?: string;
}

let currentStatus: IConfigStatus = { loaded: false, error: "The configuration has not been read yet." };

/** The parsed configuration file, or the reason why it could not be read. */
interface IConfigFile {
    raw: Partial<IServerConfig>;
    error?: string;
}

/**
 * @returns The parsed configuration file, or an empty object with the reason it could not be read.
 */
const readConfigFile = (): IConfigFile => {
    if (!existsSync(configPath)) {
        return { raw: {}, error: "No backend-config.json found." };
    }

    try {
        return { raw: JSON.parse(readFileSync(configPath, "utf-8")) as Partial<IServerConfig> };
    } catch (e) {
        return { raw: {}, error: `backend-config.json is not valid JSON (${(e as Error).message}).` };
    }
};

/**
 * Reads the configuration file and merges it with the environment variables.
 *
 * @returns The effective configuration.
 */
export const loadConfig = (): IServerConfig => {
    const { raw, error: fileError } = readConfigFile();

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
        autoMigrate: process.env.AUTO_MIGRATE !== undefined
            ? process.env.AUTO_MIGRATE === "true"
            : (raw.autoMigrate ?? false),
        database: {
            engine: process.env.DB_ENGINE && isValidDatabaseEngine(process.env.DB_ENGINE)
                ? process.env.DB_ENGINE
                : raw.database?.engine ?? DatabaseEngine.MySQL,
            host: process.env.DB_HOST ?? raw.database?.host ?? "",
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : (raw.database?.port ?? 0),
            database: process.env.DB_NAME ?? raw.database?.database ?? "",
            user: process.env.DB_USER ?? raw.database?.user ?? "",
            password: process.env.DB_PASSWORD ?? raw.database?.password ?? "",
        },
        soundLibPath: raw.soundLibPath ?? "public/sounds",
    };

    currentStatus = statusOf(merged, fileError);

    return merged;
};

/**
 * @returns The status of the configuration that was loaded last.
 */
export const getConfigStatus = (): IConfigStatus => {
    return currentStatus;
};

/**
 * @param config The effective configuration.
 * @param fileError A problem found while reading the file, if any.
 *
 * @returns Whether the database connection can be used.
 */
const statusOf = (config: IServerConfig, fileError: string | undefined): IConfigStatus => {
    const { host, port, database, user } = config.database;

    const missing: string[] = [];
    if (host.length === 0) {
        missing.push("database.host");
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        missing.push("database.port");
    }

    if (database.length === 0) {
        missing.push("database.database");
    }

    if (user.length === 0) {
        missing.push("database.user");
    }

    if (missing.length > 0) {
        const hint = `Missing database settings: ${missing.join(", ")}.`;

        return { loaded: false, error: fileError === undefined ? hint : `${fileError} ${hint}` };
    }

    return { loaded: true };
};
