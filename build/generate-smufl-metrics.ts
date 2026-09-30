/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Reduces the SMuFL metadata of every font in `public/fonts/smufl/index.json` to the metrics the app reads.
 *
 * The metadata files are 120 KB to 1.8 MB each and live in `build/smufl/`, because they are build input
 * only: the app fetches the few kilobytes this script writes next to the fonts instead. Runs as part of
 * `npm run build`, before the fonts are verified.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SmuflFontMetrics } from "../src/core/smufl/SmuflFontMetrics.js";
import { SmuflFonts } from "../src/core/smufl/SmuflFonts.js";
import { SmuflGlyphs } from "../src/core/smufl/SmuflGlyphs.js";

const fontFolder = fileURLToPath(new URL("../public/fonts/smufl/", import.meta.url));
const metadataFolder = fileURLToPath(new URL("../build/smufl/", import.meta.url));
const indexPath = `${fontFolder}index.json`;

/**
 * @param path The file to read.
 *
 * @returns The parsed content of the file.
 */
const readJson = (path: string): unknown => {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
};

const indexResult = SmuflFonts.readIndex(readJson(indexPath));
if (indexResult.index === undefined) {
    throw new Error(`cannot read ${indexPath}: ${indexResult.errors.join("; ")}`);
}

let totalBytes = 0;
for (const entry of indexResult.index.fonts) {
    const built = SmuflFontMetrics.build(readJson(`${metadataFolder}${entry.metadata}`));
    if (built.metrics === undefined) {
        throw new Error(`${entry.id}: ${built.errors.join("; ")}`);
    }

    const content = `${JSON.stringify(built.metrics)}\n`;
    writeFileSync(`${fontFolder}${entry.metrics}`, content);
    totalBytes += content.length;

    const described = Object.keys(built.metrics.glyphs).length;
    console.log(`${entry.id.padEnd(10)} ${described}/${SmuflGlyphs.all.length} glyphs, ${content.length} bytes`);
}

console.log(`${indexResult.index.fonts.length} metrics files, ${totalBytes} bytes in total`);
