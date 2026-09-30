/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import { GlyphAnchor } from "../../../core/ScoreSymbols.js";
import { SmuflGlyphs, type SmuflGlyph } from "../../../core/smufl/SmuflGlyphs.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface ISmuflGlyphViewProperties extends ICommonUIProperties {
    /** The glyph to draw. */
    glyph: SmuflGlyph;

    /** The size of one staff space, in px. A SMuFL font puts four staff spaces into one em. */
    staffSpace: number;

    /** Width of the drawing box, in staff spaces. */
    width?: number;

    /** Height of the drawing box, in staff spaces. */
    height?: number;

    /** How the glyph sits in the box. Omitted means centred. */
    anchor?: GlyphAnchor;

    /**
     * The CSS family list to draw with. Omitted means the font the score uses, which is what every
     * symbol in the app draws with; a font picker passes its own list to preview a font.
     */
    fontFamily?: string;
}

/**
 * Draws one SMuFL glyph as a character of the score's music font.
 *
 * The character goes into an SVG `<text>` element, because that element takes the baseline as an
 * explicit coordinate. SMuFL centres a glyph on its baseline and puts its ink between its own pen
 * position and its advance width, so the box the glyph is drawn into places it: the baseline sits on
 * the box's centre line and the anchor states whether the ink is centred in the box or ends on its
 * right edge. The glyph itself stays a font character — nothing is converted to paths — and because
 * the box is sized in staff spaces, the browser's line layout never sees the font metrics either.
 *
 * The font comes from the `--music-font-family` CSS variable, so this component does not need to know
 * which font is active, and the family list keeps the catalogue's fallback for uncovered glyphs.
 */
export class SmuflGlyphView extends UIComponent<ISmuflGlyphViewProperties> {
    public static override defaultProps = {
        width: 2,
        height: 2,
        anchor: GlyphAnchor.Centre,
    };

    public override render(): ComponentChild {
        const { id, title, alt, style, className, glyph, staffSpace, width = 2, height = 2 } = this.props;
        const { fontFamily, anchor = GlyphAnchor.Centre } = this.props;

        const character = String.fromCodePoint(SmuflGlyphs.definition(glyph).codepoint);
        const mergedClassName = this.generateFinalClassName(["smufl-glyph-view", className]);
        const boxWidth = staffSpace * width;
        const boxHeight = staffSpace * height;
        const glyphStyle = fontFamily === undefined ? undefined : { fontFamily };

        // A glyph is placed by the anchor its symbol states: its ink is centred in the box, starts on the
        // box's left edge or ends on its right edge. The baseline always sits on the box's centre line,
        // which is where SMuFL draws a glyph from.
        const startsOnLeftEdge = anchor === GlyphAnchor.LeftEdge;
        const endsOnRightEdge = anchor === GlyphAnchor.RightEdge;
        const textAnchor = startsOnLeftEdge ? "start" : endsOnRightEdge ? "end" : "middle";
        const x = startsOnLeftEdge ? 0 : endsOnRightEdge ? boxWidth : boxWidth / 2;

        return (
            <svg
                id={id}
                title={title}
                className={mergedClassName}
                style={style}
                width={boxWidth}
                height={boxHeight}
                viewBox={`0 0 ${boxWidth} ${boxHeight}`}
                aria-label={alt}
                aria-hidden={alt === undefined}
            >
                <text
                    x={x}
                    y={boxHeight / 2}
                    fontSize={staffSpace * 4}
                    textAnchor={textAnchor}
                    style={glyphStyle}
                >
                    {character}
                </text>
            </svg>
        );
    }
}
