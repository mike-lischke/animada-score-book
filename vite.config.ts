/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // eslint-disable-next-line no-restricted-syntax
    const env = loadEnv(mode, process.cwd(), "");

    // eslint-disable-next-line no-restricted-syntax
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const apiTarget = env.VITE_BASE_URL;

    return {
        server: {
            https: {
                key: readFileSync(join(home, ".ssh", "localhost-key.pem")),
                cert: readFileSync(join(home, ".ssh", "localhost-cert.pem")),
            },
            host: "127.0.0.1",
            port: 5173,
            proxy: {
                "/api": {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
        plugins: [
            preact({
                prefreshEnabled: false, // Disable Preact's fast refresh to avoid issues with the NoteViewer component.
            }),
            tailwindcss(),
        ],
        build: {
            target: "esnext",
            assetsInlineLimit: 0, // Don't inline any assets.
        },
    };
});
