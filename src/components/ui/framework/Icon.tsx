/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { convertPropValue } from "../../../core/utils.js";
import { UIIcon, uiIconToMdiMap } from "./UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface IIconOverlay {
    /** The URL of an overlay image. */
    icon: string;

    /**
     * The URL of an image to be used to cut out a part of the main image. Usually used to make the overlay better
     * visible.
     */
    mask: string;
}

/** Icons are images whose color can be set. Colors in the image itself are ignored. */
export interface IIconProperties extends ICommonUIProperties {
    /** The URL of the main image. Can also be a `UIIcon` enum value. */
    src?: string | UIIcon;

    overlays?: IIconOverlay[];

    disabled?: boolean;
    width?: string | number;
    height?: string | number;
    color?: string;
}

/** Icons are images which can be themed, so their colors are ignored. */
export class Icon extends UIComponent<IIconProperties> {
    public static override defaultProps = {
        disabled: false,
    };

    public render(): ComponentChild {
        const {
            id, src, overlays, disabled, style, height, width, color, alt
        } = this.props;
        let className = this.generateFinalClassName([
            "icon",
            this.classFromProperty(disabled, "overlayDisabled"),
        ]);

        let maskImage = `url("${src}")`;
        let maskSize: string | undefined = "100% 100%";
        let maskComposite: string | undefined = "subtract";
        const olLayers: ComponentChild[] = [];
        if (overlays && overlays.length > 0) {
            className += " withOverlay";

            overlays.forEach((overlay) => {
                maskImage += `, url("${overlay.mask}")`;
                maskSize! += `, auto auto`;
                maskComposite! += `, add`;
                olLayers.push(
                    <div
                        class="overlay"
                        style={{ backgroundImage: `url("${overlay.icon}")` }}
                    />,
                );
            });
        } else {
            maskSize = undefined;
            maskComposite = undefined;
        }

        let newStyle;
        if (typeof src === "string") {
            // A path was given.
            newStyle = {
                maskImage,
                WebkitMaskImage: maskImage,
                maskSize,
                maskComposite,
                // Expose the icon source as a CSS variable so the print stylesheet can
                // reuse it as a background-image (Chromium's print engine ignores
                // mask-image, so we fall back to drawing the SVG natively on paper).
                "--icon-src": maskImage,
                ...style,
                width: convertPropValue(width),
                height: convertPropValue(height),
                backgroundColor: color,
            };
        } else if (src) {
            // Otherwise it's a UIIcon — render as inline SVG via its MDI path.
            const mdiPath = uiIconToMdiMap.get(src);
            if (mdiPath) {
                newStyle = style;

                if (overlays) {
                    return (
                        <div
                            id={id}
                            className="iconHost"
                            aria-label={alt}
                        >
                            <svg
                                class={className}
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                width={convertPropValue(width) ?? "1em"}
                                height={convertPropValue(height) ?? "1em"}
                                fill={color ?? "currentColor"}
                                data-icon={UIIcon[src]}
                                style={newStyle}
                                {...this.dataAttributes}
                            >
                                <path d={mdiPath} />
                            </svg>
                            {olLayers}
                        </div>
                    );
                }

                return (
                    <svg
                        id={id}
                        class={className}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width={convertPropValue(width) ?? "1em"}
                        height={convertPropValue(height) ?? "1em"}
                        fill={color ?? "currentColor"}
                        data-icon={UIIcon[src]}
                        aria-label={alt}
                        style={newStyle}
                        {...this.dataAttributes}
                    >
                        <path d={mdiPath} />
                    </svg>
                );
            }
        }

        if (overlays) {
            return (
                <div
                    id={id}
                    className="iconHost"
                    aria-label={alt}
                >
                    <div
                        className={className}
                        style={newStyle}
                        {...this.dataAttributes}
                    />
                    {olLayers}
                </div>
            );
        } else {
            return (
                <div
                    id={id}
                    className={className}
                    style={newStyle}
                    aria-label={alt}
                    {...this.dataAttributes}
                />
            );
        }
    }
}
