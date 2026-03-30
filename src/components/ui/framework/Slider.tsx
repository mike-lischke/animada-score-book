/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { clampValue } from "../../../core/utils.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { Container } from "./Container.js";
import { Orientation } from "./ui-types.js";

interface ISliderProperties extends ICommonUIProperties {
    vertical?: boolean;
    handleSize?: number;

    value: number;
    min?: number;
    max?: number;
    step?: number;

    orientation?: "increasing" | "decreasing";

    onChange?: (value: number) => void;
}

export class Slider extends UIComponent<ISliderProperties> {

    public static override defaultProps = {
        disabled: false,
        vertical: false,
        handleSize: 30,
        orientation: "increasing",
    };

    private sliderRef = createRef<HTMLInputElement>();

    public constructor(props: ISliderProperties) {
        super(props);
    }

    public override componentDidMount(): void {
        if (this.sliderRef.current) {
            this.applyValue();
            this.sliderRef.current.style.setProperty("--handle-size", `${this.props.handleSize}px`);
        }
    }

    public override componentDidUpdate(): void {
        const { handleSize } = this.props;

        if (this.sliderRef.current) {
            this.applyValue();
            this.sliderRef.current.style.setProperty("--handle-size", `${handleSize ?? 0}px`);
        }
    }

    public render(): ComponentChild {
        const { id, vertical, "data-tooltip": dataTooltip } = this.props;
        const className = this.generateFinalClassName([
            "slider",
            this.classFromProperty(vertical, "vertical"),
        ]);

        return (
            <div
                id={id}
                ref={this.sliderRef}
                className={className}
                data-tooltip={dataTooltip}
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.handlePointerUp}
            >
                <Container // Slider body.
                    className="body"
                    orientation={vertical ? Orientation.TopDown : Orientation.LeftToRight}
                    data-tooltip="inherit"
                >
                    <div
                        className="handle"
                        data-tooltip="inherit"
                    />
                </Container>
            </div>
        );
    }

    private handlePointerDown = (e: PointerEvent): void => {
        this.handleItemPointerMove(e);

        const target = e.currentTarget as HTMLElement;
        target.onpointermove = this.handleItemPointerMove;
        target.setPointerCapture(e.pointerId);
    };

    private handlePointerUp = (e: PointerEvent): void => {
        const target = e.currentTarget as HTMLElement;
        target.onpointermove = null;
        target.releasePointerCapture(e.pointerId);
    };

    private handleItemPointerMove = (e: PointerEvent): void => {
        if (this.sliderRef.current) {
            const { vertical, orientation, min = 0, max = 1, step, onChange } = this.props;

            const bounds = this.sliderRef.current.getBoundingClientRect();
            let value;
            if (vertical) {
                value = clampValue((e.clientY - bounds.y) / bounds.height, 0, 1);
            } else {
                value = clampValue((e.clientX - bounds.x) / bounds.width, 0, 1);
            }

            // Convert value to user space, snap to step if necessary and compute new internal value.
            let realValue = value * (max - min);
            if (step) {
                realValue = Math.round(realValue / step) * step;
            }
            value = realValue / (max - min);

            // Convert value to client range and update CSS variable for slider fill.
            this.sliderRef.current.style.setProperty("--current-value", `${100 * value}%`);

            if (orientation === "decreasing") {
                realValue = max - realValue;
            }

            onChange?.(realValue);
        }
    };

    private applyValue(): void {
        if (this.sliderRef.current) {
            const { value, orientation, min = 0, max = 1, step } = this.props;
            let newValue = clampValue(value, min, max);
            if (step) {
                newValue = Math.round(newValue / step) * step;
            }
            newValue = (newValue - min) / (max - min);

            const displayValue = orientation === "decreasing" ? 1 - newValue : newValue;
            this.sliderRef.current.style.setProperty("--current-value", `${100 * displayValue}%`);
        }
    }
}
