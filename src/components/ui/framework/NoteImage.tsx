/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type CSSProperties, type RefObject } from "preact";

import { UIComponent } from "./UIComponent.js";
import { type IImageBaseProps } from "./Image.js";

export enum NoteKind {
    Note,
    Rest
}

export enum NoteLength {
    Whole,
    Half,
    Quarter,
    Eighth,
    Sixteenth,
    ThirtySecond
}

export enum NoteImageHeadType {
    Oval,
    Cross,
    Diamond,
    /** Filled square for hand-struck notes (e.g. Repinique de mão, Conga). */
    Square,
    /** Hollow equilateral triangle for shaken instruments (e.g. Chocalho, Ganzá). */
    Triangle
}

export interface INoteImageProperties extends IImageBaseProps {
    /** Whether to render from the note sprite or from rest symbols. */
    kind?: NoteKind;

    /** The rhythmic value to render. */
    value: NoteLength;

    /** Note head variant (used only when kind="note"). */
    headType?: NoteImageHeadType;

    /** Optional override for stem visibility (used only for notes). */
    hasStem?: boolean;

    /** Optional override for number of flags (0..3, used only for notes). */
    flagCount?: 0 | 1 | 2 | 3;

    /**
     * Diamond-head openness override (used only diamond type notes).
     * true => hollow (open), false => filled (closed).
     */
    diamondOpen?: boolean;

    /** When true, show the augmentation dot from the sprite. */
    dotted?: boolean;

    /** When true, hides all SVG stem variants (for custom CSS stem overlay). */
    hideStem?: boolean;

    innerRef?: RefObject<SVGSVGElement>;
}

interface INoteImageState {
    loaded: boolean;
}

/**
 * Renders notes from one composable SVG sprite (`note.svg`) and rests from predefined rest symbols.
 * Individual note parts are selected via CSS custom properties.
 */
export class NoteImage extends UIComponent<INoteImageProperties, INoteImageState> {
    public static override defaultProps = {
        disabled: false,
        kind: NoteKind.Note,
        headType: NoteImageHeadType.Oval,
    };

    public override state: INoteImageState = {
        loaded: false,
    };

    private static readonly noteSpriteSource = new URL("../../../assets/images/notes/note.svg", import.meta.url).href;
    private static readonly restSpriteSource = new URL("../../../assets/images/notes/rest.svg", import.meta.url).href;
    private static readonly registeredSymbols = new Set<string>();

    /**
     * Registers an inline SVG symbol in the hidden holder and returns its ID.
     * Subsequent calls with the same key return the existing ID without re-registering.
     *
     * @param key A unique key identifying the symbol (e.g. "press-roll").
     * @param viewBox The viewBox attribute for the symbol.
     * @param innerHTML The inner SVG markup (e.g. `<line ... />` elements).
     *
     * @returns The symbol ID for use with `<use href="#...">`.
     */
    public static registerSymbol(key: string, viewBox: string, innerHTML: string): string {
        const symbolId = `symbol-${key}`;
        if (this.registeredSymbols.has(symbolId)) {
            return symbolId;
        }

        this.registeredSymbols.add(symbolId);

        const holder = this.svgHolder;
        const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
        symbol.id = symbolId;
        symbol.setAttribute("viewBox", viewBox);
        symbol.innerHTML = innerHTML;
        holder.appendChild(symbol);

        return symbolId;
    }

    public override render(): ComponentChild {
        const {
            id, title, alt, style, disabled, width, height, innerRef, kind = NoteKind.Note, value,
            headType = NoteImageHeadType.Oval, dotted = false, hideStem = false,
        } = this.props;

        const source = kind === NoteKind.Note ? NoteImage.noteSpriteSource : NoteImage.restSpriteSource;
        const symbolId = this.symbolIdFromPath(source);
        const { loaded } = this.state;
        if (!loaded) {
            void this.cacheSprite(source).then(() => {
                this.setState({ loaded: true });
            });

            return null;
        }

        const mergedClassName = this.generateFinalClassName([
            "note-image",
            this.classFromProperty(disabled, "disabled"),
        ]);

        const cssStyle = kind === NoteKind.Note
            ? this.computeNoteStyle(style ?? {}, value, headType, dotted, hideStem)
            : this.computeRestStyle(style ?? {}, value, dotted);

        return (
            <svg
                ref={innerRef}
                id={id}
                title={title}
                className={mergedClassName}
                width={width}
                height={height}
                style={cssStyle}
                aria-label={alt}
                data-note-image-value={value}
                data-note-image-head={headType}
                data-note-image-kind={kind}
            >
                <use href={`#${symbolId}`} />
            </svg>
        );
    }

    private computeNoteStyle(baseStyle: CSSProperties, value: NoteLength,
        headType: NoteImageHeadType, dotted: boolean, hideStem = false): CSSProperties {
        const { flagCount, hasStem: hasStemOverride } = this.props;
        const style = { ...baseStyle } as CSSProperties & Record<string, string>;

        const flags = flagCount ?? this.defaultFlagCount(value);
        const stemDefault = value !== NoteLength.Whole;
        const hasStem = hideStem ? false : (hasStemOverride ?? stemDefault);
        const isOval = headType === NoteImageHeadType.Oval;

        style["--note-show-oval-body"] = isOval && value !== NoteLength.Whole ? "inline" : "none";
        style["--note-show-oval-stem"] = hasStem ? "inline" : "none";
        style["--note-show-oval-half"] = isOval && value === NoteLength.Half ? "inline" : "none";
        style["--note-show-oval-quarter"] = isOval && value !== NoteLength.Whole && value !== NoteLength.Half
            ? "inline"
            : "none";
        style["--note-show-oval-whole"] = isOval && value === NoteLength.Whole ? "inline" : "none";

        style["--note-show-flag-8th"] = flags >= 1 ? "inline" : "none";
        style["--note-show-flag-16th"] = flags >= 2 ? "inline" : "none";
        style["--note-show-flag-32nd"] = flags >= 3 ? "inline" : "none";
        style["--note-show-dot"] = dotted ? "inline" : "none";
        // Shift flags down to align with custom CSS stems (SVG stem is hidden).
        style["--note-flag-offset"] = flags >= 1 ? "10px" : "0px";

        return style;
    }

    private computeRestStyle(baseStyle: CSSProperties, value: NoteLength, dotted: boolean): CSSProperties {
        const style = { ...baseStyle } as CSSProperties & Record<string, string>;

        style["--rest-show-whole"] = value === NoteLength.Whole ? "inline" : "none";
        style["--rest-show-half"] = value === NoteLength.Half ? "inline" : "none";
        style["--rest-show-quarter"] = value === NoteLength.Quarter ? "inline" : "none";
        style["--rest-show-eighth"] = value === NoteLength.Eighth ? "inline" : "none";
        style["--rest-show-sixteenth"] = value === NoteLength.Sixteenth ? "inline" : "none";
        style["--rest-show-thirty-second"] = value === NoteLength.ThirtySecond ? "inline" : "none";
        style["--rest-show-dot"] = dotted ? "inline" : "none";

        return style;
    }

    private defaultFlagCount(value: NoteLength): 0 | 1 | 2 | 3 {
        switch (value) {
            case NoteLength.Eighth: {
                return 1;
            }

            case NoteLength.Sixteenth: {
                return 2;
            }

            case NoteLength.ThirtySecond: {
                return 3;
            }

            default: {
                return 0;
            }
        }
    }

    private async cacheSprite(source: string): Promise<void> {
        const symbolId = this.symbolIdFromPath(source);
        if (NoteImage.registeredSymbols.has(symbolId)) {
            return;
        }

        NoteImage.registeredSymbols.add(symbolId);

        try {
            const res = await fetch(source);
            const text = await res.text();

            const tpl = document.createElement("template");
            tpl.innerHTML = text.trim();
            const svg = tpl.content.firstElementChild as SVGSVGElement | null;
            if (!svg) {
                return;
            }

            const viewBox = svg.getAttribute("viewBox") ?? "0 0 24 24";

            const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
            symbol.setAttribute("id", symbolId);
            symbol.setAttribute("viewBox", viewBox);

            while (svg.firstChild) {
                symbol.appendChild(svg.firstChild);
            }

            NoteImage.svgHolder.appendChild(symbol);
        } catch {
            // The sprite load is best-effort. A failed fetch (e.g. offline or in jsdom tests)
            // must not surface as an unhandled rejection; drop the registration so a later
            // render can retry.
            NoteImage.registeredSymbols.delete(symbolId);
        }
    }

    /**
     * Retrieves the hidden SVG holder element, creating it if it doesn't exist.
     *
     * @returns The SVG element serving as the symbol holder.
     */
    private static get svgHolder(): SVGSVGElement {
        let holder = document.getElementById("svg-holder") as SVGSVGElement | null;
        if (!holder) {
            holder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            holder.id = "svg-holder";
            holder.setAttribute("width", "0");
            holder.setAttribute("height", "0");
            holder.style.position = "absolute";
            holder.style.width = "0";
            holder.style.height = "0";
            holder.style.overflow = "hidden";
            document.body.prepend(holder);
        }

        return holder;
    }

    /**
     * Generates a unique symbol ID based on the sprite path. This allows multiple NoteImage instances to reference
     * the same symbol without conflicts, even if the same sprite is used in different contexts.
     *
     * @param path The path to the sprite file.
     *
     * @returns A unique symbol ID based on the sprite path.
     */
    private symbolIdFromPath(path: string): string {
        let hash = 0;
        for (let i = 0; i < path.length; i++) {
            hash = (hash << 5) - hash + path.charCodeAt(i);
            hash |= 0;
        }

        return `id-${(hash >>> 0).toString(36)}`;
    }
}
