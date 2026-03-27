/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export enum LoadingStyle {
    Spinner = "loading-spinner",
    Dots = "loading-dots",
    Ring = "loading-ring",
    Ball = "loading-ball",
    Bars = "loading-bars",
    Infinity = "loading-infinity"
}

export enum LoadingSize {
    ExtraSmall = "loading-xs",
    Small = "loading-sm",
    Medium = "loading-md",
    Large = "loading-lg",
    ExtraLarge = "loading-xl"
}
export interface ILoadingProperties extends ICommonUIProperties {
    loadingStyle?: LoadingStyle;
    size?: LoadingSize;
}

export class Loading extends UIComponent<ILoadingProperties> {
    public render(): ComponentChild {
        const { loadingStyle = LoadingStyle.Infinity, size = LoadingSize.Medium, style } = this.props;

        const className = this.generateFinalClassName(["loading", loadingStyle, size]);

        return <span className={className} style={style}></span>;
    }
}
