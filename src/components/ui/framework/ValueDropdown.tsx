/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { getNewId } from "../../../core/utils.js";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import { UIIcon } from "./UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface IValueDropdownProperties extends ICommonUIProperties {
    /** The selected value. */
    value: number;

    /** The values the menu offers, in display order. */
    values: readonly number[];

    /** Invoked with the value the user picked. */
    onChange: (value: number) => void;

    /** Formats a value for the trigger and the menu. Defaults to the plain number. */
    formatValue?: (value: number) => string;
}

/**
 * A compact chooser: the current value beside a round button with a double chevron, which opens the list of the
 * allowed values. The button sits in its own circle while the control is at rest; on hover the value and the
 * button share one pill.
 */
export class ValueDropdown extends UIComponent<IValueDropdownProperties> {
    private readonly popoverId = `value-dropdown-${getNewId()}`;
    private readonly anchorName = `--value-dropdown-${getNewId()}`;

    public override render(): ComponentChild {
        const { id, value, title, disabled } = this.props;
        const caption = this.format(value);

        const items = this.menuValues().map((item) => {
            const className = item === value ? "selected" : undefined;

            return (
                <li key={item} className={className}>
                    <a
                        tabIndex={0}
                        onClick={() => {
                            this.select(item);
                        }}
                    >
                        {this.format(item)}
                    </a>
                </li>
            );
        });

        return (
            <div id={id} className={this.generateFinalClassName(["value-dropdown"])}>
                <Button
                    className="value-dropdown-trigger"
                    popoverTarget={disabled ? undefined : this.popoverId}
                    style={{ anchorName: this.anchorName }}
                    title={title}
                    disabled={disabled}
                    onClick={(event) => {
                        event.stopPropagation();
                    }}
                    {...this.dataAttributes}
                >
                    <span className="value-dropdown-value">{caption}</span>
                    <span className="value-dropdown-chevron" aria-hidden="true">
                        <Icon src={UIIcon.ChevronUp} />
                        <Icon src={UIIcon.ChevronDown} />
                    </span>
                </Button>
                <ul
                    className="du-dropdown du-menu dropdown-popup value-dropdown-menu"
                    popover="auto"
                    id={this.popoverId}
                    style={{ positionAnchor: this.anchorName }}
                >
                    {items}
                </ul>
            </div>
        );
    }

    /**
     * @param value The value to render.
     *
     * @returns The value as the caller wants it shown.
     */
    private format(value: number): string {
        const { formatValue } = this.props;

        return formatValue === undefined ? String(value) : formatValue(value);
    }

    /**
     * @returns The offered values, with the current one added when the list does not hold it.
     */
    private menuValues(): number[] {
        const { value, values } = this.props;
        if (values.includes(value)) {
            return [...values];
        }

        return [...values, value].sort((a, b) => {
            return a - b;
        });
    }

    /**
     * @param value The value the user picked.
     */
    private select(value: number): void {
        const { onChange } = this.props;

        document.getElementById(this.popoverId)?.hidePopover();
        if (value !== this.props.value) {
            onChange(value);
        }
    }
}
