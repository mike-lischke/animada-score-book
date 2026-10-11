/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface VSTheme {
    name: string;
    type: "light" | "dark" | "hc";
    colors?: Record<string, string | undefined>;
}

const sharedValues = `
    --radius-selector: 0.5rem;
    --radius-field: 0.375rem;
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
    const c = theme.colors ?? {};
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

    // App tokens that extend the daisyUI set, so our own surfaces follow the active theme.
    const selection = c["editor.selectionBackground"] ??
        c["terminal.selectionBackground"] ??
        c["list.activeSelectionBackground"] ??
        "#264f78";
    const shadow = c["widget.shadow"] ?? "#00000033";

    // `--color-info` is a surface color, so it is unsuitable as a foreground; this is the icon/text color.
    const infoForeground = c["notificationsInfoIcon.foreground"] ?? "#3794ff";

    // The accent of a user's own identity marker, e.g. the avatar background of an administrator.
    // Background and content are a deliberately fixed brand pair; the red is the lightest tone that still
    // reaches a 3:1 contrast with the white content.
    const identity = "#fc6246";
    const identityContent = "#ffffff";

    return `@plugin "daisyui/theme" {
    /* Meta data */
    name: "${theme.name}";
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

    /* Selection highlight, overlay shadow, info foreground and identity accent, used by our own components. */
    --color-selection: ${selection};
    --shadow-color: ${shadow};
    --color-info-foreground: ${infoForeground};
    --color-identity: ${identity};
    --color-identity-content: ${identityContent};

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
