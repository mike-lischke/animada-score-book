/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { convertPropValue } from "../../../core/utils.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface IMdiIconProperties extends ICommonUIProperties {
    /** The SVG path data from `@mdi/js` (e.g. `mdiAccount`). */
    path: string;

    /** Icon size. Default: "24px". */
    size?: string | number;

    /** Override color. Defaults to currentColor via CSS. */
    color?: string;

    /** Flip horizontally. */
    flipH?: boolean;

    /** Flip vertically. */
    flipV?: boolean;

    /** Rotation in degrees (0, 90, 180, 270). */
    rotate?: number;

    /** Enable spin animation. */
    spin?: boolean;
}

/**
 * Renders a Material Design Icon from an SVG path string.
 *
 * Usage:
 *   import { mdiAccount } from "`@mdi/js`";
 *   <MdiIcon path={mdiAccount} size="24px" />
 *
 * Tree shaking: Vite/Rollup removes all unused icon imports from `@mdi/js` automatically.
 */
export class MdiIcon extends UIComponent<IMdiIconProperties> {
    public static override defaultProps = {
        size: "24px",
        spin: false,
        flipH: false,
        flipV: false,
    };

    public render(): ComponentChild {
        const { path, size, color, flipH, flipV, rotate, spin, style } = this.props;

        const className = this.generateFinalClassName([
            "mdi-icon",
            this.classFromProperty(spin, "mdi-spin"),
        ]);

        let transform: string | undefined;
        const parts: string[] = [];

        if (flipH) {
            parts.push("scale(-1, 1)");
        }

        if (flipV) {
            parts.push("scale(1, -1)");
        }

        if (rotate && rotate !== 0) {
            parts.push(`rotate(${rotate})`);
        }

        if (parts.length > 0) {
            transform = parts.join(" ");
        }

        return (
            <svg
                class={className}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width={convertPropValue(size)}
                height={convertPropValue(size)}
                fill={color ?? "currentColor"}
                style={transform ? { ...style, transform } : style}
                {...this.dataAttributes}
            >
                <path d={path} />
            </svg>
        );
    }
}
