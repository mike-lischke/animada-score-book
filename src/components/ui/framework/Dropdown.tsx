/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { type ICommonUIProperties, type MouseEventCallback, UIComponent } from "./UIComponent.js";
import { getNewId } from "../../../core/utils.js";

export interface IDropdownItem {
    label: string;
    onClick?: MouseEventCallback;
}

export interface IDropdownProperties extends ICommonUIProperties {
    caption: string;
    items: IDropdownItem[];
}

export class Dropdown extends UIComponent<IDropdownProperties> {
    public render(): ComponentChild {
        const { caption, items } = this.props;

        const children = items.map((item, index) => {
            return (
                <li key={index}>
                    <a onClick={item.onClick}>{item.label}</a>
                </li>
            );
        });

        const popoverId = `popover-${getNewId()}`;

        return (
            <>
                <button className="btn" popoverTarget={popoverId} style={{ anchorName: "--anchor-1" }}>
                    {caption}
                </button>

                <ul className="dropdown menu w-52 rounded-box bg-base-100 shadow-sm"
                    popover="auto" id={popoverId} style={{ positionAnchor: "--anchor-1" }}>
                    {children}
                </ul>
            </>
        );
    }
}
