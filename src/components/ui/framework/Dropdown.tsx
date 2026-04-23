/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { getNewId } from "../../../core/utils.js";
import { Button } from "./Button.js";
import { type ICommonUIProperties, type MouseEventCallback, UIComponent } from "./UIComponent.js";

export interface IDropdownItem {
    label?: string;
    icon?: ComponentChild;
    onClick?: MouseEventCallback;
}

export interface IDropdownProperties extends ICommonUIProperties {
    caption?: string;
    icon?: ComponentChild;
    selectedItem?: string;
    items: IDropdownItem[];

    /** If true, the dropdown closes automatically after an item is selected. Defaults to false. */
    closeOnSelect?: boolean;
}

export class Dropdown extends UIComponent<IDropdownProperties> {
    private anchorName = `--anchor-${getNewId()}`;
    private popoverId = `popover-${getNewId()}`;

    public render(): ComponentChild {
        const { caption, closeOnSelect, icon, items, selectedItem } = this.props;

        const children = items.map((item, index) => {
            return (
                <li
                    key={index}
                    className={item.label === selectedItem ? "selected" : ""}
                >
                    <a onClick={(e) => {
                        item.onClick?.(e);
                        if (closeOnSelect) {
                            document.getElementById(this.popoverId)?.hidePopover();
                        }
                    }}>
                        {item.icon && <span className="inline-flex w-6 h-6 items-center justify-center">
                            {item.icon}
                        </span>}
                        {item.label}
                    </a>
                </li>
            );
        });

        const defaultCaption = !caption && (icon === undefined) ? "Select an option" : undefined;
        const className = this.generateFinalClassName(["dropdownHost"]);

        return (
            <div className={className}>
                <Button
                    popoverTarget={this.popoverId}
                    style={{ anchorName: this.anchorName }}
                    imageOnly={!caption && icon !== undefined}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    {icon}
                    {caption ?? defaultCaption}
                </Button>

                <ul className="dropdown menu w-52 rounded-box bg-base-100 shadow-sm"
                    popover="auto"
                    id={this.popoverId}
                    style={{ positionAnchor: this.anchorName }}
                >
                    {children}
                </ul>
            </div>
        );
    }
}
