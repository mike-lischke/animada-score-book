/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

interface ISplitSliderProperties extends ICommonUIProperties {
    value: number;
    fillValue?: number;
    splitPoint: number;
    min?: number;
    max?: number;
    step?: number;

    /* Whether to show the filled portion of the track up to the current value. */
    showFill?: boolean;

    onChange?: (value: number) => void;
}

/** Slider with a visual split marker that divides the track into two zones. */
export class SplitSlider extends UIComponent<ISplitSliderProperties> {
    private trackRef = createRef<HTMLDivElement>();

    public render(): ComponentChild {
        const {
            id, value, fillValue, splitPoint, min = 0, max = 100, style, disabled,
            showFill = true,
        } = this.props;
        const className = this.generateFinalClassName([
            "slider-split",
            this.classFromProperty(disabled, "slider-split-disabled"),
        ]);

        const range = max - min;
        const splitPercent = ((splitPoint - min) / range) * 100;
        const valuePercent = ((value - min) / range) * 100;
        const currentFillValue = fillValue ?? value;
        const fillPercent = ((currentFillValue - min) / range) * 100;

        return (
            <div
                id={id}
                className={className}
                style={style}
                {...this.dataAttributes}
                role="slider"
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={value}
                aria-disabled={disabled}
                tabIndex={disabled ? -1 : 0}
                ref={this.trackRef}
                onPointerDown={this.handlePointerDown}
                onKeyDown={disabled ? undefined : this.handleKeyDown}
            >
                <div className="slider-split-track">
                    <div
                        className="slider-split-zone-left"
                        style={{ width: `${splitPercent}%` }}
                    />
                    <div
                        className="slider-split-zone-right"
                        style={{ width: `${100 - splitPercent}%` }}
                    />
                    {showFill && <div
                        className="slider-split-fill"
                        style={{ width: `${fillPercent}%` }}
                    />}
                    <div
                        className="slider-split-thumb"
                        style={{ left: `${valuePercent}%` }}
                    />
                    <div
                        className="slider-split-marker"
                        style={{ left: `${splitPercent}%` }}
                    />
                </div>
            </div>
        );
    }

    private handlePointerDown = (e: PointerEvent) => {
        const { disabled } = this.props;

        if (disabled) {
            return;
        }

        const track = this.trackRef.current;
        if (!track) {
            return;
        }

        track.setPointerCapture(e.pointerId);
        this.updateValueFromPointer(e);

        const onMove = (moveEvent: PointerEvent) => {
            this.updateValueFromPointer(moveEvent);
        };

        const onUp = () => {
            track.removeEventListener("pointermove", onMove);
            track.removeEventListener("pointerup", onUp);
        };

        track.addEventListener("pointermove", onMove);
        track.addEventListener("pointerup", onUp);

        e.stopPropagation();
    };

    private updateValueFromPointer(e: PointerEvent): void {
        const { min = 0, max = 100, step, onChange } = this.props;
        const track = this.trackRef.current;
        if (!track) {
            return;
        }

        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        let newValue = min + (ratio * (max - min));

        if (step !== undefined && step > 0) {
            newValue = Math.round(newValue / step) * step;
        }

        newValue = Math.max(min, Math.min(max, newValue));
        onChange?.(newValue);
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        const { min = 0, max = 100, value, step = 1, onChange } = this.props;
        let newValue = value;

        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            newValue = Math.min(max, value + step);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            newValue = Math.max(min, value - step);
        } else if (e.key === "Home") {
            newValue = min;
        } else if (e.key === "End") {
            newValue = max;
        } else {
            return;
        }

        e.preventDefault();
        onChange?.(newValue);
    };
}
