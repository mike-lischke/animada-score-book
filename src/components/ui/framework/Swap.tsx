/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface ISwapProperties extends ICommonUIProperties {
    /** The content to display when the swap is in the "off" state. */
    offContent: ComponentChild;

    /** The content to display when the swap is in the "on" state. */
    onContent: ComponentChild;

    /** Optional callback that is called when the swap state changes. */
    onChange?: (isOn: boolean) => void;

    /** Optional controlled state for the swap input. */
    isOn?: boolean;

    /** Marks the swap as active, which highlights it the way a default button is highlighted. */
    isMarked?: boolean;
}

export class Swap extends UIComponent<ISwapProperties> {
    public override render(): ComponentChild {
        const { id, offContent, onContent, onChange, isOn, disabled, isMarked } = this.props;

        const className = this.generateFinalClassName([
            "btn",
            "du-btn",
            "du-swap",
            "du-swap-rotate",
            this.classFromProperty(isMarked, "du-btn-primary"),
        ]);

        return (
            <label className={className} {...this.dataAttributes}>
                <input
                    type="checkbox"
                    id={id}
                    checked={isOn}
                    disabled={disabled}
                    onChange={(event) => {
                        onChange?.(event.currentTarget.checked);
                    }}
                />
                <span className="du-swap-off fill-current" data-tooltip="inherit">{offContent}</span>
                <span className="du-swap-on fill-current" data-tooltip="inherit">{onContent}</span>
            </label>
        );
    }
}
