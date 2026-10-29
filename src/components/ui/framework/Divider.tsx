/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

interface IDividerProperties extends ICommonUIProperties {
    vertical?: boolean;
    thickness?: number;

    innerRef?: preact.RefObject<HTMLDivElement | null>;

    // data-text is supported to set a title on the divider.
}

export class Divider extends UIComponent<IDividerProperties> {
    private hoverTimer: ReturnType<typeof setTimeout> | null = null;

    public render(): ComponentChild {
        const { vertical = false, thickness = 4, style, innerRef } = this.props;

        const className = this.generateFinalClassName([
            "divider",
            "du-divider",
            this.classFromProperty(vertical, ["horizontal", "vertical"]),
        ]);

        const newStyle = {
            ...style,
            "--thickness": `${thickness}px`,
        };

        return (
            <div
                ref={innerRef}
                className={className}
                style={newStyle}
                onPointerEnter={this.pointerEnter}
                onPointerLeave={this.pointerLeave}
            >
            </div >
        );
    }

    private pointerEnter = (e: PointerEvent) => {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
        }

        this.hoverTimer = setTimeout(() => {
            (e.target as Element).classList.add("hover");
            this.hoverTimer = null;
        }, 300);
    };

    private pointerLeave = (e: PointerEvent) => {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }

        (e.target as Element).classList.remove("hover");

    };
}
