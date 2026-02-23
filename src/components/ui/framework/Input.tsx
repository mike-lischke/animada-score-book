/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { KeyboardKeys } from "../../../core/utils.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import type { TextAlignment } from "./ui-types.js";

export interface IInputProperties extends ICommonUIProperties {
    placeholder?: string;
    password?: boolean;

    /** When auto focus is set then all content is selected as well. */
    autoFocus?: boolean;

    value?: string;
    textAlignment?: TextAlignment;
    multiLine?: boolean;
    multiLineCount?: number;
    multiLineSwitchEnterKeyBehavior?: boolean;
    autoComplete?: boolean;
    spellCheck?: boolean;
    readOnly?: boolean;
    pattern?: string;

    innerRef?: preact.RefObject<HTMLElement>;

    onChange?: (e: InputEvent, props: IInputChangeProperties) => void;
    onConfirm?: (e: KeyboardEvent, props: IInputChangeProperties) => void;
    onCancel?: (e: KeyboardEvent, props: IInputProperties) => void;
    onBlur?: (e: FocusEvent, props: IInputChangeProperties) => void;
}

export interface IInputChangeProperties extends IInputProperties {
    value: string;
}

export class Input extends UIComponent<IInputProperties> {

    public static override defaultProps = {
        spellCheck: true,
    };

    private inputRef: preact.RefObject<HTMLElement>;

    public constructor(props: IInputProperties) {
        super(props);

        this.inputRef = props.innerRef ?? createRef<HTMLElement>();
    }

    /**
     * Selects all text in the input field.
     */
    public select(): void {
        if (this.inputRef.current instanceof HTMLInputElement) {
            this.inputRef.current.select();
        }
    }

    public override componentDidMount(): void {
        const { autoFocus } = this.props;
        if (this.inputRef.current && autoFocus) {
            const element = this.inputRef.current;
            element.focus();
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                element.select();
            }
        }
    }

    public render(): ComponentChild {
        const {
            id, password, textAlignment, value, multiLine, multiLineCount, spellCheck, readOnly, style,
            placeholder, pattern, "data-tooltip": dataTooltip,
        } = this.props;

        const className = this.generateFinalClassName(["input"]);

        const newStyle = {
            ...style,
            textAlign: textAlignment,
        };

        if (multiLine) {
            return (
                <textarea
                    id={id}
                    ref={this.inputRef as preact.Ref<HTMLTextAreaElement>}
                    onInput={this.handleInput}
                    onKeyDown={this.handleKeyDown}
                    onBlur={this.handleBlur}
                    className={className}
                    value={value}
                    spellcheck={spellCheck}
                    rows={multiLineCount}
                    style={newStyle}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    data-tooltip={dataTooltip}
                />
            );

        } else {
            return (
                <input
                    id={id}
                    ref={this.inputRef as preact.Ref<HTMLInputElement>}
                    onInput={this.handleInput}
                    onKeyDown={this.handleKeyDown}
                    onBlur={this.handleBlur}
                    className={className}
                    type={password ? "password" : "text"}
                    value={value}
                    pattern={pattern}
                    spellcheck={spellCheck}
                    style={newStyle}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    data-tooltip={dataTooltip}
                />
            );
        }
    }

    private handleInput = (e: Event): void => {
        const { onChange } = this.props;

        const element = e.target as HTMLInputElement;
        onChange?.(e as InputEvent, { ...this.props, value: element.value });
    };

    private handleBlur = (e: FocusEvent): void => {
        const { onBlur } = this.props;

        const element = e.target as HTMLInputElement;
        onBlur?.(e, { ...this.props, value: element.value });
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        const { multiLine, multiLineSwitchEnterKeyBehavior, onConfirm, onCancel, onKeyDown } = this.props;

        switch (e.key) {
            case KeyboardKeys.Enter: {
                if (!multiLine
                    || (multiLineSwitchEnterKeyBehavior && !e.shiftKey)
                    || (!multiLineSwitchEnterKeyBehavior && e.shiftKey)) {
                    const element = e.target as HTMLInputElement;
                    onConfirm?.(e, { ...this.props, value: element.value });
                }

                break;
            }

            case KeyboardKeys.A: {
                if (e.metaKey && this.inputRef.current instanceof HTMLInputElement) {
                    this.inputRef.current.select();
                }
                break;
            }

            case KeyboardKeys.Escape: {
                onCancel?.(e, this.props);
                break;
            }

            case KeyboardKeys.ArrowLeft:
            case KeyboardKeys.ArrowRight:
            case KeyboardKeys.ArrowUp:
            case KeyboardKeys.ArrowDown: {
                if (multiLine) {
                    // Make sure arrow navigation in a multi line input stays intact.
                    // Owning controls (like the TreeGrid) may otherwise do additional handling.
                    e.stopPropagation();
                }

                break;
            }

            default: {
                onKeyDown?.(e);
                break;
            }
        }
    };

}
