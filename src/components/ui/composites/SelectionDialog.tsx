/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Semaphore } from "../../../supplement/Semaphore.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dialog, DialogResponseClosure } from "../framework/Dialog.js";
import { Label } from "../framework/Label.js";
import { UIComponent } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIIcon } from "../framework/UIIcon.js";
import { Icon } from "../framework/Icon.js";

export interface ISelectionDialogItem {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    value?: unknown;
}

export interface ISelectionDialogShowOptions {
    title: string;
    message?: string;
    items: ISelectionDialogItem[];

    /** Item id that is selected initially. In multi-select mode only this item is selected; otherwise all are. */
    defaultItemId?: string;
    multiSelect?: boolean;
    acceptLabel?: string;
    cancelLabel?: string;
}

export interface ISelectionDialogResult {
    closure: DialogResponseClosure;
    selected?: ISelectionDialogItem;
    selectedItems?: ISelectionDialogItem[];
}

interface ISelectionDialogState {
    title: string;
    message: string;
    items: ISelectionDialogItem[];
    selectedIds: string[];
    multiSelect: boolean;
    acceptLabel: string;
    cancelLabel: string;
}

export class SelectionDialog extends UIComponent<{}, ISelectionDialogState> {
    private dialogRef = createRef<Dialog>();
    private signal?: Semaphore<{
        closure: DialogResponseClosure; selected?: ISelectionDialogItem; selectedItems?: ISelectionDialogItem[];
    }>;

    public constructor(props: {}) {
        super(props);

        this.state = {
            title: "",
            message: "",
            items: [],
            selectedIds: [],
            multiSelect: false,
            acceptLabel: "Select",
            cancelLabel: "Cancel",
        };
    }

    public async show(options: ISelectionDialogShowOptions): Promise<ISelectionDialogResult | undefined> {
        const { title, message, items, defaultItemId, multiSelect, acceptLabel, cancelLabel } = options;

        const selectedIds = multiSelect
            ? (defaultItemId !== undefined
                ? [defaultItemId]
                : items.map((item) => {
                    return item.id;
                }))
            : [defaultItemId ?? items[0].id];

        this.signal = new Semaphore<ISelectionDialogResult>();
        this.setState({
            title,
            message: message ?? "",
            items,
            selectedIds,
            multiSelect: multiSelect === true,
            acceptLabel: acceptLabel ?? "Select",
            cancelLabel: cancelLabel ?? "Cancel",
        }, () => {
            return this.dialogRef.current?.open();
        });

        const result = await this.signal.wait();
        this.signal = undefined;

        return result;
    }

    public render(): ComponentChild {
        const { title, message, items, selectedIds, multiSelect, acceptLabel, cancelLabel } = this.state;

        const className = this.generateFinalClassName(["selectionDialog"]);

        const itemButtons = items.map((item) => {
            const selected = selectedIds.includes(item.id);

            return (
                <Button
                    key={item.id}
                    className={selected ? "selectionDialogItem is-selected" : "selectionDialogItem"}
                    data-selection-id={item.id}
                    onClick={this.handleItemClick}
                >
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ width: "100%", justifyContent: "space-between" }}
                    >
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                            style={{ gap: "8px" }}
                        >
                            {item.icon && (
                                <Icon className="selectionDialogItemIcon" src={item.icon} width={20} height={20} />
                            )}
                            <span className="selectionDialogItemLabel">{item.label}</span>
                        </Container>
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                            style={{ gap: "8px" }}
                        >
                            {item.description && (
                                <span className="selectionDialogItemDescription">{item.description}</span>
                            )}
                            {selected && <Icon src={UIIcon.Check} width={18} height={18} />}
                        </Container>
                    </Container>
                </Button>
            );
        });

        let selectAllButtons: ComponentChild;
        if (multiSelect) {
            selectAllButtons = (
                <Container
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    style={{ gap: "8px", justifyContent: "flex-end" }}
                >
                    <Button
                        caption="Select All"
                        className="du-btn-sm"
                        onClick={this.handleSelectAll}
                    />
                    <Button
                        caption="Unselect All"
                        className="du-btn-sm"
                        onClick={this.handleUnselectAll}
                    />
                </Container>
            );
        }

        return (
            <Dialog
                ref={this.dialogRef}
                className={className}
                caption={
                    <>
                        <Icon src={UIIcon.Music} />
                        <Label>{title}</Label>
                    </>
                }
                actions={[
                    <Button
                        id="accept"
                        key="accept"
                        caption={acceptLabel}
                        isDefault
                        onClick={this.handleButtonClick}
                    />,
                    <Button
                        id="cancel"
                        key="cancel"
                        caption={cancelLabel}
                        onClick={this.handleButtonClick}
                    />,
                ]}
                onClose={this.handleClose}
            >
                {message && <Label caption={message} />}
                <Container
                    orientation={Orientation.TopDown}
                    className="selectionDialogList"
                    crossAlignment={ChildAlignment.Stretch}
                >
                    {itemButtons}
                </Container>
                {selectAllButtons}
            </Dialog>
        );
    }

    private handleButtonClick = (e: MouseEvent | KeyboardEvent): void => {
        const target = e.currentTarget as HTMLElement;
        const isAccept = target.id === "accept";

        this.dialogRef.current?.close(!isAccept);
    };

    private handleSelectAll = (): void => {
        const { items } = this.state;

        this.setState({
            selectedIds: items.map((item) => {
                return item.id;
            }),
        });
    };

    private handleUnselectAll = (): void => {
        this.setState({ selectedIds: [] });
    };

    private handleItemClick = (e: MouseEvent | KeyboardEvent): void => {
        const target = e.currentTarget as HTMLElement;
        const selectedId = target.dataset.selectionId;

        if (!selectedId) {
            if (!this.state.multiSelect) {
                this.dialogRef.current?.close(true);
            }

            return;
        }

        if (this.state.multiSelect) {
            const { selectedIds } = this.state;
            const next = selectedIds.includes(selectedId)
                ? selectedIds.filter((id) => {
                    return id !== selectedId;
                })
                : [...selectedIds, selectedId];

            this.setState({ selectedIds: next });

            return;
        }

        this.setState({ selectedIds: [selectedId] }, () => {
            this.dialogRef.current?.close(false);
        });
    };

    private handleClose = (returnValue: string): void => {
        const { items, selectedIds } = this.state;
        const closure = returnValue === "cancel" ? DialogResponseClosure.Cancel : DialogResponseClosure.Accept;

        if (closure !== DialogResponseClosure.Accept) {
            this.signal?.notify({ closure });

            return;
        }

        const selectedItems = items.filter((item) => {
            return selectedIds.includes(item.id);
        });

        this.signal?.notify({ closure, selected: selectedItems[0], selectedItems });
    };
}
