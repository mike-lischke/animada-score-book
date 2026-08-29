/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

let gooeyFilterCounter = 0;

export interface IGooeyGroupProps extends ICommonUIProperties {
    /**
     * Optional fill color of the gooey blob. When omitted, the blob keeps the colors of the
     * rendered children (their background/fill), which the filter blurs together.
     */
    background?: string;
}

/**
 * Wraps its children in an element rendered through a gooey SVG filter, giving arbitrary content
 * the gooey (melted-together) look with an engraved inner shadow. The blob is derived from the
 * children's own contours, so both the number and shape of the children stay fully dynamic.
 */
export class GooeyGroup extends UIComponent<IGooeyGroupProps> {
    private readonly filterId: string;

    public constructor(props: IGooeyGroupProps) {
        super(props);

        this.filterId = `gooey-${gooeyFilterCounter++}`;
    }

    public override render(): ComponentChild {
        const { children, style, background } = this.props;
        const className = this.generateFinalClassName(["gooey-group"]);
        const mergedStyle = { ...style, filter: `url(#${this.filterId})` };

        const shapeResult = background === undefined ? "goo" : "gooShape";
        const colorize = background === undefined ? undefined : (
            <>
                <feFlood flood-color={background} result="bgColor" />
                <feComposite operator="in" in="bgColor" in2="gooShape" result="goo" />
            </>
        );

        return (
            <>
                <svg className="gooey-filter-svg" aria-hidden="true">
                    <defs>
                        <filter
                            id={this.filterId}
                            x="-25%"
                            y="-25%"
                            width="150%"
                            height="150%"
                            color-interpolation-filters="sRGB"
                        >
                            <feMorphology in="SourceGraphic" operator="dilate" radius="4" result="dilated" />
                            <feGaussianBlur in="dilated" stdDeviation="6" result="blur" />
                            <feColorMatrix
                                in="blur"
                                type="matrix"
                                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
                                result={shapeResult}
                            />
                            {colorize}
                            <feOffset in="goo" dx="0" dy="3" result="shadowOffset" />
                            <feGaussianBlur in="shadowOffset" stdDeviation="1" result="shadowBlur" />
                            <feComposite operator="out" in="goo" in2="shadowBlur" result="shadowMask" />
                            <feFlood flood-color="#000" flood-opacity="0.1" result="shadowColor" />
                            <feComposite operator="in" in="shadowColor" in2="shadowMask" result="innerShadow" />
                            <feComposite operator="over" in="innerShadow" in2="goo" result="blobShadowed" />
                            <feOffset in="blobShadowed" dx="0" dy="-1" result="highlightOffset" />
                            <feGaussianBlur in="highlightOffset" stdDeviation="0.5" result="highlightBlur" />
                            <feComposite
                                operator="out"
                                in="blobShadowed"
                                in2="highlightBlur"
                                result="highlightMask"
                            />
                            <feFlood flood-color="#fff" flood-opacity="0.18" result="highlightColor" />
                            <feComposite
                                operator="in"
                                in="highlightColor"
                                in2="highlightMask"
                                result="innerHighlight"
                            />
                            <feComposite
                                operator="over"
                                in="innerHighlight"
                                in2="blobShadowed"
                                result="blob"
                            />
                            <feComposite operator="over" in="SourceGraphic" in2="blob" />
                        </filter>
                    </defs>
                </svg>
                <div className={className} style={mergedStyle} {...this.dataAttributes}>
                    {children}
                </div>
            </>
        );
    }
}
