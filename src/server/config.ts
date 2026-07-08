/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DatabaseEngine, type IDatabaseConfig } from "./database.js";

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
}

export const loadConfig = (): IServerConfig => {
    let raw: Partial<IServerConfig> = {};
    if (existsSync(configPath)) {
        raw = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<IServerConfig>;
    }

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
