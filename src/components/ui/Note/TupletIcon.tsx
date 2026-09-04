/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface ITupletIconProps extends ICommonUIProperties {
}

/** Renders a tuplet bracket with the numeral 3. */
export class TupletIcon extends UIComponent<ITupletIconProps> {
    public override render(): ComponentChild {
        const { style } = this.props;

        const className = this.generateFinalClassName(["tuplet-icon"]);

        return (
            <svg
                className={className}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="currentColor"
                stroke="currentColor"
                aria-hidden="true"
                style={style}
            >
                <path
                    d="M5 4.5 H19 M5 4.5 V7.5 M19 4.5 V7.5"
                    fill="none"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <text
                    x="12"
                    y="18.5"
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="600"
                    fontFamily="sans-serif"
                    stroke="none"
                >
                    3
                </text>
            </svg>
        );
    }
}
