/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Container } from "./Container.js";
import {
    Portal, PortalCloseReason, type IPortalOptions, type IPortalProperties,
} from "./Portal.js";
import { ComponentPlacement, UIComponent } from "./UIComponent.js";
import { computeContentPosition } from "./html-helpers.js";
import { Orientation } from "./ui-types.js";

interface IPopupProperties extends IPortalProperties {
    /** Optional header rendered above the content. */
    header?: ComponentChild;

    /** Where to place the popup relative to the target. */
    placement?: ComponentPlacement;

    /** If set no automatic repositioning takes place. */
    pinned?: boolean;

    /** Focus the first interactive popup element when opened. */
    focusOnOpen?: boolean;

    /** Restore focus to the popup trigger after Escape or programmatic close. */
    restoreFocusOnClose?: boolean;

    /** Close when a pointer press starts outside the popup. Defaults to true. */
    dismissOnOutsideClick?: boolean;

    /** Whether to show the CSS arrow pointer. */
    showArrow?: boolean;

    /** Flex orientation of the popup content. */
    orientation?: Orientation;

    innerRef?: preact.RefObject<HTMLDivElement | null>;
}

interface IPopupState {
    /** The area for placement computation. */
    currentTarget?: DOMRect;
}

export type PopupAnchor = HTMLElement | DOMRect;

/**
 * A positioned popup built on {@link Portal}. Renders into a managed
 * DOM node in `document.body` with automatic stacking above
 * all other content (including native dialogs).
 *
 * ## Usage
 *
 * ```ts
 * const popupRef = createRef<Popup | null>();
 * popupRef.current?.open(targetRect, placement);
 * ```
 */
export class Popup extends UIComponent<IPopupProperties, IPopupState> {
    private static activePopup?: Popup;

    private portalRef = createRef<Portal | null>();
    private containerRef: preact.RefObject<HTMLDivElement | null>;
    private resizeObserver?: ResizeObserver;
    private anchorObserver?: MutationObserver;
    private anchorElement?: HTMLElement;
    private returnFocusElement?: HTMLElement;
    private positionFrame?: number;
    private outsideClickTimer?: ReturnType<typeof setTimeout>;

    public constructor(props: IPopupProperties) {
        super(props);

        this.state = {};
        this.containerRef = props.innerRef ?? createRef<HTMLDivElement | null>();
    }

    public override componentWillUnmount(): void {
        this.stopPositionTracking();
        if (Popup.activePopup === this) {
            Popup.activePopup = undefined;
        }
    }

    public render(): ComponentChild {
        const {
            id, children, header, showArrow = true, orientation = Orientation.TopDown,
            placement = ComponentPlacement.TopLeft,
        } = this.props;

        const className = this.generateFinalClassName([
            "popup",
            "visible",
            placement,
            this.classFromProperty(!showArrow, "noArrow"),
        ]);

        return (
            <Portal
                ref={this.portalRef}
                className="popupPortal"
                onOpen={this.handlePortalOpen}
                onClose={this.handlePortalClose}
            >
                <Container
                    id={id}
                    className={className}
                    innerRef={this.containerRef}
                    orientation={orientation}
                >
                    {header}
                    {children}
                </Container>
            </Portal>
        );
    }

    public get isOpen(): boolean {
        return this.portalRef.current?.isOpen ?? false;
    }

    /**
     * Opens the popup positioned relative to the given target rectangle.
     * Positioning is deferred until after the Portal has rendered the DOM.
     *
     * @param target The anchor element or its bounding rectangle.
     * @param options Additional options for the portal.
     */
    public open(target: PopupAnchor, options?: IPortalOptions): void {
        const anchorElement = target instanceof HTMLElement ? target : undefined;
        const currentTarget = anchorElement?.getBoundingClientRect() ?? target as DOMRect;
        const { restoreFocusOnClose = true } = this.props;

        this.anchorElement = anchorElement;
        this.returnFocusElement = restoreFocusOnClose
            ? anchorElement ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
            : undefined;

        this.setState({ currentTarget }, () => {
            const portal = this.portalRef.current;
            if (!portal) {
                return;
            }

            if (Popup.activePopup && Popup.activePopup !== this) {
                Popup.activePopup.closeWithReason(true, PortalCloseReason.Replaced);
            }

            Popup.activePopup = this;

            if (portal.isOpen) {
                this.startPositionTracking();
                this.schedulePositionUpdate();

                return;
            }

            portal.open({
                closeOnEscape: true,
                closeOnPortalClick: false,
                backgroundOpacity: 0,
                blockMouseEvents: false,
                ...options,
            });
        });
    }

    public close(cancelled: boolean): void {
        this.closeWithReason(cancelled, PortalCloseReason.Programmatic);
    }

    public get clientRect(): DOMRect | undefined {
        if (this.containerRef.current) {
            return this.containerRef.current.getBoundingClientRect();
        }

        return undefined;
    }

    public updatePosition(target: PopupAnchor): void {
        this.anchorElement = target instanceof HTMLElement ? target : undefined;
        const currentTarget = this.anchorElement?.getBoundingClientRect() ?? target as DOMRect;
        this.setState({ currentTarget }, this.schedulePositionUpdate);
    }

    private handlePortalClose = (cancelled: boolean, _portalProperties: IPortalProperties,
        reason: PortalCloseReason): void => {
        this.stopPositionTracking();

        if (Popup.activePopup === this) {
            Popup.activePopup = undefined;
        }

        const { restoreFocusOnClose = true } = this.props;
        const returnFocusElement = this.returnFocusElement;
        this.returnFocusElement = undefined;
        this.anchorElement = undefined;

        if (restoreFocusOnClose && reason !== PortalCloseReason.OutsideClick
            && reason !== PortalCloseReason.Replaced && returnFocusElement?.isConnected) {
            requestAnimationFrame(() => {
                if (returnFocusElement.isConnected) {
                    returnFocusElement.focus({ preventScroll: true });
                }
            });
        }

        const { onClose } = this.props;

        onClose?.(cancelled, this.props, reason);

    };

    private handlePortalOpen = (): void => {
        const { onOpen } = this.props;
        const { currentTarget } = this.state;

        if (currentTarget) {
            onOpen?.(this.props);

            if (this.containerRef.current) {
                this.positionPopup(currentTarget);
                this.startPositionTracking();
                this.focusPopup();
            }
        }
    };

    private positionPopup(target: DOMRect): void {
        const {
            placement = ComponentPlacement.TopLeft,
            showArrow = true,
            pinned = false,
        } = this.props;

        const popup = this.containerRef.current;
        if (!popup) {
            return;
        }

        const viewport = window.visualViewport;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        popup.style.setProperty("--popup-viewport-width", `${viewportWidth}px`);
        popup.style.setProperty("--popup-viewport-height", `${viewportHeight}px`);
        popup.classList.remove("edgeAttached", ...Object.values(ComponentPlacement));
        popup.classList.add(placement);

        if (!pinned && this.shouldAttachToEdge(target, popup)) {
            popup.classList.add("edgeAttached");
            popup.style.removeProperty("left");
            popup.style.removeProperty("top");

            return;
        }

        const { left, top } = computeContentPosition(placement, popup, target, showArrow ? 10 : 0, !pinned);
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    }

    private shouldAttachToEdge(target: DOMRect, popup: HTMLElement): boolean {
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        if (viewportWidth > 600) {
            return false;
        }

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const spaceAbove = Math.max(0, target.top - 8);
        const spaceBelow = Math.max(0, viewportHeight - target.bottom - 8);

        return popup.scrollHeight > Math.max(spaceAbove, spaceBelow);
    }

    private startPositionTracking(): void {
        this.stopPositionTracking();

        const { pinned = false } = this.props;
        document.addEventListener("pointerdown", this.handleOutsidePointerDown, true);
        this.outsideClickTimer = setTimeout(() => {
            this.outsideClickTimer = undefined;
            if (this.portalRef.current?.isOpen) {
                document.addEventListener("click", this.handleOutsideClick, true);
            }
        }, 0);

        if (pinned) {
            return;
        }

        document.addEventListener("scroll", this.handleViewportChange, true);
        window.addEventListener("resize", this.handleViewportChange);
        window.addEventListener("orientationchange", this.handleViewportChange);
        window.visualViewport?.addEventListener("resize", this.handleViewportChange);
        window.visualViewport?.addEventListener("scroll", this.handleViewportChange);

        if (this.containerRef.current) {
            this.resizeObserver = new ResizeObserver(this.schedulePositionUpdate);
            this.resizeObserver.observe(this.containerRef.current);
            if (this.anchorElement) {
                this.resizeObserver.observe(this.anchorElement);
                this.anchorObserver = new MutationObserver(() => {
                    if (this.anchorElement && !this.anchorElement.isConnected) {
                        this.close(true);
                    }
                });
                this.anchorObserver.observe(document.body, { childList: true, subtree: true });
            }
        }
    }

    private stopPositionTracking(): void {
        document.removeEventListener("pointerdown", this.handleOutsidePointerDown, true);
        document.removeEventListener("click", this.handleOutsideClick, true);
        if (this.outsideClickTimer !== undefined) {
            clearTimeout(this.outsideClickTimer);
            this.outsideClickTimer = undefined;
        }

        document.removeEventListener("scroll", this.handleViewportChange, true);
        window.removeEventListener("resize", this.handleViewportChange);
        window.removeEventListener("orientationchange", this.handleViewportChange);
        window.visualViewport?.removeEventListener("resize", this.handleViewportChange);
        window.visualViewport?.removeEventListener("scroll", this.handleViewportChange);
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.anchorObserver?.disconnect();
        this.anchorObserver = undefined;

        if (this.positionFrame !== undefined) {
            cancelAnimationFrame(this.positionFrame);
            this.positionFrame = undefined;
        }
    }

    private closeWithReason(cancelled: boolean, reason: PortalCloseReason): void {
        this.portalRef.current?.close(cancelled, reason);
    }

    private handleOutsidePointerDown = (event: PointerEvent): void => {
        this.dismissFromOutside(event);
    };

    private handleOutsideClick = (event: MouseEvent): void => {
        this.dismissFromOutside(event);
    };

    private dismissFromOutside(event: Event): void {
        const popup = this.containerRef.current;
        const eventPath = event.composedPath();
        if (!popup || eventPath.includes(popup)
            || this.isAnchorInteraction(event, eventPath)) {
            return;
        }

        const { dismissOnOutsideClick = true } = this.props;
        if (dismissOnOutsideClick) {
            this.closeWithReason(true, PortalCloseReason.OutsideClick);
        }
    }

    private isAnchorInteraction(event: Event, eventPath: EventTarget[]): boolean {
        const anchor = this.anchorElement;
        if (!anchor) {
            return false;
        }

        if (eventPath.includes(anchor)) {
            return true;
        }

        if (!(event instanceof MouseEvent)) {
            return false;
        }

        const bounds = anchor.getBoundingClientRect();

        return event.clientX >= bounds.left && event.clientX <= bounds.right
            && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    }

    private handleViewportChange = (): void => {
        this.schedulePositionUpdate();
    };

    private schedulePositionUpdate = (): void => {
        if (this.positionFrame !== undefined) {
            return;
        }

        this.positionFrame = requestAnimationFrame(() => {
            this.positionFrame = undefined;

            if (!this.portalRef.current?.isOpen) {
                return;
            }

            if (this.anchorElement && !this.anchorElement.isConnected) {
                this.close(true);

                return;
            }

            const target = this.anchorElement?.getBoundingClientRect() ?? this.state.currentTarget;
            if (target) {
                this.positionPopup(target);
            }
        });
    };

    private focusPopup(): void {
        const { focusOnOpen = false } = this.props;
        const popup = this.containerRef.current;

        if (!focusOnOpen || !popup) {
            return;
        }

        const focusTarget = popup.querySelector<HTMLElement>(
            "[autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled), "
            + "textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
        );

        if (focusTarget) {
            focusTarget.focus({ preventScroll: true });
        } else {
            popup.tabIndex = -1;
            popup.focus({ preventScroll: true });
        }
    }
};
