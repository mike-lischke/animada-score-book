/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";
import { ICommonUIProperties, UIComponent } from "./UIComponent.js";

export interface IPopoverSliderProperties extends ICommonUIProperties {
    value: number;
    min?: number;
    max?: number;
    step?: number;

    /**
     * Called when the slider value is committed (by pressing Enter, clicking outside, or clicking the trigger
     * button again).
     */
    onChange?: (value: number) => void;
}

interface IPopoverSliderState {
    open: boolean;
    internalValue: number;
}

export class PopoverSlider extends UIComponent<IPopoverSliderProperties, IPopoverSliderState> {
    public static override defaultProps = {
        min: 10,
        max: 300,
        step: 5,
    };

    private triggerRef = createRef<HTMLButtonElement>();
    private sliderRef = createRef<HTMLInputElement>();
    private popoverRef = createRef<HTMLDivElement>();

    public constructor(props: IPopoverSliderProperties) {
        super(props);

        this.state = {
            open: false,
            internalValue: props.value,
        };
    }

    public override componentDidUpdate(prevProps: IPopoverSliderProperties) {
        const { value } = this.props;
        const { open } = this.state;

        if (prevProps.value !== value && !open) {
            this.setState({ internalValue: value });
        }
    }

    public override componentDidMount() {
        document.addEventListener("mousedown", this.handleDocumentMouseDown);
    }

    public override componentWillUnmount() {
        document.removeEventListener("mousedown", this.handleDocumentMouseDown);
    }

    public override render(): ComponentChild {
        const { min = 0, max = 1, step = 0.1, style } = this.props;
        const { open, internalValue } = this.state;

        if (!open) {
            return null;
        }

        const idBase = "popover-slider";
        const className = this.generateFinalClassName([
            "popover-slider",
            "absolute z-50 mt-2",
        ]);

        return (
            <div
                ref={this.popoverRef}
                id={`${idBase}-popover`}
                role="dialog"
                aria-modal="false"
                class={className}
                style={style}
            >
                <div class="p-3 bg-base-100 rounded-box shadow-lg w-64 border border-base-300">
                    <input
                        ref={this.sliderRef}
                        id={`${idBase}-range`}
                        type="range"
                        class="range range-primary w-full"
                        min={min}
                        max={max}
                        step={step}
                        value={internalValue}
                        onInput={this.handleSliderInput}
                        onKeyDown={this.handleSliderKeyDown}
                    />
                </div>
            </div>
        );
    }

    public open = () => {
        this.setState({ open: true }, () => {
            this.sliderRef.current?.focus();
        });
    };

    public close = (commit: boolean) => {
        const { internalValue } = this.state;
        const { onChange } = this.props;

        this.setState({ open: false }, () => {
            this.triggerRef.current?.focus();
            if (commit && onChange) {
                onChange(internalValue);
            }
        });
    };

    private handleDocumentMouseDown = (ev: MouseEvent) => {
        const { open } = this.state;
        if (!open) {
            return;
        }

        const trigger = this.triggerRef.current;
        const slider = this.sliderRef.current;
        const target = ev.target as Node | null;

        if (!target) {
            return;
        }

        if (trigger?.contains(target)) {
            return;
        }

        if (slider?.parentElement?.contains(target)) {
            return;
        }

        // Click outside → close (commit)
        this.close(true);
    };

    private handleSliderInput = (ev: Event) => {
        const { min = 0, onChange } = this.props;

        const target = ev.currentTarget as HTMLInputElement;
        const value = Number(target.value || min);
        this.setState({ internalValue: value }, () => {
            onChange?.(value);
        });
    };

    private handleSliderKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
            ev.preventDefault();
            this.close(false);
        }
        if (ev.key === "Enter") {
            ev.preventDefault();
            this.close(true);
        }
    };
}
