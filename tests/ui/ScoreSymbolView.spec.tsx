/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { ScoreSymbolView } from "../../src/components/ui/framework/ScoreSymbolView.js";
import { ScoreSymbol } from "../../src/core/ScoreSymbols.js";

const staffSpace = 10;

const renderSymbol = (symbol: ScoreSymbol): RenderResult => {
    return render(<ScoreSymbolView symbol={symbol} staffSpace={staffSpace} />);
};

/**
 * @param result The render result to read from.
 *
 * @returns The drawing element of the rendered symbol.
 */
const svgOf = (result: RenderResult): SVGSVGElement => {
    const svg = result.container.querySelector("svg");
    if (svg === null) {
        throw new Error("the symbol view drew no svg");
    }

    return svg;
};

describe("ScoreSymbolView", () => {
    afterEach(() => {
        cleanup();
    });

    it("draws a glyph symbol with the music font", () => {
        const result = renderSymbol(ScoreSymbol.NoteheadBlack);
        const text = svgOf(result).querySelector("text");

        expect(text?.textContent).toBe(String.fromCodePoint(0xE0A4));
        expect(svgOf(result).classList.contains("smufl-glyph-view")).toBe(true);
    });

    it("ends a notehead on the right edge of its box, which is where its stem sits", () => {
        const result = renderSymbol(ScoreSymbol.NoteheadBlack);
        const text = svgOf(result).querySelector("text");

        // The box is two staff spaces wide, so the glyph's pen position is its right edge. That the
        // glyph is anchored there is asserted in the browser test, where jsdom is not in the way.
        expect(text?.getAttribute("x")).toBe("20");
    });

    it("centres a clef in its box", () => {
        const result = renderSymbol(ScoreSymbol.PercussionClef);
        const text = svgOf(result).querySelector("text");

        expect(text?.textContent).toBe(String.fromCodePoint(0xE069));
        expect(text?.getAttribute("x")).toBe("10");
    });

    it("hangs a flag on the left edge of its box, which is where its stem ends", () => {
        const result = renderSymbol(ScoreSymbol.FlagEighth);
        const text = svgOf(result).querySelector("text");

        // The glyph's pen sits at the box's left edge, which is the box's origin.
        expect(text?.getAttribute("x")).toBe("0");
        expect(text?.textContent).toBe(String.fromCodePoint(0xE240));
    });

    it("draws an own path in the ink box of its catalogue entry", () => {
        const result = renderSymbol(ScoreSymbol.NoteheadSquare);
        const svg = svgOf(result);
        const path = svg.querySelector("path");

        // The square head is 1.4 staff spaces wide and tall.
        expect(svg.getAttribute("width")).toBe("14");
        expect(svg.getAttribute("height")).toBe("14");
        expect(svg.getAttribute("viewBox")).toBe("0 0 1.4 1.4");
        expect(path?.getAttribute("d")).toBe("M0 0 H1.4 V1.4 H0 Z");
        expect(path?.getAttribute("fill")).toBe("currentColor");
        expect(path?.getAttribute("stroke")).toBeNull();
    });

    it("inks a stroked own path with the stroke of its entry", () => {
        const result = renderSymbol(ScoreSymbol.NoteheadCross);
        const path = svgOf(result).querySelector("path");

        expect(path?.getAttribute("fill")).toBe("none");
        expect(path?.getAttribute("stroke")).toBe("currentColor");
    });
});
