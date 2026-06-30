/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Container } from "./Container.js";
import { Portal, type IPortalOptions, type IPortalProperties } from "./Portal.js";
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

    /** Whether to show the CSS arrow pointer. */
    showArrow?: boolean;

    /** Flex orientation of the popup content. */
    orientation?: Orientation;

    innerRef?: preact.RefObject<HTMLDivElement>;
}

interface IPopupState {
    hidden: boolean;         // Used to temporarily hide the popup on scroll.
    currentTarget?: DOMRect; // The area for placement computation.
}

/**
 * A positioned popup built on {@link Portal}. Renders into a managed
 * DOM node in `document.body` with automatic stacking above
 * all other content (including native dialogs).
 *
 * ## Usage
 *
 * ```ts
 * const popupRef = createRef<Popup>();
 * popupRef.current?.open(targetRect, placement);
 * ```
 */
export class Popup extends UIComponent<IPopupProperties, IPopupState> {

    public static override defaultProps = {
        placement: ComponentPlacement.TopLeft,
        pinned: false,
        showArrow: true,
        orientation: Orientation.TopDown,
    };

    private portalRef = createRef<Portal>();
    private containerRef: preact.RefObject<HTMLDivElement>;
    private resizeObserver?: ResizeObserver;

    public constructor(props: IPopupProperties) {
        super(props);

        this.state = { hidden: false };
        this.containerRef = props.innerRef ?? createRef<HTMLDivElement>();
    }

    public override componentWillUnmount(): void {
        this.stopResizeObserver();
    }

    public render(): ComponentChild {
        const { id, children, header, showArrow, orientation, placement } = this.props;

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
     * @param currentTarget The target element's bounding rectangle.
     * @param options Additional options for the portal.
     */
    public open(currentTarget: DOMRect, options?: IPortalOptions): void {
        this.setState({ currentTarget }, () => {
            this.portalRef.current?.open({
                closeOnEscape: true,
                closeOnPortalClick: true,
                backgroundOpacity: 0,
                ...options,
            });
        });
    }

    public close(cancelled: boolean): void {
        this.portalRef.current?.close(cancelled);
    }

    public get clientRect(): DOMRect | undefined {
        if (this.containerRef.current) {
            return this.containerRef.current.getBoundingClientRect();
        }

        return undefined;
    }

    public updatePosition(newTarget: DOMRect): void {
        this.setState({ currentTarget: newTarget }, this.handlePortalOpen);
    }

    private handlePortalClose = (cancelled: boolean): void => {
        this.stopResizeObserver();

        const { onClose } = this.props;

        onClose?.(cancelled, this.props);

    };

    private handlePortalOpen = (): void => {
        const { onOpen } = this.props;
        const { currentTarget } = this.state;

        if (currentTarget) {
            onOpen?.(this.props);

            if (this.containerRef.current) {
                this.positionPopup(currentTarget);
                this.startResizeObserver(currentTarget);
            }
        }
    };

    private positionPopup(target: DOMRect): void {
        const { placement, showArrow, pinned } = this.props;

        if (this.containerRef.current && placement) {
            const { left, top } = computeContentPosition(placement, this.containerRef.current, target,
                showArrow ? 10 : 0, !pinned);
            this.containerRef.current.style.left = `${left}px`;
            this.containerRef.current.style.top = `${top}px`;
        }
    }

    private startResizeObserver(target: DOMRect): void {
        this.stopResizeObserver();

        if (this.containerRef.current) {
            this.resizeObserver = new ResizeObserver(() => {
                this.positionPopup(target);
            });
            this.resizeObserver.observe(this.containerRef.current);
        }
    }

    private stopResizeObserver(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
    }
};
