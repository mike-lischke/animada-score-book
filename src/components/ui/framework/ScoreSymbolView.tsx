/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import {
    OwnPathInk, ScoreSymbols, ScoreSymbolSource, type IOwnPathDefinition, type ScoreSymbol,
} from "../../../core/ScoreSymbols.js";
import { SmuflGlyphView } from "./SmuflGlyphView.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

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
        const { staffSpace, symbol, inkBox = false } = this.props;

        const definition = ScoreSymbols.definition(symbol);
        const mergedClassName = this.generateFinalClassName(["score-symbol-view"]);

        if (definition.source !== ScoreSymbolSource.MusicFontGlyph) {
            return this.renderOwnPath(definition.path, mergedClassName);
        }

        const glyph = (
            <SmuflGlyphView
                className={inkBox ? "score-symbol-view" : mergedClassName}
                glyph={definition.glyph}
                staffSpace={staffSpace}
                anchor={definition.anchor}
            />
        );

        if (!inkBox) {
            return glyph;
        }

        // The glyph box is wider than the ink, so the box is hung on the edge the symbol's anchor states:
        // the ink's right edge meets a stem, its left edge hangs on one, and its centre sits in a slot.
        const box = ScoreSymbols.inkBox(symbol);
        const boxClassName = this.generateFinalClassName([
            "score-symbol-view-ink-box",
            `score-symbol-view-${definition.anchor}`,
        ]);

        return (
            <span className={boxClassName} style={{ width: box.width, height: box.height }}>
                {glyph}
            </span>
        );
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
}
