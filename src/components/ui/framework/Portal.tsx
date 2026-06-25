/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, render } from "preact";

import { Stack } from "../../../supplement/Stack.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

/** Options that can change on every open call. */
export interface IPortalOptions {
    /** Translucency of the background element (0..1, default: 0.5). */
    backgroundOpacity?: number;

    /** If true, close the portal when Escape is pressed (default: true). */
    closeOnEscape?: boolean;

    /** If true, close the portal when clicking the background area (default: false). */
    closeOnPortalClick?: boolean;

    /**
     * When true, mouse events are blocked from reaching elements behind the portal
     * (default: true).
     */
    blockMouseEvents?: boolean;
}

export interface IPortalProperties extends ICommonUIProperties {
    /**
     * The element that hosts the portal. Defaults to document.body.
     */
    container?: HTMLElement;

    onOpen?: (props: IPortalProperties) => void;
    onClose?: (cancelled: boolean, props: IPortalProperties) => void;
}

interface IPortalState {
    open: boolean;
    options: IPortalOptions;
}

/**
 * Renders children into a managed DOM node appended to an arbitrary parent
 * (default: `document.body`), ensuring correct stacking order.
 *
 * A static stack tracks all open portals. Only the topmost portal responds
 * to Escape. Each new portal receives an incrementally higher z-index.
 */
export class Portal extends UIComponent<IPortalProperties, IPortalState> {

    /** Stack of all currently open portals, for stacking and Escape handling. */
    private static portalStack = new Stack<Portal>();

    private host?: HTMLDivElement;

    public constructor(props: IPortalProperties) {
        super(props);

        this.state = {
            open: false,
            options: {},
        };
    }

    public override componentDidUpdate(): void {
        const { id, children, container = document.body } = this.props;
        const { open, options } = this.state;

        if (open) {
            if (!this.host) {
                const blockMouseEvents = options.blockMouseEvents ?? true;
                const className = [
                    "portal",
                    blockMouseEvents ? "" : "ignoreMouse",
                ].filter(Boolean).join(" ");

                this.host = document.createElement("div");
                if (id) {
                    this.host.id = id;
                }

                this.host.className = className;
                this.host.style.setProperty(
                    "--background-opacity", String(options.backgroundOpacity ?? 0.5),
                );

                this.host.addEventListener("mousedown", this.handlePortalMouseDown);
                this.host.addEventListener("wheel", this.handlePortalMouseWheel);
                container.appendChild(this.host);
            }
            render(children, this.host);
        } else {
            this.host?.remove();
            this.host = undefined;
        }
    }

    public override componentWillUnmount(): void {
        this.host?.remove();
        this.host = undefined;
    }

    public render(): ComponentChild {
        return null;
    }

    public get isOpen(): boolean {
        const { open } = this.state;

        return open;
    }

    public open(options?: IPortalOptions): void {
        const { open } = this.state;

        if (!open) {
            const activeOptions: IPortalOptions = {
                closeOnEscape: true,
                closeOnPortalClick: false,
                blockMouseEvents: true,
                ...options,
            };

            this.setState({ open: true, options: activeOptions }, () => {
                Portal.portalStack.push(this);

                const { onOpen } = this.props;
                onOpen?.(this.props);
            });
        }
    }

    public close(cancelled: boolean): void {
        const { open } = this.state;

        if (open) {
            const { onClose } = this.props;

            onClose?.(cancelled, this.props);

            this.setState({ open: false, options: {} });
            const index = Portal.portalStack.findIndex((portal) => {
                return portal === this;
            });

            if (index > -1) {
                Portal.portalStack.splice(index, 1);
            }
        }
    }

    /**
     * Handles mousedown on the portal background. Closes the portal
     * if `closeOnPortalClick` is enabled and the click target
     * is the background itself (not a child element).
     *
     * @param event The mouse event.
     */
    private handlePortalMouseDown = (event: MouseEvent): void => {
        const { open, options } = this.state;

        if (open && options.closeOnPortalClick && event.target === this.host) {
            this.close(true);
        }
    };

    private handlePortalMouseWheel = (event: WheelEvent): void => {
        const { open, options } = this.state;

        if (open && !options.blockMouseEvents) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    static {
        // A single keydown handler for all portals. Only the topmost
        // portal responds, respecting its closeOnEscape setting.
        document.body.addEventListener("keydown", (e: KeyboardEvent): void => {
            if (Portal.portalStack.length > 0 && e.key === "Escape") {
                const portal = Portal.portalStack.top;

                if (portal) {
                    const { options } = portal.state;

                    if (options.closeOnEscape) {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                        portal.close(true);
                    }
                }
            }
        });
    }
}
