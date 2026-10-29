/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IMetronomeIconProperties extends ICommonUIProperties {
}

/** Renders the metronome switch icon: the pendulum stroke crossing its stem, as in the mockup. */
export class MetronomeIcon extends UIComponent<IMetronomeIconProperties> {
    public override render(): ComponentChild {
        const { id, alt, style } = this.props;

        const className = this.generateFinalClassName(["icon"]);

        return (
            <svg
                id={id}
                className={className}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-label={alt}
                style={style}
                {...this.dataAttributes}
            >
                <path d="M12.5 4.5 V19.5" />
                <path d="M7 16.5 L18 7.5" />
            </svg>
        );
    }
}
