/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type CSSProperties } from "preact";

import {
    BarlinePart, ScoreSymbol, ScoreSymbols, ScoreSymbolSource, type IBarlineSource,
} from "../../../core/ScoreSymbols.js";
import { SmuflGlyphView } from "./SmuflGlyphView.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface IBarlineViewProperties extends ICommonUIProperties {
    /** The barline to draw. The symbol catalogue states the parts it is assembled from. */
    symbol: ScoreSymbol;

    /** The size of one staff space, in px. A SMuFL font puts four staff spaces into one em. */
    staffSpace: number;
}

/**
 * Draws a barline of the score's symbol catalogue.
 *
 * A music font draws a barline thinner than a pixel, and the browser anti-aliases it, which makes the thin
 * strokes of a score look fuzzy. The score therefore assembles its bar lines itself: the strokes are drawn in
 * the thickness the font states, so their edges land on the pixel grid, while the repeat dots stay a glyph of
 * the font, because a round dot has no edge that could be rounded to a pixel either way. The width of the
 * strokes and their separations come from the font's engraving defaults, so a barline follows a font change
 * just like a glyph does.
 *
 * The view states its own height, the staff band it spans, and is centred from the outside: the caller places
 * its box.
 */
export class BarlineView extends UIComponent<IBarlineViewProperties> {
    public override render(): ComponentChild {
        const { symbol, staffSpace } = this.props;

        const definition = ScoreSymbols.definition(symbol);
        if (definition.source !== ScoreSymbolSource.Barline) {
            console.warn(`BarlineView: ${ScoreSymbol[symbol]} is not a barline`);

            return null;
        }

        const className = this.generateFinalClassName(["barline-view"]);
        const parts = definition.parts.map((part, index) => {
            return this.renderPart(part, definition, index, staffSpace);
        });

        // The strokes of this barline stand as far apart as the font draws them, which the loader has measured.
        const style = { "--barline-gap": `var(--barline-${definition.key}-separation)` } as CSSProperties;

        return (
            <span className={className} style={style}>
                {parts}
            </span>
        );
    }

    private renderPart(part: BarlinePart, definition: IBarlineSource, index: number,
        staffSpace: number): ComponentChild {

        const key = `${part}-${index}`;
        if (part !== BarlinePart.RepeatDots) {
            return <span key={key} className={`barline-view-part barline-view-${part}`} />;
        }

        const { dotsGlyph } = definition;
        if (dotsGlyph === undefined) {
            return null;
        }

        return (
            <span key={key} className="barline-view-part barline-view-dots">
                <SmuflGlyphView glyph={dotsGlyph} staffSpace={staffSpace} />
            </span>
        );
    }
}
