/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { MeasureLayout } from "../../../core/MeasureLayout.js";
import { clampValue } from "../../../core/utils.js";
import type { IScoreViewport } from "../../../supplement/Requisitions.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IScoreNavigatorProps extends ICommonUIProperties {
    /** Number of measures in the arrangement. */
    barCount: number;

    /** Column widths set for individual measures, keyed by 1-based measure number. */
    measureWidths?: ReadonlyMap<number, number>;

    /** The visible viewport of the score. */
    viewport: IScoreViewport;

    /** Reports a requested viewport position, 0..1 over the scrollable range. */
    onMove: (position: number) => void;
}

/**
 * A compact map of the score with a draggable viewport window. It navigates the score by scrolling and shows
 * no tracks, notes or selection, so it stays a thin navigation strip.
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
        const { className, barCount, measureWidths, viewport } = this.props;

        const columns = MeasureLayout.columns(barCount, measureWidths);
        const offsets = MeasureLayout.offsets(columns);
        const totalWidth = MeasureLayout.totalWidth(offsets) || 1;

        const ticks: ComponentChild[] = [];
        for (let bar = 1; bar <= barCount; bar++) {
            ticks.push(
                <div
                    key={bar}
                    className="scoreNavigatorTick"
                    style={{ left: `${(offsets[bar - 1] / totalWidth) * 100}%` }}
                />,
            );
        }

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
                {ticks}
                <div className="scoreNavigatorWindow" style={windowStyle} />
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
