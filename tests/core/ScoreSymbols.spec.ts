/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { NoteDisplayType } from "../../src/core/ScoreBookDataModel.js";
import { NoteLength } from "../../src/core/rest-notation.js";
import { OwnPathInk, ScoreSymbols, ScoreSymbol, ScoreSymbolSource } from "../../src/core/ScoreSymbols.js";
import { SmuflGlyphs } from "../../src/core/smufl/SmuflGlyphs.js";

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
});
