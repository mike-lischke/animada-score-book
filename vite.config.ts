/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { env } from "node:process";

import { preact } from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, Plugin } from "vite";

import { BundleBudget } from "./build/BundleBudget.js";

const packageJson = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string; };

/**
 * The chunks the client bundle is split into.
 *
 * Every third-party library is named here, one explicit package per pattern: a generic `node_modules` rule would move
 * Vite's preload helper into a lazy chunk, which makes the entry chunk import that chunk (and everything in it)
 * eagerly. A library only one dynamic import reaches (`@mediabunny/mp3-encoder`) keeps the chunk that import gave it;
 * only libraries shared between several imports are named, so their chunk gets a meaningful name instead of a path
 * fragment.
 *
 * The domain layer (`src/core`) is a chunk of its own: it is the stable part of the app, so UI work then leaves the
 * browser's copy of it valid, and both app chunks stay below the 500 kB limit Vite warns about.
 */
const chunkGroups = [
    {
        name: "vendor",
        test: /[\\/]node_modules[\\/](preact|@mdi[\\/]js|classnames)[\\/]/,
    },
    {
        name: "tabulator",
        test: /[\\/]node_modules[\\/]tabulator-tables[\\/]/,
    },
    {
        name: "mediabunny",
        test: /[\\/]node_modules[\\/]mediabunny[\\/]/,
    },
    {
        name: "core",
        test: /[\\/]src[\\/]core[\\/]/,
    },
];

/**
 * Fails the build when the emitted bundle exceeds its size budget.
 *
 * Runs after the bundle is written, so the check sees the files the browser will load.
 *
 * @returns A Vite plugin object.
 */
const bundleBudgetCheck = (): Plugin => {
    let distFolder = "";

    return {
        name: "bundle-budget-check",
        apply: "build",
        configResolved: (config) => {
            distFolder = resolve(config.root, config.build.outDir);
        },
        closeBundle: () => {
            BundleBudget.verify(distFolder);
        },
    };
};

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
    const home = env.HOME ?? env.USERPROFILE ?? "";

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
            bundleBudgetCheck(),
            spaDocumentFallback(),
        ],
        build: {
            target: "esnext",
            assetsInlineLimit: 0, // Don't inline any assets.
            manifest: true, // The bundle budget check reads the chunk graph from it.
            rolldownOptions: {
                output: {
                    codeSplitting: {
                        groups: chunkGroups,
                    },
                },
            },
        },
        appType: "mpa",
        define: {
            appVersion: JSON.stringify(packageJson.version),
        },
    };
});
