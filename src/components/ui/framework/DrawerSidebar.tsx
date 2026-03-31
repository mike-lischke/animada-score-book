/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, TargetedEvent } from "preact";

import { UIComponent } from "./UIComponent.js";
import { Container } from "./Container.js";
import { Orientation } from "./ui-types.js";

export interface IDrawerSidebarProps {
    id: string;
    open: boolean;

    /** Shows the sidebar permanently, ignoring the `open` state. */
    alwaysOpen?: boolean;

    sidebarContent: ComponentChild;

    onOpenChange?: (open: boolean) => void;
}

export class DrawerSidebar extends UIComponent<IDrawerSidebarProps> {
    public render(): ComponentChild {
        const { id, open, alwaysOpen, sidebarContent, children } = this.props;

        return (
            <div id={id} className={`drawer ${alwaysOpen ? "drawer-open" : ""}`}>
                <input
                    id={`${id}-toggle`}
                    type="checkbox"
                    className="drawer-toggle"
                    checked={open}
                    onChange={this.handleOnChange}
                />
                <Container
                    className="drawer-content"
                    orientation={Orientation.TopDown}
                >
                    {children}
                </Container>
                <div className="drawer-side">
                    <label htmlFor={`${id}-toggle`} aria-label="close sidebar" className="drawer-overlay" />
                    <Container className="drawer-sidebar-content">
                        {sidebarContent}
                    </Container>
                </div>
            </div>
        );
    }

    /**
     * Handles user clicks on the drawer toggle checkbox (which usually means the checkbox becomes unchecked,
     * i.e. the drawer is closed).
     *
     * @param e The event object
     */
    private handleOnChange = (e: TargetedEvent<HTMLInputElement>) => {
        const { onOpenChange } = this.props;

        onOpenChange?.(e.currentTarget.checked);
    };
}
