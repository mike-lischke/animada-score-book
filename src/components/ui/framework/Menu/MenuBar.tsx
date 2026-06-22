/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Button } from "../Button.js";
import { Icon } from "../Icon.js";
import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";
import { type IMenuItem } from "./MenuItem.js";
import { Menu } from "./Menu.js";

interface IMenuBarItem extends IMenuItem {
    /** The nested menu items shown when this top-level item is clicked. */
    children?: IMenuItem[];
}

interface IMenuBarProperties extends ICommonUIProperties {
    items: IMenuBarItem[];

    /** Called when a menu item is clicked (any level). */
    onItemClick?: (id: string) => void;
}

interface IMenuBarState {
    openMenuId: string;
}

/**
 * A horizontal bar of top-level items that each open a dropdown Menu.
 */
export class MenuBar extends UIComponent<IMenuBarProperties, IMenuBarState> {
    private menuRefs = new Map<string, preact.RefObject<Menu>>();

    public constructor(props: IMenuBarProperties) {
        super(props);

        this.state = {
            openMenuId: "",
        };
    }

    public render(): ComponentChild {
        const { id, items, style } = this.props;
        const { openMenuId } = this.state;
        const className = this.generateFinalClassName(["menuBar"]);

        return (
            <div
                id={id}
                className={className}
                style={{ ...style, display: "flex", alignItems: "center" }}
                onMouseLeave={() => {
                    this.setState({ openMenuId: "" });
                }}
            >
                {items.map((item) => {
                    const refKey = item.id;
                    let menuRef = this.menuRefs.get(refKey);

                    if (!menuRef) {
                        menuRef = createRef<Menu>();
                        this.menuRefs.set(refKey, menuRef);
                    }

                    const isOpen = openMenuId === item.id;

                    return (
                        <div
                            key={item.id}
                            onMouseEnter={() => {
                                if (openMenuId !== "") {
                                    this.setState({ openMenuId: item.id });
                                }
                            }}
                        >
                            <Button
                                imageOnly={!item.label && item.icon !== undefined}
                                onClick={() => {
                                    if (item.children) {
                                        this.setState({
                                            openMenuId: isOpen ? "" : item.id,
                                        }, () => {
                                            if (!isOpen) {
                                                menuRef.current?.open();
                                            }
                                        });
                                    }

                                    this.props.onItemClick?.(item.id);
                                }}
                            >
                                {item.icon && <Icon src={item.icon} />}
                                {item.label}
                            </Button>
                            {item.children && (
                                <Menu
                                    ref={menuRef}
                                    items={item.children}
                                    onItemClick={(childId) => {
                                        this.setState({ openMenuId: "" });
                                        this.props.onItemClick?.(childId);
                                    }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }
}
