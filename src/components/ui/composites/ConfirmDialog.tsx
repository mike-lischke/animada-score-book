/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef, VNode } from "preact";

import { Button } from "../framework/Button.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Dialog, DialogResponseClosure } from "../framework/Dialogs/Dialog.js";

/** Possible buttons to show. Only fields with a value also show a button. */
export interface IConfirmDialogButtons {
    accept?: string;
    refuse?: string;
    alternative?: string;
    default?: string;
}

interface IConfirmDialogProperties extends ICommonUIProperties {
    onClose?: (closure: DialogResponseClosure, values?: Record<string, unknown>) => void;
}

interface IConfirmDialogState {
    title?: string;
    message: ComponentChild;
    buttons: IConfirmDialogButtons;
    values?: Record<string, unknown>;
    description?: string[];
}

export class ConfirmDialog extends UIComponent<IConfirmDialogProperties, IConfirmDialogState> {

    private dialogRef = createRef<Dialog>();

    public constructor(props: IConfirmDialogProperties) {
        super(props);
        this.state = {
            message: "",
            buttons: {},
        };
    }

    public render(): ComponentChild {
        const { title, message, buttons, description } = this.state;

        const className = this.generateFinalClassName(["confirmDialog"]);
        let dialogContent = null;
        if ((message as VNode).key !== undefined) {
            dialogContent = message;
        } else {
            // If no explicit content is specified, use the description list for additional content.
            const descriptionLabels: ComponentChild[] = [];
            description?.forEach((value, index) => {
                descriptionLabels.push(
                    <Label id={`caption${index}`} caption={value} />,
                );
            });

            dialogContent =
                <Container orientation={Orientation.TopDown}>
                    {message && <Label id="dialogMessage" caption={message as string} />}
                    <Container
                        orientation={Orientation.TopDown}
                        className="description">
                        {descriptionLabels}
                    </Container>
                </Container>;
        }

        // TODO: consider the different order of the buttons based on the OS.
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

        if (buttons.accept) {
            actions.push(<Button
                caption={buttons.accept.replace(/&/g, "")}
                id="accept"
                key="accept"
                isDefault={buttons.accept === buttons.default}
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

        return (
            <Dialog
                ref={this.dialogRef}
                className={className}
                caption={
                    <>
                        <Icon src={Codicon.Question} />
                        <Label>{title ?? "Confirm"}</Label>
                    </>
                }
                content={dialogContent}
                actions={{
                    end: actions,
                }}
                onClose={this.handleClose}
            >
            </Dialog>
        );
    }

    public show(message: ComponentChild, buttons: IConfirmDialogButtons, title?: string, description?: string[],
        values?: Record<string, unknown>): void {
        this.setState({ title, message, buttons, values, description }, () => {
            return this.dialogRef.current?.open({ closeOnEscape: true });
        });
    }

    private handleActionClick = (e: MouseEvent | KeyboardEvent): void => {
        const { onClose } = this.props;
        const { values } = this.state;

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

        this.dialogRef.current?.close(false);

        onClose?.(closure, values);
    };

    private handleClose = (cancelled: boolean): void => {
        if (cancelled) {
            const { onClose } = this.props;
            const { values } = this.state;

            onClose?.(DialogResponseClosure.Cancel, values);
        }
    };

}
