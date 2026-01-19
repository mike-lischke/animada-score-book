/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface IImageProperties extends ICommonUIProperties {
    disabled?: boolean;

    /** Either a URL to an image or a base64 data string. */
    src?: string;

    alt?: string;
    width?: string | number;
    height?: string | number;

    innerRef?: preact.RefObject<HTMLImageElement>;
}

interface IImageState {
    width: number;
    height: number;
}

export class Image extends UIComponent<IImageProperties, IImageState> {

    public static override defaultProps = {
        disabled: false,
    };

    public render(): ComponentChild {
        const { id, title, disabled, src, alt, width, height, innerRef } = this.props;
        const className = this.generateFinalClassName([
            "image",
            this.classFromProperty(disabled, "disabled"),
        ]);

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
}
