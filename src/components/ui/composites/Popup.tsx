/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { UIComponent, ComponentPlacement, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Container } from "../framework/Container.js";
import { Orientation } from "../framework/ui-types.js";
import { Portal, type IPortalOptions } from "../framework/Portal.js";
import { computeContentPosition } from "../framework/html-helpers.js";

interface IPopupProperties extends ICommonUIProperties {
    /** Optional header rendered above the content. */
    header?: ComponentChild;

    /** Where to place the popup relative to the target. */
    placement?: ComponentPlacement;

    /** Whether to show the CSS arrow pointer. */
    showArrow?: boolean;

    /** Flex orientation of the popup content. */
    orientation?: Orientation;
}

interface IPopupState {
    visible: boolean;
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
    private portalRef = createRef<Portal>();
    private containerRef = createRef<HTMLDivElement>();

    /** The placement used for the current open call, for CSS class mapping. */
    private currentPlacement: ComponentPlacement = ComponentPlacement.BottomLeft;

    /** Stored target rect so positioning can happen after Portal renders. */
    private pendingTarget?: DOMRect;

    public constructor(props: IPopupProperties) {
        super(props);

        this.state = { visible: false };
    }

    public get isOpen(): boolean {
        const { visible } = this.state;

        return visible;
    }

    /**
     * Opens the popup positioned relative to the given target rectangle.
     * Positioning is deferred until after the Portal has rendered the DOM.
     *
     * @param target    The target element's bounding rectangle.
     * @param placement Where to place the popup relative to the target.
     */
    public open(target: DOMRect, placement?: ComponentPlacement): void {
        const { placement: propsPlacement } = this.props;

        this.currentPlacement = placement ?? propsPlacement ?? ComponentPlacement.BottomLeft;
        this.pendingTarget = target;
        this.setState({ visible: true });

        const options: IPortalOptions = {
            backgroundOpacity: 0,
            closeOnEscape: true,
            closeOnPortalClick: true,
        };

        this.portalRef.current?.open(options);
    }

    public close(): void {
        this.portalRef.current?.close(true);
        this.setState({ visible: false });
    }

    public render(): ComponentChild {
        const { children, header, showArrow, orientation } = this.props;
        const { visible } = this.state;

        const className = [
            "popup",
            visible ? "visible" : "",
            this.currentPlacement,
            showArrow === false ? "noArrow" : "",
        ].filter(Boolean).join(" ");

        return (
            <Portal
                ref={this.portalRef}
                onOpen={this.handlePortalOpen}
                onClose={this.handlePortalClose}
            >
                <Container
                    className={className}
                    innerRef={this.containerRef}
                    orientation={orientation ?? Orientation.TopDown}
                    onClick={(e: Event) => {
                        e.stopPropagation();
                    }}
                >
                    {header}
                    {visible && children}
                </Container>
            </Portal>
        );
    }

    private handlePortalOpen = (): void => {
        const el = this.containerRef.current;

        if (el && this.pendingTarget) {
            // Defer to the next animation frame so the browser has laid out
            // the popup before we measure its dimensions.
            requestAnimationFrame(() => {
                const { showArrow } = this.props;
                const { left, top } = computeContentPosition(
                    this.currentPlacement, el, this.pendingTarget!, showArrow ? 10 : 0, true,
                );
                el.style.left = `${left}px`;
                el.style.top = `${top}px`;
            });
        }
    };

    private handlePortalClose = (): void => {
        this.setState({ visible: false });
    };
}
