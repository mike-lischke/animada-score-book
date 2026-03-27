/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIComponent } from "./UIComponent.js";
import { Container } from "./Container.js";

export interface IDrawerSidebarProps {
    id: string;
    open: boolean;

    /** Shows the sidebar permanently, ignoring the `open` state. */
    alwaysOpen?: boolean;

    siderbarContent: ComponentChild;

    onOpenChange?: (open: boolean) => void;
}

export class DrawerSidebar extends UIComponent<IDrawerSidebarProps> {
    public render(): ComponentChild {
        const { id, open, alwaysOpen, siderbarContent, children } = this.props;

        return (
            <div id={id} className={`drawer ${alwaysOpen ? "drawer-open" : ""}`}>
                <input id={`${id}-toggle`} type="checkbox" className="drawer-toggle" checked={open} />
                <div className="drawer-content">
                    {children}
                </div>
                <div className="drawer-side">
                    <label htmlFor={`${id}-toggle`} aria-label="close sidebar" className="drawer-overlay" />
                    <Container className="drawer-sidebar-content">
                        {siderbarContent}
                    </Container>
                </div>
            </div>
        );
    }
}
