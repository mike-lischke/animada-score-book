/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { getNewId } from "../../../core/utils.js";

/** What decision made the user to close a dialog. */
export enum DialogResponseClosure {
    Accept,
    Decline,
    Alternative,

    /** Set when no decision was made. */
    Cancel,
}

/** Types for general dialogs. */
export enum DialogType {
    /** A simple prompt value dialog, requesting a single value from the user. */
    Prompt,

    /** Confirm a question (yes, no, alt). */
    Confirm,

    /** Select one entry from a list. */
    Select,
}

/** A set of values that describe a single modal dialog request. */
export interface IDialogRequest extends Record<string, unknown> {
    /** The type of the dialog to show. Used mostly to schedule dialog requests. */
    type: DialogType;

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

export interface IDialogResponse extends Record<string, unknown> {
    id: string;
    type: DialogType;
    closure: DialogResponseClosure;

    data?: Record<string, unknown>;
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
        this.dialogRef.current?.addEventListener("close", this.handleClose);
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();

        this.dialogRef.current?.removeEventListener("close", this.handleClose);
    }

    public render(): ComponentChild {
        const { id = `dialog-${getNewId()}`, children, caption, actions } = this.props;

        return (
            <dialog
                id={id}
                className="modal"
                ref={this.dialogRef}>
                <div className="modal-box">
                    {caption && <h3 className="font-bold text-lg">{caption}</h3>}
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
        }
    }

    public close(cancelled: boolean): void {
        this.dialogRef.current?.close(cancelled ? "cancel" : "accept");
    }

    private handleClose = (event: Event): void => {
        const { onClose } = this.props;

        const returnValue = this.dialogRef.current?.returnValue ?? "cancel";
        onClose?.(returnValue);
    };
}
