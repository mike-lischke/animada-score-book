/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";
import { Portal, type IPortalOptions } from "../Portal.js";
import { DialogContent } from "./DialogContent.js";

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
export interface IDialogActions {
    /** Top/Left aligned content. */
    begin?: ComponentChild[];

    /** Ditto for right/bottom. */
    end?: ComponentChild[];
}

interface IDialogProperties extends ICommonUIProperties {
    content?: ComponentChild;
    header?: ComponentChild;
    caption?: ComponentChild;

    /** A node where to mount the dialog to. */
    container?: HTMLElement;

    actions?: IDialogActions;

    onClose?: (cancelled: boolean, props: IDialogProperties) => void;
    onOpen?: (props: IDialogProperties) => void;
}

/** A modal popup component to interact with the user (e.g. in wizards or task lists). */
export class Dialog extends UIComponent<IDialogProperties> {

    public static override defaultProps = {
        container: document.body,
    };

    private portalRef = createRef<Portal>();

    public render(): ComponentChild {
        const { children, caption, header, content, actions, container } = this.props;

        const className = this.generateFinalClassName([]); // Dialog class name is handled in the DialogContent class.

        return (
            <Portal
                ref={this.portalRef}
                container={container}

                onClose={this.handleClose}
                onOpen={this.handleOpen}
            >
                <DialogContent
                    className={className}
                    caption={caption}
                    header={header}
                    content={content}
                    actions={actions}
                    draggable
                    onCloseClick={this.handleCloseClick}
                >
                    {children}
                </DialogContent>
            </Portal>
        );
    }

    public open(options?: IPortalOptions): void {
        this.portalRef.current?.open({
            backgroundOpacity: 0.5,
            ...options,
        });
    }

    public close(cancelled: boolean): void {
        this.portalRef.current?.close(cancelled);
    }

    private handleClose = (cancelled: boolean): void => {
        const { onClose } = this.props;

        onClose?.(cancelled, this.props);

        this.setState({ open: false });
    };

    private handleOpen = (): void => {
        const { onOpen } = this.props;

        onOpen?.(this.props);
    };

    private handleCloseClick = (): void => {
        this.close(true);
    };
}
