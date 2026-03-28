/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Semaphore } from "../../../supplement/Semaphore.js";
import { Button } from "../framework/Button.js";
import { Codicon } from "../framework/Codicon.js";
import { Dialog, DialogResponseClosure, type IDialogResponse } from "../framework/Dialog.js";
import { Grid } from "../framework/Grid.js";
import { GridCell } from "../framework/GridCell.js";
import { Icon } from "../framework/Icon.js";
import { Input } from "../framework/Input.js";
import { Label } from "../framework/Label.js";
import { UIComponent } from "../framework/UIComponent.js";
import { ChildAlignment } from "../framework/ui-types.js";

export enum ValueEditorEntryType {
    Title,
    Value,
    Description,
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
}

export interface IValueDialogState {
    id: string;
    caption: string;
    entries: IValueEditorEntry[];
    valueMap: Map<string, IValueEditorValueEntry>;
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
            valueMap: new Map(),
            entries: [],
        };
    }

    public async show(id: string, caption: string, entries: IValueEditorEntry[]): Promise<IDialogResponse> {
        this.signal = new Semaphore<IDialogResponse>();
        const map = new Map<string, IValueEditorValueEntry>();
        entries.forEach((entry) => {
            if (entry.type === ValueEditorEntryType.Value) {
                map.set(entry.id, { ...(entry as IValueEditorValueEntry) });
            }
        });

        this.setState({ id, caption, valueMap: map, entries }, () => {
            return this.dialogRef.current?.open();
        });

        const result = await this.signal.wait();
        this.signal = undefined;

        return result;
    };

    public render(): ComponentChild {
        const { id, caption, entries, valueMap } = this.state;

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
                    <Icon src={Codicon.PassFilled} />
                    <Label>{caption}</Label>
                </>
            }
            actions={[
                <Button
                    id="cancel"
                    key="cancel"
                    caption="Cancel"
                    onClick={this.handleButtonClick}
                />,
                <Button
                    id="accept"
                    key="accept"
                    caption="OK"
                    onClick={this.handleButtonClick}
                />,
            ]}
            onClose={this.closeDialog}
        >
            <Grid columns={8} columnGap={8}>
                {cells}
            </Grid>
        </Dialog>;
    }

    private handleValueChange = (e: InputEvent): void => {
        const { valueMap } = this.state;

        const target = e.target as HTMLInputElement;
        const id = target.id;
        const props: IValueEditorValueEntry = {
            type: ValueEditorEntryType.Value,
            id,
            content: target.value,
        };

        valueMap.set(id, props);
        this.setState({ valueMap });
    };

    private handleButtonClick = (e: MouseEvent | KeyboardEvent): void => {
        const { id, valueMap } = this.state;

        const target = e.currentTarget as HTMLElement;

        let closure;
        switch (target.id) {
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
        this.signal?.notify({ id, closure, values: valueMap.size > 0 ? Array.from(valueMap.values()) : [] });
    };

    private closeDialog = (returnValue: string): void => {
        if (returnValue === "cancelled") {
            const { id, valueMap } = this.state;

            this.signal?.notify({
                id,
                closure: DialogResponseClosure.Cancel,
                values: valueMap.size > 0 ? Array.from(valueMap.values()) : []
            });
        }
    };
}
