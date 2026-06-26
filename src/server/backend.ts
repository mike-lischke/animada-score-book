/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { lookup as lookupMimeType } from "mime-types";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";

import { convertErrorToString } from "../core/utils.js";
import {
    adminGroupName, buildCapabilities, checkPermission, createAccessToken, createRefreshToken,
    getPermissionSummary, hashPassword,
    hasUsers, isUserInAdminGroup, makePermBits, Permission, refreshTokenExpirySeconds, setPermissions,
    verifyAndRotateRefreshToken, verifyPassword, verifyToken,
    type ITokenPayload,
} from "./auth.js";
import { DatabaseEngine, type IDatabaseAdapter, type IDatabaseConfig } from "./database.js";
import { MySqlAdapter } from "./mysql-adapter.js";
import { PostgresAdapter } from "./postgres-adapter.js";

const configPath = resolve(process.cwd(), "backend-config.json");
const uploadsPath = resolve(process.cwd(), "public", "uploads", "instruments");

interface IServerConfig {
    host: string;
    port: number;
    database: IDatabaseConfig;
    soundLibPath: string;
}

const defaultConfig: IServerConfig = {
    host: process.env.HOST ?? "0.0.0.0",
    port: 3100,
    database: {
        engine: DatabaseEngine.MySQL,
        host: "127.0.0.1",
        port: 3306,
        database: "animada_score_book",
        user: "root",
        password: "",
    },
    soundLibPath: "public/sounds",
};

let adapter: IDatabaseAdapter;
let config: IServerConfig;

const loadConfig = (): IServerConfig => {
    let saved: Partial<IServerConfig> = {};

    if (existsSync(configPath)) {
        try {
            saved = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<IServerConfig>;
        } catch {
            console.warn("Invalid backend-config.json, using defaults.");
        }
    }

    // Environment variables take precedence over saved config.
    return {
        ...defaultConfig,
        ...saved,
        host: process.env.HOST ?? saved.host ?? defaultConfig.host,
        port: process.env.PORT ? Number(process.env.PORT) : (saved.port ?? defaultConfig.port),
    };
};

const saveConfig = (): void => {
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
};

const createAdapter = (): IDatabaseAdapter => {
    const { engine } = config.database;

    switch (engine) {
        case DatabaseEngine.Postgres:
            return new PostgresAdapter();

        case DatabaseEngine.MySQL:
        case DatabaseEngine.MariaDB:
        default:
            return new MySqlAdapter();
    }
};

// ---------- JSON helpers ----------

const sendJson = (res: ServerResponse, data: unknown, status = 200): void => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });

    res.end(JSON.stringify(data));
};

const sendError = (res: ServerResponse, message: string, status = 400): void => {
    sendJson(res, { error: message }, status);
};

const readJsonBody = (req: IncomingMessage): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        req.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");

            if (!raw) {
                resolve({});

                return;
            }

            try {
                resolve(JSON.parse(raw) as Record<string, unknown>);
            } catch {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
};

// ---------- Proxy helpers ----------

/**
 * Extracts the first value of a request header, or undefined if absent.
 *
 * @param req  The incoming HTTP request.
 * @param name The header name (lowercase).
 * @returns The header value or undefined.
 */
const getHeader = (req: IncomingMessage, name: string): string | undefined => {
    const value = req.headers[name];

    return Array.isArray(value) ? value[0] : value;
};

/**
 * Returns the effective request URL, taking reverse-proxy headers into account.
 *
 * @param req The incoming HTTP request.
 * @returns The reconstructed URL.
 */
const getRequestUrl = (req: IncomingMessage): URL => {
    const proto = getHeader(req, "x-forwarded-proto") ?? "http";
    const host = getHeader(req, "x-forwarded-host") ?? getHeader(req, "host") ?? "localhost";

    return new URL(req.url ?? "/", `${proto}://${host}`);
};

// ---------- CORS ----------

const setCorsHeaders = (res: ServerResponse): void => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

// ---------- Auth Helpers ----------

/**
 * Extracts the Bearer token from the Authorization header.
 *
 * @param req The incoming HTTP request.
 * @returns The token string or undefined.
 */
const extractToken = (req: IncomingMessage): string | undefined => {
    const header = getHeader(req, "authorization");

    if (!header?.startsWith("Bearer ")) {
        return undefined;
    }

    return header.slice(7);
};

/**
 * Extracts a cookie value by name from the Cookie header.
 *
 * @param req  The incoming HTTP request.
 * @param name The cookie name.
 * @returns The cookie value or undefined.
 */
const getCookie = (req: IncomingMessage, name: string): string | undefined => {
    const cookieHeader = getHeader(req, "cookie");

    if (!cookieHeader) {
        return undefined;
    }

    for (const part of cookieHeader.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) {
            return rest.join("=");
        }
    }

    return undefined;
};

/**
 * Extracts the authenticated user from the request, or returns undefined for anonymous.
 *
 * @param req The incoming HTTP request.
 * @returns The token payload or undefined.
 */
const getAuthUser = (req: IncomingMessage): ITokenPayload | undefined => {
    const token = extractToken(req);

    if (!token) {
        return undefined;
    }

    return verifyToken(token);
};

/**
 * Sets the refresh token as an httpOnly cookie on the response.
 *
 * @param res     The HTTP response.
 * @param token   The refresh token value.
 * @param maxAge  The cookie max age in seconds.
 */
const setRefreshTokenCookie = (res: ServerResponse, token: string, maxAge: number): void => {
    const cookie = `refreshToken=${token}; HttpOnly; Secure; Path=/; Max-Age=${maxAge}; SameSite=Lax`;

    res.setHeader("Set-Cookie", cookie);
};

/**
 * Clears the refresh token cookie.
 *
 * @param res The HTTP response.
 */
const clearRefreshTokenCookie = (res: ServerResponse): void => {
    res.setHeader("Set-Cookie", "refreshToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax");
};

// ---------- Color Helpers ----------

/**
 * Generates a random hex color string using the golden-angle distribution
 * for visually pleasing hue spacing.
 *
 * @returns A hex color string like "#a1b2c3".
 */
const randomGroupColor = (): string => {
    const goldenAngle = 137.508;
    const hue = ((Math.random() * 360) + (goldenAngle * Math.random())) % 360;
    const saturation = 45 + (Math.random() * 20);
    const lightness = 40 + (Math.random() * 15);

    const h = hue / 60;
    const c = ((1 - Math.abs((2 * lightness / 100) - 1)) * saturation) / 100;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = (lightness / 100) - (c / 2);

    let r: number;
    let g: number;
    let b: number;

    if (h < 1) {
        r = c; g = x; b = 0;
    } else if (h < 2) {
        r = x; g = c; b = 0;
    } else if (h < 3) {
        r = 0; g = c; b = x;
    } else if (h < 4) {
        r = 0; g = x; b = c;
    } else if (h < 5) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }

    const toHex = (v: number): string => {
        const hex = Math.round((v + m) * 255).toString(16);

        return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// ---------- Anonymous User Seed ----------

/**
 * Seeds a system anonymous user. This user cannot log in — it exists only
 * as a permission reference for world-accessible entities.
 *
 * @param targetAdapter The database adapter.
 */
const seedAnonymousUser = async (targetAdapter: IDatabaseAdapter): Promise<void> => {
    const rows = await targetAdapter.query<{ cnt: number; }>(
        "SELECT COUNT(*) AS cnt FROM users WHERE username = 'anonymous'",
    );

    if ((rows[0]?.cnt ?? 0) > 0) {
        return;
    }

    // Use a random 64-byte password that no one can ever log in with.
    const randomPassword = randomBytes(64).toString("hex");
    const passwordHash = await hashPassword(randomPassword);

    await targetAdapter.insertReturningId(
        `INSERT INTO users (username, password_hash, display_name)
         VALUES (?, ?, ?)`,
        ["anonymous", passwordHash, "Anonymous"],
    );

    console.log("Seeded anonymous system user.");
};

// ---------- API Handlers ----------

const handleHealth = async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let hasData = false;
    let anyUsers = false;

    if (adapter.isInitialized()) {
        try {
            const rows = await adapter.query<{ cnt: number; }>(
                "SELECT COUNT(*) AS cnt FROM folders",
            );

            hasData = (rows[0]?.cnt ?? 0) > 0;
            anyUsers = await hasUsers(adapter);
        } catch {
            // Tables might not exist yet.
        }
    }

    sendJson(res, {
        status: "ok",
        initialized: adapter.isInitialized(),
        engine: config.database.engine,
        hasData,
        hasUsers: anyUsers,
    });
};

const handleSetup = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);

    // If the backend is already set up, only admins may reconfigure.
    if (adapter.isInitialized()) {
        const usersExist = await hasUsers(adapter);

        if (usersExist) {
            const user = getAuthUser(req);

            if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
                sendError(res, "Forbidden", 403);

                return;
            }
        }
    }

    // Merge incoming config with defaults.
    config.database = {
        engine: typeof body.engine === "string" ? body.engine as DatabaseEngine : config.database.engine,
        host: typeof body.host === "string" ? body.host : config.database.host,
        port: typeof body.port === "number" ? body.port : config.database.port,
        database: typeof body.database === "string" ? body.database : config.database.database,
        user: typeof body.user === "string" ? body.user : config.database.user,
        password: typeof body.password === "string" ? body.password : config.database.password,
    };

    // Re-create the adapter if engine changed.
    const newAdapter = createAdapter();

    try {
        const result = await newAdapter.testConnection(config.database);

        if (!result.success) {
            sendError(res, "Connection test failed. Check your credentials.", 400);

            return;
        }

        // If overwrite is requested, drop existing tables first.
        if (body.overwrite) {
            try {
                await newAdapter.initialize(config.database);
                await newAdapter.execute("DROP TABLE IF EXISTS permissions");
                await newAdapter.execute("DROP TABLE IF EXISTS user_groups");
                await newAdapter.execute("DROP TABLE IF EXISTS `groups`");
                await newAdapter.execute("DROP TABLE IF EXISTS users");
                await newAdapter.execute("DROP TABLE IF EXISTS instrument_images");
                await newAdapter.execute("DROP TABLE IF EXISTS instruments");
                await newAdapter.execute("DROP TABLE IF EXISTS scores");
                await newAdapter.execute("DROP TABLE IF EXISTS folders");
                await newAdapter.shutdown();
                const freshAdapter = createAdapter();

                await freshAdapter.initialize(config.database);
                await seedIfExists(freshAdapter);
                await seedAnonymousUser(freshAdapter);
                await adapter.shutdown();
                adapter = freshAdapter;
                saveConfig();
                sendJson(res, { success: true });

                return;
            } catch (e) {
                console.error("Overwrite failed:", convertErrorToString(e));
                sendError(res, "Database overwrite failed. Check server logs for details.", 500);

                return;
            }
        }

        await newAdapter.initialize(config.database);

        // Only load seed if tables are empty.
        const existing = await newAdapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM folders",
        );

        if ((existing[0]?.cnt ?? 0) === 0) {
            await seedIfExists(newAdapter);
        }

        await seedAnonymousUser(newAdapter);
    } catch (e) {
        console.error("Database initialisation failed:", convertErrorToString(e));
        sendError(res, "Database initialisation failed. Check server logs for details.", 500);

        return;
    }

    // Shutdown old adapter, activate new one.
    await adapter.shutdown();
    adapter = newAdapter;

    if (body.soundLibPath) {
        config.soundLibPath = body.soundLibPath as string;
    }

    saveConfig();

    console.log("Database setup complete. Configuration saved.");
    sendJson(res, { success: true });
};

/**
 * Imports seed.sql if it exists.
 *
 * @param targetAdapter The adapter to execute the seed SQL against.
 */
const seedIfExists = async (targetAdapter: IDatabaseAdapter): Promise<void> => {
    const seedPath = resolve(process.cwd(), "build", "seed.sql");

    if (existsSync(seedPath)) {
        const seedSql = readFileSync(seedPath, "utf-8");

        await targetAdapter.executeMultiple(seedSql);
        console.log("Seed data imported from build/seed.sql");
    }
};

const handleTestConnection = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);

    const testConfig: IDatabaseConfig = {
        engine: typeof body.engine === "string" ? body.engine as DatabaseEngine : DatabaseEngine.MySQL,
        host: typeof body.host === "string" ? body.host : "127.0.0.1",
        port: typeof body.port === "number" ? body.port : 3306,
        database: typeof body.database === "string" ? body.database : "",
        user: typeof body.user === "string" ? body.user : "root",
        password: typeof body.password === "string" ? body.password : "",
    };

    const testAdapter = createAdapterFor(testConfig);

    try {
        const result = await testAdapter.testConnection(testConfig);

        await testAdapter.shutdown();

        if (result.success) {
            sendJson(res, { success: true });
        } else {
            sendJson(res, { success: false, error: result.error ?? "Connection failed." });
        }
    } catch (e: unknown) {
        console.error("testConnection error:", convertErrorToString(e));
        sendJson(res, { success: false, error: String(e) });
    }
};

const createAdapterFor = (dbConfig: IDatabaseConfig): IDatabaseAdapter => {
    switch (dbConfig.engine) {
        case DatabaseEngine.Postgres:
            return new PostgresAdapter();

        case DatabaseEngine.MySQL:
        case DatabaseEngine.MariaDB:
        default:
            return new MySqlAdapter();
    }
};

const handleListScoreFolderContent = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const parentId = body.parentid !== undefined ? Number(body.parentid) : null;

    const folderParams: unknown[] = [];
    let folderWhere: string;

    if (parentId === null || parentId === -1) {
        folderWhere = "parentid IS NULL";
    } else {
        folderWhere = "parentid = ?";
        folderParams.push(parentId);
    }

    const folders = await adapter.query(
        `SELECT f.*, (
            EXISTS(SELECT 1 FROM folders cf WHERE cf.parentid = f.id LIMIT 1)
            OR EXISTS(SELECT 1 FROM scores cs WHERE cs.folderid = f.id LIMIT 1)
        ) AS hasChildren
        FROM folders f
        WHERE ${folderWhere}
        ORDER BY f.name`,
        folderParams,
    );

    for (const f of folders) {
        if (f.parentid === null) {
            f.parentid = -1;
        }

        f.hasChildren = Boolean(f.hasChildren);
    }

    const scoreParams: unknown[] = [];
    let scoreWhere: string;

    if (parentId === null || parentId === -1) {
        // Scores at root: folderid should be NULL.
        scoreWhere = "folderid IS NULL";
    } else {
        scoreWhere = "folderid = ?";
        scoreParams.push(parentId);
    }

    const scores = await adapter.query(
        `SELECT * FROM scores WHERE ${scoreWhere} ORDER BY name`,
        scoreParams,
    );

    // Filter out entries the user cannot read and attach permission summaries.
    const readableFolders: Array<Record<string, unknown>> = [];
    for (const f of folders) {
        const summary = await getPermissionSummary(adapter, user, "folder", f.id as number);

        if (summary.canRead) {
            readableFolders.push({
                ...f,
                perm: {
                    isOwner: summary.isOwner, isGroup: summary.isGroup, isWorld: summary.isWorld,
                    permBits: summary.permBits,
                },
            });
        }
    }

    const readableScores: Array<Record<string, unknown>> = [];
    for (const s of scores) {
        const summary = await getPermissionSummary(adapter, user, "score", s.id as number);

        if (summary.canRead) {
            readableScores.push({
                ...s,
                perm: {
                    isOwner: summary.isOwner, isGroup: summary.isGroup, isWorld: summary.isWorld,
                    permBits: summary.permBits,
                },
            });
        }
    }

    sendJson(res, { folders: readableFolders, scores: readableScores });
};

const handleAddScoreFolder = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const name = String(body.name ?? "").trim();
    const parentId = body.parentid !== undefined ? Number(body.parentid) : null;

    if (!name) {
        sendError(res, "Name required");

        return;
    }

    // Check write permission on parent folder (or require auth for root).
    if (parentId !== null && parentId !== -1) {
        const allowed = await checkPermission(adapter, user, "folder", parentId, Permission.W);

        if (!allowed) {
            sendError(res, "Forbidden", 403);

            return;
        }
    } else if (!user) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const result = await adapter.insertReturningId(
        "INSERT INTO folders (parentid, name) VALUES (?, ?)",
        [parentId === -1 ? null : parentId, name],
    );

    // Assign default permissions: owner = current user, group = null, world = read-only.
    if (user) {
        const permBits = makePermBits(Permission.RWX, Permission.RX, Permission.R);

        await setPermissions(adapter, "folder", result.insertId, user.userId, null, permBits);
    }

    sendJson(res, { success: true, id: result.insertId });
};

const handleAddScore = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const folderId = body.folderId !== undefined ? Number(body.folderId) : null;
    const name = String(body.name ?? "").trim();
    const content = String(body.content ?? "");

    if (!name) {
        sendError(res, "Name required");

        return;
    }

    // Check write permission on parent folder (or require auth for root).
    if (folderId !== null && folderId !== -1) {
        const allowed = await checkPermission(adapter, user, "folder", folderId, Permission.W);

        if (!allowed) {
            sendError(res, "Forbidden", 403);

            return;
        }
    } else if (!user) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const result = await adapter.insertReturningId(
        "INSERT INTO scores (folderid, name, content) VALUES (?, ?, ?)",
        [folderId === -1 ? null : folderId, name, content],
    );

    // Assign default permissions: owner = current user, group = null, world = read-only.
    if (user) {
        const permBits = makePermBits(Permission.RWX, Permission.RX, Permission.R);

        await setPermissions(adapter, "score", result.insertId, user.userId, null, permBits);
    }

    sendJson(res, { success: true, id: result.insertId });
};

const handleRenameEntry = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const type = body.type as string | undefined;
    const id = body.id !== undefined ? Number(body.id) : undefined;
    const name = String(body.name ?? "").trim();

    if (!type || id === undefined || !name) {
        sendError(res, "type, id and name required");

        return;
    }

    if (type !== "folder" && type !== "score") {
        sendError(res, "Invalid type (folder|score)");

        return;
    }

    const allowed = await checkPermission(adapter, user, type, id, Permission.W);

    if (!allowed) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const table = type === "folder" ? "folders" : "scores";

    await adapter.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id]);

    sendJson(res, { success: true });
};

const handleUpdateScore = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const id = body.id !== undefined ? Number(body.id) : undefined;
    const content = body.content as string | undefined;

    if (id === undefined || content === undefined) {
        sendError(res, "id and content required");

        return;
    }

    const allowed = await checkPermission(adapter, user, "score", id, Permission.W);

    if (!allowed) {
        sendError(res, "Forbidden", 403);

        return;
    }

    await adapter.execute("UPDATE scores SET content = ? WHERE id = ?", [content, id]);

    sendJson(res, { success: true });
};

const handleDelete = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const type = body.type as string | undefined;
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (!type || id === undefined) {
        sendError(res, "type and id required");

        return;
    }

    const allowed = await checkPermission(adapter, user, type, id, Permission.W);

    if (!allowed) {
        sendError(res, "Forbidden", 403);

        return;
    }

    if (type === "score") {
        await adapter.execute("DELETE FROM scores WHERE id = ?", [id]);
        // Also delete the permission entry.
        await adapter.execute(
            "DELETE FROM permissions WHERE entity_type = 'score' AND entity_id = ?", [id],
        );
        sendJson(res, { success: true });

        return;
    }

    if (type === "folder") {
        const folders = await adapter.query<{ parentid: number | null; }>(
            "SELECT parentid FROM folders WHERE id = ?", [id],
        );

        if (folders.length === 0) {
            sendError(res, "Folder not found", 404);

            return;
        }

        const parentId = folders[0].parentid;

        // Move scores into parent folder (or to root if deleting a root folder).
        await adapter.execute(
            "UPDATE scores SET folderid = ? WHERE folderid = ?", [parentId, id],
        );

        // Move subfolders into parent folder (or to root).
        await adapter.execute(
            "UPDATE folders SET parentid = ? WHERE parentid = ?", [parentId, id],
        );

        // Remove the folder itself.
        await adapter.execute("DELETE FROM folders WHERE id = ?", [id]);
        // Also delete the permission entry.
        await adapter.execute(
            "DELETE FROM permissions WHERE entity_type = 'folder' AND entity_id = ?", [id],
        );

        sendJson(res, { success: true });

        return;
    }

    sendError(res, "Invalid type (folder|score)");
};

const handleMove = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const body = await readJsonBody(req);
    const type = body.type as string | undefined;
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (type === "folder") {
        const newParentId = body.newParentId !== undefined ? Number(body.newParentId) : undefined;

        if (id === undefined || newParentId === undefined) {
            sendError(res, "id and newParentId required");

            return;
        }

        // Need write permission on both the folder being moved and the target parent.
        const allowed = await checkPermission(adapter, user, "folder", id, Permission.W);

        if (!allowed) {
            sendError(res, "Forbidden", 403);

            return;
        }

        if (newParentId !== -1) {
            const targetAllowed = await checkPermission(adapter, user, "folder", newParentId, Permission.W);

            if (!targetAllowed) {
                sendError(res, "Forbidden", 403);

                return;
            }
        }

        await adapter.execute("UPDATE folders SET parentid = ? WHERE id = ?", [
            newParentId === -1 ? null : newParentId, id,
        ]);
        sendJson(res, { success: true });

        return;
    }

    if (type === "score") {
        const newFolderId = body.newFolderId !== undefined ? Number(body.newFolderId) : undefined;

        if (id === undefined || newFolderId === undefined) {
            sendError(res, "id and newFolderId required");

            return;
        }

        // Need write permission on the score being moved.
        const allowed = await checkPermission(adapter, user, "score", id, Permission.W);

        if (!allowed) {
            sendError(res, "Forbidden", 403);

            return;
        }

        if (newFolderId !== -1) {
            const targetAllowed = await checkPermission(adapter, user, "folder", newFolderId, Permission.W);

            if (!targetAllowed) {
                sendError(res, "Forbidden", 403);

                return;
            }
        }

        await adapter.execute("UPDATE scores SET folderid = ? WHERE id = ?", [
            newFolderId === -1 ? null : newFolderId, id,
        ]);
        sendJson(res, { success: true });

        return;
    }

    sendError(res, "Invalid type (folder|score)");
};

const handleClearAll = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    if (!adapter.isInitialized()) {
        sendError(res, "Database not initialised.", 500);

        return;
    }

    await adapter.execute("DELETE FROM scores");
    await adapter.execute("DELETE FROM folders");

    sendJson(res, { success: true });
};

// ---------- Auth Handlers ----------

const handleLogin = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
        sendError(res, "Username and password required");

        return;
    }

    const rows = await adapter.query<{
        id: number; username: string; passwordHash: string;
        displayName: string;
    }>(
        "SELECT id, username, password_hash AS passwordHash, display_name AS displayName" +
        " FROM users WHERE username = ?",
        [username],
    );

    if (rows.length === 0) {
        sendError(res, "Invalid username or password", 401);

        return;
    }

    const user = rows[0];
    const valid = await verifyPassword(password, user.passwordHash);

    if (!valid) {
        sendError(res, "Invalid username or password", 401);

        return;
    }

    const admin = await isUserInAdminGroup(adapter, user.id);

    const payload: ITokenPayload = {
        userId: user.id,
        username: user.username,
        isAdmin: admin,
    };

    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken();

    // Store the hash in the database for rotation.
    await adapter.execute(
        "UPDATE users SET refresh_token_hash = ?, last_login = NOW() WHERE id = ?",
        [refreshToken.hash, user.id],
    );

    setRefreshTokenCookie(res, refreshToken.raw, refreshToken.maxAge);

    const capabilities = await buildCapabilities(adapter, payload);

    sendJson(res, {
        token: accessToken,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            isAdmin: payload.isAdmin,
        },
        capabilities,
    });
};

const handleGroupLogin = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);
    const groupName = String(body.groupName ?? "").trim();
    const password = String(body.password ?? "");

    if (!groupName || !password) {
        sendError(res, "Group name and password required");

        return;
    }

    const rows = await adapter.query<{
        id: number; name: string; passwordHash: string | null;
    }>(
        "SELECT id, name, password_hash AS passwordHash FROM `groups` WHERE name = ?",
        [groupName],
    );

    if (rows.length === 0 || !rows[0].passwordHash) {
        sendError(res, "Invalid group name or password", 401);

        return;
    }

    const group = rows[0];
    const valid = await verifyPassword(password, group.passwordHash!);

    if (!valid) {
        sendError(res, "Invalid group name or password", 401);

        return;
    }

    // Log in as the anonymous user but with group rights.
    const anonRows = await adapter.query<{ id: number; username: string; displayName: string; }>(
        "SELECT id, username, display_name AS displayName FROM users WHERE username = 'anonymous'",
    );

    if (anonRows.length === 0) {
        sendError(res, "Anonymous user not found", 500);

        return;
    }

    const anon = anonRows[0];

    const payload: ITokenPayload = {
        userId: anon.id,
        username: anon.username,
        isAdmin: false,
        authType: "group",
        groupId: group.id,
    };

    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken();

    await adapter.execute(
        "UPDATE users SET refresh_token_hash = ?, last_login = NOW() WHERE id = ?",
        [refreshToken.hash, anon.id],
    );

    // Update group last_login.
    await adapter.execute(
        "UPDATE `groups` SET last_login = NOW() WHERE id = ?",
        [group.id],
    );

    setRefreshTokenCookie(res, refreshToken.raw, refreshToken.maxAge);

    const capabilities = await buildCapabilities(adapter, payload);

    sendJson(res, {
        token: accessToken,
        user: {
            id: anon.id,
            username: anon.username,
            displayName: anon.displayName,
            isAdmin: false,
        },
        group: {
            id: group.id,
            name: group.name,
        },
        capabilities,
    });
};

const handleRefresh = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const rawToken = getCookie(req, "refreshToken");

    if (!rawToken) {
        sendError(res, "No refresh token", 401);

        return;
    }

    const result = await verifyAndRotateRefreshToken(adapter, rawToken);

    if (!result) {
        clearRefreshTokenCookie(res);
        sendError(res, "Invalid or expired refresh token", 401);

        return;
    }

    // Verify the user still exists.
    const rows = await adapter.query<{ id: number; username: string; }>(
        "SELECT id, username FROM users WHERE id = ?",
        [result.userId],
    );

    if (rows.length === 0) {
        clearRefreshTokenCookie(res);
        sendError(res, "User no longer exists", 401);

        return;
    }

    const user = rows[0];
    const admin = await isUserInAdminGroup(adapter, user.id);

    // Preserve group-login info from the old access token, or from custom headers
    // (sessionStorage backup for page reloads where the in-memory token is lost).
    const authHeader = req.headers.authorization;
    let authType: string | undefined;
    let groupId: number | undefined;

    if (authHeader?.startsWith("Bearer ")) {
        const oldPayload = verifyToken(authHeader.slice(7));

        if (oldPayload?.authType === "group") {
            authType = oldPayload.authType;
            groupId = oldPayload.groupId;
        }
    }

    const headerAuthType = req.headers["x-auth-type"];
    const headerGroupId = req.headers["x-group-id"];

    if (!authType && headerAuthType === "group" && headerGroupId) {
        authType = "group";
        groupId = Number(headerGroupId);
    }

    const accessToken = createAccessToken({
        userId: user.id,
        username: user.username,
        isAdmin: admin,
        authType,
        groupId,
    });

    setRefreshTokenCookie(res, result.newRawToken, refreshTokenExpirySeconds);

    sendJson(res, { token: accessToken });
};

const handleLogout = (req: IncomingMessage, res: ServerResponse): void => {
    clearRefreshTokenCookie(res);
    sendJson(res, { success: true });
};

const handleWhoAmI = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user) {
        const capabilities = await buildCapabilities(adapter, undefined);

        sendJson(res, { authenticated: false, capabilities });

        return;
    }

    // Verify the user still exists.
    const rows = await adapter.query<{
        id: number; username: string; displayName: string;
    }>(
        "SELECT id, username, display_name AS displayName FROM users WHERE id = ?",
        [user.userId],
    );

    if (rows.length === 0) {
        const capabilities = await buildCapabilities(adapter, undefined);

        sendJson(res, { authenticated: false, capabilities });

        return;
    }

    const dbUser = rows[0];
    const admin = await isUserInAdminGroup(adapter, dbUser.id);
    const payload: ITokenPayload = {
        userId: dbUser.id,
        username: dbUser.username,
        isAdmin: admin,
        authType: user.authType,
        groupId: user.groupId,
    };
    const capabilities = await buildCapabilities(adapter, payload);

    let group: { id: number; name: string; } | undefined;
    if (user.authType === "group" && user.groupId !== undefined) {
        const groupRows = await adapter.query<{ id: number; name: string; }>(
            "SELECT id, name FROM `groups` WHERE id = ?",
            [user.groupId],
        );

        if (groupRows.length > 0) {
            group = { id: groupRows[0].id, name: groupRows[0].name };
        }
    }

    sendJson(res, {
        authenticated: true,
        user: {
            id: dbUser.id,
            username: dbUser.username,
            displayName: dbUser.displayName,
            isAdmin: admin,
        },
        group,
        capabilities,
    });
};

// ---------- User CRUD Handlers ----------

/**
 * Creates the first admin user. Only allowed when no users exist yet.
 *
 * @param req The incoming HTTP request.
 * @param res The HTTP response.
 */
const handleCreateInitialAdmin = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const usersExist = await hasUsers(adapter);

    if (usersExist) {
        sendError(res, "Admin user already exists.", 403);

        return;
    }

    const body = await readJsonBody(req);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? username).trim();
    const groupName = String(body.groupName ?? "My first group").trim();

    if (!username || !password) {
        sendError(res, "Username and password required");

        return;
    }

    if (username.length < 3) {
        sendError(res, "Username must be at least 3 characters");

        return;
    }

    if (password.length < 6) {
        sendError(res, "Password must be at least 6 characters");

        return;
    }

    const passwordHash = await hashPassword(password);
    const result = await adapter.insertReturningId(
        `INSERT INTO users (username, password_hash, display_name)
         VALUES (?, ?, ?)`,
        [username, passwordHash, displayName],
    );

    // Create an "Admins" group and add the user to it.
    const groupResult = await adapter.insertReturningId(
        "INSERT INTO `groups` (name, description) VALUES (?, ?)",
        [adminGroupName, "System administrators with full access"],
    );

    await adapter.execute(
        "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
        [result.insertId, groupResult.insertId],
    );

    // Create the default group (idempotent — may already exist from seed).
    const defaultGroupRows = await adapter.query<{ id: number; }>(
        "SELECT id FROM `groups` WHERE name = ?", [groupName],
    );

    let defaultGroupId: number;

    if (defaultGroupRows.length > 0) {
        defaultGroupId = defaultGroupRows[0].id;
    } else {
        const agResult = await adapter.insertReturningId(
            "INSERT INTO `groups` (name, description, color) VALUES (?, ?, ?)",
            [groupName, "", "#2a9d8f"],
        );
        defaultGroupId = agResult.insertId;
    }

    // Assign permissions: the new admin owns all entities that have no owner yet,
    // and they belong to the default group.
    const ownerPermBits = makePermBits(Permission.RWX, Permission.RX, Permission.R);

    // Folders without permissions.
    const orphanFolders = await adapter.query<{ id: number; }>(
        `SELECT f.id FROM folders f
         WHERE NOT EXISTS (
             SELECT 1 FROM permissions p
             WHERE p.entity_type = 'folder' AND p.entity_id = f.id
         )`,
    );

    for (const f of orphanFolders) {
        await adapter.execute(
            `INSERT INTO permissions (entity_type, entity_id, owner_id, group_id, perm_bits)
             VALUES ('folder', ?, ?, ?, ?)`,
            [f.id, result.insertId, defaultGroupId, ownerPermBits],
        );
    }

    // Scores without permissions.
    const orphanScores = await adapter.query<{ id: number; }>(
        `SELECT s.id FROM scores s
         WHERE NOT EXISTS (
             SELECT 1 FROM permissions p
             WHERE p.entity_type = 'score' AND p.entity_id = s.id
         )`,
    );

    for (const s of orphanScores) {
        await adapter.execute(
            `INSERT INTO permissions (entity_type, entity_id, owner_id, group_id, perm_bits)
             VALUES ('score', ?, ?, ?, ?)`,
            [s.id, result.insertId, defaultGroupId, ownerPermBits],
        );
    }

    console.log(
        `Assigned permissions: ${orphanFolders.length} folders, ${orphanScores.length} scores ` +
        `→ owner=${username}, group=${groupName}.`,
    );

    const payload: ITokenPayload = {
        userId: result.insertId,
        username,
        isAdmin: true,
    };

    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken();

    await adapter.execute(
        "UPDATE users SET refresh_token_hash = ? WHERE id = ?",
        [refreshToken.hash, result.insertId],
    );

    setRefreshTokenCookie(res, refreshToken.raw, refreshToken.maxAge);

    const capabilities = await buildCapabilities(adapter, payload);

    console.log(`Initial admin user created: id=${result.insertId}, username=${username}.`);

    sendJson(res, {
        token: accessToken,
        user: { id: result.insertId, username, displayName, isAdmin: true },
        capabilities,
    });
};

const handleListUsers = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const rows = await adapter.query(
        `SELECT u.id, u.username, u.display_name, u.last_login, u.created_at, u.updated_at,
                (ug.user_id IS NOT NULL) AS is_admin
         FROM users u
         LEFT JOIN user_groups ug ON u.id = ug.user_id
             AND ug.group_id = (SELECT id FROM \`groups\` WHERE name = ?)
         ORDER BY u.username`,
        [adminGroupName],
    );

    sendJson(res, {
        users: rows.map((u) => {
            return {
                id: u.id,
                username: u.username,
                displayName: u.display_name,
                isAdmin: Boolean(u.is_admin),
                lastLogin: u.last_login,
                createdAt: u.created_at,
                updatedAt: u.updated_at,
            };
        }),
    });
};

const handleCreateUser = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const authUser = getAuthUser(req);

    if (!authUser || !(await isUserInAdminGroup(adapter, authUser.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? username).trim();

    if (!username || !password) {
        sendError(res, "Username and password required");

        return;
    }

    if (username.length < 3) {
        sendError(res, "Username must be at least 3 characters");

        return;
    }

    if (password.length < 6) {
        sendError(res, "Password must be at least 6 characters");

        return;
    }

    const existing = await adapter.query<{ cnt: number; }>(
        "SELECT COUNT(*) AS cnt FROM users WHERE username = ?",
        [username],
    );

    if ((existing[0]?.cnt ?? 0) > 0) {
        sendError(res, "Username already exists");

        return;
    }

    // Check for group name collisions.
    const groupCollision = await adapter.query<{ cnt: number; }>(
        "SELECT COUNT(*) AS cnt FROM `groups` WHERE name = ?",
        [username],
    );

    if ((groupCollision[0]?.cnt ?? 0) > 0) {
        sendError(res, "A group with this name already exists");

        return;
    }

    const passwordHash = await hashPassword(password);
    const result = await adapter.insertReturningId(
        `INSERT INTO users (username, password_hash, display_name)
         VALUES (?, ?, ?)`,
        [username, passwordHash, displayName],
    );

    sendJson(res, { success: true, id: result.insertId });
};

const handleUpdateUser = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const authUser = getAuthUser(req);

    if (!authUser || !(await isUserInAdminGroup(adapter, authUser.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (id === undefined) {
        sendError(res, "id required");

        return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (body.displayName !== undefined) {
        updates.push("display_name = ?");
        params.push(String(body.displayName).trim());
    }

    if (body.password) {
        const passwordHash = await hashPassword(String(body.password));

        updates.push("password_hash = ?");
        params.push(passwordHash);
    }

    if (updates.length === 0) {
        sendError(res, "No fields to update");

        return;
    }

    params.push(id);

    await adapter.execute(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        params,
    );

    sendJson(res, { success: true });
};

const handleDeleteUser = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const authUser = getAuthUser(req);

    if (!authUser || !(await isUserInAdminGroup(adapter, authUser.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (id === undefined) {
        sendError(res, "id required");

        return;
    }

    // Prevent deleting the last admin (last member of the Admins group).
    if (id === authUser.userId) {
        const adminCount = await adapter.query<{ cnt: number; }>(
            `SELECT COUNT(*) AS cnt FROM user_groups
             WHERE group_id = (SELECT id FROM \`groups\` WHERE name = ?)`,
            [adminGroupName],
        );

        if ((adminCount[0]?.cnt ?? 0) <= 1) {
            sendError(res, "Cannot delete the last admin user");

            return;
        }
    }

    await adapter.execute("DELETE FROM users WHERE id = ?", [id]);

    sendJson(res, { success: true });
};

// ---------- Group CRUD Handlers ----------

const handleListGroups = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const rows = await adapter.query(
        "SELECT id, name, description, color, admin_id AS adminId," +
        " (password_hash IS NOT NULL) AS hasPassword," +
        " last_login AS lastLogin, created_at AS createdAt" +
        " FROM `groups` ORDER BY name",
    );

    sendJson(res, {
        groups: rows.map((g) => {
            return {
                id: g.id,
                name: g.name,
                description: g.description,
                color: g.color,
                adminId: g.adminId,
                hasPassword: Boolean(g.hasPassword),
                lastLogin: g.lastLogin,
                createdAt: g.createdAt,
            };
        }),
    });
};

const handleListPublicGroups = async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Public endpoint: only returns groups that have a shared password set.
    const rows = await adapter.query(
        "SELECT name FROM `groups` WHERE password_hash IS NOT NULL ORDER BY name",
    );

    sendJson(res, {
        groups: rows.map((g) => {
            return g.name;
        }),
    });
};

const handleCreateGroup = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const name = String(body.name ?? "").trim();
    const description = body.description !== undefined ? String(body.description).trim() : "";
    const color = typeof body.color === "string" && body.color ? body.color : randomGroupColor();
    const password = typeof body.password === "string" && body.password ? body.password : undefined;
    const adminId = body.adminId !== undefined ? Number(body.adminId) || null : null;

    if (!name) {
        sendError(res, "Group name required");

        return;
    }

    // Check for name collisions with users.
    const userCollision = await adapter.query<{ cnt: number; }>(
        "SELECT COUNT(*) AS cnt FROM users WHERE username = ?",
        [name],
    );

    if ((userCollision[0]?.cnt ?? 0) > 0) {
        sendError(res, "A user with this name already exists");

        return;
    }

    const existing = await adapter.query<{ cnt: number; }>(
        "SELECT COUNT(*) AS cnt FROM `groups` WHERE name = ?",
        [name],
    );

    if ((existing[0]?.cnt ?? 0) > 0) {
        sendError(res, "Group name already exists");

        return;
    }

    let passwordHash: string | null = null;
    if (password) {
        passwordHash = await hashPassword(password);
    }

    const result = await adapter.insertReturningId(
        "INSERT INTO `groups` (name, description, color, password_hash, admin_id) VALUES (?, ?, ?, ?, ?)",
        [name, description, color, passwordHash, adminId],
    );

    sendJson(res, { success: true, id: result.insertId, color });
};

const handleUpdateGroup = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    // Full admins OR the group's designated admin can update.
    const body = await readJsonBody(req);
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (id === undefined) {
        sendError(res, "id required");

        return;
    }

    const groupRow = await adapter.query<{ admin_id: number | null; }>(
        "SELECT admin_id FROM `groups` WHERE id = ?",
        [id],
    );

    if (groupRow.length === 0) {
        sendError(res, "Group not found", 404);

        return;
    }

    const isGroupAdmin = groupRow[0].admin_id === user?.userId;

    if (!user || (!(await isUserInAdminGroup(adapter, user.userId)) && !isGroupAdmin)) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const description = body.description !== undefined ? String(body.description).trim() : undefined;
    const color = body.color !== undefined ? String(body.color) : undefined;
    const password = body.password !== undefined
        ? (typeof body.password === "string" && body.password ? body.password : null)
        : undefined;
    const adminId = body.adminId !== undefined ? (Number(body.adminId) || null) : undefined;

    if (!name && description === undefined && color === undefined
        && password === undefined && adminId === undefined) {
        sendError(res, "No fields to update");

        return;
    }

    if (name) {
        // Check for name collisions with users.
        const userCollision = await adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM users WHERE username = ?",
            [name],
        );

        if ((userCollision[0]?.cnt ?? 0) > 0) {
            sendError(res, "A user with this name already exists");

            return;
        }
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (name) {
        updates.push("name = ?");
        params.push(name);
    }

    if (description !== undefined) {
        updates.push("description = ?");
        params.push(description);
    }

    if (color !== undefined) {
        updates.push("color = ?");
        params.push(color);
    }

    if (password !== undefined) {
        // Prevent setting a password on the Admins group.
        const groupInfo = await adapter.query<{ name: string; }>(
            "SELECT name FROM `groups` WHERE id = ?",
            [id],
        );

        if (groupInfo[0]?.name === adminGroupName && password !== null) {
            sendError(res, "Cannot set a shared password on the Admins group.");

            return;
        }

        if (password === null) {
            updates.push("password_hash = NULL");
        } else {
            updates.push("password_hash = ?");
            params.push(await hashPassword(password));
        }
    }

    if (adminId !== undefined) {
        updates.push("admin_id = ?");
        params.push(adminId);
    }

    params.push(id);

    await adapter.execute(
        `UPDATE \`groups\` SET ${updates.join(", ")} WHERE id = ?`,
        params,
    );

    sendJson(res, { success: true });
};

const handleDeleteGroup = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (id === undefined) {
        sendError(res, "id required");

        return;
    }

    await adapter.execute("DELETE FROM `groups` WHERE id = ?", [id]);

    sendJson(res, { success: true });
};

// ---------- User-Group Membership Handlers ----------

const handleAddUserToGroup = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const userId = body.userId !== undefined ? Number(body.userId) : undefined;
    const groupId = body.groupId !== undefined ? Number(body.groupId) : undefined;

    if (userId === undefined || groupId === undefined) {
        sendError(res, "userId and groupId required");

        return;
    }

    await adapter.execute(
        "INSERT IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)",
        [userId, groupId],
    );

    sendJson(res, { success: true });
};

const handleRemoveUserFromGroup = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const userId = body.userId !== undefined ? Number(body.userId) : undefined;
    const groupId = body.groupId !== undefined ? Number(body.groupId) : undefined;

    if (userId === undefined || groupId === undefined) {
        sendError(res, "userId and groupId required");

        return;
    }

    await adapter.execute(
        "DELETE FROM user_groups WHERE user_id = ? AND group_id = ?",
        [userId, groupId],
    );

    sendJson(res, { success: true });
};

const handleListGroupMembers = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const authUser = getAuthUser(req);

    if (!authUser || !(await isUserInAdminGroup(adapter, authUser.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const url = getRequestUrl(req);
    const groupId = Number(url.searchParams.get("groupId"));

    if (!groupId) {
        sendError(res, "groupId required");

        return;
    }

    const rows = await adapter.query(
        `SELECT u.id, u.username, u.display_name
         FROM users u
         JOIN user_groups ug ON u.id = ug.user_id
         WHERE ug.group_id = ?
         ORDER BY u.username`,
        [groupId],
    );

    sendJson(res, {
        members: rows.map((u) => {
            return {
                id: u.id,
                username: u.username,
                displayName: u.display_name,
            };
        }),
    });
};

// ---------- Permission Handlers ----------

const handleGetPermissions = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);
    const url = getRequestUrl(req);
    const entityType = url.searchParams.get("entityType") ?? "";
    const entityIdStr = url.searchParams.get("entityId");
    const entityId = entityIdStr !== null ? Number(entityIdStr) : null;

    if (!entityType) {
        sendError(res, "entityType required");

        return;
    }

    // Non-admins can only read permissions for entities they own.
    const rows = await adapter.query<{
        id: number; entityType: string; entityId: number | null;
        ownerId: number | null; groupId: number | null; permBits: number;
    }>(
        "SELECT id, entity_type AS entityType, entity_id AS entityId," +
        " owner_id AS ownerId, group_id AS groupId, perm_bits AS permBits" +
        " FROM permissions WHERE entity_type = ? AND entity_id <=> ?",
        [entityType, entityId],
    );

    if (rows.length === 0) {
        sendJson(res, { permission: null });

        return;
    }

    const perm = rows[0];

    // Restrict access: non-admins can only see permissions for entities they own.
    if (!user || (!(await isUserInAdminGroup(adapter, user.userId)) && perm.ownerId !== user.userId)) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const ownerBits = (perm.permBits >> 6) & 0x7;
    const groupBits = (perm.permBits >> 3) & 0x7;
    const worldBits = perm.permBits & 0x7;

    sendJson(res, {
        permission: {
            id: perm.id,
            entityType: perm.entityType,
            entityId: perm.entityId,
            ownerId: perm.ownerId,
            groupId: perm.groupId,
            ownerPerm: ownerBits,
            groupPerm: groupBits,
            worldPerm: worldBits,
        },
    });
};

const handleSetPermissions = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const body = await readJsonBody(req);
    const entityType = String(body.entityType ?? "");
    const entityId = body.entityId !== undefined ? Number(body.entityId) : null;
    const ownerId = body.ownerId !== undefined ? Number(body.ownerId) : null;
    const groupId = body.groupId !== undefined ? Number(body.groupId) : null;
    const ownerPerm = body.ownerPerm !== undefined ? Number(body.ownerPerm) : Permission.RWX;
    const groupPerm = body.groupPerm !== undefined ? Number(body.groupPerm) : Permission.RX;
    const worldPerm = body.worldPerm !== undefined ? Number(body.worldPerm) : Permission.None;

    if (!entityType) {
        sendError(res, "entityType required");

        return;
    }

    const permBits = makePermBits(ownerPerm, groupPerm, worldPerm);

    await setPermissions(adapter, entityType, entityId, ownerId, groupId, permBits);

    sendJson(res, { success: true });
};

const scanDirectory = (dir: string, root: string): Array<{
    name: string; path: string; isDir: boolean;
    children?: unknown[];
}> => {
    const items: Array<{ name: string; path: string; isDir: boolean; children?: unknown[]; }> = [];

    if (!existsSync(dir)) {
        return items;
    }

    const entries = readdirSync(dir);

    for (const entry of entries) {
        if (entry.startsWith(".")) {
            continue;
        }

        const fullPath = join(dir, entry);
        const relative = fullPath.slice(root.length).replace(/^[/\\]/, "");
        const isDir = statSync(fullPath).isDirectory();
        const node: { name: string; path: string; isDir: boolean; children?: unknown[]; } = {
            name: entry,
            path: relative,
            isDir,
        };

        if (isDir) {
            node.children = scanDirectory(fullPath, root);
        }

        items.push(node);
    }

    items.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });

    return items;
};

const handleListSoundLib = (_req: IncomingMessage, res: ServerResponse): void => {
    const soundPath = resolve(config.soundLibPath);

    if (!existsSync(soundPath)) {
        sendJson(res, []);

        return;
    }

    const tree = scanDirectory(soundPath, soundPath);

    sendJson(res, tree);
};

// Serve static files from the sound library.
const serveSoundLibFile = (req: IncomingMessage, res: ServerResponse): void => {
    const url = getRequestUrl(req);
    const relativePath = url.pathname.replace(/^\/soundLib\//, "");
    const soundPath = resolve(config.soundLibPath);

    // Prevent directory traversal.
    const filePath = resolve(soundPath, relativePath);
    if (!filePath.startsWith(soundPath)) {
        res.writeHead(403);

        res.end("Forbidden");

        return;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404);

        res.end("Not found");

        return;
    }

    const ext = extname(filePath);
    const mimeType = lookupMimeType(ext) || "application/octet-stream";
    const data = readFileSync(filePath);

    res.writeHead(200, {
        "Content-Type": mimeType,
        "Content-Length": data.length,
        "Cache-Control": "public, max-age=3600",
    });

    res.end(data);
};

// ---------- Instrument Image Upload ----------

const handleUploadInstrumentImage = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const user = getAuthUser(req);

    if (!user || !(await isUserInAdminGroup(adapter, user.userId))) {
        sendError(res, "Forbidden", 403);

        return;
    }

    const url = getRequestUrl(req);
    const instrumentId = Number(url.searchParams.get("instrumentId"));

    if (!instrumentId || instrumentId <= 0) {
        sendError(res, "Invalid instrumentId");

        return;
    }

    // Parse multipart form data.
    const contentType = req.headers["content-type"] ?? "";

    if (!contentType.startsWith("multipart/form-data")) {
        sendError(res, "Expected multipart/form-data");

        return;
    }

    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

    if (!boundary) {
        sendError(res, "Missing boundary in multipart request");

        return;
    }

    const body = await readRawBody(req);
    const parts = parseMultipart(body, boundary);
    const filePart = parts.find((p) => {
        return p.name === "file";
    });

    if (!filePart?.filename) {
        sendError(res, "No file uploaded");

        return;
    }

    const extension = extname(filePart.filename).toLowerCase().replace(/^\./, "");
    const allowed = ["jpg", "jpeg", "png", "webp"];

    if (!allowed.includes(extension)) {
        sendError(res, "Invalid file type. Allowed: jpg, jpeg, png, webp");

        return;
    }

    // Generate unique filename.
    const basename = Array.from({ length: 32 }, () => {
        return Math.floor(Math.random() * 16).toString(16);
    }).join("");
    const targetName = `${basename}.${extension}`;
    const targetPath = join(uploadsPath, targetName);

    writeFileSync(targetPath, filePart.data);

    // Try to read image dimensions if the file is an image format.
    let width: number | undefined;
    let height: number | undefined;

    try {
        // Simple PNG/JPEG dimension reading without external dependencies.
        if (extension === "png" && filePart.data.length > 24) {
            width = filePart.data.readUInt32BE(16);
            height = filePart.data.readUInt32BE(20);
        } else if (extension === "jpeg" || extension === "jpg") {
            let offset = 2;

            while (offset < filePart.data.length - 9) {
                if (filePart.data[offset] !== 0xFF) {
                    break;
                }

                const marker = filePart.data[offset + 1];

                if (marker === 0xC0 || marker === 0xC2) {
                    height = filePart.data.readUInt16BE(offset + 5);
                    width = filePart.data.readUInt16BE(offset + 7);

                    break;
                }

                offset += 2 + filePart.data.readUInt16BE(offset + 2);
            }
        }
    } catch {
        // Ignore dimension parsing errors.
    }

    const publicPath = `/uploads/instruments/${targetName}`;
    const lookedUp = lookupMimeType(extension);
    const mimeType = filePart.contentType ?? (lookedUp || "application/octet-stream");

    const result = await adapter.insertReturningId(
        `INSERT INTO instrument_images
            (instrument_id, file_path, mime_type, width, height, file_size)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [instrumentId, publicPath, mimeType, width ?? null, height ?? null, filePart.data.length],
    );

    sendJson(res, {
        id: result.insertId,
        instrumentId: instrumentId,
        filePath: publicPath,
        mimeType: mimeType,
        width: width ?? null,
        height: height ?? null,
        fileSize: filePart.data.length,
    });
};

/** Simple multipart form data part. */
interface IMultipartPart {
    name?: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
}

/**
 * Reads the full raw request body.
 *
 * @param req The incoming HTTP request.
 * @returns The full body as a Buffer.
 */
const readRawBody = (req: IncomingMessage): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        req.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        req.on("end", () => {
            resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
    });
};

/**
 * Parses multipart/form-data body into parts.
 *
 * @param body The raw request body.
 * @param boundary The multipart boundary string.
 * @returns The parsed parts.
 */
const parseMultipart = (body: Buffer, boundary: string): IMultipartPart[] => {
    const parts: IMultipartPart[] = [];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const endBoundary = Buffer.from(`--${boundary}--`);
    const crlf = Buffer.from("\r\n");
    const doubleCrlf = Buffer.from("\r\n\r\n");

    let offset = 0;

    while (offset < body.length) {
        const boundaryPos = body.indexOf(boundaryBuffer, offset);

        if (boundaryPos === -1) {
            break;
        }

        offset = boundaryPos + boundaryBuffer.length;

        // Check for end boundary.
        if (body.subarray(offset, offset + 2).equals(Buffer.from("--"))) {
            break;
        }

        // Skip CRLF after boundary.
        if (body.subarray(offset, offset + 2).equals(crlf)) {
            offset += 2;
        }

        const headersEnd = body.indexOf(doubleCrlf, offset);

        if (headersEnd === -1) {
            break;
        }

        const headerText = body.subarray(offset, headersEnd).toString("utf-8");
        const part: IMultipartPart = { data: Buffer.alloc(0) };

        for (const line of headerText.split("\r\n")) {
            const colonPos = line.indexOf(":");

            if (colonPos === -1) {
                continue;
            }

            const key = line.substring(0, colonPos).trim().toLowerCase();
            const value = line.substring(colonPos + 1).trim();

            if (key === "content-disposition") {
                const nameMatch = value.match(/name="([^"]+)"/);

                if (nameMatch) {
                    part.name = nameMatch[1];
                }

                const filenameMatch = value.match(/filename="([^"]+)"/);

                if (filenameMatch) {
                    part.filename = filenameMatch[1];
                }
            } else if (key === "content-type") {
                part.contentType = value;
            }
        }

        offset = headersEnd + doubleCrlf.length;

        // Find next boundary.
        const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), offset);

        if (nextBoundary === -1) {
            // Try with just boundary (no leading CRLF - last part before end boundary).
            const endBoundaryPos = body.indexOf(endBoundary, offset);

            if (endBoundaryPos === -1) {
                part.data = body.subarray(offset);

                parts.push(part);

                break;
            }

            part.data = body.subarray(offset, endBoundaryPos - 2); // -2 for CRLF before end boundary.
            parts.push(part);

            break;
        }

        part.data = body.subarray(offset, nextBoundary);
        parts.push(part);
        offset = nextBoundary + 2; // Skip CRLF.
    }

    return parts;
};

// ---------- Router ----------

const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);

        res.end();

        return;
    }

    const url = getRequestUrl(req);
    const pathname = url.pathname;
    const action = url.searchParams.get("action");

    // Sound library static files.
    if (pathname.startsWith("/soundLib/")) {
        serveSoundLibFile(req, res);

        return;
    }

    // API routes.
    if (pathname === "/api") {
        if (!action) {
            sendError(res, "Missing action");

            return;
        }

        try {
            switch (action) {
                case "health":
                    await handleHealth(req, res);

                    break;

                case "setup":
                    await handleSetup(req, res);

                    break;

                case "testConnection":
                    await handleTestConnection(req, res);

                    break;

                case "listScoreFolderContent":
                    await handleListScoreFolderContent(req, res);

                    break;

                case "addScoreFolder":
                    await handleAddScoreFolder(req, res);

                    break;

                case "addScore":
                    await handleAddScore(req, res);

                    break;

                case "renameEntry":
                    await handleRenameEntry(req, res);

                    break;

                case "updateScore":
                    await handleUpdateScore(req, res);

                    break;

                case "delete":
                    await handleDelete(req, res);

                    break;

                case "move":
                    await handleMove(req, res);

                    break;

                case "listSoundLib":
                    handleListSoundLib(req, res);

                    break;

                case "clearAll":
                    await handleClearAll(req, res);

                    break;

                case "login":
                    await handleLogin(req, res);

                    break;

                case "groupLogin":
                    await handleGroupLogin(req, res);

                    break;

                case "listPublicGroups":
                    await handleListPublicGroups(req, res);

                    break;

                case "refresh":
                    await handleRefresh(req, res);

                    break;

                case "logout":
                    handleLogout(req, res);

                    break;

                case "whoami":
                    await handleWhoAmI(req, res);

                    break;

                case "createInitialAdmin":
                    await handleCreateInitialAdmin(req, res);

                    break;

                case "listUsers":
                    await handleListUsers(req, res);

                    break;

                case "createUser":
                    await handleCreateUser(req, res);

                    break;

                case "updateUser":
                    await handleUpdateUser(req, res);

                    break;

                case "deleteUser":
                    await handleDeleteUser(req, res);

                    break;

                case "listGroups":
                    await handleListGroups(req, res);

                    break;

                case "createGroup":
                    await handleCreateGroup(req, res);

                    break;

                case "updateGroup":
                    await handleUpdateGroup(req, res);

                    break;

                case "deleteGroup":
                    await handleDeleteGroup(req, res);

                    break;

                case "addUserToGroup":
                    await handleAddUserToGroup(req, res);

                    break;

                case "removeUserFromGroup":
                    await handleRemoveUserFromGroup(req, res);

                    break;

                case "listGroupMembers":
                    await handleListGroupMembers(req, res);

                    break;

                case "getPermissions":
                    await handleGetPermissions(req, res);

                    break;

                case "setPermissions":
                    await handleSetPermissions(req, res);

                    break;

                default:
                    sendError(res, "Unknown action");
            }
        } catch (e) {
            console.error("API error:", convertErrorToString(e));
            sendError(res, "Internal server error.", 500);
        }

        return;
    }

    // Upload instrument image.
    if (pathname === "/upload-instrument-image.php" && req.method === "POST") {
        await handleUploadInstrumentImage(req, res);

        return;
    }

    // Serve static frontend files (dist/) with SPA fallback.
    serveStaticFile(req, res, pathname);
};

/**
 * Serves a static file from the dist/ or public/ directories.
 * Falls back to index.html for SPA client-side routing.
 *
 * @param req      The incoming HTTP request.
 * @param res      The HTTP response.
 * @param pathname The requested URL path.
 */
const serveStaticFile = (req: IncomingMessage, res: ServerResponse, pathname: string): void => {
    const distPath = resolve(process.cwd(), "dist");
    const decodedPath = decodeURIComponent(pathname);

    // Try public/ first (for uploads etc.), then dist/.
    const candidates = [
        resolve(process.cwd(), "public", `.${decodedPath}`),
        resolve(distPath, `.${decodedPath}`),
    ];

    for (const filePath of candidates) {
        if (!filePath.startsWith(distPath) && !filePath.startsWith(resolve(process.cwd(), "public"))) {
            continue; // Directory traversal attempt.
        }

        if (existsSync(filePath) && !statSync(filePath).isDirectory()) {
            const ext = extname(filePath);
            const mimeType = lookupMimeType(ext) || "application/octet-stream";
            const data = readFileSync(filePath);

            res.writeHead(200, {
                "Content-Type": mimeType,
                "Content-Length": data.length,
                "Cache-Control": "public, max-age=3600",
            });

            res.end(data);

            return;
        }
    }

    // SPA fallback: serve index.html for any non-file route.
    const indexPath = resolve(distPath, "index.html");

    if (existsSync(indexPath)) {
        const data = readFileSync(indexPath);

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": data.length,
        });

        res.end(data);

        return;
    }

    res.writeHead(404);

    res.end("Not found");
};

// ---------- Startup ----------

const main = (): void => {
    config = loadConfig();
    adapter = createAdapter();

    // Try to initialise with saved or default config on startup.
    adapter.testConnection(config.database).then((result) => {
        if (result.success) {
            return adapter.initialize(config.database).then(() => {
                const { engine, host, port, database } = config.database;
                console.log(
                    `Backend initialised: ${engine} @ ${host}:${port}/${database}`,
                );

                // Load seed only if tables are empty (avoid duplicates).
                return adapter.query<{ cnt: number; }>(
                    "SELECT COUNT(*) AS cnt FROM folders",
                ).then((rows) => {
                    if ((rows[0]?.cnt ?? 0) === 0) {
                        return seedIfExists(adapter);
                    }

                    return undefined;
                }).then(() => {
                    return seedAnonymousUser(adapter);
                });
            });
        }

        console.log(`Could not auto-connect: ${result.error ?? "unknown reason"}`);
        console.log("Waiting for setup from frontend…");

        return undefined;
    }).catch((e: unknown) => {
        console.warn("Database init failed:", convertErrorToString(e));
        console.log("Waiting for setup from frontend…");
    });

    // Ensure uploads directory exists.
    if (!existsSync(uploadsPath)) {
        mkdirSync(uploadsPath, { recursive: true });
    }

    const server = createServer((req, res) => {
        void handleRequest(req, res);
    });

    // Keep track of open connections for graceful shutdown.
    const connections = new Set<import("node:net").Socket>();

    server.on("connection", (socket) => {
        connections.add(socket);

        socket.once("close", () => {
            connections.delete(socket);
        });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${config.port} is already in use.`);
            process.exit(1);
        }

        throw err;
    });

    server.listen(config.port, config.host, () => {
        const displayHost = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;

        console.log(
            `Backend server listening on http://${displayHost}:${config.port}`
            + ` (bound to ${config.host}:${config.port})`,
        );
    });

    const shutdown = () => {
        console.log("\nShutting down…");

        // Stop accepting new connections (Node 18+).
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (server.closeIdleConnections) {
            server.closeIdleConnections();
        }

        // Destroy all keep-alive connections.
        for (const socket of connections) {
            socket.destroy();
        }

        connections.clear();

        adapter.shutdown().then(() => {
            server.close(() => {
                process.exit(0);
            });
        }).catch(() => {
            process.exit(1);
        });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
};

main();
