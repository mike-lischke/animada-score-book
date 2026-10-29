/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, render } from "preact";

import { escapeStack } from "../../../supplement/EscapeStack.js";
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

export enum PortalCloseReason {
    Escape,
    OutsideClick,
    Replaced,
    Programmatic,

    /** Another layer took over the screen, so the portal had to make room. */
    Superseded,
}

export interface IPortalProperties extends ICommonUIProperties {
    /**
     * The element that hosts the portal. Defaults to document.body.
     */
    container?: HTMLElement;

    onOpen?: (props: IPortalProperties) => void;
    onClose?: (cancelled: boolean, props: IPortalProperties, reason: PortalCloseReason) => void;

    /** Called when Enter is pressed while this is the topmost portal. */
    onEnter?: (event: KeyboardEvent) => void;
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
 * to Enter, and Escape is handled by the global escape stack. Each new portal
 * receives an incrementally higher z-index.
 */
export class Portal extends UIComponent<IPortalProperties, IPortalState> {

    /** Stack of all currently open portals, for stacking and Enter handling. */
    private static portalStack = new Stack<Portal>();

    private host?: HTMLDivElement;

    public constructor(props: IPortalProperties) {
        super(props);

        this.state = {
            open: false,
            options: {},
        };
    }

    /**
     * Closes every open portal, e.g. when the sidebar takes over the screen. A portal that cannot be
     * closed by Escape is left alone, since it is meant to block the app.
     */
    public static closeAll(): void {
        // A copy, because closing removes the portals from the stack.
        for (const portal of [...Portal.portalStack]) {
            if (portal.state.options.closeOnEscape) {
                portal.close(true, PortalCloseReason.Superseded);
            }
        }
    }

    public override componentDidUpdate(): void {
        const { id, children, container = document.body } = this.props;
        const { open, options } = this.state;

        if (open) {
            if (!this.host) {
                const blockMouseEvents = options.blockMouseEvents ?? true;
                const className = this.generateFinalClassName([
                    "portal",
                    this.classFromProperty(blockMouseEvents, ["ignoreMouse", ""]),
                ]);

                this.host = document.createElement("div");
                if (id) {
                    this.host.id = id;
                }

                this.host.className = className;
                this.host.style.setProperty(
                    "--background-opacity", String(options.backgroundOpacity ?? 0.5),
                );

                this.host.addEventListener("mousedown", this.handlePortalMouseDown);
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

        const index = Portal.portalStack.findIndex((portal) => {
            return portal === this;
        });
        if (index >= 0) {
            Portal.portalStack.splice(index, 1);
        }

        escapeStack.remove(this.handleEscape);
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
                escapeStack.push(this.handleEscape);

                const { onOpen } = this.props;
                onOpen?.(this.props);
            });
        }
    }

    public close(cancelled: boolean, reason = PortalCloseReason.Programmatic): void {
        const { open } = this.state;

        if (open) {
            const { onClose } = this.props;

            onClose?.(cancelled, this.props, reason);

            this.setState({ open: false, options: {} });
            const index = Portal.portalStack.findIndex((portal) => {
                return portal === this;
            });

            if (index > -1) {
                Portal.portalStack.splice(index, 1);
            }

            escapeStack.remove(this.handleEscape);
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
            this.close(true, PortalCloseReason.OutsideClick);
        }
    };

    private handleEscape = (): void => {
        const { open, options } = this.state;

        if (open && options.closeOnEscape) {
            this.close(true, PortalCloseReason.Escape);
        }
    };

    static {
        // A single keydown handler for all portals. Enter is forwarded to the topmost portal's onEnter
        // callback (e.g. the dialog's default action). Escape runs through the escape stack, so that a
        // single press never closes more than one layer.
        document.body.addEventListener("keydown", (e: KeyboardEvent): void => {
            if (e.key !== "Enter" || Portal.portalStack.length === 0) {
                return;
            }

            Portal.portalStack.top?.props.onEnter?.(e);
        });
    }
}
