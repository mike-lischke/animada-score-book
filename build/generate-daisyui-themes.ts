/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { escapeCssIdent } from "../src/components/ui/framework/css-helpers.js";
interface VSTheme {
    name: string;
    type: "light" | "dark" | "hc";
    colors?: Record<string, string>;
}

const sharedValues = `
    --radius-selector: 0.5rem;
    --radius-field: 0.25rem;
    --radius-box: 0.5rem;

    --size-selector: 0.25rem;
    --size-field: 0.25rem;

    --border: 1px;

    --depth: 1;
    --noise: 0;`;

const currentFile = fileURLToPath(import.meta.url);
const currentFolder = dirname(currentFile);

const srcDir = join(currentFolder, "../themes");
const outFile = join(currentFolder, "../src/generated/themes.css");
const themeNamesFile = join(currentFolder, "../src/generated/theme-names.ts");

const files = readdirSync(srcDir).filter((f) => {
    return f.endsWith(".json");
});

const mapVsThemeToDaisyTheme = (theme: VSTheme): string => {
    const c = theme.colors ?? {} as Record<string, string | undefined>;
    const type = theme.type === "dark" ? "dark" : "light";

    // Base colors.
    const base100 = c["editor.background"];
    const baseContent = c["editor.foreground"] ?? c.foreground;
    const primary = c["button.background"] ?? c["banner.background"] ?? "#3794ff";
    const secondary = c["minimapGutter.addedBackground"] ?? primary;
    const neutralBg = c["activityBar.background"] ?? "#404040";
    const neutralFg = c["activityBar.foreground"] ?? "#cccccc";
    const accent = c["charts.green"] ?? primary;
    const info = c["inputValidation.infoBackground"] ?? primary;
    const warning = c["notificationsWarningIcon.foreground"] ?? c["charts.yellow"] ?? "#cca700";
    const error = c.errorForeground ?? c["notificationsErrorIcon.foreground"] ?? c["charts.red"] ?? "#f14c4c";
    const success = c["gitDecoration.addedResourceForeground"] ?? c["minimapGutter.addedBackground"] ??
        c["charts.green"] ?? "#81b88b";

    // Own color definitions. They are not used in daisyUI themes, but we can use them for for our
    // own components, to achieve a more consistent look.
    /*const selectionBg =
        c["editor.selectionBackground"] ??
        c["terminal.selectionBackground"] ??
        c["list.activeSelectionBackground"] ??
        "#264f78";*/

    return `@plugin "daisyui/theme" {
    /* Meta data */
    name: "${escapeCssIdent(theme.name)}";
    default: ${theme.name === "Light+" ? "true" : "false"};
    prefersdark: ${theme.name === "Dark+" ? "true" : "false"};
    color-scheme: ${type};

    /* Base backgrounds + text */
    --color-base-100: ${base100};
    --color-base-200: ${c["welcomePage.tileBackground"] ?? base100};
    --color-base-300: ${c["badge.background"] ?? base100};
    --color-base-content: ${baseContent};

    /* Primary color */
    --color-primary: ${primary};
    --color-primary-content: ${c["button.foreground"] ?? "#ffffff"};

    /* Secondary color */
    --color-secondary: ${secondary};
    --color-secondary-content: #ffffff;

    /* Accent color */
    --color-accent: ${accent};
    --color-accent-content: ${c.foreground ?? "#ffffff"};

    /* Neutral surfaces (Cards, Dropdowns, etc.) */
    --color-neutral: ${neutralBg};
    --color-neutral-content: ${neutralFg};

    /* Semantic colors */
    --color-info: ${info};
    --color-info-content: ${c.foreground ?? "#ffffff"};
    --color-success: ${success};
    --color-success-content: ${c.foreground ?? "#ffffff"};
    --color-warning: ${warning};
    --color-warning-content: ${c.foreground ?? "#ffffff"};
    --color-error: ${error};
    --color-error-content: ${c.foreground ?? "#ffffff"};

    ${sharedValues}
}`;
};

const themeExports: string[] = [];
const themeNames: Record<string, string> = {};

const daisyThemes = files.map((file: string) => {
    const raw = readFileSync(join(srcDir, file), "utf8");
    const theme = JSON.parse(raw) as VSTheme;

    themeExports.push(mapVsThemeToDaisyTheme(theme));
    themeNames[theme.name] = theme.type;
});

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, themeExports.join("\n\n"), "utf8");
writeFileSync(themeNamesFile,
    `export const themeNames = ${JSON.stringify(themeNames, null, 4)};\n`, "utf8");
console.log(`Wrote ${daisyThemes.length} DaisyUI themes to ${outFile}\n`);
