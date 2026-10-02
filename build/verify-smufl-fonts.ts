/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Verifies the SMuFL fonts shipped in `public/fonts/smufl/`.
 *
 * Runs as part of `npm run build`, so a font that cannot be used never ships. A `limited` font is
 * reported but does not fail the build; only a broken index or an unusable font does.
 */

import { fileURLToPath } from "node:url";

import { SmuflFontStatus } from "../src/core/smufl/SmuflFonts.js";
import { SmuflFontVerifier } from "../src/core/smufl/SmuflFontVerifier.js";

const fontFolder = fileURLToPath(new URL("../public/fonts/smufl/", import.meta.url));
const metadataFolder = fileURLToPath(new URL("../build/smufl/", import.meta.url));
const report = SmuflFontVerifier.verifyIndex(fontFolder, metadataFolder);
const unusable = report.fonts.filter((font) => {
    return font.status === SmuflFontStatus.Invalid;
});

console.log(SmuflFontVerifier.formatReport(report));

if (report.errors.length > 0 || unusable.length > 0) {
    throw new Error(`${report.errors.length + unusable.length} SMuFL font problem(s) in ${fontFolder}`);
}
