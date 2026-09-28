/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { SmuflGlyphView } from "../../src/components/ui/framework/SmuflGlyphView.js";
import { SmuflGlyph } from "../../src/core/smufl/SmuflGlyphs.js";

const staffSpace = 10;

/**
 * Renders one glyph.
 *
 * @param glyph The glyph to render.
 * @param width The width of the drawing box, in staff spaces.
 * @param height The height of the drawing box, in staff spaces.
 *
 * @returns The render result.
 */
const renderGlyph = (glyph: SmuflGlyph, width?: number, height?: number): RenderResult => {
    return render(<SmuflGlyphView glyph={glyph} staffSpace={staffSpace} width={width} height={height} />);
};

/**
 * @param result The render result to read from.
 *
 * @returns The drawing element of the rendered glyph.
 */
const svgOf = (result: RenderResult): SVGSVGElement => {
    const svg = result.container.querySelector("svg");
    if (svg === null) {
        throw new Error("the glyph view drew no svg");
    }

    return svg;
};

/**
 * @param result The render result to read from.
 *
 * @returns The text element that carries the glyph character.
 */
const textOf = (result: RenderResult): SVGTextElement => {
    const text = svgOf(result).querySelector("text");
    if (text === null) {
        throw new Error("the glyph view drew no text");
    }

    return text;
};

describe("SmuflGlyphView", () => {
    afterEach(() => {
        cleanup();
    });

    it("draws the codepoint of the glyph", () => {
        const result = renderGlyph(SmuflGlyph.TimeSigCommon);

        expect(textOf(result).textContent).toBe(String.fromCodePoint(0xE08A));
    });

    it("sizes the drawing box in staff spaces", () => {
        const result = renderGlyph(SmuflGlyph.NoteheadBlack, 2, 1);
        const svg = svgOf(result);

        expect(svg.getAttribute("width")).toBe("20");
        expect(svg.getAttribute("height")).toBe("10");
        expect(svg.getAttribute("viewBox")).toBe("0 0 20 10");
    });

    it("puts the baseline in the middle of the box, so the glyph is centred on it", () => {
        const result = renderGlyph(SmuflGlyph.NoteheadBlack, 2, 1);
        const text = textOf(result);

        expect(text.getAttribute("x")).toBe("10");
        expect(text.getAttribute("y")).toBe("5");
    });

    it("keeps the glyph character away from assistive technology", () => {
        expect(svgOf(renderGlyph(SmuflGlyph.TimeSigCommon)).getAttribute("aria-hidden")).toBe("true");
    });
});
