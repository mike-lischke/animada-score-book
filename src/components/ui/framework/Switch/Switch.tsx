/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./Switch.css";

import { ComponentChild, createRef } from "preact";

import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";

export enum CheckState {
    Unchecked,
    Checked,
    Indeterminate,
}

export interface ISwitchProperties extends ICommonUIProperties {
    checkState?: CheckState;
    disabled?: boolean;
    round?: boolean;
    caption?: string;

    onChange?: (e: InputEvent, checkState: CheckState) => void;
}

export class Switch extends UIComponent<ISwitchProperties> {

    public static override defaultProps = {
        checkState: CheckState.Unchecked,
        disabled: false,
        round: true,
    };

    private toggleRef = createRef<HTMLInputElement>();

    public override componentDidMount(): void {
        const { checkState } = this.props;

        if (this.toggleRef.current) {
            this.toggleRef.current.checked = checkState === CheckState.Checked;
        }
    }

    public override componentDidUpdate(): void {
        if (this.toggleRef.current) {
            const { checkState } = this.props;

            this.toggleRef.current.checked = checkState === CheckState.Checked;
        }
    }

    public render(): ComponentChild {
        const { children, id = "", round, caption } = this.props;
        const className = this.generateFinalClassName([
            "switch",
            this.classFromProperty(round, "round"),
        ]);

        let content = children;
        content ??= caption;

        return (
            <div id={id}>
                <input
                    type="checkbox"
                    id="switch-checkbox-input"
                    ref={this.toggleRef}
                    className={className}
                    onInput={this.handleInput}
                />

                <label
                    htmlFor="switch-checkbox-input"
                    className={className}
                    tabIndex={0}
                    onKeyPress={this.handleInput}
                >
                    {content}
                </label>
            </div>
        );
    }

    private handleInput = (e: Event): void => {
        if (e.target) {
            const { onChange } = this.props;

            e.preventDefault();
            const element = e.target as HTMLInputElement;
            onChange?.(e as InputEvent,
                element.indeterminate
                    ? CheckState.Indeterminate
                    : (element.checked ? CheckState.Checked : CheckState.Unchecked),
            );
        }
    };

}
