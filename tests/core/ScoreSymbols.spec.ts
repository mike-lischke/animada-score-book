/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { NoteDisplayType } from "../../src/core/ScoreBookDataModel.js";
import { NoteLength } from "../../src/core/rest-notation.js";
import {
    BarlineEdge, BarlinePart, GlyphAnchor, OwnPathInk, ScoreSymbols, ScoreSymbol, ScoreSymbolSource,
} from "../../src/core/ScoreSymbols.js";
import { SmuflGlyph, SmuflGlyphs } from "../../src/core/smufl/SmuflGlyphs.js";

describe("ScoreSymbols", () => {
    it("states a source for every symbol", () => {
        for (const symbol of ScoreSymbols.all) {
            const definition = ScoreSymbols.definition(symbol);
            expect(definition, ScoreSymbol[symbol]).toBeDefined();
            expect(Object.values(ScoreSymbolSource), ScoreSymbol[symbol]).toContain(definition.source);
        }
    });

    it("draws glyph symbols with a glyph the font catalogue knows", () => {
        for (const symbol of ScoreSymbols.all) {
            const definition = ScoreSymbols.definition(symbol);
            if (definition.source !== ScoreSymbolSource.MusicFontGlyph) {
                continue;
            }

            const glyph = SmuflGlyphs.definition(definition.glyph);
            expect(glyph, ScoreSymbol[symbol]).toBeDefined();
            expect(SmuflGlyphs.all, ScoreSymbol[symbol]).toContain(definition.glyph);
        }
    });

    it("gives every own path a box, path data and an ink", () => {
        for (const symbol of ScoreSymbols.all) {
            const definition = ScoreSymbols.definition(symbol);
            if (definition.source !== ScoreSymbolSource.OwnPath) {
                continue;
            }

            const { path } = definition;
            expect(path.width, ScoreSymbol[symbol]).toBeGreaterThan(0);
            expect(path.height, ScoreSymbol[symbol]).toBeGreaterThan(0);
            expect(path.data, ScoreSymbol[symbol]).toMatch(/^M/);

            if (path.ink === OwnPathInk.Stroked) {
                expect(path.strokeWidth, ScoreSymbol[symbol]).toBeGreaterThan(0);
            } else {
                expect(path.strokeWidth, ScoreSymbol[symbol]).toBeUndefined();
            }
        }
    });

    it("draws the square and the cross head in a square box", () => {
        for (const symbol of [ScoreSymbol.NoteheadSquare, ScoreSymbol.NoteheadCross]) {
            const definition = ScoreSymbols.definition(symbol);
            expect(definition.source, ScoreSymbol[symbol]).toBe(ScoreSymbolSource.OwnPath);

            if (definition.source === ScoreSymbolSource.OwnPath) {
                expect(definition.path.width, ScoreSymbol[symbol]).toBe(definition.path.height);
            }
        }
    });

    it("maps a time signature digit to the symbol of its codepoint", () => {
        const digits = "0123456789";

        for (const digit of digits) {
            const symbol = ScoreSymbols.timeSignatureDigit(digit);
            expect(symbol, digit).toBeDefined();

            const definition = ScoreSymbols.definition(symbol!);
            expect(definition.source).toBe(ScoreSymbolSource.MusicFontGlyph);
            if (definition.source === ScoreSymbolSource.MusicFontGlyph) {
                expect(SmuflGlyphs.definition(definition.glyph).codepoint, digit).toBe(0xE080 + Number(digit));
            }
        }
    });

    it("rejects anything that is not a single digit as a time signature", () => {
        expect(ScoreSymbols.timeSignatureDigit("")).toBeUndefined();
        expect(ScoreSymbols.timeSignatureDigit("12")).toBeUndefined();
        expect(ScoreSymbols.timeSignatureDigit("/")).toBeUndefined();
        expect(ScoreSymbols.timeSignatureDigit("x")).toBeUndefined();
    });

    it("draws the standard note values with the font and the percussion heads itself", () => {
        expect(ScoreSymbols.notehead(NoteDisplayType.Oval, NoteLength.Whole)).toBe(ScoreSymbol.NoteheadWhole);
        expect(ScoreSymbols.notehead(NoteDisplayType.Oval, NoteLength.Half)).toBe(ScoreSymbol.NoteheadHalf);
        expect(ScoreSymbols.notehead(NoteDisplayType.Oval, NoteLength.Quarter)).toBe(ScoreSymbol.NoteheadBlack);
        expect(ScoreSymbols.notehead(NoteDisplayType.Oval, NoteLength.ThirtySecond)).toBe(ScoreSymbol.NoteheadBlack);

        expect(ScoreSymbols.notehead(NoteDisplayType.Square, NoteLength.Quarter)).toBe(ScoreSymbol.NoteheadSquare);
        expect(ScoreSymbols.notehead(NoteDisplayType.Triangle, NoteLength.Quarter)).toBe(ScoreSymbol.NoteheadTriangle);
        expect(ScoreSymbols.notehead(NoteDisplayType.Cross, NoteLength.Quarter)).toBe(ScoreSymbol.NoteheadCross);
        expect(ScoreSymbols.notehead(NoteDisplayType.Diamond, NoteLength.Quarter)).toBe(ScoreSymbol.NoteheadDiamond);
    });

    it("names the rest of every standard value", () => {
        expect(ScoreSymbols.rest(NoteLength.Whole)).toBe(ScoreSymbol.RestWhole);
        expect(ScoreSymbols.rest(NoteLength.Half)).toBe(ScoreSymbol.RestHalf);
        expect(ScoreSymbols.rest(NoteLength.Quarter)).toBe(ScoreSymbol.RestQuarter);
        expect(ScoreSymbols.rest(NoteLength.Eighth)).toBe(ScoreSymbol.RestEighth);
        expect(ScoreSymbols.rest(NoteLength.Sixteenth)).toBe(ScoreSymbol.RestSixteenth);
        expect(ScoreSymbols.rest(NoteLength.ThirtySecond)).toBe(ScoreSymbol.RestThirtySecond);
    });

    it("names a flag only for a value that carries one", () => {
        expect(ScoreSymbols.flag(NoteLength.Whole)).toBeUndefined();
        expect(ScoreSymbols.flag(NoteLength.Quarter)).toBeUndefined();
        expect(ScoreSymbols.flag(NoteLength.Eighth)).toBe(ScoreSymbol.FlagEighth);
        expect(ScoreSymbols.flag(NoteLength.Sixteenth)).toBe(ScoreSymbol.FlagSixteenth);
        expect(ScoreSymbols.flag(NoteLength.ThirtySecond)).toBe(ScoreSymbol.FlagThirtySecond);
    });

    it("states the ink box of a symbol as the length a drawing sizes its box with", () => {
        // A glyph's box is what the selected font states for it.
        expect(ScoreSymbols.inkBox(ScoreSymbol.NoteheadBlack)).toEqual({
            width: "var(--glyph-ink-width-noteheadblack)",
            height: "var(--glyph-ink-height-noteheadblack)",
        });

        // A path states its own box, in staff spaces, so it scales with the font.
        expect(ScoreSymbols.inkBox(ScoreSymbol.NoteheadSquare)).toEqual({
            width: "calc(var(--staff-space) * 1.4)",
            height: "calc(var(--staff-space) * 1.4)",
        });
    });

    it("hangs flags and the marks beside a note on the left edge of their box", () => {
        const leftAnchored = [
            ScoreSymbol.FlagEighth,
            ScoreSymbol.FlagSixteenth,
            ScoreSymbol.FlagThirtySecond,
            ScoreSymbol.AugmentationDot,
            ScoreSymbol.Accent,
        ];

        for (const symbol of leftAnchored) {
            const definition = ScoreSymbols.definition(symbol);
            expect(definition.source, ScoreSymbol[symbol]).toBe(ScoreSymbolSource.MusicFontGlyph);
            if (definition.source === ScoreSymbolSource.MusicFontGlyph) {
                expect(definition.anchor, ScoreSymbol[symbol]).toBe(GlyphAnchor.LeftEdge);
            }
        }

        // The parentheses end on the right edge of their box, so a drawing places their ink itself.
        for (const symbol of [ScoreSymbol.GhostParenthesisLeft, ScoreSymbol.GhostParenthesisRight]) {
            const definition = ScoreSymbols.definition(symbol);
            if (definition.source === ScoreSymbolSource.MusicFontGlyph) {
                expect(definition.anchor, ScoreSymbol[symbol]).toBe(GlyphAnchor.RightEdge);
            }
        }
    });

    it("assembles every barline from strokes the score draws and the font's repeat dots", () => {
        const barlines = [
            ScoreSymbol.BarlineSingle, ScoreSymbol.BarlineFinal, ScoreSymbol.RepeatStart, ScoreSymbol.RepeatEnd,
            ScoreSymbol.RepeatBoth,
        ];

        for (const symbol of barlines) {
            const definition = ScoreSymbols.definition(symbol);
            expect(definition.source, ScoreSymbol[symbol]).toBe(ScoreSymbolSource.Barline);
            if (definition.source !== ScoreSymbolSource.Barline) {
                continue;
            }

            expect(definition.parts.length, ScoreSymbol[symbol]).toBeGreaterThan(0);
            expect(definition.key, ScoreSymbol[symbol]).toMatch(/^[a-z][a-z-]*$/);

            // The dots are the one part that stays a glyph: a stroke is drawn in the thickness the font states,
            // which rounds to a whole pixel, while a dot has no edge to round either way.
            const carriesDots = definition.parts.includes(BarlinePart.RepeatDots);
            expect(definition.dotsGlyph, ScoreSymbol[symbol]).toBe(
                carriesDots ? SmuflGlyph.RepeatDots : undefined);
        }

        // The dots of a repeat are a glyph of the font catalogue, so a font publishes their metrics.
        expect(ScoreSymbols.drawnGlyphs).toContain(SmuflGlyph.RepeatDots);
    });

    it("states the edge of the bar a barline stands on", () => {
        expect(ScoreSymbols.barlineEdge(ScoreSymbol.BarlineSingle)).toBe(BarlineEdge.End);
        expect(ScoreSymbols.barlineEdge(ScoreSymbol.BarlineFinal)).toBe(BarlineEdge.End);
        expect(ScoreSymbols.barlineEdge(ScoreSymbol.RepeatStart)).toBe(BarlineEdge.Start);
        expect(ScoreSymbols.barlineEdge(ScoreSymbol.RepeatEnd)).toBe(BarlineEdge.End);

        // A repeat that closes a section and opens the next one straddles the edge with its ink centred on it.
        expect(ScoreSymbols.barlineEdge(ScoreSymbol.RepeatBoth)).toBe(BarlineEdge.Centred);

        // A symbol that is not drawn as a barline ends on the edge of the box it is placed in.
        expect(ScoreSymbols.barlineEdge(ScoreSymbol.NoteheadBlack)).toBe(BarlineEdge.End);
    });

    it("states the ink box of a drawn barline as the size the stylesheet draws it in", () => {
        expect(ScoreSymbols.inkBox(ScoreSymbol.RepeatEnd)).toEqual({
            width: "var(--barline-repeat-width)",
            height: "var(--barline-height)",
        });
    });
});
