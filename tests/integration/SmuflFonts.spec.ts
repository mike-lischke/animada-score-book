/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    SmuflFonts, SmuflFontStatus, type ISmuflFontIndex, type ISmuflFontIndexEntry,
} from "../../src/core/smufl/SmuflFonts.js";
import { SmuflFontVerifier } from "../../src/core/smufl/SmuflFontVerifier.js";
import { SmuflGlyphs, SmuflGlyphFamily } from "../../src/core/smufl/SmuflGlyphs.js";

/** Relative to the project root, which is the working directory a test run starts from. */
const fontFolder = join("public", "fonts", "smufl");
const catalogue = SmuflFontVerifier.verifyIndex(fontFolder);

describe("SmuflGlyphs", () => {
    it("gives every glyph a family and a private use codepoint", () => {
        for (const glyph of SmuflGlyphs.all) {
            const definition = SmuflGlyphs.definition(glyph);
            expect(definition.family, glyph).toBeTypeOf("number");
            expect(definition.codepoint, glyph).toBeGreaterThanOrEqual(0xE000);
            expect(definition.codepoint, glyph).toBeLessThanOrEqual(0xF8FF);
        }
    });

    it("assigns every codepoint exactly once", () => {
        const codepoints = SmuflGlyphs.all.map((glyph) => {
            return SmuflGlyphs.definition(glyph).codepoint;
        });

        expect(new Set(codepoints).size).toBe(codepoints.length);
    });

    it("covers every family with at least one glyph", () => {
        for (const family of SmuflGlyphs.families) {
            expect(SmuflGlyphs.ofFamily(family).length, SmuflGlyphFamily[family]).toBeGreaterThan(0);
        }
    });

    it("lists only stemmed noteheads as stemmed", () => {
        const noteheadFamilies = [SmuflGlyphFamily.StandardNoteheads, SmuflGlyphFamily.PercussionNoteheads];

        for (const glyph of SmuflGlyphs.stemmedNoteheads) {
            expect(noteheadFamilies, glyph).toContain(SmuflGlyphs.definition(glyph).family);
            expect(glyph, glyph).not.toMatch(/Whole$/);
        }
    });

    it("names the engraving defaults the geometry reads", () => {
        const defaults = SmuflGlyphs.requiredEngravingDefaults;

        expect(defaults.length).toBeGreaterThan(0);
        expect(new Set(defaults).size).toBe(defaults.length);
    });
});

describe("SmuflFonts catalogue", () => {
    it("reads without problems", () => {
        expect(catalogue.errors).toEqual([]);
        expect(catalogue.fonts.length).toBeGreaterThan(0);
    });

    it("marks exactly one font as the default", () => {
        const raw: unknown = JSON.parse(readFileSync(join(fontFolder, "index.json"), "utf8"));
        const index = SmuflFonts.readIndex(raw).index;
        const defaults = index?.fonts.filter((entry) => {
            return entry.isDefault;
        }) ?? [];

        expect(defaults.map((entry) => {
            return entry.id;
        })).toEqual(["bravura"]);
    });

    it("ships no font that is unusable", () => {
        const unusable = catalogue.fonts.filter((font) => {
            return font.status === SmuflFontStatus.Invalid;
        });

        expect(unusable.map((font) => {
            return `${font.id}: ${font.errors.join("; ")}`;
        })).toEqual([]);
    });

    it("ships at least one font that serves every symbol family", () => {
        const complete = catalogue.fonts.filter((font) => {
            return font.families.every((family) => {
                return family.provided === family.total;
            });
        });

        expect(complete.length).toBeGreaterThan(0);
    });

    it("reports the gaps of a font instead of hiding them", () => {
        for (const font of catalogue.fonts) {
            expect(font.status === SmuflFontStatus.Limited, font.id).toBe(font.gaps.length > 0);
        }
    });
});

/**
 * @returns The catalogue the app ships.
 */
const readIndex = (): ISmuflFontIndex => {
    const raw: unknown = JSON.parse(readFileSync(join(fontFolder, "index.json"), "utf8"));
    const index = SmuflFonts.readIndex(raw).index;
    if (index === undefined) {
        throw new Error("the font catalogue could not be read");
    }

    return index;
};

/**
 * @param index The catalogue to look in.
 * @param id The id of the font to resolve.
 *
 * @returns The catalogue entry of the font.
 */
const fontEntry = (index: ISmuflFontIndex, id: string): ISmuflFontIndexEntry => {
    const entry = index.fonts.find((candidate) => {
        return candidate.id === id;
    });

    if (entry === undefined) {
        throw new Error(`the catalogue has no font "${id}"`);
    }

    return entry;
};

describe("SmuflFonts family stack", () => {
    it("names the default font on its own", () => {
        const index = readIndex();
        const entry = SmuflFonts.defaultEntry(index);

        expect(entry?.id).toBe("bravura");
        expect(entry === undefined ? "" : SmuflFonts.familyStack(index, entry)).toBe("\"Bravura\"");
    });

    it("appends the default font as the fallback of every other font", () => {
        const index = readIndex();

        expect(SmuflFonts.familyStack(index, fontEntry(index, "leipzig"))).toBe("\"Leipzig\", \"Bravura\"");
    });
});

describe("SmuflGlyphs time signature digits", () => {
    it("maps every digit to the glyph of its codepoint", () => {
        const digits = "0123456789";

        for (const digit of digits) {
            const glyph = SmuflGlyphs.timeSignatureDigit(digit);
            expect(glyph, digit).toBeDefined();
            expect(SmuflGlyphs.definition(glyph!).codepoint, digit).toBe(0xE080 + Number(digit));
        }
    });

    it("rejects anything that is not a single digit", () => {
        expect(SmuflGlyphs.timeSignatureDigit("")).toBeUndefined();
        expect(SmuflGlyphs.timeSignatureDigit("12")).toBeUndefined();
        expect(SmuflGlyphs.timeSignatureDigit("/")).toBeUndefined();
        expect(SmuflGlyphs.timeSignatureDigit("x")).toBeUndefined();
    });
});
