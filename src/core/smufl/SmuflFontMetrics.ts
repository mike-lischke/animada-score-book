/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * The engraving metrics of one SMuFL font, reduced to what the app reads.
 *
 * A font's own metadata file is 120 KB to 1.2 MB, most of it glyphs no score draws. `build/generate-smufl-metrics`
 * reduces it to this module's shape, and the loader reads the result, so the app can take its geometry from the
 * selected font without shipping the metadata.
 *
 * Every measure is in staff spaces, as SMuFL defines them; four of them make one em.
 */

import { SmuflGlyphs } from "./SmuflGlyphs.js";

/** A point in staff spaces, relative to the glyph's origin on its baseline. */
export type ISmuflPoint = [number, number];

/** What a font states about one glyph, in staff spaces. */
export interface ISmuflGlyphMetrics {
    /** Top right corner of the glyph's ink. Missing when the font states no box for the glyph. */
    bBoxNE?: ISmuflPoint;

    /** Bottom left corner of the glyph's ink. Missing when the font states no box for the glyph. */
    bBoxSW?: ISmuflPoint;

    /** Where an up-stem leaves the glyph's ink. Missing for a glyph that carries no stem. */
    stemUpSE?: ISmuflPoint;

    /** Where an up-stem ends in a flag's ink. Missing for a glyph that attaches no stem. */
    stemUpNW?: ISmuflPoint;

    /** Where a down-stem leaves the glyph's ink. Missing for a glyph that carries no stem. */
    stemDownNW?: ISmuflPoint;
}

/**
 * The engraving defaults the score's geometry is drawn from. Their values differ per font, which is
 * the point of reading them from the font instead of hard-coding pixels.
 */
export interface ISmuflEngravingDefaults {
    staffLineThickness: number;
    stemThickness: number;
    beamThickness: number;
    beamSpacing: number;
    legerLineThickness: number;
    legerLineExtension: number;
    thinBarlineThickness: number;
    thickBarlineThickness: number;
    barlineSeparation: number;
    bracketThickness: number;
    tupletBracketThickness: number;
}

/** The reduced metrics of one font, as `build/generate-smufl-metrics` writes them. */
export interface ISmuflFontMetrics {
    /** The file's own version, so a change to the shape can be recognised. */
    version: number;

    /** The font's name, as its metadata states it. */
    fontName: string;

    /** The font's version, as its metadata states it. */
    fontVersion: string;

    engravingDefaults: ISmuflEngravingDefaults;

    /**
     * What the font states about the glyphs the score draws, by SMuFL glyph name. A glyph the font's
     * metadata does not describe is absent, and the loader falls back to the default font for it.
     */
    glyphs: Record<string, ISmuflGlyphMetrics>;
}

/** A metrics file that was built or read, plus every problem that was found. */
export interface ISmuflFontMetricsResult {
    /** The metrics, or undefined when the file cannot be used at all. */
    metrics?: ISmuflFontMetrics;

    errors: string[];
}

/** The shape of the metrics file this module reads and writes. */
const metricsVersion = 1;

const readNumber = (value: unknown): number | undefined => {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const readString = (value: unknown): string | undefined => {
    return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * Reads a version, which fonts state either as a number (1.482) or as a string ("5.2.102").
 *
 * @param value The value as the metadata holds it.
 *
 * @returns The version as a string.
 */
const readVersion = (value: unknown): string | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }

    return readString(value);
};

const readObject = (value: unknown): Record<string, unknown> | undefined => {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
};

const readPoint = (value: unknown): ISmuflPoint | undefined => {
    if (!Array.isArray(value) || value.length !== 2) {
        return undefined;
    }

    const x = readNumber(value[0]);
    const y = readNumber(value[1]);

    return x === undefined || y === undefined ? undefined : [x, y];
};

const readGlyphMetrics = (value: unknown): ISmuflGlyphMetrics | undefined => {
    const source = readObject(value);
    if (source === undefined) {
        return undefined;
    }

    const bBoxNE = readPoint(source.bBoxNE);
    const bBoxSW = readPoint(source.bBoxSW);
    const stemUpSE = readPoint(source.stemUpSE);
    const stemUpNW = readPoint(source.stemUpNW);
    const stemDownNW = readPoint(source.stemDownNW);

    // A box is either stated whole or not at all. Without one the anchors still say where a stem
    // attaches, so a glyph the font describes that much is kept.
    if ((bBoxNE === undefined || bBoxSW === undefined)
        && stemUpSE === undefined && stemUpNW === undefined && stemDownNW === undefined) {
        return undefined;
    }

    return {
        ...(bBoxNE === undefined || bBoxSW === undefined ? {} : { bBoxNE, bBoxSW }),
        ...(stemUpSE === undefined ? {} : { stemUpSE }),
        ...(stemUpNW === undefined ? {} : { stemUpNW }),
        ...(stemDownNW === undefined ? {} : { stemDownNW }),
    };
};

/** The engraving metrics of the SMuFL fonts the score can be drawn with. */
export class SmuflFontMetrics {
    /**
     * Reduces a font's SMuFL metadata to the metrics the app reads.
     *
     * @param metadata The parsed content of a font's metadata file.
     *
     * @returns The reduced metrics, plus what was missing to build them.
     */
    public static build(metadata: unknown): ISmuflFontMetricsResult {
        const errors: string[] = [];
        const source = readObject(metadata);
        if (source === undefined) {
            return { errors: ["the font metadata is not a JSON object"] };
        }

        const fontName = readString(source.fontName);
        const fontVersion = readVersion(source.fontVersion);
        if (fontName === undefined || fontVersion === undefined) {
            errors.push("fontName and fontVersion: expected non-empty strings");
        }

        const engravingDefaults = SmuflFontMetrics.readEngravingDefaults(source.engravingDefaults, errors);
        if (errors.length > 0 || fontName === undefined || fontVersion === undefined) {
            return { errors };
        }

        const boxes = readObject(source.glyphBBoxes);
        const anchors = readObject(source.glyphsWithAnchors);
        const glyphs: Record<string, ISmuflGlyphMetrics> = {};

        for (const glyph of SmuflGlyphs.all) {
            const box = readObject(boxes?.[glyph]);
            const glyphAnchors = readObject(anchors?.[glyph]);
            const metrics = readGlyphMetrics({
                bBoxNE: box?.bBoxNE,
                bBoxSW: box?.bBoxSW,
                stemUpSE: glyphAnchors?.stemUpSE,
                stemUpNW: glyphAnchors?.stemUpNW,
                stemDownNW: glyphAnchors?.stemDownNW,
            });

            // A glyph the font does not describe at all is measured with the default font's metrics.
            if (metrics !== undefined) {
                glyphs[glyph] = metrics;
            }
        }

        return {
            metrics: { version: metricsVersion, fontName, fontVersion, engravingDefaults, glyphs },
            errors: [],
        };
    }

    /**
     * Reads a reduced metrics file, as the loader or a test receives it.
     *
     * @param raw The parsed content of a metrics file.
     *
     * @returns The metrics when the file is well formed, plus every problem that was found.
     */
    public static read(raw: unknown): ISmuflFontMetricsResult {
        const errors: string[] = [];
        const source = readObject(raw);
        if (source === undefined) {
            return { errors: ["the metrics file is not a JSON object"] };
        }

        if (source.version !== metricsVersion) {
            errors.push(`version: expected ${metricsVersion}`);
        }

        const fontName = readString(source.fontName);
        const fontVersion = readString(source.fontVersion);
        if (fontName === undefined || fontVersion === undefined) {
            errors.push("fontName and fontVersion: expected non-empty strings");
        }

        const engravingDefaults = SmuflFontMetrics.readEngravingDefaults(source.engravingDefaults, errors);
        const unusable = errors.length > 0 || fontName === undefined || fontVersion === undefined;

        // A glyph the file describes wrongly is reported, but the rest of the metrics stays usable.
        const rawGlyphs = readObject(source.glyphs) ?? {};
        const glyphs: Record<string, ISmuflGlyphMetrics> = {};
        for (const [name, value] of Object.entries(rawGlyphs)) {
            const metrics = readGlyphMetrics(value);
            if (metrics === undefined) {
                errors.push(`glyphs.${name}: expected a box or a stem anchor`);

                continue;
            }

            glyphs[name] = metrics;
        }

        if (unusable) {
            return { errors };
        }

        return {
            metrics: { version: metricsVersion, fontName, fontVersion, engravingDefaults, glyphs },
            errors,
        };
    }

    private static readEngravingDefaults(raw: unknown, errors: string[]): ISmuflEngravingDefaults {
        const source = readObject(raw);
        const defaults: Record<string, number> = {};

        for (const key of SmuflGlyphs.requiredEngravingDefaults) {
            const value = readNumber(source?.[key]);
            if (value === undefined) {
                errors.push(`engravingDefaults.${key}: expected a number`);

                continue;
            }

            defaults[key] = value;
        }

        return defaults as unknown as ISmuflEngravingDefaults;
    }
}
