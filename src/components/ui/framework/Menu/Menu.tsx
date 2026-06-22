/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./Menu.css";

import { ComponentChild } from "preact";

import { Button } from "../Button.js";
import { Icon } from "../Icon.js";
import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";
import { getNewId } from "../../../../core/utils.js";
import { Codicon } from "../Codicon.js";
import { type IMenuItem, MenuItem } from "./MenuItem.js";

interface IMenuProperties extends ICommonUIProperties {
    /** The menu items (including separators). */
    items: IMenuItem[];

    /** Shown as the trigger button caption when used standalone. */
    caption?: string;

    /** Shown as the trigger button icon when used standalone. */
    icon?: Codicon;

    /** Called when an item is clicked. The item id is passed. */
    onItemClick?: (id: string) => void;
}

interface IMenuState {
    open: boolean;
}

/**
 * A vertical popup menu. Uses the native popover API for positioning.
 *
 * Can be used standalone (renders a trigger button) or embedded
 * in a MenuBar (the MenuBar controls open/close via ref).
 */
export class Menu extends UIComponent<IMenuProperties, IMenuState> {
    private popoverId = `menu-popover-${getNewId()}`;
    private anchorName = `--menu-anchor-${getNewId()}`;

    public constructor(props: IMenuProperties) {
        super(props);

        this.state = {
            open: false,
        };
    }

    public render(): ComponentChild {
        const { id, caption, icon, items, style } = this.props;
        const triggerShown = (caption ?? icon) !== undefined;
        const className = this.generateFinalClassName(["menuHost"]);

        return (
            <div id={id} className={className} style={style}>
                {triggerShown && (
                    <div style={{ anchorName: this.anchorName }}>
                        <Button
                            className="du-btn-ghost"
                            popoverTarget={this.popoverId}
                            imageOnly={!caption && icon !== undefined}
                            onClick={(e) => {
                                e.stopPropagation();
                            }}
                        >
                            {icon && <Icon src={icon} />}
                            {caption}
                        </Button>
                    </div>
                )}

                <div
                    className="menu du-dropdown du-menu rounded-box bg-base-100 shadow-sm"
                    id={this.popoverId}
                    popover="auto"
                    style={{ positionAnchor: this.anchorName }}
                    onKeyDown={this.handleKeyDown}
                    onToggle={this.handlePopoverToggle}
                >
                    {items.map((item) => {
                        return (
                            <div
                                key={item.id}
                                onClick={() => {
                                    if (!item.disabled && item.label !== "-") {
                                        this.props.onItemClick?.(item.id);
                                        this.close();
                                    }
                                }}
                            >
                                <MenuItem item={item} />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    public open(): void {
        this.setState({ open: true });
    }

    public close(): void {
        const popover = document.getElementById(this.popoverId);

        if (popover && typeof (popover as HTMLElement & { hidePopover?: () => void; }).hidePopover === "function") {
            (popover as HTMLElement & { hidePopover: () => void; }).hidePopover();
        }

        this.setState({ open: false });
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
            this.close();
        }
    };

    private handlePopoverToggle = (e: Event): void => {
        const popover = e.target as HTMLElement;

        this.setState({ open: popover.matches(":popover-open") });
    };
}
