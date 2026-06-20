/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Semaphore } from "../../../supplement/Semaphore.js";
import { Button } from "../framework/Button.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Dialog, DialogResponseClosure, type IDialogResponse } from "../framework/Dialog.js";
import { Grid } from "../framework/Grid.js";
import { GridCell } from "../framework/GridCell.js";
import { Icon } from "../framework/Icon.js";
import { Input, type IInputProperties } from "../framework/Input.js";
import { Label } from "../framework/Label.js";
import { ProgressIndicator } from "../framework/ProgressIndicator.js";
import { UIComponent } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export enum ValueEditorEntryType {
    Title,
    Value,
    Description,
    Spinner,
}

/** One entry in the value editor dialog. */
export interface IValueEditorEntry {
    /** The name of the entry. */
    type: ValueEditorEntryType;

    /** The unique identifier of the entry. */
    id: string;

    /** The content of the entry. */
    content?: string | number | boolean;

    /** A number between 1 and 8, which determines how many cells an entry spans. */
    displayWidth?: number;
}

export interface IValueEditorValueEntry extends IValueEditorEntry {
    type: ValueEditorEntryType.Value;
    placeholder?: string;

    /** Renders the input as a password field. */
    password?: boolean;

    /** Called when Enter is pressed in the input. */
    onConfirm?: (e: KeyboardEvent, props: IInputProperties) => void;
}

/** Options for {@link ValueDialog.show}. */
export interface IValueDialogShowOptions {
    /** Label for the accept button. Defaults to "OK". */
    acceptLabel?: string;

    /** Label for the decline button. Defaults to "Cancel". */
    declineLabel?: string;

    /** Error message to display above the form. */
    errorMessage?: string;

    /** When true, the action buttons (OK/Cancel) are hidden. */
    hideActions?: boolean;

    /** Marks the accept button as the default action (visual highlight + Enter key). */
    isDefault?: boolean;
}

export interface IValueDialogState {
    id: string;
    caption: string;
    icon: Codicon;
    entries: IValueEditorEntry[];
    valueMap: Map<string, IValueEditorValueEntry>;
    acceptLabel: string;
    declineLabel: string;
    errorMessage: string;
    hideActions: boolean;
    isDefault: boolean;
}

interface IGridCellProperties {
    columnSpan?: number;
    mainAlignment?: ChildAlignment;
}

/** A dialog to edit multiple values. */
export class ValueDialog extends UIComponent<{}, IValueDialogState> {
    private dialogRef = createRef<Dialog>();
    private signal?: Semaphore<IDialogResponse>;

    public constructor(props: {}) {
        super(props);

        // Add a copy of all value entries to the state for editing.
        this.state = {
            id: "",
            caption: "",
            icon: Codicon.Undefined,
            valueMap: new Map(),
            entries: [],
            acceptLabel: "OK",
            declineLabel: "Cancel",
            errorMessage: "",
            hideActions: false,
            isDefault: false,
        };
    }

    /**
     * Programmatically closes the dialog without going through the normal accept/decline flow.
     * Use this for status-only dialogs that need to be dismissed externally.
     */
    public dismiss(): void {
        this.dialogRef.current?.close(false);
    }

    /**
     * Programmatically triggers the accept action.
     * Closes the dialog and notifies the signal as if the accept button was clicked.
     */
    public triggerAccept(): void {
        this.dialogRef.current?.close(false);
    }

    public async show(id: string, caption: string, icon: Codicon,
        entries: IValueEditorEntry[], options?: IValueDialogShowOptions): Promise<IDialogResponse> {
        const { acceptLabel, declineLabel, errorMessage, hideActions, isDefault } = options ?? {};

        this.signal = new Semaphore<IDialogResponse>();
        const map = new Map<string, IValueEditorValueEntry>();
        entries.forEach((entry) => {
            if (entry.type === ValueEditorEntryType.Value) {
                map.set(entry.id, { ...(entry as IValueEditorValueEntry) });
            }
        });

        this.setState({
            id, caption, valueMap: map, icon, entries,
            acceptLabel: acceptLabel ?? "OK",
            declineLabel: declineLabel ?? "Cancel",
            errorMessage: errorMessage ?? "",
            hideActions: hideActions ?? false,
            isDefault: isDefault ?? false,
        }, () => {
            return this.dialogRef.current?.open();
        });

        const result = await this.signal.wait();
        this.signal = undefined;

        return result;
    };

    public render(): ComponentChild {
        const { id, caption, icon, entries, valueMap, acceptLabel, declineLabel, errorMessage, hideActions,
            isDefault }
            = this.state;

        const className = this.generateFinalClassName(["valueDialog"]);

        const cells: ComponentChild[] = [];
        entries.forEach((entry) => {
            let cellContent: ComponentChild = null;
            let cellProps: Partial<IGridCellProperties> = {};

            switch (entry.type) {
                case ValueEditorEntryType.Title:
                    cellContent = <Label
                        caption={entry.content as string}
                        style={{ flex: "1" }}
                    />;
                    cellProps = {
                        columnSpan: entry.displayWidth ?? 2,
                        mainAlignment: ChildAlignment.Start,
                    };
                    break;

                case ValueEditorEntryType.Value: {
                    const valueEntry = valueMap.get(entry.id)!;

                    cellContent = <Input
                        id={entry.id}
                        value={valueEntry.content as string}
                        placeholder={valueEntry.placeholder}
                        password={valueEntry.password}
                        onConfirm={valueEntry.onConfirm}
                        style={{ flex: "1" }}
                        onChange={this.handleValueChange}
                    />;
                    cellProps = {
                        columnSpan: entry.displayWidth,
                    };
                    break;
                }

                case ValueEditorEntryType.Description:
                    cellContent = <Label
                        caption={entry.content as string}
                        style={{ flex: "1" }}
                    />;
                    cellProps = {
                        columnSpan: entry.displayWidth,
                    };
                    break;

                case ValueEditorEntryType.Spinner:
                    cellContent = <ProgressIndicator />;
                    cellProps = {
                        columnSpan: entry.displayWidth,
                    };
                    break;
            }

            cells.push(
                <GridCell
                    key={entry.id}
                    crossAlignment={ChildAlignment.Center}
                    {...cellProps}
                >
                    {cellContent}
                </GridCell>,
            );
        });

        return <Dialog
            id={id}
            ref={this.dialogRef}
            className={className}
            caption={
                <>
                    <Icon src={icon} />
                    <Label>{caption}</Label>
                </>
            }
            actions={hideActions ? [] : [
                <Button
                    id="accept"
                    key="accept"
                    caption={acceptLabel}
                    isDefault={isDefault}
                    onClick={this.handleButtonClick}
                />,
                <Button
                    id="cancel"
                    key="cancel"
                    caption={declineLabel}
                    onClick={this.handleButtonClick}
                />,
            ]}
            onClose={this.closeDialog}
        >
            {errorMessage && (
                <Container
                    className="text-error bg-error/10 rounded p-2 mb-3"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={Codicon.Error}
                        style={{ fontSize: "16px", marginRight: "8px" }} />
                    <Label caption={errorMessage} wrap />
                </Container>
            )}
            <Grid columns={8} columnGap={8}>
                {cells}
            </Grid>
        </Dialog>;
    }

    private handleValueChange = (e: InputEvent): void => {
        const { valueMap } = this.state;

        const target = e.target as HTMLInputElement;
        const entry = valueMap.get(target.id);
        if (entry) {
            entry.content = target.value;
            this.setState({ valueMap: new Map(valueMap) });
        }
    };

    private handleButtonClick = (e: MouseEvent | KeyboardEvent): void => {
        const target = e.currentTarget as HTMLElement;

        let isDecline: boolean;
        switch (target.id) {
            case "accept": {
                isDecline = false;
                break;
            }

            case "alternative": {
                isDecline = false;
                break;
            }

            default: {
                isDecline = true;
                break;
            }
        }

        // close() triggers the native close event → closeDialog handles signal.notify().
        this.dialogRef.current?.close(isDecline);
    };

    private closeDialog = (returnValue: string): void => {
        const { id, valueMap } = this.state;

        const data: Record<string, IValueEditorValueEntry> = {};
        valueMap.forEach((valueEntry, key) => {
            data[key] = valueEntry;
        });

        const closure = returnValue === "cancelled"
            ? DialogResponseClosure.Cancel
            : DialogResponseClosure.Accept;

        this.signal?.notify({ id, closure, data });
    };
}
