/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SmuflFontMetrics } from "../../src/core/smufl/SmuflFontMetrics.js";
import { SmuflGlyph, SmuflGlyphs } from "../../src/core/smufl/SmuflGlyphs.js";
import { SmuflFonts } from "../../src/core/smufl/SmuflFonts.js";

/** The folder the shipped fonts and their metrics live in. */
const fontFolder = join("public", "fonts", "smufl");

/** The engraving defaults a font's metadata states, with the keys the geometry reads. */
const metadata = {
    fontName: "Test",
    fontVersion: 1.482,
    engravingDefaults: {
        staffLineThickness: 0.13,
        stemThickness: 0.12,
        beamThickness: 0.5,
        beamSpacing: 0.25,
        legerLineThickness: 0.16,
        legerLineExtension: 0.4,
        thinBarlineThickness: 0.16,
        thickBarlineThickness: 0.5,
        barlineSeparation: 0.4,
        repeatBarlineDotSeparation: 0.16,
        bracketThickness: 0.5,
        tupletBracketThickness: 0.16,
        hairpinThickness: 0.16,
    },
    glyphBBoxes: {
        [SmuflGlyph.NoteheadBlack]: { bBoxNE: [1.18, 0.5], bBoxSW: [0, -0.5] },
        [SmuflGlyph.RestQuarter]: { bBoxNE: [1.08, 1.492], bBoxSW: [0.004, -1.5] },
    },
    glyphsWithAnchors: {
        [SmuflGlyph.NoteheadBlack]: { stemUpSE: [1.18, 0.168], stemDownNW: [0, -0.168] },
        // A font may state an anchor for a glyph it gives no box for, which still places its stem.
        [SmuflGlyph.NoteheadHalf]: { stemUpSE: [1.18, 0.168] },
        // A flag states where the stem ends in its ink instead of where a stem leaves a head.
        [SmuflGlyph.Flag8thUp]: { stemUpNW: [0, -0.04] },
    },
};

/**
 * @param path The file to read.
 *
 * @returns The parsed content of the file.
 */
const readJson = (path: string): unknown => {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
};

describe("SmuflFontMetrics", { concurrent: false }, () => {
    it("reduces a font's metadata to the metrics the score draws with", () => {
        const built = SmuflFontMetrics.build(metadata);

        expect(built.errors).toEqual([]);
        expect(built.metrics?.fontName).toBe("Test");
        expect(built.metrics?.engravingDefaults.staffLineThickness).toBe(0.13);
        expect(built.metrics?.glyphs[SmuflGlyph.NoteheadBlack]).toEqual({
            bBoxNE: [1.18, 0.5],
            bBoxSW: [0, -0.5],
            stemUpSE: [1.18, 0.168],
            stemDownNW: [0, -0.168],
        });

        // Only the glyphs the score draws are kept, so the metadata's other thousands are dropped.
        expect(Object.keys(built.metrics?.glyphs ?? {})).toEqual([
            SmuflGlyph.NoteheadHalf,
            SmuflGlyph.NoteheadBlack,
            SmuflGlyph.RestQuarter,
            SmuflGlyph.Flag8thUp,
        ]);

        // A flag carries no box of its own here, but the anchor that places its stem is kept.
        expect(built.metrics?.glyphs[SmuflGlyph.Flag8thUp]).toEqual({ stemUpNW: [0, -0.04] });
    });

    it("reads a version a font states as a number", () => {
        // Bravura, Gootville, Petaluma and Sebastian state theirs as a number, the others as text.
        expect(SmuflFontMetrics.build(metadata).metrics?.fontVersion).toBe("1.482");
        expect(SmuflFontMetrics.build({ ...metadata, fontVersion: "5.2.102" }).metrics?.fontVersion)
            .toBe("5.2.102");
    });

    it("reports what keeps a font's metadata from being measured", () => {
        const withoutThickness = {
            ...metadata,
            engravingDefaults: { ...metadata.engravingDefaults, stemThickness: "thin" },
        };

        expect(SmuflFontMetrics.build(withoutThickness).metrics).toBeUndefined();
        expect(SmuflFontMetrics.build(withoutThickness).errors)
            .toContain("engravingDefaults.stemThickness: expected a number");
        expect(SmuflFontMetrics.build({ fontName: "", fontVersion: 1 }).metrics).toBeUndefined();
    });

    it("rejects a metrics file whose shape does not match", () => {
        const result = SmuflFontMetrics.read({ version: 99, fontName: "Test", fontVersion: "1" });

        expect(result.metrics).toBeUndefined();
        expect(result.errors).toContain("version: expected 1");
    });

    it("keeps the rest of a metrics file when one glyph entry is broken", () => {
        const built = SmuflFontMetrics.build(metadata).metrics;
        const broken = { ...built, glyphs: { ...built?.glyphs, [SmuflGlyph.RestWhole]: {} } };

        const result = SmuflFontMetrics.read(broken);

        expect(result.errors).toContain(`glyphs.${SmuflGlyph.RestWhole}: expected a box or a stem anchor`);
        expect(result.metrics?.glyphs[SmuflGlyph.NoteheadBlack]).toBeDefined();
    });

    it("reads every metrics file that ships", () => {
        const files = readdirSync(fontFolder).filter((name) => {
            return name.endsWith("-metrics.json");
        });

        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const result = SmuflFontMetrics.read(readJson(join(fontFolder, file)));

            expect(result.errors, file).toEqual([]);
            expect(result.metrics, file).toBeDefined();
        }
    });

    it("describes every glyph the score draws in the catalogue's default font", () => {
        // The default font stands in for every glyph another font does not describe, so it has to
        // carry all of them.
        const index = SmuflFonts.readIndex(readJson(join(fontFolder, "index.json"))).index;
        const entry = index === undefined ? undefined : SmuflFonts.defaultEntry(index);
        const metrics = entry === undefined ? undefined : SmuflFontMetrics.read(
            readJson(join(fontFolder, entry.metrics)),
        ).metrics;

        expect(entry?.id).toBe("bravura");

        const described = SmuflGlyphs.all.filter((glyph) => {
            return metrics?.glyphs[glyph] !== undefined;
        });

        expect(described).toHaveLength(SmuflGlyphs.all.length);
    });
});
