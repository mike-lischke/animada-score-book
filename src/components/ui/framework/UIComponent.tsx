/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./component-styles.scss";

import cx from "classnames";
import {
    Component, type AriaRole, type ComponentChildren, type CSSProperties, type GenericEventHandler,
    type WheelEventHandler
} from "preact";

import type { ISubscribable, Subscription } from "../../../core/types/general.js";

// Click events can also be triggered using the keyboard.
export type ClickEventCallback = (e: MouseEvent | KeyboardEvent) => void;
export type MouseEventCallback = (e: MouseEvent) => void;
export type KeyboardEventCallback = (e: KeyboardEvent) => void;
export type PointerEventCallback = (e: PointerEvent) => void;
export type DragEventCallback = (e: DragEvent) => void;

/**
 * The component placement determines at which of the 12 places relative to a given target rectangle or position
 * a floating HTML element is located.
 *```
 *                      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
 *                      │   Top Left    │ │  Top Center   │ │   Top Right   │
 *                      └───────────────┘ └───────────────┘ └───────────────┘
 *   ┌───────────────┐  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ┌───────────────┐
 *   │   Left Top    │  ┃                                                   ┃  │  Right Top    │
 *   └───────────────┘  ┃                                                   ┃  └───────────────┘
 *   ┌───────────────┐  ┃                                                   ┃  ┌───────────────┐
 *   │  Left Center  │  ┃                    target rect                    ┃  │  Right Center │
 *   └───────────────┘  ┃                                                   ┃  └───────────────┘
 *   ┌───────────────┐  ┃                                                   ┃  ┌───────────────┐
 *   │  Left Bottom  │  ┃                                                   ┃  │  Right Bottom │
 *   └───────────────┘  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  └───────────────┘
 *                      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
 *                      │  Bottom Left  │ │ Bottom Center │ │ Bottom Right  │
 *                      └───────────────┘ └───────────────┘ └───────────────┘
 *```
 * Additionally, content is also aligned depending on the target place, like shown in the ASCII art. That means it is
 * not possible to get mixed positions, like content element in the bottom right corner, but with its center instead
 * of the right side.
 */
export enum ComponentPlacement {
    TopLeft = "top-start",
    TopCenter = "top",
    TopRight = "top-end",

    RightTop = "right-start",
    RightCenter = "right",
    RightBottom = "right-end",

    BottomLeft = "bottom-start",
    BottomCenter = "bottom",
    BottomRight = "bottom-end",

    LeftTop = "left-start",
    LeftCenter = "left",
    LeftBottom = "left-end",
}

export interface ICommonUIProperties {
    children?: ComponentChildren;

    /** Properties that are available on any HTML element: */

    className?: string;
    id?: string;
    style?: CSSProperties;
    tabIndex?: number;
    draggable?: boolean;
    disabled?: boolean;
    role?: AriaRole;
    type?: string;

    /** For OS style tooltips. */
    title?: string;

    /** Tooltip text to show in a custom tooltip. */
    "data-tooltip"?: string;

    /** Accessible label, equivalent to the alt attribute on images. */
    alt?: string;

    /** Some often used input events: */

    /** Clicks can be triggered by both mouse and keyboard events. */
    onClick?: ClickEventCallback;
    onDblClick?: MouseEventCallback;
    onKeyDown?: KeyboardEventCallback;
    onKeyUp?: KeyboardEventCallback;
    onKeyPress?: KeyboardEventCallback;
    onPointerDown?: PointerEventCallback;
    onPointerUp?: PointerEventCallback;
    onPointerMove?: PointerEventCallback;
    onPointerEnter?: PointerEventCallback;
    onPointerLeave?: PointerEventCallback;
    onDragStart?: DragEventCallback;
    onDragEnd?: DragEventCallback;

    onScroll?: GenericEventHandler<HTMLElement>;
    onWheel?: WheelEventHandler<HTMLElement>;
}

export abstract class UIComponent<P extends ICommonUIProperties = {}, S = {}>
    extends Component<P, S> {

    private subscriptionHandlers: Array<[boolean, () => void]> = [];

    public override componentWillUnmount(): void {
        this.subscriptionHandlers.forEach(([, unsubscribe]) => {
            unsubscribe();
        });
        this.subscriptionHandlers = [];
    }

    /**
     * Adds a new subscription to a subscribable and automatically unsubscribes it when the component is unmounted.
     *
     * @param subscribable The subscribable to subscribe to.
     * @param subscription  The subscription callback to subscribe.
     * @param removeAtUpdate Whether to remove the subscription at next component update.
     */
    public addSubscription(subscribable: ISubscribable, subscription: Subscription, removeAtUpdate = false): void {
        this.subscriptionHandlers.push([removeAtUpdate, subscribable.subscribe(subscription)]);
    }

    /**
     * Removes a subscription that was added using addSubscription.
     *
     * @param subscribable The subscribable to unsubscribe from.
     * @param subscription The subscription callback to unsubscribe.
     */
    public removeSubscription(subscribable: ISubscribable, subscription: Subscription): void {
        this.subscriptionHandlers = this.subscriptionHandlers.filter(([, unsubscribe]) => {
            if (unsubscribe === subscribable.subscribe(subscription)) {
                unsubscribe();

                return false;
            }

            return true;
        });
    }

    public override componentDidUpdate(previousProps: Readonly<P>, previousState: Readonly<S>,
        snapshot?: unknown): void {
        this.subscriptionHandlers = this.subscriptionHandlers.filter(([removeAtUpdate, unsubscribe]) => {
            if (removeAtUpdate) {
                unsubscribe();

                return false;
            }

            return true;
        });
    }

    /**
     * Takes the given base class names (CSS class names) and combines them with the class name of the component.
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

    /** @returns An object with all `data-*` props, ready to be spread onto a DOM element. */
    protected dataAttributes(): Record<string, string | number | undefined> {
        return Object.fromEntries(
            Object.entries(this.props).filter(([key]) => {
                return key.startsWith("data-");
            }),
        ) as Record<string, string | number | undefined>;
    }
}
