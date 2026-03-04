/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [preact({
        prefreshEnabled: false, // Disable Preact's fast refresh to avoid issues with the NoteViewer component.
    })],
    build: {
        target: "esnext",
        assetsInlineLimit: 0, // Don't inline any assets.
    },
});
