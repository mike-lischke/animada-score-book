/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, Plugin } from "vite";

const packageJson = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string; };

/**
 * Helper plugin to serve index.html for non-asset requests, enabling SPA-like routing in development mode.
 *
 * @returns A Vite plugin object.
 */
const spaDocumentFallback = (): Plugin => {
    return {
        name: "spa-document-fallback",
        apply: "serve",
        configureServer: (server) => {
            server.middlewares.use((req, _res, next) => {
                const method = req.method ?? "GET";
                if (method !== "GET" && method !== "HEAD") {
                    next();

                    return;
                }

                const url = req.url ?? "/";
                const pathname = url.split("?")[0];
                const accept = req.headers.accept ?? "";

                const isHtmlRequest =
                    accept.includes("text/html") || accept.includes("*/*");

                const isAssetLike =
                    pathname.startsWith("/api") ||
                    pathname.startsWith("/sounds") ||
                    pathname.startsWith("/assets") ||
                    pathname.startsWith("/src") ||
                    pathname.startsWith("/@vite") ||
                    pathname.includes("/__vite_") ||
                    /\.[a-zA-Z0-9]+$/.test(pathname);

                if (!isHtmlRequest || isAssetLike) {
                    next();

                    return;
                }

                req.url = "/index.html";
                next();
            });
        },
    };
};

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
    // eslint-disable-next-line no-restricted-syntax
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";

    return {
        server: command === "serve" ? {
            https: {
                key: readFileSync(join(home, ".ssh", "localhost-key.pem")),
                cert: readFileSync(join(home, ".ssh", "localhost-cert.pem")),
            },
            host: "127.0.0.1",
            port: 5173,
            proxy: {
                "/api": {
                    target: "http://127.0.0.1:3100",
                    changeOrigin: true,
                },
                "/soundLib": {
                    target: "http://127.0.0.1:3100",
                    changeOrigin: true,
                },
            },
        } : undefined,
        plugins: [
            preact({
                prefreshEnabled: false, // Disable Preact's fast refresh to avoid issues with the NoteViewer component.
            }),
            tailwindcss(),
            spaDocumentFallback(),
        ],
        build: {
            target: "esnext",
            assetsInlineLimit: 0, // Don't inline any assets.
        },
        appType: "mpa",
        define: {
            appVersion: JSON.stringify(packageJson.version),
        },
    };
});
