/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";
import { Portal, type IPortalOptions } from "../Portal.js";
import { DialogContent } from "./DialogContent.js";

// Describes a collection of react nodes that should be rendered in an action area, separated
// by their alignment.
export interface IDialogActions {
    begin?: ComponentChild[]; // Top/Left aligned content.
    end?: ComponentChild[];   // Ditto for right/bottom.
}

interface IDialogProperties extends ICommonUIProperties {
    content?: ComponentChild;
    header?: ComponentChild;
    caption?: ComponentChild;
    container?: HTMLElement; // A node where to mount the dialog to.

    actions?: IDialogActions;

    onClose?: (cancelled: boolean, props: IDialogProperties) => void;
    onOpen?: (props: IDialogProperties) => void;
}

// A modal popup component to interact with the user (e.g. in wizards or task lists).
// For value editing with input validation see ValueEditDialog instead.
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
