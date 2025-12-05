/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./styles.css";

import { Component, type ComponentChildren, type CSSProperties } from "preact";
import cx from "classnames";

// Click events can also be triggered using the keyboard.
export type ClickEventCallback = (e: MouseEvent | KeyboardEvent) => void;
export type MouseEventCallback = (e: MouseEvent) => void;
export type KeyboardEventCallback = (e: KeyboardEvent) => void;
export type PointerEventCallback = (e: PointerEvent) => void;
export type DragEventCallback = (e: DragEvent) => void;

export interface ICommonUIProperties {
    children?: ComponentChildren;

    /** Properties that are available on any HTML element: */

    className?: string;
    id?: string;
    style?: CSSProperties;
    tabIndex?: number;
    draggable?: boolean;
    disabled?: boolean;
    role?: string;

    /** For OS style tooltips. */
    title?: string;

    /** Some often used input events: */

    /** Clicks can be triggered by both mouse and keyboard events. */
    onClick?: ClickEventCallback;
    onDoubleClick?: MouseEventCallback;
    onKeyDown?: KeyboardEventCallback;
    onKeyUp?: KeyboardEventCallback;
    onKeyPress?: KeyboardEventCallback;

}

export abstract class UIComponent<P extends ICommonUIProperties = {}, S = {}>
    extends Component<P, S> {
    /**
     * Takes the given base class names (CSS classe names) and combines them with the class name of the component.
     * It automatically handles undefined values.
     *
     * @param base The base names for a given component.
     *
     * @returns A string with CSS class names derived from a default and the given names.
     */
    protected generateFinalClassName(base: Array<string | undefined>): string {
        const { className } = this.props;

        return cx(
            base,
            className
        );
    }

    /**
     * @returns The class name or undefined, depending on the truthiness of the value.
     *
     * @param value A value that must be truthy to return a class name.
     * @param c A single class name or a list of class names.
     *          If a list is given and the value is a boolean then the first entry is used for false,
     *         the second for true. If the value is a number then the entry at that index is used.
     *         If the value is a string then it is returned only if it is contained in the list.
     */
    protected classFromProperty(value: boolean | number | string | undefined,
        c: string | string[]): string | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (c instanceof Array) {
            if (typeof value === "string") {
                return c.includes(value) ? value : undefined;
            }

            if (typeof value === "boolean") {
                return c[value ? 1 : 0];
            }

            return c[value];
        } else if (value === false || value === 0 || value === "") {
            return undefined;
        }

        return c;
    }
}
