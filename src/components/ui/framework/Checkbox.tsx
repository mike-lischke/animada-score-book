/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

interface ICheckboxProperties extends ICommonUIProperties {
    checked: boolean;
    onChange?: (checked: boolean) => void;
}

export class Checkbox extends UIComponent<ICheckboxProperties> {

    public static override defaultProps = {
        disabled: false,
    };

    public constructor(props: ICheckboxProperties) {
        super(props);
    }

    public render(): ComponentChild {
        const { id, checked, disabled, style } = this.props;
        const className = this.generateFinalClassName(["checkbox"]);

        return (
            <input
                id={id}
                type="checkbox"
                className={className}
                {...this.dataAttributes}
                checked={checked}
                disabled={disabled}
                style={style}
                onChange={this.handleChange}
            />
        );
    }

    private handleChange = (event: Event): void => {
        const { onChange } = this.props;

        const target = event.currentTarget as HTMLInputElement;
        onChange?.(target.checked);
    };
}
