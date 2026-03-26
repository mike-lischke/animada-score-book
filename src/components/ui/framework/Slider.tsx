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
    value: number;
    vertical?: boolean;
    handleSize?: number;

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

    public set value(newValue: number) {
        const { onChange } = this.props;

        newValue = clampValue(newValue, 0, 1);
        this.setState({ currentValue: newValue });

        this.sliderRef.current?.style.setProperty("--current-value", `${100 * newValue}%`);

        onChange?.(newValue);
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
            const { vertical, orientation, onChange } = this.props;

            const bounds = this.sliderRef.current.getBoundingClientRect();
            let value;
            if (vertical) {
                value = clampValue((e.clientY - bounds.y) / bounds.height, 0, 1);
            } else {
                value = clampValue((e.clientX - bounds.x) / bounds.width, 0, 1);
            }

            this.sliderRef.current.style.setProperty("--current-value", `${100 * value}%`);

            if (orientation === "decreasing") {
                value = 1 - value;
            }

            onChange?.(value);
        }
    };

    private applyValue(): void {
        if (this.sliderRef.current) {
            const { value, orientation } = this.props;

            const displayValue = orientation === "decreasing" ? 1 - value : value;
            this.sliderRef.current.style.setProperty("--current-value", `${100 * displayValue}%`);
        }
    }
}
