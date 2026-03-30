/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { escapeStack } from "../../../supplement/EscapeStack.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

/** What decision made the user to close a dialog. */
export enum DialogResponseClosure {
    Accept,
    Decline,
    Alternative,

    /** Set when no decision was made. */
    Cancel,
}

/** A set of values that describe a single modal dialog request. */
export interface IDialogRequest extends Record<string, unknown> {
    /** An id to identify the invocation. */
    id: string;

    /** Optionally used to set a customized dialog title (where supported). */
    title?: string;

    /** A list of strings to be rendered before the actual prompt, each in an own paragraph. */
    description?: string[];

    /** Values to configure how the dialog looks like (available options in drop downs etc.). */
    parameters?: Record<string, unknown>;

    /** Values to pre-fill certain elements or additional data for captions, payload etc. */
    values?: Record<string, unknown>;

    /** Additional data which is passed along with the dialog request. */
    data?: Record<string, unknown>;
}

export interface IDialogResponse {
    id: string;
    closure: DialogResponseClosure;

    data: Record<string, unknown>;
}

/**
 * Describes a collection of react nodes that should be rendered in an action area, separated
 * by their alignment.
 */

interface IDialogProperties extends ICommonUIProperties {
    caption?: ComponentChild;

    actions?: ComponentChild[];

    /** Called when the dialog is closed. The return value indicates how the dialog was closed. */
    onClose?: (returnValue: string) => void;
}

/** A modal popup component to interact with the user (e.g. in wizards or task lists). */
export class Dialog extends UIComponent<IDialogProperties> {
    private dialogRef = createRef<HTMLDialogElement>();

    public override componentDidMount(): void {
        this.dialogRef.current?.addEventListener("close", this.handleCloseEvent);
        this.dialogRef.current?.addEventListener("cancel", this.handleCancelEvent);
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();

        this.dialogRef.current?.removeEventListener("close", this.handleCloseEvent);
        this.dialogRef.current?.removeEventListener("cancel", this.handleCancelEvent);
    }

    public render(): ComponentChild {
        const { id, children, caption, actions } = this.props;

        const className = this.generateFinalClassName(["dialog", "modal"]);

        return (
            <dialog
                id={id}
                className={className}
                ref={this.dialogRef}>
                <div className="modal-box">
                    {caption && <h3 id="dialog-caption">{caption}</h3>}
                    {children}
                    <div className="modal-action">
                        <form method="dialog">
                            {actions}
                        </form>
                    </div>
                </div>
            </dialog>
        );
    }

    public open(): void {
        if (this.dialogRef.current) {
            this.dialogRef.current.returnValue = "cancel";
            this.dialogRef.current.showModal();

            escapeStack.push(this.onEscape);
        }
    }

    public close(cancelled: boolean): void {
        this.dialogRef.current?.close(cancelled ? "cancel" : "accept");
    }

    private handleCloseEvent = (): void => {
        const { onClose } = this.props;

        escapeStack.remove(this.onEscape);
        const returnValue = this.dialogRef.current?.returnValue ?? "cancel";
        onClose?.(returnValue);
    };

    private onEscape = (): void => {
        // At this point the escape handler is already popped from the stack, so we don't need to worry about that.
        this.close(true);
    };

    private handleCancelEvent = (event: Event): void => {
        // No automatic closing on escape key, we want to handle this ourselves via the EscapeStack to ensure
        // correct stacking of dialogs.
        event.preventDefault();
    };
}
