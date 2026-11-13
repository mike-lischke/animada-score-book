/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Rasterises the images the confirmation mails carry.
 *
 * Mail clients do not render SVG reliably — Gmail and Outlook drop it — so the mails reference PNG copies. This
 * script creates them from the vector sources: the brand logo from `public/logo.svg`, the musician illustrations
 * from the website's `src/assets/images`. The result lives in `public/mail` and is committed, so building the
 * package needs neither Chromium nor the website checkout.
 *
 * Usage: `npm run generate:mail-assets [-- --source <illustration directory>]`
 */

import { chromium, type Browser } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argv } from "node:process";

/** Edge length of the square canvas an illustration is centred in, so every mail carries the same image box. */
const illustrationSize = 240;

/** Height of the logo raster; the aspect ratio of the source is kept. */
const logoHeight = 256;

const projectRoot = resolve(import.meta.dirname, "..");
const targetDir = join(projectRoot, "public", "mail");

const sourceIndex = argv.indexOf("--source");
const sourceDir = sourceIndex >= 0
    ? resolve(argv[sourceIndex + 1])
    : resolve(projectRoot, "..", "website-animada-score-book", "src", "assets", "images");

if (!existsSync(sourceDir)) {
    throw new Error(`The illustration sources are missing: ${sourceDir}. Pass --source <directory>.`);
}

/**
 * @param file The SVG file to read.
 *
 * @returns Its markup without the XML prolog and the doctype, which are invalid inside an HTML document.
 */
const svgOf = (file: string): string => {
    const raw = readFileSync(file, "utf-8");
    const start = raw.indexOf("<svg");

    if (start < 0) {
        throw new Error(`No <svg> element in ${file}.`);
    }

    return raw.slice(start);
};

/**
 * @param browser The Chromium instance that renders the illustration.
 * @param source The SVG file to rasterise.
 * @param target The PNG file to write.
 * @param height The height to render at, keeping the aspect ratio.
 *
 * @returns The size of the written file in bytes.
 */
const rasteriseTight = async (browser: Browser, source: string, target: string,
    height: number): Promise<number> => {
    const svg = svgOf(source);
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];

    if (viewBox === undefined) {
        throw new Error(`No viewBox in ${source}.`);
    }

    const [, , boxWidth, boxHeight] = viewBox.split(/[ ,]+/).map(Number);
    const width = Math.round(height * (boxWidth / boxHeight));
    const page = await browser.newPage({ viewport: { width, height } });

    await page.setContent(
        `<body style="margin:0"><style>svg{display:block;width:${width}px;height:${height}px}</style>${svg}</body>`,
    );
    await page.screenshot({ path: target, omitBackground: true });
    await page.close();

    return statSync(target).size;
};

/**
 * @param browser The Chromium instance that renders the illustration.
 * @param source The SVG file to rasterise.
 * @param target The PNG file to write.
 * @param size The edge length of the square canvas, which the illustration is centred in.
 *
 * @returns The size of the written file in bytes.
 */
const rasteriseSquare = async (browser: Browser, source: string, target: string,
    size: number): Promise<number> => {
    const svg = svgOf(source);
    const page = await browser.newPage({ viewport: { width: size, height: size } });

    await page.setContent(
        `<body style="margin:0;display:flex;align-items:center;justify-content:center;`
        + `width:${size}px;height:${size}px">`
        + `<style>svg{display:block;max-width:${size}px;max-height:${size}px;width:auto;height:auto}</style>`
        + `${svg}</body>`,
    );
    await page.screenshot({ path: target, omitBackground: true });
    await page.close();

    return statSync(target).size;
};

const report = (target: string, size: number): void => {
    console.log(`  ${basename(target).padEnd(26)} ${(size / 1024).toFixed(1)} kB`);
};

mkdirSync(targetDir, { recursive: true });

const browser = await chromium.launch();
let total = 0;

console.log(`Mail images from ${sourceDir}`);
console.log("Logo:");

const logoPath = join(targetDir, "logo.png");
const logoSize = await rasteriseTight(browser, join(projectRoot, "public", "logo.svg"), logoPath, logoHeight);

report(logoPath, logoSize);
total += logoSize;

console.log("Illustrations:");

const illustrations = readdirSync(sourceDir)
    .filter((file) => {
        return file.endsWith(".svg");
    })
    .sort();

for (const file of illustrations) {
    const target = join(targetDir, `${basename(file, ".svg")}.png`);
    const size = await rasteriseSquare(browser, join(sourceDir, file), target, illustrationSize);

    report(target, size);
    total += size;
}

await browser.close();

console.log(`\n${illustrations.length + 1} images, ${(total / 1024).toFixed(0)} kB in ${targetDir}`);
