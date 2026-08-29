/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Semaphore } from "../../../supplement/Semaphore.js";
import { Button } from "../framework/Button.js";
import { Checkbox } from "../framework/Checkbox.js";
import { Container } from "../framework/Container.js";
import { Dialog, DialogResponseClosure } from "../framework/Dialog.js";
import { Icon } from "../framework/Icon.js";
import { Input, type IInputProperties } from "../framework/Input.js";
import { Label } from "../framework/Label.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent } from "../framework/UIComponent.js";
import { UIIcon } from "../framework/UIIcon.js";

export interface IInsertBarsResult {
    closure: DialogResponseClosure;
    count: number;
    copyContent: boolean;
}

interface IInsertBarsDialogState {
    count: string;
    copyContent: boolean;
}

/**
 * Asks the user how many bars to insert and whether to copy the preceding bar's content.
 */
export class InsertBarsDialog extends UIComponent<{}, IInsertBarsDialogState> {
    private dialogRef = createRef<Dialog>();
    private signal?: Semaphore<IInsertBarsResult>;

    public constructor(props: {}) {
        super(props);

        this.state = {
            count: "1",
            copyContent: false,
        };
    }

    public async show(): Promise<IInsertBarsResult | undefined> {
        this.signal = new Semaphore<IInsertBarsResult>();
        this.setState({ count: "1", copyContent: false }, () => {
            return this.dialogRef.current?.open();
        });

        const result = await this.signal.wait();
        this.signal = undefined;

        return result;
    }

    public render(): ComponentChild {
        const { count, copyContent } = this.state;

        return (
            <Dialog
                ref={this.dialogRef}
                caption={
                    <>
                        <Icon src={UIIcon.Add} />
                        <Label>Insert Bars</Label>
                    </>
                }
                actions={[
                    <Button
                        id="accept"
                        key="accept"
                        caption="Insert"
                        isDefault
                        onClick={this.handleButtonClick}
                    />,
                    <Button
                        id="cancel"
                        key="cancel"
                        caption="Cancel"
                        onClick={this.handleButtonClick}
                    />,
                ]}
                onClose={this.handleClose}
            >
                <Container
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Stretch}
                    style={{ gap: "10px" }}
                >
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ gap: "8px" }}
                    >
                        <Label caption="Number of bars" style={{ width: "140px" }} />
                        <Input
                            id="insertBarsCount"
                            value={count}
                            autoFocus
                            style={{ flex: 1 }}
                            onChange={this.handleCountChange}
                            onConfirm={this.handleConfirm}
                        />
                    </Container>
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ gap: "8px" }}
                    >
                        <Checkbox
                            id="insertBarsCopy"
                            checked={copyContent}
                            onChange={this.handleCopyChange}
                        />
                        <Label caption="Copy content of the preceding bar" />
                    </Container>
                </Container>
            </Dialog>
        );
    }

    private handleButtonClick = (e: MouseEvent | KeyboardEvent): void => {
        const target = e.currentTarget as HTMLElement;
        const isAccept = target.id === "accept";

        this.dialogRef.current?.close(!isAccept);
    };

    private handleConfirm = (): void => {
        this.dialogRef.current?.close(false);
    };

    private handleCountChange = (e: InputEvent, props: IInputProperties): void => {
        this.setState({ count: props.value ?? "" });
    };

    private handleCopyChange = (checked: boolean): void => {
        this.setState({ copyContent: checked });
    };

    private handleClose = (returnValue: string): void => {
        const { count, copyContent } = this.state;

        if (returnValue !== "accept") {
            this.signal?.notify({ closure: DialogResponseClosure.Cancel, count: 1, copyContent: false });

            return;
        }

        const parsed = Number(count);
        const resolvedCount = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

        this.signal?.notify({ closure: DialogResponseClosure.Accept, count: resolvedCount, copyContent });
    };
}
