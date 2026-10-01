/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BarlineView } from "../../src/components/ui/framework/BarlineView.js";
import { ScoreSymbol } from "../../src/core/ScoreSymbols.js";
import { SmuflGlyph, SmuflGlyphs } from "../../src/core/smufl/SmuflGlyphs.js";

const staffSpace = 10;

/**
 * Renders one barline.
 *
 * @param symbol The barline to draw.
 *
 * @returns The render result.
 */
const renderBarline = (symbol: ScoreSymbol): RenderResult => {
    return render(<BarlineView symbol={symbol} staffSpace={staffSpace} />);
};

/**
 * @param result The render result to read from.
 *
 * @returns The parts the barline was drawn from, in drawing order.
 */
const partsOf = (result: RenderResult): string[] => {
    return [...result.container.querySelectorAll(".barline-view-part")].map((part) => {
        return [...part.classList].find((name) => {
            return name.startsWith("barline-view-") && name !== "barline-view-part";
        })!;
    });
};

describe("BarlineView", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("draws the strokes of a plain barline", () => {
        expect(partsOf(renderBarline(ScoreSymbol.BarlineSingle))).toEqual(["barline-view-thin"]);
        expect(partsOf(renderBarline(ScoreSymbol.BarlineFinal)))
            .toEqual(["barline-view-thin", "barline-view-thick"]);
    });

    it("hangs the repeat dots on the side the repeat reaches into", () => {
        // `:|` ends on the bar's edge and reaches into it with its dots, `|:` does the same mirrored, with its
        // thick stroke on the outside.
        expect(partsOf(renderBarline(ScoreSymbol.RepeatEnd)))
            .toEqual(["barline-view-dots", "barline-view-thin", "barline-view-thick"]);
        expect(partsOf(renderBarline(ScoreSymbol.RepeatStart)))
            .toEqual(["barline-view-thick", "barline-view-thin", "barline-view-dots"]);

        // A repeat that closes and opens at once has the dots on both sides of its strokes.
        expect(partsOf(renderBarline(ScoreSymbol.RepeatBoth))).toEqual([
            "barline-view-dots", "barline-view-thin", "barline-view-thick", "barline-view-thin", "barline-view-dots",
        ]);
    });

    it("draws the repeat dots with the font's own dots glyph", () => {
        const result = renderBarline(ScoreSymbol.RepeatEnd);
        const text = result.container.querySelector(".barline-view-dots text");

        expect(text?.textContent).toBe(String.fromCodePoint(0xE043));
        expect(text?.textContent).toBe(String.fromCodePoint(SmuflGlyphs.definition(SmuflGlyph.RepeatDots).codepoint));
    });

    it("draws the strokes itself, so a barline is not a font glyph", () => {
        const result = renderBarline(ScoreSymbol.BarlineSingle);

        expect(result.container.querySelector("svg")).toBeNull();
    });

    it("states how far apart the font draws the strokes of this barline", () => {
        // The separation is not the font's default for two strokes but what its own barline glyph states, which
        // the loader publishes per barline shape.
        const result = renderBarline(ScoreSymbol.RepeatEnd);
        const style = result.container.firstElementChild?.getAttribute("style") ?? "";

        expect(style).toContain("--barline-gap: var(--barline-repeat-separation)");
    });

    it("draws nothing for a symbol that is not a barline", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {
            // The warning is what the test asserts.
        });

        expect(renderBarline(ScoreSymbol.NoteheadBlack).container.querySelector("span")).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
    });
});
