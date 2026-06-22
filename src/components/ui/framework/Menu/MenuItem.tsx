/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { Icon } from "../Icon.js";
import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";
import { Codicon } from "../Codicon.js";

export interface IMenuItem {
    id: string;
    label: string;
    icon?: Codicon;

    /** If true, shows a right-pointing arrow indicating a submenu. */
    hasSubMenu?: boolean;

    /** Use "-" as label for a separator line. */
    disabled?: boolean;
}

interface IMenuItemViewProperties extends ICommonUIProperties {
    item: IMenuItem;
}

/**
 * Renders a single menu item: label, optional icon, optional submenu arrow.
 * Set `item.label = "-"` and `item.disabled` for a separator.
 */
export class MenuItem extends UIComponent<IMenuItemViewProperties> {

    public render(): ComponentChild {
        const { id, item, style } = this.props;
        const { label, icon, hasSubMenu, disabled } = item;
        const isSeparator = label === "-";
        const className = this.generateFinalClassName([
            "menuItem",
            this.classFromProperty(disabled ?? isSeparator, "disabled"),
            this.classFromProperty(hasSubMenu ?? false, "submenu"),
            isSeparator ? "separator" : "",
        ]);

        if (isSeparator) {
            return (
                <div id={id} className={className} style={style} />
            );
        }

        return (
            <div id={id} className={className} style={style}>
                {icon && <Icon src={icon} />}
                <span>{label}</span>
                {hasSubMenu && (
                    <Icon src={Codicon.ChevronRight} style={{ marginLeft: "auto", fontSize: "12px" }} />
                )}
            </div>
        );
    }
}
