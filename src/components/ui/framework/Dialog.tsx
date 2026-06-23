/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Portal, type IPortalOptions } from "./Portal.js";
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

interface IDialogProperties extends ICommonUIProperties {
    caption?: ComponentChild;

    actions?: ComponentChild[];

    /** Called when the dialog is closed. */
    onClose?: (returnValue: string) => void;
}

/**
 * A modal dialog built on {@link Portal}. Renders centered with a
 * semi-transparent backdrop. Escape and click-outside-to-close are
 * handled by the underlying Portal.
 */
export class Dialog extends UIComponent<IDialogProperties> {
    private portalRef = createRef<Portal>();

    /** When set, suppresses the default onClose mapping in handlePortalClose. */
    private customReturnValue?: string;

    public render(): ComponentChild {
        const { id, children, caption, actions } = this.props;

        const className = this.generateFinalClassName(["dialog"]);

        return (
            <Portal
                ref={this.portalRef}
                onClose={this.handlePortalClose}
            >
                <div
                    id={id}
                    class={className}
                    onClick={(e: Event) => {
                        e.stopPropagation();
                    }}
                >
                    {caption && <div class="dialog-caption">{caption}</div>}
                    <div class="dialog-content">
                        {children}
                    </div>
                    {actions && actions.length > 0 && (
                        <div class="dialog-actions" onClick={this.handleActionClick}>
                            {actions}
                        </div>
                    )}
                </div>
            </Portal>
        );
    }

    public open(): void {
        const options: IPortalOptions = {
            backgroundOpacity: 0.5,
            closeOnEscape: true,
            closeOnPortalClick: false,
        };

        this.portalRef.current?.open(options);
    }

    public close(cancelled: boolean): void {
        this.portalRef.current?.close(cancelled);
    }

    private handlePortalClose = (cancelled: boolean): void => {
        const { onClose } = this.props;

        if (this.customReturnValue) {
            onClose?.(this.customReturnValue);
            this.customReturnValue = undefined;
        } else {
            onClose?.(cancelled ? "cancel" : "accept");
        }
    };

    private handleActionClick = (e: MouseEvent): void => {
        const target = e.target as HTMLElement;
        const button = target.closest("button");

        if (!button) {
            return;
        }

        // Only handle default buttons (type=submit or no type).
        if (button.type === "button") {
            return;
        }

        if (button.value) {
            this.customReturnValue = button.value;
            this.portalRef.current?.close(button.value !== "accept");
        }
    };
}
