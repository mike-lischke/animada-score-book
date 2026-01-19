/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { convertPropValue } from "../../../core/utils.js";
import { type Codicon, iconNameMap } from "./Codicon.js";
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
    /** The URL of the main image. Can also be a codicon name. */
    src?: string | Codicon;

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
        const { src, overlays, disabled, style, height, width, color, "data-tooltip": dataTooltip } = this.props;
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
                ...style,
                width: convertPropValue(width),
                height: convertPropValue(height),
                backgroundColor: color,
            };
        } else if (src) {
            // Otherwise it's a codicon.
            newStyle = style;
            className += " codicon codicon-" + iconNameMap.get(src)!;
        }

        if (overlays) {
            return (
                <div
                    className="iconHost"
                >
                    <div
                        className={className}
                        style={newStyle}
                        data-tooltip={dataTooltip}
                    />
                    {olLayers}
                </div>
            );
        } else {
            return (
                <div
                    className={className}
                    style={newStyle}
                    data-tooltip={dataTooltip}
                />
            );
        }
    }

}
