/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { type ICommonUIProperties, type MouseEventCallback, UIComponent } from "./UIComponent.js";
import type { Orientation } from "./ui-types.js";

export interface IButtonProperties extends ICommonUIProperties {
    innerRef?: preact.RefObject<HTMLButtonElement>;

    /** The caption of the button. Alternatively you can add a text child instead. */
    caption?: string;

    /**
     * If set, the outline of the button becomes a circle. This is usually used with image-only buttons only.
     * Different styling rules apply.
     */
    round?: boolean;
    orientation?: Orientation;

    /** When set it is assumed there's only a single (image) child. Different styling rules apply. */
    imageOnly?: boolean;

    /** Marks this button as default on a dialog. Different styling rules apply. */
    isDefault?: boolean;

    focusOnClick?: boolean;

    /** The value to returned if the button is used in a form/dialog. */
    name?: string;

    value?: string;

    popoverTarget?: string;

    onContextMenu?: MouseEventCallback;
}

export class Button extends UIComponent<IButtonProperties> {
    private buttonRef: preact.RefObject<HTMLButtonElement>;

    public constructor(props: IButtonProperties) {
        super(props);

        this.buttonRef = props.innerRef ?? createRef<HTMLButtonElement>();
    }

    public render(): ComponentChild {
        const {
            id, children, caption, style, orientation, round, imageOnly, disabled, isDefault, title, role,
            name, value, popoverTarget, onClick
        } = this.props;
        const className = this.generateFinalClassName([
            "btn",
            this.classFromProperty(round, "btn-circle"),
            this.classFromProperty(imageOnly, "imageOnly"),
            this.classFromProperty(disabled, "btn-disabled"),
            this.classFromProperty(isDefault, "default"),
        ]);

        const content = children ?? caption;
        const newStyle = {
            ...style,
            flexDirection: orientation,
        };

        const button = <button
            id={id}
            ref={this.buttonRef}
            style={newStyle}
            className={className}
            title={title}
            disabled={disabled}
            role={role}
            name={name}
            value={value}
            {...this.dataAttributes()}
            popoverTarget={popoverTarget}
            onClick={onClick}
        >
            {content}
        </button>;

        return button;
    }
}
