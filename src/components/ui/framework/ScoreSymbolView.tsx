/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type CSSProperties } from "preact";

import {
    BarlinePart, glyphInkSpacesVariablePrefix, GlyphAnchor, OwnPathInk, ScoreSymbols, ScoreSymbolSource,
    type IBarlineSource, type IOwnPathDefinition, type IScoreSymbolDefinition, type ScoreSymbol,
} from "../../../core/ScoreSymbols.js";
import { SmuflGlyph, SmuflGlyphs } from "../../../core/smufl/SmuflGlyphs.js";
import { BarlineView } from "./BarlineView.js";
import { SmuflGlyphView } from "./SmuflGlyphView.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

/** The box a symbol is drawn in when it is the icon of a toolbar button. */
export const scoreIconSize = 24;

export interface IScoreSymbolViewProperties extends ICommonUIProperties {
    /** The symbol to draw. */
    symbol: ScoreSymbol;

    /** The size of one staff space, in px. A SMuFL font puts four staff spaces into one em. */
    staffSpace: number;

    /**
     * Whether the view is the symbol's ink box, so a caller places the ink and not the box the font draws
     * in. Omitted means the view is the font's own box, which a caller places by its centre or an edge.
     */
    inkBox?: boolean;

    /**
     * Whether the view draws the symbol as an icon: one svg of {@link scoreIconSize} px holding the symbol's
     * ink — not the box the font draws it in — centred and scaled to fill it. A caller places that svg alone,
     * with no box around it.
     */
    icon?: boolean;
}

/**
 * Draws one notation symbol of the score's symbol catalogue.
 *
 * A symbol is either a glyph of the selected music font or a path of the score's own; this component
 * is what makes the difference invisible to its callers. A glyph is drawn with its ink centred on the
 * box's centre line and, where the symbol asks for it, ending on the box's right edge, which is where
 * a stem attaches; an own path fills its own ink box. Either way the box is sized in staff spaces, so
 * the symbol scales with the font the score is drawn with, and the caller places the box.
 *
 * With `inkBox` the component is the ink box of its symbol instead: the box the font draws in is wider
 * than the ink, so the caller sizes the ink box and the glyph hangs on the edge its anchor states.
 */
export class ScoreSymbolView extends UIComponent<IScoreSymbolViewProperties> {
    public override render(): ComponentChild {
        const { staffSpace, symbol, inkBox = false, icon = false } = this.props;

        const definition = ScoreSymbols.definition(symbol);
        const mergedClassName = this.generateFinalClassName(["score-symbol-view"]);

        if (icon) {
            return this.renderIcon(definition, staffSpace);
        }

        if (definition.source === ScoreSymbolSource.Barline) {
            return <BarlineView symbol={symbol} staffSpace={staffSpace} />;
        }

        if (definition.source === ScoreSymbolSource.OwnPath) {
            return this.renderOwnPath(definition.path, mergedClassName);
        }

        const glyph = (
            <SmuflGlyphView
                className={inkBox ? "score-symbol-view" : mergedClassName}
                glyph={definition.glyph}
                staffSpace={staffSpace}
                anchor={definition.anchor}
                width={definition.box?.width}
                height={definition.box?.height}
            />
        );

        if (!inkBox) {
            return glyph;
        }

        // The glyph box is wider than the ink, so the box is hung on the edge the symbol's anchor states:
        // the ink's right edge meets a stem, its left edge hangs on one, and its centre sits in a slot.
        const box = ScoreSymbols.inkBox(symbol);
        const glyphName = definition.glyph.toLowerCase();
        const boxClassName = this.generateFinalClassName([
            "score-symbol-view-ink-box",
            `score-symbol-view-${definition.anchor}`,
        ]);

        // The ink box in the font's own unit, so a stylesheet can scale the ink to a box of its own without
        // knowing the glyph: the height is the distance between the ink's edges.
        const boxStyle = {
            width: box.width,
            height: box.height,
            "--symbol-ink-spaces-width": `var(${glyphInkSpacesVariablePrefix}width-${glyphName})`,
            "--symbol-ink-spaces-height":
                `calc(var(${glyphInkSpacesVariablePrefix}top-${glyphName})`
                + ` - var(${glyphInkSpacesVariablePrefix}bottom-${glyphName}))`,

            // How far the ink's centre sits above the baseline: a glyph whose ink is not symmetric around
            // its baseline — a dynamic mark is drawn above it — is moved down by it, so the ink is centred.
            "--symbol-ink-offset-y":
                `calc((var(${glyphInkSpacesVariablePrefix}top-${glyphName}, 0)`
                + ` + var(${glyphInkSpacesVariablePrefix}bottom-${glyphName}, 0)) * var(--staff-space) / 2)`,
        } as CSSProperties;

        return (
            <span className={boxClassName} style={boxStyle} {...this.dataAttributes}>
                {glyph}
            </span>
        );
    }

    /**
     * Describes the ink of a glyph to the stylesheet, which places and scales a symbol drawn as an icon with
     * it: the metrics the font loader publishes for the glyph, plus the box the view draws it in and the pen
     * position inside that box.
     *
     * @param glyph The glyph whose ink is described.
     * @param anchor How the glyph sits in its box, which is what states the pen position.
     * @param boxWidth Width of the box the glyph is drawn in, in staff spaces.
     * @param boxHeight Height of the box the glyph is drawn in, in staff spaces.
     *
     * @returns The custom properties the icon class reads.
     */
    private static inkStyle(glyph: SmuflGlyph, anchor: GlyphAnchor, boxWidth = 2, boxHeight = 2): CSSProperties {
        const glyphName = glyph.toLowerCase();
        const penX = anchor === GlyphAnchor.LeftEdge
            ? 0
            : anchor === GlyphAnchor.RightEdge ? boxWidth : boxWidth / 2;

        return {
            "--ink-left": `var(${glyphInkSpacesVariablePrefix}left-${glyphName}, 0)`,
            "--ink-width": `var(${glyphInkSpacesVariablePrefix}width-${glyphName}, 0)`,
            "--ink-top": `var(${glyphInkSpacesVariablePrefix}top-${glyphName}, 0)`,
            "--ink-bottom": `var(${glyphInkSpacesVariablePrefix}bottom-${glyphName}, 0)`,
            "--ink-box-width": boxWidth,
            "--ink-box-height": boxHeight,
            "--ink-pen-x": penX,
            "--ink-pen-y": boxHeight / 2,
        } as CSSProperties;
    }

    private renderOwnPath(path: IOwnPathDefinition, className: string): ComponentChild {
        const { id, title, style, staffSpace } = this.props;

        const filled = path.ink === OwnPathInk.Filled;

        return (
            <svg
                id={id}
                title={title}
                className={className}
                style={style}
                width={staffSpace * path.width}
                height={staffSpace * path.height}
                viewBox={`0 0 ${path.width} ${path.height}`}
                aria-hidden
            >
                <path
                    d={path.data}
                    fill={filled ? "currentColor" : "none"}
                    stroke={filled ? undefined : "currentColor"}
                    strokeWidth={path.strokeWidth}
                    strokeLinecap={path.roundEnds ? "round" : undefined}
                />
            </svg>
        );
    }

    /**
     * Draws a symbol as the icon of a toolbar button.
     *
     * @param definition What draws the symbol.
     * @param staffSpace The size of one staff space, in px.
     *
     * @returns The icon, a single svg.
     */
    private renderIcon(definition: IScoreSymbolDefinition, staffSpace: number): ComponentChild {
        if (definition.source === ScoreSymbolSource.Barline) {
            return this.renderBarlineIcon(definition, staffSpace);
        }

        if (definition.source === ScoreSymbolSource.OwnPath) {
            return this.renderOwnPathIcon(definition.path);
        }

        return (
            <SmuflGlyphView
                className="score-symbol-icon"
                style={ScoreSymbolView.inkStyle(definition.glyph, definition.anchor,
                    definition.box?.width, definition.box?.height)}
                glyph={definition.glyph}
                staffSpace={staffSpace}
                anchor={definition.anchor}
                width={definition.box?.width}
                height={definition.box?.height}
            />
        );
    }

    private renderOwnPathIcon(path: IOwnPathDefinition): ComponentChild {
        const filled = path.ink === OwnPathInk.Filled;

        // A path of the score is its own ink box, so the icon only has to scale it into the icon's box.
        return (
            <svg
                className="score-symbol-icon"
                width={scoreIconSize}
                height={scoreIconSize}
                viewBox={`0 0 ${path.width} ${path.height}`}
                aria-hidden
            >
                <path
                    d={path.data}
                    fill={filled ? "currentColor" : "none"}
                    stroke={filled ? undefined : "currentColor"}
                    strokeWidth={path.strokeWidth}
                    strokeLinecap={path.roundEnds ? "round" : undefined}
                />
            </svg>
        );
    }

    /**
     * Draws a barline as an icon: one stroke per part the barline is assembled from, and the font's glyph for
     * its repeat dots. The strokes take the thickness the font states; the class of the barline's edge places
     * them and the dots.
     *
     * @param definition The barline to draw.
     * @param staffSpace The size of one staff space, in px.
     *
     * @returns The icon, a single svg.
     */
    private renderBarlineIcon(definition: IBarlineSource, staffSpace: number): ComponentChild {
        const className = `score-symbol-icon score-symbol-icon-barline barline-icon-${definition.edge}`;

        const parts = definition.parts.map((part, index) => {
            if (part !== BarlinePart.RepeatDots) {
                const partClass = `barline-icon-stroke barline-icon-stroke-${part}`;

                return <path key={`${part}-${index}`} className={partClass} d="M0 3 V21" />;
            }

            const { dotsGlyph } = definition;
            if (dotsGlyph === undefined) {
                return null;
            }

            // The dots are the font's glyph, drawn at the size the font gives them and moved onto the place
            // the icon layout states for them.
            const dots = String.fromCodePoint(SmuflGlyphs.definition(dotsGlyph).codepoint);

            return (
                <text
                    key={`dots-${index}`}
                    className="barline-icon-dots"
                    x={0}
                    y={0}
                    fontSize={staffSpace * 4}
                    style={ScoreSymbolView.inkStyle(dotsGlyph, GlyphAnchor.Centre)}
                >
                    {dots}
                </text>
            );
        });

        return (
            <svg
                className={className}
                width={scoreIconSize}
                height={scoreIconSize}
                viewBox={`0 0 ${scoreIconSize} ${scoreIconSize}`}
                aria-hidden
            >
                {parts}
            </svg>
        );
    }
}
