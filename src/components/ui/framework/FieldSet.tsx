/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface IFieldSetProperties extends ICommonUIProperties {
    legend: ComponentChild;
}

export class FieldSet extends UIComponent<IFieldSetProperties> {
    public override render(): ComponentChild {
        const { id, legend, children, style } = this.props;

        const className = this.generateFinalClassName([
            "fieldset",
            "bg-base-100",
            "border-base-300/70",
            "rounded-box",
            "border",
            "p-4"
        ]);

        return (
            <fieldset id={id} className={className} style={style}>
                <legend className="fieldset-legend">{legend}</legend>
                {children}
            </fieldset>

        );
    }
}
