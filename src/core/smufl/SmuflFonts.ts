/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { isJsonObject } from "../utils.js";
import { SmuflGlyphFamily, type SmuflGlyph } from "./SmuflGlyphs.js";

/**
 * The SMuFL font catalogue: the shape of `public/fonts/smufl/index.json` and the result of checking
 * that catalogue against what the score needs.
 *
 * The index is hand-maintained and ships with the app, so it is read and validated at build time and
 * again at runtime. Everything here is environment-agnostic: no file system, no DOM.
 */

/** The file format a font is shipped in. */
export enum SmuflFontFormat {
    Woff2 = "woff2",
    OpenType = "opentype",
}

/** Which rights the font is published under. */
export interface ISmuflFontLicense {
    /** The license's SPDX identifier, e.g. `OFL-1.1`. */
    spdx: string;

    /** The license notice shipped next to the font, relative to the index. */
    file: string;
}

/** One selectable font, as `index.json` lists it. */
export interface ISmuflFontIndexEntry {
    id: string;
    name: string;

    /** The font file, relative to the folder that holds the index. */
    file: string;
    format: SmuflFontFormat;

    /** The SMuFL metadata JSON, relative to the folder that holds the index. */
    metadata: string;

    version: string;
    copyright?: string;
    license: ISmuflFontLicense;

    /** Where the font was taken from, for provenance. */
    source: string;

    /** Marks the font the score uses until the user picks another one. */
    isDefault?: boolean;
}

/** The catalogue, as `index.json` holds it. */
export interface ISmuflFontIndex {
    version: number;
    fonts: ISmuflFontIndexEntry[];
}

/** The catalogue after reading it, together with the problems that keep it from being used. */
export interface ISmuflFontIndexReadResult {
    index?: ISmuflFontIndex;
    errors: string[];
}

/** How usable a font is for the score. */
export enum SmuflFontStatus {
    /** The font provides everything the score needs. */
    Ok,

    /** The font loads, but lacks required glyphs or anchors. */
    Limited,

    /** The font cannot be used at all. */
    Invalid,
}

/** What a font lacks for a glyph. */
export enum SmuflFontGapKind {
    /** The character map does not map the glyph's codepoint. */
    Glyph,

    /** The glyph carries no stem anchor, so no stem can be attached to it. */
    StemAnchor,
}

/** A required glyph a font does not fully provide. */
export interface ISmuflFontGap {
    glyph: SmuflGlyph;
    family: SmuflGlyphFamily;
    kind: SmuflFontGapKind;
}

/** How many glyphs of one family a font provides. */
export interface ISmuflFontFamilyCoverage {
    family: SmuflGlyphFamily;
    provided: number;
    total: number;
}

/** The verification result of a single font. */
export interface ISmuflFontReport {
    id: string;
    name: string;
    status: SmuflFontStatus;

    /** Number of codepoints the font maps. */
    codepoints: number;

    /** Coverage per symbol family, which is the granularity a font is usable at. */
    families: ISmuflFontFamilyCoverage[];

    /** Required glyphs or anchors the font does not provide. */
    gaps: ISmuflFontGap[];

    /** Problems that make the font unusable. */
    errors: string[];
}

/** The verification result of a whole catalogue. */
export interface ISmuflFontIndexReport {
    /** Problems with the catalogue itself, before any font was looked at. */
    errors: string[];
    fonts: ISmuflFontReport[];
}

const readNonEmptyString = (value: unknown): string | undefined => {
    return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** The font catalogue of `public/fonts/smufl/index.json`, and what a usable font has to provide. */
export class SmuflFonts {
    /**
     * Reads a font catalogue from parsed JSON and reports everything that keeps it from being used.
     *
     * @param raw The parsed content of the index file.
     *
     * @returns The catalogue when it is well formed, plus every problem that was found.
     */
    public static readIndex(raw: unknown): ISmuflFontIndexReadResult {
        const errors: string[] = [];
        if (!isJsonObject(raw)) {
            return { errors: ["the font index is not a JSON object"] };
        }

        let version: number | undefined;
        if (typeof raw.version === "number") {
            version = raw.version;
        } else {
            errors.push("version: expected a number");
        }

        if (!Array.isArray(raw.fonts)) {
            return { errors: [...errors, "fonts: expected an array"] };
        }

        const ids = new Set<string>();
        const fonts = raw.fonts.map((rawFont, position) => {
            return SmuflFonts.readEntry(rawFont, `fonts[${position}]`, ids, errors);
        });

        if (errors.length > 0 || version === undefined) {
            return { errors };
        }

        return { index: { version, fonts }, errors: [] };
    }

    private static readEntry(value: unknown, path: string, ids: Set<string>,
        errors: string[]): ISmuflFontIndexEntry {
        if (!isJsonObject(value)) {
            errors.push(`${path}: expected an object`);

            return {
                id: "", name: "", file: "", format: SmuflFontFormat.Woff2, metadata: "", version: "",
                license: { spdx: "", file: "" }, source: "",
            };
        }

        const id = SmuflFonts.readRequiredString(value, "id", path, errors);
        if (ids.has(id)) {
            errors.push(`${path}.id: duplicated id "${id}"`);
        }

        ids.add(id);

        const format = SmuflFonts.readFormat(value.format);
        if (format === undefined) {
            errors.push(`${path}.format: expected "woff2" or "opentype"`);
        }

        return {
            id,
            name: SmuflFonts.readRequiredString(value, "name", path, errors),
            file: SmuflFonts.readRequiredString(value, "file", path, errors),
            format: format ?? SmuflFontFormat.Woff2,
            metadata: SmuflFonts.readRequiredString(value, "metadata", path, errors),
            version: SmuflFonts.readRequiredString(value, "version", path, errors),
            copyright: readNonEmptyString(value.copyright),
            license: SmuflFonts.readLicense(value.license, `${path}.license`, errors),
            source: SmuflFonts.readRequiredString(value, "source", path, errors),
            isDefault: value.isDefault === true,
        };
    }

    private static readLicense(value: unknown, path: string, errors: string[]): ISmuflFontLicense {
        if (!isJsonObject(value)) {
            errors.push(`${path}: expected an object`);

            return { spdx: "", file: "" };
        }

        return {
            spdx: SmuflFonts.readRequiredString(value, "spdx", path, errors),
            file: SmuflFonts.readRequiredString(value, "file", path, errors),
        };
    }

    private static readFormat(value: unknown): SmuflFontFormat | undefined {
        if (value === SmuflFontFormat.Woff2 || value === SmuflFontFormat.OpenType) {
            return value;
        }

        return undefined;
    }

    private static readRequiredString(source: Record<string, unknown>, key: string, path: string,
        errors: string[]): string {
        const value = readNonEmptyString(source[key]);
        if (value === undefined) {
            errors.push(`${path}.${key}: expected a non-empty string`);

            return "";
        }

        return value;
    }
}
