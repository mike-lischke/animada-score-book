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

/**
 * Supplies live placement bounds while a popup remains anchored to a DOM element. Returning undefined means the
 * anchor is currently out of view: the popup hides until the provider reports bounds again.
 */
export type PopupBoundsProvider = () => DOMRect | undefined;

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
    dismissOnEscape?: boolean;

    persistent?: boolean;

    /** Whether to show the CSS arrow pointer. */
    showArrow?: boolean;

    /** Distance between the popup and its target, in px. */
    offset?: number;

    /** Supplies live placement bounds; undefined while the anchor is out of view, which hides the popup. */
    boundsProvider?: PopupBoundsProvider;

    /**
     * The area a pointer press counts as an interaction with the anchor, e.g. the view that holds the anchor's
     * elements. Defaults to the anchor element: a popup that belongs to a whole view — the score a selection
     * sits in — states that view, so a press beside the anchor is not dismissed as if it were outside.
     */
    anchorArea?: HTMLElement;

    /** Flex orientation of the popup content. */
    orientation?: Orientation;

    innerRef?: preact.RefObject<HTMLDivElement | null>;
}

interface IPopupState {
    /** The area for placement computation. */
    currentTarget?: DOMRect;
}

/**
 * A positioned popup built on {@link Portal}. Renders into a managed
 * DOM node in `document.body` with automatic stacking above
 * all other content (including native dialogs).
 *
 * ## Usage
 *
 * ```ts
 * const popupRef = createRef<Popup | null>();
 * popupRef.current?.open(targetElement);
 * popupRef.current?.openAtRect(targetRect);
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

    /** Whether the anchor left the view, which hides the popup while it stays open. */
    private anchorOffscreen = false;

    /** Whether the next placement is applied without a transition, because the popup is placed from scratch. */
    private instantPlacement = true;

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
     * Opens the popup positioned relative to the given live target element.
     * Positioning is deferred until after the Portal has rendered the DOM.
     *
     * @param target The live DOM element the popup is anchored to.
     * @param options Additional options for the portal.
     */
    public open(target: HTMLElement, options?: IPortalOptions): void {
        const { restoreFocusOnClose = true } = this.props;

        this.openPopup(this.resolveBounds(target), target, options, restoreFocusOnClose);
    }

    /**
     * Opens the popup relative to static viewport bounds without a live DOM anchor.
     *
     * @param target The viewport rectangle for placement.
     * @param options Additional options for the portal.
     */
    public openAtRect(target: DOMRect, options?: IPortalOptions): void {
        const { restoreFocusOnClose = true } = this.props;

        this.openPopup(target, undefined, options, restoreFocusOnClose);
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

    public updatePosition(target: HTMLElement): void {
        const { boundsProvider, anchorArea } = this.props;
        if (this.anchorElement !== target) {
            if (this.anchorElement && this.anchorElement !== anchorArea) {
                this.resizeObserver?.unobserve(this.anchorElement);
            }

            this.anchorElement = target;
            this.resizeObserver?.observe(target);
        }

        // A provider is asked again for every placement, so only the mode without one needs the bounds in state.
        if (boundsProvider === undefined) {
            this.setState({ currentTarget: this.resolveBounds(target) }, this.schedulePositionUpdate);
        } else {
            this.schedulePositionUpdate();
        }
    }

    private openPopup(currentTarget: DOMRect | undefined, anchorElement: HTMLElement | undefined,
        options: IPortalOptions | undefined, restoreFocusOnClose: boolean): void {
        const { persistent = false, dismissOnEscape } = this.props;
        this.anchorElement = anchorElement;
        this.anchorOffscreen = false;
        this.instantPlacement = true;
        this.returnFocusElement = restoreFocusOnClose
            ? anchorElement ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
            : undefined;

        this.setState({ currentTarget }, () => {
            const portal = this.portalRef.current;
            if (!portal) {
                return;
            }

            if (!persistent) {
                if (Popup.activePopup && Popup.activePopup !== this) {
                    Popup.activePopup.closeWithReason(true, PortalCloseReason.Replaced);
                }

                Popup.activePopup = this;
            }

            if (portal.isOpen) {
                this.startPositionTracking();
                this.schedulePositionUpdate();

                return;
            }

            portal.open({
                closeOnPortalClick: false,
                backgroundOpacity: 0,
                blockMouseEvents: false,
                ...options,
                closeOnEscape: dismissOnEscape ?? (persistent ? false : options?.closeOnEscape ?? true),
            });
        });
    }

    private handlePortalClose = (cancelled: boolean, _portalProperties: IPortalProperties,
        reason: PortalCloseReason): void => {
        const popupProperties = this.props;
        const { restoreFocusOnClose = true, onClose } = popupProperties;
        this.stopPositionTracking();

        if (Popup.activePopup === this) {
            Popup.activePopup = undefined;
        }

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

        onClose?.(cancelled, popupProperties, reason);

    };

    private handlePortalOpen = (): void => {
        const popupProperties = this.props;
        const { onOpen } = popupProperties;
        const { currentTarget } = this.state;

        onOpen?.(popupProperties);

        if (!this.containerRef.current) {
            return;
        }

        // Bounds are missing while the anchor is out of view: the popup opens hidden and is placed as soon as they
        // are reported again, which is what makes it come back when its anchor is scrolled into view.
        this.setAnchorOffscreen(currentTarget === undefined);
        this.startPositionTracking();

        if (currentTarget) {
            this.positionPopup(currentTarget);
        }

        this.focusPopup();
    };

    private resolveBounds(fallback?: HTMLElement): DOMRect | undefined {
        const { boundsProvider } = this.props;
        if (boundsProvider !== undefined) {
            return boundsProvider();
        }

        return (this.anchorElement ?? fallback)?.getBoundingClientRect();
    }

    private positionPopup(target: DOMRect): void {
        const {
            placement = ComponentPlacement.TopLeft,
            showArrow = true,
            pinned = false,
            offset = showArrow ? 10 : 0,
        } = this.props;

        const popup = this.containerRef.current;
        if (!popup) {
            return;
        }

        popup.classList.remove("offscreen");
        const viewport = window.visualViewport;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        popup.style.setProperty("--popup-viewport-width", `${viewportWidth}px`);
        popup.style.setProperty("--popup-viewport-height", `${viewportHeight}px`);
        popup.classList.remove("edgeAttached", ...Object.values(ComponentPlacement));
        popup.classList.add(placement);

        if (!pinned && this.shouldAttachToEdge(target, popup)) {
            popup.classList.remove("positioned");
            popup.classList.add("edgeAttached");
            popup.style.removeProperty("left");
            popup.style.removeProperty("top");

            return;
        }

        const { left, top } = computeContentPosition(placement, popup, target, offset, !pinned);

        // The placement the popup opens with, and the one that follows the anchor having left the view, is applied
        // without a transition: the popup must not travel in from where it was placed before. The class that
        // animates the later placements follows a frame later, hence not in the same style recalculation.
        if (this.instantPlacement) {
            this.instantPlacement = false;
            popup.classList.remove("positioned");
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
            requestAnimationFrame(() => {
                this.containerRef.current?.classList.add("positioned");
            });

            return;
        }

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

    private setAnchorOffscreen(offscreen: boolean): void {
        if (this.anchorOffscreen === offscreen) {
            return;
        }

        this.anchorOffscreen = offscreen;
        if (offscreen) {
            // The placement that follows is applied without a transition, so the popup does not travel back in.
            this.instantPlacement = true;
        }

        this.containerRef.current?.classList.toggle("offscreen", offscreen);
    }

    private startPositionTracking(): void {
        this.stopPositionTracking();

        const { pinned = false, persistent = false, anchorArea } = this.props;
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
            if (anchorArea) {
                this.resizeObserver.observe(anchorArea);
            }

            if (this.anchorElement) {
                this.resizeObserver.observe(this.anchorElement);
            }

            if (this.anchorElement && !persistent) {
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
        const { persistent = false } = this.props;
        if (persistent) {
            return;
        }

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
        const { anchorArea } = this.props;
        const anchor = anchorArea ?? this.anchorElement;
        if (!anchor) {
            return false;
        }

        if (eventPath.includes(anchor)) {
            return true;
        }

        if (!(event instanceof MouseEvent)) {
            return false;
        }

        // The placement bounds say where the popup hangs and may be as narrow as a single point, so what counts as
        // a press on the anchor is the area of the element the popup hangs on.
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
            const { boundsProvider, persistent = false } = this.props;
            const { currentTarget } = this.state;
            this.positionFrame = undefined;

            if (!this.portalRef.current?.isOpen) {
                return;
            }

            if (!persistent && this.anchorElement && !this.anchorElement.isConnected) {
                this.close(true);

                return;
            }

            const target = boundsProvider !== undefined
                ? boundsProvider()
                : this.anchorElement?.getBoundingClientRect() ?? currentTarget;
            if (target === undefined) {
                this.setAnchorOffscreen(true);

                return;
            }

            this.setAnchorOffscreen(false);
            this.positionPopup(target);
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
