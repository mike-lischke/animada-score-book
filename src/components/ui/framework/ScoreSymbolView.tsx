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
}

/**
 * Draws one notation symbol of the score's symbol catalogue.
 *
 * A symbol is either a glyph of the selected music font or a path of the score's own; this component
 * is what makes the difference invisible to its callers. A glyph is drawn with its ink centred on the
 * box's centre line and, where the symbol asks for it, ending on the box's right edge, which is where
 * a stem attaches; an own path fills its own ink box. Either way the box is sized in staff spaces, so
 * the symbol scales with the font the score is drawn with, and the caller places the box.
 */
export class ScoreSymbolView extends UIComponent<IScoreSymbolViewProperties> {
    public override render(): ComponentChild {
        const { staffSpace, symbol } = this.props;

        const definition = ScoreSymbols.definition(symbol);
        const mergedClassName = this.generateFinalClassName(["score-symbol-view"]);

        if (definition.source === ScoreSymbolSource.MusicFontGlyph) {
            return (
                <SmuflGlyphView
                    className={mergedClassName}
                    glyph={definition.glyph}
                    staffSpace={staffSpace}
                    anchor={definition.anchor}
                />
            );
        }

        return this.renderOwnPath(definition.path, mergedClassName);
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
