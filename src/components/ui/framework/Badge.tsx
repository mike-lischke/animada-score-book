/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

/** Semantic color of a badge. */
export enum BadgeVariant {
    Neutral = "neutral",
    Primary = "primary",
    Success = "success",
    Warning = "warning",
    Error = "error",
}

export interface IBadgeProperties extends ICommonUIProperties {
    /** The caption of the badge. Can alternatively be set via the children. */
    caption?: string;

    /** The semantic color of the badge. Defaults to `Neutral`. */
    variant?: BadgeVariant;
}

/**
 * A small status badge. Its surface is a translucent tint of the variant color, its border a stronger tint and
 * its text the variant color itself, so the badge follows the active theme.
 */
export class Badge extends UIComponent<IBadgeProperties> {
    public render(): ComponentChild {
        const { className, caption, children, variant = BadgeVariant.Neutral } = this.props;
        const finalClassName = this.generateFinalClassName(["uiBadge", `uiBadge-${variant}`, className]);

        return <span className={finalClassName} {...this.dataAttributes}>{children ?? caption}</span>;
    }
}
