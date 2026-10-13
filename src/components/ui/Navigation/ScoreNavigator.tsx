/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { clampValue } from "../../../core/utils.js";
import type { IScoreViewport } from "../../../supplement/Requisitions.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IScoreNavigatorProps extends ICommonUIProperties {
    /** The visible viewport of the score. */
    viewport: IScoreViewport;

    /** Reports a requested viewport position, 0..1 over the scrollable range. */
    onMove: (position: number) => void;
}

/**
 * A horizontal scrollbar for navigating the visible score viewport.
 */
export class ScoreNavigator extends UIComponent<IScoreNavigatorProps> {
    private railRef = createRef<HTMLDivElement | null>();

    private activePointerId?: number;
    private dragOffset = 0;

    public override componentWillUnmount(): void {
        document.removeEventListener("pointermove", this.handlePointerMove);
        document.removeEventListener("pointerup", this.handlePointerUp);
        document.removeEventListener("pointercancel", this.handlePointerUp);
    }

    public override render(): ComponentChild {
        const { className, viewport } = this.props;

        const windowStyle = {
            left: `${viewport.position * (1 - viewport.width) * 100}%`,
            width: `${viewport.width * 100}%`,
        };

        return (
            <div
                ref={this.railRef}
                className={this.generateFinalClassName(["scoreNavigator", className])}
                onPointerDown={this.handlePointerDown}
                {...this.dataAttributes}
            >
                <div className="scoreNavigatorTrack">
                    <div className="scoreNavigatorWindow" style={windowStyle} />
                </div>
            </div>
        );
    }

    private handlePointerDown = (event: PointerEvent): void => {
        const rail = this.railRef.current;
        if (!rail || event.button !== 0) {
            return;
        }

        const rect = rail.getBoundingClientRect();
        if (rect.width <= 0) {
            return;
        }

        const { viewport } = this.props;
        const windowLeft = viewport.position * (1 - viewport.width);
        const fraction = (event.clientX - rect.left) / rect.width;

        if (fraction >= windowLeft && fraction <= windowLeft + viewport.width) {
            this.dragOffset = fraction - windowLeft;
        } else {
            // A press outside the window centers the window on the pressed position.
            this.dragOffset = viewport.width / 2;
            this.moveTo(fraction - this.dragOffset);
        }

        this.activePointerId = event.pointerId;
        rail.setPointerCapture(event.pointerId);
        document.addEventListener("pointermove", this.handlePointerMove);
        document.addEventListener("pointerup", this.handlePointerUp);
        document.addEventListener("pointercancel", this.handlePointerUp);

        event.preventDefault();
    };

    private handlePointerMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.activePointerId) {
            return;
        }

        const rail = this.railRef.current;
        if (!rail) {
            return;
        }

        const rect = rail.getBoundingClientRect();
        if (rect.width <= 0) {
            return;
        }

        this.moveTo(((event.clientX - rect.left) / rect.width) - this.dragOffset);

        event.preventDefault();
    };

    private handlePointerUp = (event: PointerEvent): void => {
        if (event.pointerId !== this.activePointerId) {
            return;
        }

        this.activePointerId = undefined;
        document.removeEventListener("pointermove", this.handlePointerMove);
        document.removeEventListener("pointerup", this.handlePointerUp);
        document.removeEventListener("pointercancel", this.handlePointerUp);
    };

    private moveTo(windowLeftFraction: number): void {
        const { viewport, onMove } = this.props;

        const maxLeft = Math.max(0, 1 - viewport.width);
        const left = clampValue(windowLeftFraction, 0, maxLeft);
        onMove(maxLeft > 0 ? clampValue(left / maxLeft, 0, 1) : 0);
    }
}
