/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

interface ISliderProperties extends ICommonUIProperties {
    vertical?: boolean;

    value: number;
    min?: number;
    max?: number;
    step?: number;

    onChange?: (value: number) => void;
}

export class Slider extends UIComponent<ISliderProperties> {

    public static override defaultProps = {
        disabled: false,
        vertical: false,
    };

    private sliderRef = createRef<HTMLInputElement>();

    public render(): ComponentChild {
        const { id, vertical, min, max, value, style, onChange } = this.props;

        const className = this.generateFinalClassName([
            "range",
            this.classFromProperty(vertical, "vertical"),
        ]);

        return (
            <input
                id={id}
                ref={this.sliderRef}
                className={className}
                {...this.dataAttributes}
                type="range"
                min={min}
                max={max}
                value={value}
                style={style}
                onChange={(e) => {
                    const newValue = parseFloat(e.currentTarget.value);
                    onChange?.(newValue);
                }}
            />
        );
    }
}
