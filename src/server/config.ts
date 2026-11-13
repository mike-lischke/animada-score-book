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

/** The images the confirmation mails carry, relative to the directory the process runs in. */
export const mailImagesPath = resolve(process.cwd(), "public", "mail");

export interface IServerConfig {
    host: string;
    port: number;
    database: IDatabaseConfig;
    soundLibPath: string;

    /** Public account creation. */
    registration: IRegistrationConfig;

    /** The outgoing mail server that delivers the confirmation links. */
    mail: IMailConfig;

    /** The curated scores a demo may offer without a session. */
    demo: IDemoConfig;

    /** Origins allowed for CORS. Undefined = no CORS headers (strictest). */
    allowedOrigins?: string[];

    /** When true, trust x-forwarded-* proxy headers. Default false. */
    trustProxy?: boolean;
}

/** Whether visitors may create an account themselves. */
export interface IRegistrationConfig {
    /** Default false: an installation that is not asked to stays closed. */
    enabled: boolean;
}

/**
 * The SMTP account that delivers the mail a new account needs to confirm its address. An installation without one
 * cannot create accounts at all, because every account — including the initial admin — starts unconfirmed.
 */
export interface IMailConfig {
    /** SMTP host. Empty means no mail can be sent. */
    host: string;

    port: number;

    /** True for an implicitly encrypted connection (usually port 465), false to upgrade with STARTTLS. */
    secure: boolean;

    user: string;
    password: string;

    /** The From address of the mails, for example `Animada Score Book <no-reply@example.com>`. */
    from: string;

    /**
     * Origin the confirmation links name, for example `https://scores.example.com`. Left out, the link names the
     * origin the account request came in on, which is the right one for a host that serves site and backend.
     */
    publicUrl?: string;
}

/**
 * @param mail The configured mail account.
 *
 * @returns Whether the backend can send mail with it.
 */
export const isMailConfigured = (mail: IMailConfig): boolean => {
    return mail.host.length > 0 && mail.from.length > 0;
};

/** The curated demo catalog. */
export interface IDemoConfig {
    /** The scores a demo may offer, by id. An empty list disables the catalog. */
    scoreIds: number[];
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

    const demoScoreIdsEnv = process.env.DEMO_SCORE_IDS
        ? process.env.DEMO_SCORE_IDS.split(",")
            .map((value) => {
                return Number.parseInt(value.trim(), 10);
            })
            .filter((value) => {
                return Number.isInteger(value) && value > 0;
            })
        : undefined;

    // Environment variables take precedence over saved config.
    const requestedEngine: string | undefined = process.env.DB_ENGINE ?? raw.database?.engine;
    const engine = requestedEngine !== undefined && isValidDatabaseEngine(requestedEngine)
        ? requestedEngine
        : DatabaseEngine.MySQL;
    const engineError = requestedEngine !== undefined && !isValidDatabaseEngine(requestedEngine)
        ? `The database engine "${requestedEngine}" is not supported. Use "mysql" or "mariadb".`
        : undefined;

    const merged: IServerConfig = {
        host: process.env.HOST ?? raw.host ?? "0.0.0.0",
        port: process.env.PORT ? Number(process.env.PORT) : (raw.port ?? 3100),
        allowedOrigins: allowedOriginsEnv ?? raw.allowedOrigins,
        trustProxy: process.env.TRUST_PROXY !== undefined
            ? process.env.TRUST_PROXY === "true"
            : (raw.trustProxy ?? false),
        database: {
            engine,
            host: process.env.DB_HOST ?? raw.database?.host ?? "",
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : (raw.database?.port ?? 0),
            database: process.env.DB_NAME ?? raw.database?.database ?? "",
            user: process.env.DB_USER ?? raw.database?.user ?? "",
            password: process.env.DB_PASSWORD ?? raw.database?.password ?? "",
        },
        soundLibPath: raw.soundLibPath ?? "public/sounds",
        registration: {
            enabled: process.env.REGISTRATION_ENABLED !== undefined
                ? process.env.REGISTRATION_ENABLED === "true"
                : (raw.registration?.enabled ?? false),
        },
        mail: {
            host: process.env.MAIL_HOST ?? raw.mail?.host ?? "",
            port: process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : (raw.mail?.port ?? 587),
            secure: process.env.MAIL_SECURE !== undefined
                ? process.env.MAIL_SECURE === "true"
                : (raw.mail?.secure ?? false),
            user: process.env.MAIL_USER ?? raw.mail?.user ?? "",
            password: process.env.MAIL_PASSWORD ?? raw.mail?.password ?? "",
            from: process.env.MAIL_FROM ?? raw.mail?.from ?? "",
            publicUrl: process.env.MAIL_PUBLIC_URL ?? raw.mail?.publicUrl,
        },
        demo: {
            scoreIds: demoScoreIdsEnv ?? raw.demo?.scoreIds ?? [],
        },
    };

    currentStatus = engineError === undefined
        ? statusOf(merged, fileError)
        : { loaded: false, error: engineError };

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
