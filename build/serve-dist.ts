/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable no-restricted-syntax */

import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "127.0.0.1";
const distRoot = resolve(process.cwd(), "dist");

const mimeTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".wav": "audio/wav",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

const sendFile = async (filePath: string, response: ServerResponse): Promise<void> => {
    const fileInfo = await stat(filePath);
    const extension = extname(filePath).toLowerCase();

    response.writeHead(200, {
        "Content-Length": fileInfo.size,
        "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
        "Cache-Control": "no-store",
    });

    createReadStream(filePath).pipe(response);
};

const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
    void (async () => {
        const method = request.method ?? "GET";
        if (!["GET", "HEAD"].includes(method)) {
            response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Method Not Allowed");

            return;
        }

        const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
        const requestPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
        const candidatePath = normalize(join(distRoot, requestPath));
        const safePath = candidatePath.startsWith(distRoot) ? candidatePath : join(distRoot, "index.html");
        const filePath = existsSync(safePath) ? safePath : join(distRoot, "index.html");

        try {
            if (method === "HEAD") {
                const fileInfo = await stat(filePath);
                const extension = extname(filePath).toLowerCase();
                response.writeHead(200, {
                    "Content-Length": fileInfo.size,
                    "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
                    "Cache-Control": "no-store",
                });
                response.end();

                return;
            }

            await sendFile(filePath, response);
        } catch {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Not Found");
        }
    })();
};

const server = createServer(handleRequest);

server.listen(port, host, () => {
    console.log(`Serving dist at http://${host}:${port}`);
});
