/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { CSSProperties } from "preact";
import { Component, type ComponentChildren } from "preact";
import cx from "classnames";

export interface IComponentProperties {
    children?: ComponentChildren;

    /** Additional class names to apply for this component. */
    className?: string;
    id?: string;
    style?: CSSProperties;
    tabIndex?: number;
    draggable?: boolean;
    disabled?: boolean;
    role?: string;

    /** For OS style tooltips. */
    title?: string;
}

export interface IComponentState {
    // Nothing in this base component.
}

export abstract class ComponentBase<P extends IComponentProperties = {}, S extends IComponentState = {}>
    extends Component<P, S> {
    /**
     * Constructs a CSS class name value out of the given base names, the framework class name,
     * some properties and any user supplied names.
     *
     * @param base The base names for a given component.
     *
     * @returns A string with CSS class names derived from a default and the given names.
     */
    protected getEffectiveClassNames(base: Array<string | undefined>): string {
        const { className } = this.props;

        return cx(
            base,
            className
        );
    }

    /**
     * Conditionally returns a CSS class name from a list of names or a single name.
     *
     * @param value A value that must be truthy to return a class name.
     * @param c A single class name or a list of class names. If the value is a boolean, the list must have two entries.
     *
     * @returns The class name or undefined, depending on the truthiness of the value.
     */
    protected classFromProperty(value: unknown, c: string | string[]): string | undefined {
        if (value == null) {
            return undefined;
        }

        if (c instanceof Array) {
            if (typeof value === "boolean") {
                return c[value ? 1 : 0];
            }

            return c[value as number];
        } else if (value === false || value === 0 || value === "") {
            return undefined;
        }

        return c;
    }
}
