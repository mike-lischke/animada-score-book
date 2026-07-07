/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { lookup as lookupMimeType } from "mime-types";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";

import { type RequestContext } from "./RequestContext.js";
import { uploadsPath } from "./config.js";

/** Simple multipart form data part. */
interface IMultipartPart {
    name?: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
}

export class StaticRoutes {
    /** Magic bytes for supported image formats. */
    private static readonly imageSignatures = new Map<string, number[]>([
        ["png", [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
        ["jpg", [0xFF, 0xD8, 0xFF]],
        ["jpeg", [0xFF, 0xD8, 0xFF]],
        ["webp", [0x52, 0x49, 0x46, 0x46]],
    ]);

    public constructor(private readonly ctx: RequestContext) { }

    public handleListSoundLib(req: IncomingMessage, res: ServerResponse) {
        const soundPath = resolve(this.ctx.config.soundLibPath);

        if (!existsSync(soundPath)) {
            this.ctx.sendJson(res, []);

            return;
        }

        const tree = this.scanDirectory(soundPath, soundPath);

        this.ctx.sendJson(res, tree);
    };

    public async handleUploadInstrumentImage(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user || !(await this.ctx.auth.isUserInAdminGroup(user.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const url = this.ctx.getRequestUrl(req);
        const instrumentId = Number(url.searchParams.get("instrumentId"));

        if (!instrumentId || instrumentId <= 0) {
            this.ctx.sendError(res, "Invalid instrumentId");

            return;
        }

        const contentType = req.headers["content-type"] ?? "";

        if (!contentType.startsWith("multipart/form-data")) {
            this.ctx.sendError(res, "Expected multipart/form-data");

            return;
        }

        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
        const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

        if (!boundary) {
            this.ctx.sendError(res, "Missing boundary in multipart request");

            return;
        }

        const body = await this.readRawBody(req);
        const parts = this.parseMultipart(body, boundary);
        const filePart = parts.find((p) => {
            return p.name === "file";
        });

        if (!filePart?.filename) {
            this.ctx.sendError(res, "No file uploaded");

            return;
        }

        const extension = extname(filePart.filename).toLowerCase().replace(/^\./, "");
        const allowed = ["jpg", "jpeg", "png", "webp"];

        if (!allowed.includes(extension)) {
            this.ctx.sendError(res, "Invalid file type. Allowed: jpg, jpeg, png, webp");

            return;
        }

        if (!this.validateImageSignature(filePart.data, extension)) {
            this.ctx.sendError(res, "File content does not match its extension.");

            return;
        }

        const basename = Array.from({ length: 32 }, () => {
            return Math.floor(Math.random() * 16).toString(16);
        }).join("");
        const targetName = `${basename}.${extension}`;
        const targetPath = join(uploadsPath, targetName);

        writeFileSync(targetPath, filePart.data);

        let width: number | undefined;
        let height: number | undefined;

        try {
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
        const mimeType = lookedUp || "application/octet-stream";

        const result = await this.ctx.auth.adapter.insertReturningId(
            `INSERT INTO instrument_images
            (instrument_id, file_path, mime_type, width, height, file_size)
         VALUES (?, ?, ?, ?, ?, ?)`,
            [instrumentId, publicPath, mimeType, width ?? null, height ?? null, filePart.data.length],
        );

        this.ctx.sendJson(res, {
            id: result.insertId,
            instrumentId: instrumentId,
            filePath: publicPath,
            mimeType: mimeType,
            width: width ?? null,
            height: height ?? null,
            fileSize: filePart.data.length,
        });
    };

    public serveStaticFile(req: IncomingMessage, res: ServerResponse, pathname: string): void {
        const distPath = resolve(process.cwd(), "dist");
        const decodedPath = decodeURIComponent(pathname);

        const candidates = [
            resolve(process.cwd(), "public", `.${decodedPath}`),
            resolve(distPath, `.${decodedPath}`),
        ];

        for (const filePath of candidates) {
            if (!filePath.startsWith(distPath) && !filePath.startsWith(resolve(process.cwd(), "public"))) {
                continue;
            }

            if (existsSync(filePath) && !statSync(filePath).isDirectory()) {
                const ext = extname(filePath);
                const mimeType = lookupMimeType(ext) || "application/octet-stream";
                const data = readFileSync(filePath);

                res.writeHead(200, {
                    "Content-Type": mimeType,
                    "Content-Length": data.length,
                    "Cache-Control": "public, max-age=3600",
                    "X-Content-Type-Options": "nosniff",
                });

                res.end(data);

                return;
            }
        }

        const indexPath = resolve(distPath, "index.html");

        if (existsSync(indexPath)) {
            const data = readFileSync(indexPath);

            res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Length": data.length,
                "X-Content-Type-Options": "nosniff",
            });

            res.end(data);

            return;
        }

        res.writeHead(404);

        res.end("Not found");
    };

    public serveSoundLibFile(req: IncomingMessage, res: ServerResponse): void {
        const url = this.ctx.getRequestUrl(req);
        const relativePath = url.pathname.replace(/^\/soundLib\//, "");
        const soundPath = resolve(this.ctx.config.soundLibPath);

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
            "X-Content-Type-Options": "nosniff",
        });

        res.end(data);
    };

    private scanDirectory(dir: string, root: string): Array<{
        name: string; path: string; isDir: boolean;
        children?: unknown[];
    }> {
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
                node.children = this.scanDirectory(fullPath, root);
            }

            items.push(node);
        }

        items.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        return items;
    };

    private validateImageSignature(data: Buffer, extension: string): boolean {
        const sig = StaticRoutes.imageSignatures.get(extension);

        if (!sig) {
            return false;
        }

        if (data.length < sig.length) {
            return false;
        }

        for (let i = 0; i < sig.length; i++) {
            if (data[i] !== sig[i]) {
                return false;
            }
        }

        if (extension === "webp") {
            const webpSubtype = [0x57, 0x45, 0x42, 0x50];

            if (data.length < 12) {
                return false;
            }

            for (let i = 0; i < webpSubtype.length; i++) {
                if (data[8 + i] !== webpSubtype[i]) {
                    return false;
                }
            }
        }

        return true;
    };

    private readRawBody(req: IncomingMessage, maxSize = 50 * 1024 * 1024): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let totalSize = 0;

            req.on("data", (chunk: Buffer) => {
                totalSize += chunk.length;

                if (totalSize > maxSize) {
                    req.destroy();

                    reject(new Error("Request body too large"));

                    return;
                }

                chunks.push(chunk);
            });
            req.on("end", () => {
                resolve(Buffer.concat(chunks));
            });
            req.on("error", reject);
        });
    };

    private parseMultipart(body: Buffer, boundary: string): IMultipartPart[] {
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

            if (body.subarray(offset, offset + 2).equals(Buffer.from("--"))) {
                break;
            }

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

            const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), offset);

            if (nextBoundary === -1) {
                const endBoundaryPos = body.indexOf(endBoundary, offset);

                if (endBoundaryPos === -1) {
                    part.data = body.subarray(offset);

                    parts.push(part);

                    break;
                }

                part.data = body.subarray(offset, endBoundaryPos - 2);
                parts.push(part);

                break;
            }

            part.data = body.subarray(offset, nextBoundary);
            parts.push(part);
            offset = nextBoundary + 2;
        }

        return parts;
    };
}
