/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { clampValue, convertPropValue } from "../../../core/utils.js";
import { Button } from "./Button.js";
import { Grid } from "./Grid.js";
import { GridCell } from "./GridCell.js";
import { Input } from "./Input.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { TextAlignment } from "./ui-types.js";

export interface IUpDownProperties extends ICommonUIProperties {
    /** The minimal value that can be entered.*/
    min?: number;

    /** The maximal value that can be entered. */
    max?: number;

    /** The value for one step when using the arrow buttons. */
    step?: number;

    value?: number;
    textAlignment?: TextAlignment;

    innerRef?: preact.RefObject<HTMLDivElement>;

    onChange?: (value: number, props: IUpDownProperties) => void;
    onConfirm?: (value: number, props: IUpDownProperties) => void;
    onCancel?: (props: IUpDownProperties) => void;
}

export class UpDown extends UIComponent<IUpDownProperties> {
    public static override defaultProps = {
        textAlignment: TextAlignment.End,
    };

    private containerRef: preact.RefObject<HTMLDivElement>;

    public constructor(props: IUpDownProperties) {
        super(props);

        this.containerRef = props.innerRef ?? createRef<HTMLDivElement>();
    }

    public override componentDidMount(): void {
        // Now that we know the control's height we can update the height of the items.
        if (this.containerRef.current) {
            const value = convertPropValue(this.containerRef.current.clientHeight) ?? null;
            this.containerRef.current.style.setProperty("--item-height", value);
        }
    }

    public render(): ComponentChild {
        const { id, disabled = false, textAlignment, value = 0 } = this.props;

        const className = this.generateFinalClassName(["upDown"]);

        const content = (
            <Input
                id={id ?? "upDownInput"}
                className="du-input-sm"
                value={value.toString()}
                onChange={this.handleInputChange}
                onConfirm={this.handleInputConfirm}
                onCancel={this.handleInputCancel}
                textAlignment={textAlignment}
                data-tooltip="inherit"
                disabled={disabled}
            />
        );

        return (
            <Grid
                key="upDownMain"
                innerRef={this.containerRef}
                className={className}
                columns={["auto", 16]}
            >
                <GridCell
                    id="content"
                    key="upDownContent"
                    rowSpan={2}
                    data-tooltip="inherit"
                >
                    {content}
                </GridCell>
                <GridCell>
                    <Button
                        id="up"
                        key="upButton"
                        onClick={this.handleButtonClick}
                        tabIndex={-1}
                    />
                </GridCell>
                <GridCell>
                    <Button
                        id="down"
                        key="downButton"
                        onClick={this.handleButtonClick}
                        tabIndex={-1}
                    />
                </GridCell>
            </Grid>
        );
    }

    private handleButtonClick = (e: MouseEvent | KeyboardEvent): void => {
        const { step = 1 } = this.props;

        const target = e.currentTarget as HTMLElement;
        this.stepValue(target.id === "up" ? step : -step);
        e.preventDefault();
    };

    private stepValue = (amount: number): void => {
        const { onConfirm, disabled, min, max, value = 0 } = this.props;
        if (disabled) {
            return;
        }

        const newValue = clampValue(value + amount, min, max);
        if (newValue === value) {
            return;
        }

        onConfirm?.(newValue, this.props);
    };

    private handleInputChange = (e: InputEvent): void => {
        const { onChange } = this.props;
        const currentValue = (e.target as HTMLInputElement).value;

        onChange?.(Number(currentValue), this.props);
    };

    private handleInputConfirm = (e: KeyboardEvent,): void => {
        const { onConfirm } = this.props;

        const stringValue = (e.target as HTMLInputElement).value;
        onConfirm?.(Number(stringValue), this.props);
    };

    private handleInputCancel = (): void => {
        const { onCancel } = this.props;

        onCancel?.(this.props);
    };
}
