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
}

export class Swap extends UIComponent<ISwapProperties> {
    public override render(): ComponentChild {
        const { id, offContent, onContent, onChange, isOn } = this.props;

        const className = this.generateFinalClassName([
            "btn",
            "btn-circle",
            "swap",
            "swap-rotate"
        ]);

        return (
            <label className={className}>
                <input
                    type="checkbox"
                    id={id}
                    checked={isOn}
                    onChange={(event) => {
                        onChange?.(event.currentTarget.checked);
                    }}
                />
                <span className="swap-off fill-current">{offContent}</span>
                <span className="swap-on fill-current">{onContent}</span>
            </label>
        );
    }
}
