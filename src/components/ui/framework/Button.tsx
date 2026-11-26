/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef, type JSX } from "preact";

import { type ICommonUIProperties, type MouseEventCallback, UIComponent } from "./UIComponent.js";
import type { Orientation } from "./ui-types.js";

export interface IButtonProperties extends ICommonUIProperties<JSX.IntrinsicElements["button"]["role"]> {
    innerRef?: preact.RefObject<HTMLButtonElement | null>;

    /** The caption of the button. Alternatively you can add a text child instead. */
    caption?: string;

    /**
     * If set, the outline of the button becomes a circle. This is usually used with image-only buttons only.
     * Different styling rules apply.
     */
    round?: boolean;
    orientation?: Orientation;

    /** Uses a compact, stable 40 px control height. Image-only buttons are square. */
    compact?: boolean;

    /** When set it is assumed there's only a single (image) child. Different styling rules apply. */
    imageOnly?: boolean;

    /** Marks this button as default on a dialog. Different styling rules apply. */
    isDefault?: boolean;

    /** Whether pointer activation should move focus to the button. Defaults to preserving the current focus. */
    focusOnClick?: boolean;

    /** The value to returned if the button is used in a form/dialog. */
    name?: string;

    value?: string;

    /** Pressed state of a toggle button. Rendered as the `aria-pressed` attribute, which names the property. */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "aria-pressed"?: boolean;

    /** Expanded state of a disclosure button, as in an accordion header. */
    ariaExpanded?: boolean;

    /** The element a disclosure button controls. */
    ariaControls?: string;

    /**
     * The accessible name of the button, when the caption or the title is not what a screen reader should say. A
     * button with a visible caption needs none; an image-only button falls back to its title.
     */
    ariaLabel?: string;

    popoverTarget?: string;

    /**
     * When set, the daisyUI style variants (circle, disabled, primary) are omitted, so only the
     * base `btn`/`du-btn` classes remain and the button can be styled entirely through custom CSS.
     */
    plain?: boolean;

    onContextMenu?: MouseEventCallback;
}

export class Button extends UIComponent<IButtonProperties> {
    private buttonRef: preact.RefObject<HTMLButtonElement | null>;

    public constructor(props: IButtonProperties) {
        super(props);

        this.buttonRef = props.innerRef ?? createRef<HTMLButtonElement | null>();
    }

    public render(): ComponentChild {
        const {
            id, children, caption, style, orientation, round, compact, imageOnly, disabled, isDefault, title, role,
            name, type, value, popoverTarget, onClick, plain, "aria-pressed": ariaPressed, ariaExpanded, ariaControls,
            ariaLabel,
        } = this.props;

        const className = this.generateFinalClassName([
            "btn",
            "du-btn",
            this.classFromProperty(!plain && round, "du-btn-circle"),
            this.classFromProperty(compact, "compact"),
            this.classFromProperty(imageOnly, "imageOnly"),
            this.classFromProperty(!plain && disabled, "du-btn-disabled"),
            this.classFromProperty(!plain && isDefault, "du-btn-primary"),
        ]);

        const content = children ?? caption;

        // An image-only button carries its caption in the title, which is the last resort a screen reader falls back
        // to. Naming it explicitly makes the tooltip text its accessible name, which every assistive technology reads.
        const accessibleName = ariaLabel ?? (imageOnly ? title : undefined);

        const newStyle = {
            ...style,
            flexDirection: orientation,
        };

        const button = <button
            id={id}
            ref={this.buttonRef}
            type={type as HTMLButtonElement["type"]}
            style={newStyle}
            className={className}
            title={title}
            disabled={disabled}
            role={role}
            name={name}
            value={value}
            aria-label={accessibleName}
            aria-pressed={ariaPressed}
            aria-expanded={ariaExpanded}
            aria-controls={ariaControls}
            {...this.dataAttributes}
            popoverTarget={popoverTarget}
            onClick={onClick}
            onMouseDown={this.handleMouseDown}
            onPointerDown={this.handleMouseDown}
        >
            {content}
        </button>;

        return button;
    }

    private handleMouseDown = (e: MouseEvent | PointerEvent): void => {
        const { focusOnClick } = this.props;
        if (focusOnClick) {
            this.buttonRef.current?.focus();
        } else {
            e.preventDefault();
        }

        e.stopPropagation();
    };
}
