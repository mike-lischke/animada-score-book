/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef } from "preact";
import { Button } from "./Button.js";
import { ICommonUIProperties, UIComponent } from "./UIComponent.js";

export interface IPopoverSliderProperties extends ICommonUIProperties {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;

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
        if (prevProps.value !== this.props.value && !this.state.open) {
            this.setState({ internalValue: this.props.value });
        }
    }

    public override componentDidMount() {
        document.addEventListener("mousedown", this.handleDocumentMouseDown);
    }

    public override componentWillUnmount() {
        document.removeEventListener("mousedown", this.handleDocumentMouseDown);
    }

    public override render(
        { min = 10, max = 300, step = 5, label, "data-tooltip": dataTooltip }: IPopoverSliderProperties,
        { open, internalValue }: IPopoverSliderState
    ) {
        const idBase = "popover-slider";

        return (
            <div
                class="relative inline-block"
                data-tooltip={dataTooltip}
            >
                <Button
                    innerRef={this.triggerRef}
                    id={`${idBase}-trigger`}
                    className="
                        bg-transparent border-none shadow-none underline underline-offset-2 decoration-dashed
                        hover:decoration-2 p-1 h-auto"
                    aria-haspopup="dialog"
                    aria-expanded={open ? "true" : "false"}
                    aria-controls={`${idBase}-popover`}
                    data-tooltip="inherit"
                    onClick={this.handleTriggerClick}
                >
                    {label && <span class="mr-1">{label}</span>}
                    <span class="mr-1 text-base-content/70 align-baseline text-base" data-tooltip="inherit">
                        {internalValue}
                    </span>
                </Button>

                {open && (
                    <div
                        ref={this.popoverRef}
                        id={`${idBase}-popover`}
                        role="dialog"
                        aria-modal="false"
                        class="absolute z-50 mt-2 left-1/2 -translate-x-1/2"
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
                )}
            </div>
        );

    }

    private open = () => {
        this.setState({ open: true }, () => {
            this.sliderRef.current?.focus();
        });
    };

    private close = (commit: boolean) => {
        const { internalValue } = this.state;
        const { onChange } = this.props;

        this.setState({ open: false }, () => {
            this.triggerRef.current?.focus();
            if (commit && onChange) {
                onChange(internalValue);
            }
        });
    };

    private handleTriggerClick = () => {
        const { open } = this.state;
        if (open) {
            this.close(true);
        } else {
            this.open();
        }
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
        const target = ev.currentTarget as HTMLInputElement;
        const value = Number(target.value || this.props.min);
        this.setState({ internalValue: value });
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
