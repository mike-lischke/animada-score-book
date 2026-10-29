/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type CSSProperties, createRef } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import type { IPoint } from "../../../core/types/general.js";
import { clampValue } from "../../../core/utils.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

/** The UI setting a floating bar's dragged place is remembered in. */
export type FloatingBarPositionSetting = "toolsBarPosition" | "modeBarPosition";

export interface IFloatingBarState {
    /** Where the bar was dragged to, in px inside the overlay it floats in. Absent means its default place. */
    position?: IPoint;

    /** Where the bar is drawn, clamped to the room the overlay offers. */
    placement?: IPoint;
}

/**
 * A bar that floats in its overlay: a pointer down on its handle drags it, the overlay's edges clamp it and the
 * overlay's other surfaces stay free. Subclasses state where the bar sits before it was ever dragged.
 */
export abstract class FloatingBar<P extends ICommonUIProperties<unknown>, S extends IFloatingBarState>
    extends UIComponent<P, S> {
    /** The bar's own element, whose place a drag states and whose area bounds the drag. */
    protected readonly hostRef = createRef<HTMLDivElement | null>();

    /** The UI setting the dragged place is remembered in. */
    protected abstract readonly positionSetting: FloatingBarPositionSetting;

    private resizeObserver?: ResizeObserver;

    /** The pointer the running drag belongs to, absent while the bar stays put. */
    private dragPointerId?: number;

    /** Offset from the bar's top-left corner to the pointer, as taken when the drag started. */
    private dragOffset: IPoint = { x: 0, y: 0 };

    /** The areas of the overlay's other surfaces, taken when the drag starts: the bar keeps them free. */
    private obstacles: DOMRect[] = [];

    public override componentDidMount(): void {
        this.restorePosition();
        this.observeLayout();
        this.updateLayout();
    }

    public override componentWillUnmount(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.endDrag();
    }

    /** Fits the bar into its overlay. Subclasses extend the fit before the bar is placed. */
    protected updateLayout(): void {
        const host = this.hostRef.current;
        const overlay = host?.offsetParent;
        if (host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const overlayWidth = overlay.clientWidth;
        const overlayHeight = overlay.clientHeight;
        const width = host.offsetWidth;
        const height = host.offsetHeight;
        if (overlayWidth === 0 || overlayHeight === 0 || width === 0 || height === 0) {
            return;
        }

        const place = this.state.position ?? this.defaultPlacement(width, height, overlayWidth);
        const placement = {
            x: clampValue(place.x, 0, Math.max(0, overlayWidth - width)),
            y: clampValue(place.y, 0, Math.max(0, overlayHeight - height)),
        };

        const current = this.state.placement;
        if (current?.x !== placement.x || current.y !== placement.y) {
            this.setState({ placement });
        }
    }

    /** @returns The style that places the bar, or undefined while the overlay offered no place yet. */
    protected placementStyle(): CSSProperties | undefined {
        const { placement } = this.state;
        if (placement === undefined) {
            return undefined;
        }

        return { left: `${placement.x}px`, top: `${placement.y}px`, right: "auto" };
    }

    protected readonly handlePointerDown = (event: PointerEvent): void => {
        const host = this.hostRef.current;
        const overlay = host?.offsetParent ?? null;
        const target = event.target;
        if (host === null || !(overlay instanceof HTMLElement) || !(target instanceof HTMLElement)
            || !this.isDragHandle(target)) {
            return;
        }

        const hostRect = host.getBoundingClientRect();
        this.dragOffset = { x: event.clientX - hostRect.left, y: event.clientY - hostRect.top };
        this.dragPointerId = event.pointerId;
        this.obstacles = FloatingBar.obstaclesIn(overlay, host);

        // Capturing keeps the score from reacting to the pointer while the bar is on the move.
        host.setPointerCapture(event.pointerId);
        document.addEventListener("pointermove", this.handlePointerMove);
        document.addEventListener("pointerup", this.handleDragEnd);
        document.addEventListener("pointercancel", this.handleDragEnd);

        event.preventDefault();
    };

    /**
     * @param target The element the pointer went down on.
     *
     * @returns True when that element takes the bar.
     */
    protected abstract isDragHandle(target: HTMLElement): boolean;

    /**
     * @param barWidth The width of the bar.
     * @param barHeight The height of the bar.
     * @param overlayWidth The width of the overlay the bar floats in.
     *
     * @returns The place the bar takes while it was not dragged.
     */
    protected abstract defaultPlacement(barWidth: number, barHeight: number, overlayWidth: number): IPoint;

    /**
     * @param position The position the pointer states, in px inside the overlay.
     * @param bar The area the bar takes.
     * @param overlay The area of the overlay the bar floats in.
     *
     * @returns The position the bar can take, as close to the stated one as the overlay allows.
     */
    private static clampPlacement(position: IPoint, bar: DOMRect, overlay: DOMRect): IPoint {
        return {
            x: clampValue(position.x, 0, Math.max(0, overlay.width - bar.width)),
            y: clampValue(position.y, 0, Math.max(0, overlay.height - bar.height)),
        };
    }

    /**
     * @param position The place inside the overlay.
     * @param bar The area the bar takes.
     * @param overlay The area of the overlay the bar floats in.
     *
     * @returns The area the place covers, in viewport coordinates.
     */
    private static areaAt(position: IPoint, bar: DOMRect, overlay: DOMRect): DOMRect {
        const left = overlay.left + position.x;
        const top = overlay.top + position.y;

        return {
            x: left,
            y: top,
            width: bar.width,
            height: bar.height,
            top,
            right: left + bar.width,
            bottom: top + bar.height,
            left,
            toJSON: () => {
                return {};
            },
        };
    }

    /**
     * @param overlay The overlay the bar floats in.
     * @param host The bar's own element, which is no obstacle to itself.
     *
     * @returns The areas of the overlay's other surfaces, in viewport coordinates.
     */
    private static obstaclesIn(overlay: HTMLElement, host: HTMLElement): DOMRect[] {
        const obstacles: DOMRect[] = [];

        for (const sibling of overlay.children) {
            // A readout the pointer passes through is no obstacle, only a surface the user works with is.
            if (sibling === host || !(sibling instanceof HTMLElement)
                || getComputedStyle(sibling).pointerEvents === "none") {
                continue;
            }

            const rect = sibling.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                obstacles.push(rect);
            }
        }

        return obstacles;
    }

    /**
     * @param place The area the bar would take, in viewport coordinates.
     * @param obstacles The areas the bar has to keep free.
     *
     * @returns True when the area covers one of them.
     */
    private static coversObstacle(place: DOMRect, obstacles: DOMRect[]): boolean {
        return obstacles.some((rect) => {
            return place.left < rect.right && place.right > rect.left
                && place.top < rect.bottom && place.bottom > rect.top;
        });
    }

    /** Watches the surfaces whose size decides the bar's place. */
    private observeLayout(): void {
        const host = this.hostRef.current;
        const overlay = host?.offsetParent;
        if (typeof ResizeObserver === "undefined" || host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        this.resizeObserver = new ResizeObserver(() => {
            this.updateLayout();
        });
        this.resizeObserver.observe(overlay);
        this.resizeObserver.observe(host);
    }

    private handlePointerMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.dragPointerId) {
            return;
        }

        const host = this.hostRef.current;
        const overlay = host?.offsetParent ?? null;
        if (host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const hostRect = host.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        // The bar keeps the offset the pointer took it at and the stated place is what the clamp makes of it.
        const position = FloatingBar.clampPlacement({
            x: event.clientX - this.dragOffset.x - overlayRect.left,
            y: event.clientY - this.dragOffset.y - overlayRect.top,
        }, hostRect, overlayRect);

        const place = FloatingBar.areaAt(position, hostRect, overlayRect);
        if (FloatingBar.coversObstacle(place, this.obstacles)) {
            return;
        }

        this.setState({ position, placement: position });
        event.preventDefault();
    };

    private handleDragEnd = (event: PointerEvent): void => {
        if (event.pointerId !== this.dragPointerId) {
            return;
        }

        const { position } = this.state;
        this.endDrag();

        if (position !== undefined) {
            AppStorage.saveSetting(this.positionSetting, position);
        }
    };

    /** Ends the running drag: the bar no longer follows a pointer and its listeners are gone. */
    private endDrag(): void {
        this.dragPointerId = undefined;
        document.removeEventListener("pointermove", this.handlePointerMove);
        document.removeEventListener("pointerup", this.handleDragEnd);
        document.removeEventListener("pointercancel", this.handleDragEnd);
    }

    /**
     * Puts the bar where the last drag left it. A place the overlay no longer offers — the window shrank, a
     * surface now covers it — is dropped, so the bar falls back to its default place.
     */
    private restorePosition(): void {
        const stored = AppStorage.loadUISettings()?.[this.positionSetting];
        const host = this.hostRef.current;
        const overlay = host?.offsetParent ?? null;
        if (stored === undefined || host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const hostRect = host.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        const clamped = FloatingBar.clampPlacement(stored, hostRect, overlayRect);
        const place = FloatingBar.areaAt(clamped, hostRect, overlayRect);
        if (FloatingBar.coversObstacle(place, FloatingBar.obstaclesIn(overlay, host))) {
            return;
        }

        // The stored place stays the preference; the layout clamps it again when the overlay is smaller now.
        this.setState({ position: stored });
    }
}
