/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IHairpinIconProps extends ICommonUIProperties {
}

/** Renders the shared hairpin button icon: a left and a right hairpin stacked, each one twice as wide as it is high. */
export class HairpinIcon extends UIComponent<IHairpinIconProps> {
    public override render(): ComponentChild {
        const { style } = this.props;

        const className = this.generateFinalClassName(["hairpin-icon"]);

        return (
            <svg
                className={className}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="100%"
                height="100%"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={style}
            >
                <path d="M20 4 L4 7.5 L20 11" />
                <path d="M4 13 L20 16.5 L4 20" />
            </svg>
        );
    }
}
