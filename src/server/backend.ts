/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { lookup as lookupMimeType } from "mime-types";

import {
    DatabaseEngine, type IDatabaseAdapter, type IDatabaseConfig
} from "./database.js";
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

// ---------- API Handlers ----------

const handleHealth = async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let hasData = false;

    if (adapter.isInitialized()) {
        try {
            const rows = await adapter.query<{ cnt: number; }>(
                "SELECT COUNT(*) AS cnt FROM folders",
            );

            hasData = (rows[0]?.cnt ?? 0) > 0;
        } catch {
            // Tables might not exist yet.
        }
    }

    sendJson(res, {
        status: "ok",
        initialized: adapter.isInitialized(),
        engine: config.database.engine,
        hasData,
    });
};

const handleSetup = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);

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
                await newAdapter.execute("DROP TABLE IF EXISTS instrument_images");
                await newAdapter.execute("DROP TABLE IF EXISTS instruments");
                await newAdapter.execute("DROP TABLE IF EXISTS scores");
                await newAdapter.execute("DROP TABLE IF EXISTS folders");
                await newAdapter.shutdown();
                const freshAdapter = createAdapter();

                await freshAdapter.initialize(config.database);
                await seedIfExists(freshAdapter);
                await adapter.shutdown();
                adapter = freshAdapter;
                saveConfig();
                sendJson(res, { success: true });

                return;
            } catch (e) {
                sendError(res, `Overwrite failed: ${String(e)}`, 500);

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
    } catch (e) {
        sendError(res, `Initialisation failed: ${String(e)}`, 500);

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
        console.error("testConnection error:", String(e));
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

    sendJson(res, { folders, scores });
};

const handleAddScoreFolder = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);
    const name = String(body.name ?? "").trim();

    if (!name) {
        sendError(res, "Name required");

        return;
    }

    const parentId = body.parentid !== undefined ? Number(body.parentid) : null;

    const result = await adapter.insertReturningId(
        "INSERT INTO folders (parentid, name) VALUES (?, ?)",
        [parentId, name],
    );

    sendJson(res, { success: true, id: result.insertId });
};

const handleAddScore = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);
    const folderId = body.folderId !== undefined ? Number(body.folderId) : null;
    const name = String(body.name ?? "").trim();
    const content = String(body.content ?? "");

    if (!name) {
        sendError(res, "Name required");

        return;
    }

    const result = await adapter.insertReturningId(
        "INSERT INTO scores (folderid, name, content) VALUES (?, ?, ?)",
        [folderId, name, content],
    );

    sendJson(res, { success: true, id: result.insertId });
};

const handleRenameEntry = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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

    const table = type === "folder" ? "folders" : "scores";

    await adapter.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id]);

    sendJson(res, { success: true });
};

const handleUpdateScore = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);
    const id = body.id !== undefined ? Number(body.id) : undefined;
    const content = body.content as string | undefined;

    if (id === undefined || content === undefined) {
        sendError(res, "id and content required");

        return;
    }

    await adapter.execute("UPDATE scores SET content = ? WHERE id = ?", [content, id]);

    sendJson(res, { success: true });
};

const handleDelete = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);
    const type = body.type as string | undefined;
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (!type || id === undefined) {
        sendError(res, "type and id required");

        return;
    }

    if (type === "score") {
        await adapter.execute("DELETE FROM scores WHERE id = ?", [id]);
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

        sendJson(res, { success: true });

        return;
    }

    sendError(res, "Invalid type (folder|score)");
};

const handleMove = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readJsonBody(req);
    const type = body.type as string | undefined;
    const id = body.id !== undefined ? Number(body.id) : undefined;

    if (type === "folder") {
        const newParentId = body.newParentId !== undefined ? Number(body.newParentId) : undefined;

        if (id === undefined || newParentId === undefined) {
            sendError(res, "id and newParentId required");

            return;
        }

        await adapter.execute("UPDATE folders SET parentid = ? WHERE id = ?", [newParentId, id]);
        sendJson(res, { success: true });

        return;
    }

    if (type === "score") {
        const newFolderId = body.newFolderId !== undefined ? Number(body.newFolderId) : undefined;

        if (id === undefined || newFolderId === undefined) {
            sendError(res, "id and newFolderId required");

            return;
        }

        await adapter.execute("UPDATE scores SET folderid = ? WHERE id = ?", [newFolderId, id]);
        sendJson(res, { success: true });

        return;
    }

    sendError(res, "Invalid type (folder|score)");
};

const handleClearAll = async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!adapter.isInitialized()) {
        sendError(res, "Database not initialised.", 500);

        return;
    }

    await adapter.execute("DELETE FROM scores");
    await adapter.execute("DELETE FROM folders");

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
        instrument_id: instrumentId,
        file_path: publicPath,
        mime_type: mimeType,
        width: width ?? null,
        height: height ?? null,
        file_size: filePart.data.length,
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
    if (pathname === "/api" || pathname === "/api.php") {
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

                default:
                    sendError(res, "Unknown action");
            }
        } catch (e) {
            console.error("API error:", e);
            sendError(res, `Internal server error: ${String(e)}`, 500);
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
                });
            });
        }

        console.log(`Could not auto-connect: ${result.error ?? "unknown reason"}`);
        console.log("Waiting for setup from frontend…");

        return undefined;
    }).catch((e: unknown) => {
        console.warn("Database init failed:", String(e));
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
