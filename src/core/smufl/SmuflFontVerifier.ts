/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Checks the SMuFL font catalogue in `public/fonts/smufl/`.
 *
 * A font is usable only when its index entry is complete, the files it names exist, its character map
 * carries every glyph the score draws, and its metadata defines the engraving defaults the geometry
 * reads. The glyph check reads the font's own character map, so it proves presence instead of trusting
 * the sidecar metadata.
 *
 * Node only, because it reads the catalogue from disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isJsonObject } from "../utils.js";
import { SmuflFontFile } from "./SmuflFontFile.js";
import {
    SmuflFontFormat, SmuflFontGapKind, SmuflFonts, SmuflFontStatus,
    type ISmuflFontGap, type ISmuflFontIndexEntry, type ISmuflFontIndexReport, type ISmuflFontReport,
} from "./SmuflFonts.js";
import { SmuflGlyphs, SmuflGlyphFamily, type SmuflGlyph } from "./SmuflGlyphs.js";

/** Which glyph of the catalogue a font provides, so coverage and gaps derive from one pass. */
interface IGlyphCoverage {
    glyph: SmuflGlyph;
    family: SmuflGlyphFamily;
    mapped: boolean;
}

/** The file extensions each format may use. */
const formatExtensions: Readonly<Record<SmuflFontFormat, readonly string[]>> = {
    [SmuflFontFormat.Woff2]: [".woff2"],
    [SmuflFontFormat.OpenType]: [".otf", ".ttf"],
};

const statusLabels: Readonly<Record<SmuflFontStatus, string>> = {
    [SmuflFontStatus.Ok]: "ok",
    [SmuflFontStatus.Limited]: "limited",
    [SmuflFontStatus.Invalid]: "invalid",
};

const gapLabels: Readonly<Record<SmuflFontGapKind, string>> = {
    [SmuflFontGapKind.Glyph]: "no glyph",
    [SmuflFontGapKind.StemAnchor]: "no stem anchor",
};

/** Checks the SMuFL fonts a folder holds against the catalogue those fonts belong to. */
export class SmuflFontVerifier {
    /**
     * Verifies every font of a catalogue.
     *
     * @param fontFolder The folder that holds the index and the font files.
     *
     * @returns The result for the whole catalogue. When the index itself cannot be read, `fonts` is
     * empty and `errors` says why.
     */
    public static verifyIndex(fontFolder: string): ISmuflFontIndexReport {
        const indexPath = join(fontFolder, "index.json");
        if (!existsSync(indexPath)) {
            return { errors: [`index.json is missing in ${fontFolder}`], fonts: [] };
        }

        let raw: unknown;
        try {
            raw = JSON.parse(readFileSync(indexPath, "utf8"));
        } catch (error) {
            return { errors: [`index.json: ${(error as Error).message}`], fonts: [] };
        }

        const result = SmuflFonts.readIndex(raw);
        if (result.index === undefined) {
            return { errors: result.errors, fonts: [] };
        }

        return {
            errors: result.errors,
            fonts: result.index.fonts.map((entry) => {
                return SmuflFontVerifier.verify(fontFolder, entry);
            }),
        };
    }

    /**
     * Verifies one font of a catalogue.
     *
     * @param fontFolder The folder that holds the index and the font files.
     * @param entry The index entry to check.
     *
     * @returns The font's verification result.
     */
    public static verify(fontFolder: string, entry: ISmuflFontIndexEntry): ISmuflFontReport {
        const errors: string[] = [];
        const gaps: ISmuflFontGap[] = [];

        if (!formatExtensions[entry.format].some((extension) => {
            return entry.file.endsWith(extension);
        })) {
            errors.push(`file: "${entry.file}" does not match the declared format "${entry.format}"`);
        }

        if (!existsSync(join(fontFolder, entry.license.file))) {
            errors.push(`license.file: "${entry.license.file}" is missing`);
        }

        const font = SmuflFontVerifier.readFont(fontFolder, entry, errors);
        const missingAnchors = SmuflFontVerifier.readMetadata(fontFolder, entry, errors);

        const coverage = SmuflGlyphs.all.map((glyph): IGlyphCoverage => {
            const { codepoint, family } = SmuflGlyphs.definition(glyph);

            return { glyph, family, mapped: font?.contains(codepoint) ?? false };
        });

        for (const item of coverage) {
            if (!item.mapped) {
                gaps.push({ glyph: item.glyph, family: item.family, kind: SmuflFontGapKind.Glyph });
            }
        }

        for (const glyph of missingAnchors) {
            gaps.push({ glyph, family: SmuflGlyphs.definition(glyph).family, kind: SmuflFontGapKind.StemAnchor });
        }

        const families = SmuflGlyphs.families.map((family) => {
            const ofFamily = coverage.filter((item) => {
                return item.family === family;
            });

            return {
                family,
                provided: ofFamily.filter((item) => {
                    return item.mapped;
                }).length,
                total: ofFamily.length,
            };
        });

        let status = SmuflFontStatus.Ok;
        if (errors.length > 0) {
            status = SmuflFontStatus.Invalid;
        } else if (gaps.length > 0) {
            status = SmuflFontStatus.Limited;
        }

        return {
            id: entry.id,
            name: entry.name,
            status,
            codepoints: font?.codepointCount ?? 0,
            families,
            gaps,
            errors,
        };
    }

    /**
     * Formats a catalogue result for the console.
     *
     * @param report The catalogue verification result.
     *
     * @returns One line per font, with its incomplete families, gaps and errors below it.
     */
    public static formatReport(report: ISmuflFontIndexReport): string {
        const lines = report.errors.map((error) => {
            return `index error: ${error}`;
        });

        for (const font of report.fonts) {
            const complete = font.families.filter((family) => {
                return family.provided === family.total;
            }).length;

            lines.push(`${font.id} (${font.name}): ${statusLabels[font.status]}, ${font.codepoints} codepoints, `
                + `${complete}/${font.families.length} families complete`);

            for (const family of font.families) {
                if (family.provided < family.total) {
                    lines.push(`  ${SmuflGlyphFamily[family.family]}: ${family.provided}/${family.total} glyphs`);
                }
            }

            for (const gap of font.gaps) {
                lines.push(`  gap: ${gap.glyph} - ${gapLabels[gap.kind]}`);
            }

            for (const error of font.errors) {
                lines.push(`  error: ${error}`);
            }
        }

        return lines.join("\n");
    }

    private static readFont(fontFolder: string, entry: ISmuflFontIndexEntry,
        errors: string[]): SmuflFontFile | undefined {
        const path = join(fontFolder, entry.file);
        if (!existsSync(path)) {
            errors.push(`file: "${entry.file}" is missing`);

            return undefined;
        }

        try {
            const font = SmuflFontFile.read(path);
            if (font.format !== entry.format) {
                errors.push(`file: "${entry.file}" is a ${font.format} font, not ${entry.format}`);
            }

            return font;
        } catch (error) {
            errors.push(`file: ${(error as Error).message}`);

            return undefined;
        }
    }

    private static readMetadata(fontFolder: string, entry: ISmuflFontIndexEntry,
        errors: string[]): SmuflGlyph[] {
        const path = join(fontFolder, entry.metadata);
        if (!existsSync(path)) {
            errors.push(`metadata: "${entry.metadata}" is missing`);

            return [];
        }

        try {
            const metadata: unknown = JSON.parse(readFileSync(path, "utf8"));
            if (!isJsonObject(metadata)) {
                errors.push("metadata: expected a JSON object");

                return [];
            }

            return SmuflFontVerifier.checkMetadata(metadata, errors);
        } catch (error) {
            errors.push(`metadata: ${(error as Error).message}`);

            return [];
        }
    }

    /**
     * Checks a font's metadata against what the score's geometry needs.
     *
     * @param metadata The parsed metadata file.
     * @param errors Collects the problems that were found.
     *
     * @returns The stemmed noteheads the metadata gives no stem anchor.
     */
    private static checkMetadata(metadata: Record<string, unknown>, errors: string[]): SmuflGlyph[] {
        if (typeof metadata.fontName !== "string") {
            errors.push("metadata.fontName: expected a string");
        }

        const version = metadata.fontVersion;
        if (typeof version !== "string" && typeof version !== "number") {
            errors.push("metadata.fontVersion: expected a string or a number");
        }

        const defaults = metadata.engravingDefaults;
        if (!isJsonObject(defaults)) {
            errors.push("metadata.engravingDefaults: expected an object");
        } else {
            for (const key of SmuflGlyphs.requiredEngravingDefaults) {
                if (typeof defaults[key] !== "number") {
                    errors.push(`metadata.engravingDefaults.${key}: expected a number`);
                }
            }
        }

        const anchors = metadata.glyphsWithAnchors;
        if (!isJsonObject(anchors)) {
            return [...SmuflGlyphs.stemmedNoteheads];
        }

        return SmuflGlyphs.stemmedNoteheads.filter((glyph) => {
            const glyphAnchors = anchors[glyph];

            return !isJsonObject(glyphAnchors) || !("stemUpSE" in glyphAnchors) || !("stemDownNW" in glyphAnchors);
        });
    }
}
