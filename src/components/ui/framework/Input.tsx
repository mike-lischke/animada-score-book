/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { KeyboardKeys } from "../../../core/utils.js";
import { Button } from "./Button.js";
import { Codicon } from "./Codicon.js";
import { Icon } from "./Icon.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import type { TextAlignment } from "./ui-types.js";

export interface IInputProperties extends ICommonUIProperties {
    placeholder?: string;
    password?: boolean;

    /** When auto focus is set then all content is selected as well. */
    autoFocus?: boolean;

    value?: string;
    textAlignment?: TextAlignment;
    autoComplete?: boolean;
    spellCheck?: boolean;
    readOnly?: boolean;

    /** Shows a toggle button to reveal the password in plain text. */
    showPasswordToggle?: boolean;

    innerRef?: preact.RefObject<HTMLElement>;

    onChange?: (e: InputEvent, props: IInputProperties) => void;
    onConfirm?: (e: KeyboardEvent, props: IInputProperties) => void;
    onCancel?: (e: KeyboardEvent, props: IInputProperties) => void;
    onBlur?: (e: FocusEvent, props: IInputProperties) => void;
}

interface IInputState {
    passwordVisible: boolean;
}

export class Input extends UIComponent<IInputProperties, IInputState> {

    public static override defaultProps = {
        spellCheck: true,
    };

    private inputRef: preact.RefObject<HTMLElement>;

    public constructor(props: IInputProperties) {
        super(props);

        this.inputRef = props.innerRef ?? createRef<HTMLElement>();
        this.state = { passwordVisible: false };
    }

    /**
     * Selects all text in the input field.
     */
    public select(): void {
        if (this.inputRef.current instanceof HTMLInputElement) {
            this.inputRef.current.select();
        }
    }

    public override componentDidUpdate(): void {
        // Reset visibility when switching from password to non-password mode.
        const { password } = this.props;
        const { passwordVisible } = this.state;

        if (!password && passwordVisible) {
            this.setState({ passwordVisible: false });
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
            id, password, showPasswordToggle, textAlignment, value, spellCheck, readOnly, disabled, style,
            placeholder,
        } = this.props;
        const { passwordVisible } = this.state;

        const className = this.generateFinalClassName(["input"]);

        const newStyle = {
            padding: "3px",
            ...style,
            textAlign: textAlignment,
        };

        const inputType = password && !passwordVisible ? "password" : "text";

        const inputElement = (
            <input
                id={id}
                ref={this.inputRef as preact.Ref<HTMLInputElement>}
                onInput={this.handleInput}
                onKeyDown={this.handleKeyDown}
                onBlur={this.handleBlur}
                className={className}
                type={inputType}
                value={value}
                spellcheck={spellCheck}
                style={password && showPasswordToggle ? { ...newStyle, paddingRight: "28px" } : newStyle}
                readOnly={readOnly}
                disabled={disabled}
                placeholder={placeholder}
            />
        );

        if (password && showPasswordToggle) {
            return (
                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                    {inputElement}
                    <Button
                        imageOnly
                        className="du-btn-xs du-btn-ghost"
                        style={{
                            position: "absolute",
                            right: "2px",
                            padding: "0",
                            minHeight: "unset",
                            height: "20px",
                            width: "24px",
                        }}
                        tabIndex={-1}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.setState({ passwordVisible: !passwordVisible }, () => {
                                this.inputRef.current?.focus();
                            });
                        }}
                    >
                        <Icon
                            src={passwordVisible ? Codicon.EyeClosed : Codicon.Eye}
                            style={{ fontSize: "14px" }}
                        />
                    </Button>
                </div>
            );
        }

        return inputElement;
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
        const { onConfirm, onCancel, onKeyDown } = this.props;

        switch (e.key) {
            case KeyboardKeys.Enter: {
                const element = e.target as HTMLInputElement;
                onConfirm?.(e, { ...this.props, value: element.value });

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

            default: {
                onKeyDown?.(e);
                break;
            }
        }
    };

}
