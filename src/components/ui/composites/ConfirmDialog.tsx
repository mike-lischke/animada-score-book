/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Semaphore } from "../../../supplement/Semaphore.js";
import { Button } from "../framework/Button.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Dialog, DialogResponseClosure } from "../framework/Dialog.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { Orientation } from "../framework/ui-types.js";
import { UIComponent } from "../framework/UIComponent.js";

/** Possible buttons to show. Only fields with a value also show a button. */
export interface IConfirmDialogButtons {
    accept?: string;
    refuse?: string;
    alternative?: string;
    default?: string;
}

interface IConfirmDialogState {
    title?: string;
    message: string;
    buttons: IConfirmDialogButtons;
    values?: Record<string, unknown>;
    description?: string[];
    closeOnBackdropClick?: boolean;
}

export class ConfirmDialog extends UIComponent<{}, IConfirmDialogState> {
    private dialogRef = createRef<Dialog>();
    private signal?: Semaphore<DialogResponseClosure>;

    public constructor(props: {}) {
        super(props);
        this.state = {
            message: "",
            buttons: {},
        };
    }

    public async show(message: string, buttons: IConfirmDialogButtons, title?: string, description?: string[],
        values?: Record<string, unknown>, closeOnBackdropClick?: boolean): Promise<DialogResponseClosure> {
        this.signal = new Semaphore<DialogResponseClosure>();
        this.setState({ title, message, buttons, values, description, closeOnBackdropClick }, () => {
            return this.dialogRef.current?.open();
        });

        const result = await this.signal.wait();
        this.signal = undefined;

        return result;
    }

    public render(): ComponentChild {
        const { title, message, buttons, description } = this.state;

        const className = this.generateFinalClassName(["confirmDialog"]);
        let dialogContent = null;
        const descriptionLabels: ComponentChild[] = [];
        description?.forEach((value, index) => {
            descriptionLabels.push(
                <Label id={`caption${index}`} caption={value} />,
            );
        });

        dialogContent =
            <Container orientation={Orientation.TopDown}>
                {message && <Label id="dialogMessage" caption={message} />}
                <Container
                    orientation={Orientation.TopDown}
                    className="description">
                    {descriptionLabels}
                </Container>
            </Container>;

        const actions: ComponentChild[] = [];
        if (buttons.alternative) {
            actions.push(<Button
                caption={buttons.alternative.replace(/&/g, "")} // Remove hot key indicator. We cannot show them.
                id="alternative"
                key="alternative"
                isDefault={buttons.alternative === buttons.default}
                onClick={this.handleActionClick}
            />);
        }

        if (buttons.refuse) {
            actions.push(<Button
                caption={buttons.refuse.replace(/&/g, "")}
                id="refuse"
                key="refuse"
                isDefault={buttons.refuse === buttons.default}
                onClick={this.handleActionClick}
            />);
        }

        if (buttons.accept) {
            actions.push(<Button
                caption={buttons.accept.replace(/&/g, "")}
                id="accept"
                key="accept"
                isDefault={buttons.accept === buttons.default}
                onClick={this.handleActionClick}
            />);
        }

        return (
            <Dialog
                ref={this.dialogRef}
                className={className}
                closeOnBackdropClick={this.state.closeOnBackdropClick}
                caption={
                    <>
                        <Icon src={Codicon.Question} />
                        <Label>{title ?? "Confirm"}</Label>
                    </>
                }
                actions={actions}
                onClose={this.handleClose}
            >
                {dialogContent}
            </Dialog>
        );
    }

    private handleActionClick = (e: MouseEvent | KeyboardEvent): void => {
        const id = (e.currentTarget as HTMLElement).id;
        let closure;
        switch (id) {
            case "accept": {
                closure = DialogResponseClosure.Accept;
                break;
            }

            case "alternative": {
                closure = DialogResponseClosure.Alternative;
                break;
            }

            default: {
                closure = DialogResponseClosure.Decline;
                break;
            }
        }

        this.dialogRef.current?.close(closure === DialogResponseClosure.Decline);
        this.signal?.notify(closure);
    };

    private handleClose = (returnValue: string): void => {
        if (returnValue === "cancelled") {
            this.signal?.notify(DialogResponseClosure.Cancel);
        }
    };

}
