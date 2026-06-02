/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, type RefObject } from "preact";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export enum PredefinedImage {
    PlayImage,
    PauseImage,
    CountIn,
    Metronome,
    Record,

    // Notation
    CommonTime,
}

export interface IImageBaseProps extends ICommonUIProperties {
    disabled?: boolean;
    alt?: string;
    width?: string | number;
    height?: string | number;
}

/** Variant: normal image (URL, base64 etc.) */
export interface IImageUrlProps extends IImageBaseProps {
    /**
     * The image source. Can be a URL string or base64 encoded string.
     */
    src: string;
    innerRef?: RefObject<HTMLImageElement>;
}

/** Variant: predefined SVG icon */
export interface IImagePredefinedProps extends IImageBaseProps {
    /**
     * The image source. Can be a predefined image from the `PredefinedImage` enum.
     */
    src: PredefinedImage;
    innerRef?: RefObject<SVGSVGElement>;
}

export type IImageProperties = IImageUrlProps | IImagePredefinedProps;

interface IImageState {
    loaded: boolean;
}

export class Image extends UIComponent<IImageProperties, IImageState> {
    public static override defaultProps = {
        disabled: false,
    };

    /** Holds loaded SVG image ids for re-use. */
    private static readonly registeredSymbols = new Set<string>();

    private static readonly svgIconSources: Record<PredefinedImage, string> = {
        [PredefinedImage.PlayImage]: new URL("../../../assets/images/icons/play.svg", import.meta.url).href,
        [PredefinedImage.PauseImage]: new URL("../../../assets/images/icons/pause.svg", import.meta.url).href,
        [PredefinedImage.CountIn]: new URL("../../../assets/images/icons/count-in.svg", import.meta.url).href,
        [PredefinedImage.Metronome]: new URL("../../../assets/images/icons/metronome.svg", import.meta.url).href,
        [PredefinedImage.Record]: new URL("../../../assets/images/icons/record.svg", import.meta.url).href,

        // Notation
        [PredefinedImage.CommonTime]: new URL("../../../assets/images/notes/common-time.svg", import.meta.url).href,
    };

    public render(): ComponentChild {
        const { id, title, disabled, src, alt, width, height, innerRef } = this.props;
        const { loaded } = this.state;

        const className = this.generateFinalClassName([
            "image",
            this.classFromProperty(disabled, "disabled"),
        ]);

        if (typeof src === "string") {
            return (
                <img
                    ref={innerRef}
                    id={id}
                    title={title}
                    className={className}
                    src={src}
                    alt={alt}
                    width={width}
                    height={height}
                />
            );
        }

        // Is this a predefined image? If so, we need to ensure it's registered in the SVG cache.
        const path = Image.svgIconSources[src];
        if (!path) {
            // Not a valid predefined image, render nothing.
            return null;
        }

        const symbolId = this.symbolIdFromPath(path);
        if (loaded) {
            return <svg
                ref={innerRef}
                id={id}
                title={title}
                className={className}
                width={width}
                height={height}
                aria-label={alt}
            >
                <use href={`#${symbolId}`} />
            </svg>;
        }

        void this.cacheSvgImageSource(path).then(() => {
            this.setState({ loaded: true });
        });

        return null;
    }

    /**
     * @returns The SVG holder HTML element, creating it if it doesn't exist yet.
     *
     * This is used to hold SVG symbols that can be referenced in the Image component.
     */
    private get svgHolder(): SVGSVGElement {
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
    };

    /**
     * Registers an SVG symbol in the cache. The symbol can then be used in the app with
     * `<svg><use href="#symbolId"></use></svg>`.
     *
     * @param src The path to the SVG file.
     *
     * @returns The symbol ID if registration was successful, or undefined if it failed.
     */
    private async cacheSvgImageSource(src: string): Promise<string | undefined> {
        const symbolId = this.symbolIdFromPath(src);
        if (Image.registeredSymbols.has(symbolId)) {
            return symbolId;
        }

        Image.registeredSymbols.add(symbolId);

        const res = await fetch(src);
        const text = await res.text();

        const tpl = document.createElement("template");
        tpl.innerHTML = text.trim();
        const svg = tpl.content.firstElementChild as SVGSVGElement | null;
        if (!svg) {
            return symbolId;
        }

        const viewBox = svg.getAttribute("viewBox") ?? "0 0 24 24";

        const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
        symbol.setAttribute("id", symbolId);
        symbol.setAttribute("viewBox", viewBox);

        while (svg.firstChild) {
            symbol.appendChild(svg.firstChild);
        }

        this.svgHolder.appendChild(symbol);
    };

    private symbolIdFromPath(path: string): string {
        let hash = 0;
        for (let i = 0; i < path.length; i++) {
            hash = (hash << 5) - hash + path.charCodeAt(i);
            hash |= 0;
        }

        return `id-${(hash >>> 0).toString(36)}`;
    }
}
