/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export enum CheckState {
    Unchecked,
    Checked,
    Indeterminate,
}

export interface IToggleProperties extends ICommonUIProperties {
    checkState?: CheckState;
    disabled?: boolean;

    /** When true, the toggle is rendered rotated 90° (handle moves vertically). */
    vertical?: boolean;

    onChange?: (e: InputEvent, checkState: CheckState) => void;
}

export class Toggle extends UIComponent<IToggleProperties> {

    public static override defaultProps = {
        checkState: CheckState.Unchecked,
        disabled: false,
        round: true,
    };

    private toggleRef = createRef<HTMLInputElement>();

    public override componentDidMount(): void {
        const { checkState } = this.props;

        if (this.toggleRef.current && checkState === CheckState.Indeterminate) {
            this.toggleRef.current.indeterminate = true;
        }
    }

    public override componentDidUpdate(prevProps: IToggleProperties): void {
        super.componentDidUpdate(prevProps, {});

        if (this.toggleRef.current) {
            const { checkState } = this.props;

            this.toggleRef.current.checked = checkState === CheckState.Checked;
        }
    }

    public render(): ComponentChild {
        const { id, checkState, vertical } = this.props;
        const className = this.generateFinalClassName([
            "toggle",
            ...(vertical ? ["toggle-vertical"] : []),
        ]);

        return (
            <input
                id={id}
                ref={this.toggleRef}
                className={className}
                type="checkbox"
                checked={checkState === CheckState.Checked}
                onInput={this.handleInput}
            />
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
