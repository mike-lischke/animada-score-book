/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import type { IScoreCreationSettings } from "../../../core/AppStorage.js";
import { Semaphore } from "../../../supplement/Semaphore.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dialog, DialogResponseClosure } from "../framework/Dialog.js";
import { Icon } from "../framework/Icon.js";
import { Input, type IInputProperties } from "../framework/Input.js";
import { Label } from "../framework/Label.js";
import { UIComponent } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIIcon } from "../framework/UIIcon.js";
import type { ISelectionDialogItem } from "./SelectionDialog.js";

export interface INewScoreShowOptions {
    items: ISelectionDialogItem[];

    /** The last-used creation settings, used to pre-fill the dialog. */
    defaultSettings?: IScoreCreationSettings;
}

export interface INewScoreResult {
    closure: DialogResponseClosure;
    title: string;
    timeSignature: string;
    pulse: string;
    stepResolution: number;
    barCount: number;
    tempo: number;
    selectedItems: ISelectionDialogItem[];
}

interface INewScoreTimeSignature {
    signature: string;
    pulse: string;
    stepResolution: number;
}

/** The time signatures the grid/staff rendering supports, with their grid parameters. */
const timeSignatureOptions: INewScoreTimeSignature[] = [
    { signature: "4/4", pulse: "1/4", stepResolution: 16 },
    { signature: "6/8", pulse: "3/8", stepResolution: 8 },
    { signature: "5/4", pulse: "1/2", stepResolution: 8 },
    { signature: "7/8", pulse: "1/2", stepResolution: 8 },
];

interface INewScoreDialogState {
    items: ISelectionDialogItem[];
    selectedIds: string[];
    title: string;
    timeSignature: string;
    barCount: string;
    tempo: string;
}

export class NewScoreDialog extends UIComponent<{}, INewScoreDialogState> {
    private dialogRef = createRef<Dialog>();
    private signal?: Semaphore<INewScoreResult>;

    public constructor(props: {}) {
        super(props);

        this.state = {
            items: [],
            selectedIds: [],
            title: "",
            timeSignature: "4/4",
            barCount: "1",
            tempo: "110",
        };
    }

    public async show(options: INewScoreShowOptions): Promise<INewScoreResult | undefined> {
        const { items, defaultSettings } = options;

        this.signal = new Semaphore<INewScoreResult>();
        this.setState({
            items,
            selectedIds: this.resolveDefaultSelectedIds(items, defaultSettings),
            title: "",
            timeSignature: defaultSettings?.timeSignature ?? "4/4",
            barCount: String(defaultSettings?.barCount ?? 1),
            tempo: defaultSettings?.tempo ?? "110",
        }, () => {
            return this.dialogRef.current?.open();
        });

        const result = await this.signal.wait();
        this.signal = undefined;

        return result;
    }

    public render(): ComponentChild {
        const { items, selectedIds, title, timeSignature, barCount, tempo } = this.state;

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
                        {selected && <Icon src={UIIcon.Check} width={18} height={18} />}
                    </Container>
                </Button>
            );
        });

        const signatureOptions = timeSignatureOptions.map((option) => {
            return (
                <option key={option.signature} value={option.signature}>
                    {option.signature}
                </option>
            );
        });

        return (
            <Dialog
                ref={this.dialogRef}
                caption={
                    <>
                        <Icon src={UIIcon.Music} />
                        <Label>New Song</Label>
                    </>
                }
                actions={[
                    <Button
                        id="accept"
                        key="accept"
                        caption="Create"
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
                        <Label caption="Title" style={{ width: "120px" }} />
                        <Input
                            id="newScoreTitle"
                            value={title}
                            placeholder="Untitled Arrangement"
                            autoFocus
                            style={{ flex: 1 }}
                            onChange={this.handleTitleChange}
                            onConfirm={this.handleInputConfirm}
                        />
                    </Container>
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ gap: "8px" }}
                    >
                        <Label caption="Time Signature" style={{ width: "120px" }} />
                        <select
                            id="newScoreTimeSignature"
                            className="du-select du-select-bordered du-select-sm"
                            value={timeSignature}
                            onChange={this.handleTimeSignatureChange}
                        >
                            {signatureOptions}
                        </select>
                    </Container>
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ gap: "8px" }}
                    >
                        <Label caption="Bars" style={{ width: "120px" }} />
                        <Input
                            id="newScoreBars"
                            value={barCount}
                            style={{ flex: 1 }}
                            onChange={this.handleBarCountChange}
                            onConfirm={this.handleInputConfirm}
                        />
                    </Container>
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ gap: "8px" }}
                    >
                        <Label caption="Tempo (BPM)" style={{ width: "120px" }} />
                        <Input
                            id="newScoreTempo"
                            value={tempo}
                            style={{ flex: 1 }}
                            onChange={this.handleTempoChange}
                            onConfirm={this.handleInputConfirm}
                        />
                    </Container>
                    <Label caption="Instruments" />
                    <Container
                        orientation={Orientation.TopDown}
                        className="selectionDialogList"
                        crossAlignment={ChildAlignment.Stretch}
                    >
                        {itemButtons}
                    </Container>
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
                </Container>
            </Dialog>
        );
    }

    private resolveDefaultSelectedIds(items: ISelectionDialogItem[],
        defaultSettings?: IScoreCreationSettings): string[] {
        const instrumentIds = defaultSettings?.instruments;
        if (instrumentIds === undefined) {
            return items.map((item) => {
                return item.id;
            });
        }

        return items
            .filter((item) => {
                return instrumentIds.includes(Number(item.id));
            })
            .map((item) => {
                return item.id;
            });
    }

    private handleButtonClick = (e: MouseEvent | KeyboardEvent): void => {
        const target = e.currentTarget as HTMLElement;
        const isAccept = target.id === "accept";

        this.dialogRef.current?.close(!isAccept);
    };

    private handleInputConfirm = (): void => {
        this.dialogRef.current?.close(false);
    };

    private handleTitleChange = (e: InputEvent, props: IInputProperties): void => {
        this.setState({ title: props.value ?? "" });
    };

    private handleTimeSignatureChange = (e: Event): void => {
        const select = e.currentTarget as HTMLSelectElement;

        this.setState({ timeSignature: select.value });
    };

    private handleBarCountChange = (e: InputEvent, props: IInputProperties): void => {
        this.setState({ barCount: props.value ?? "" });
    };

    private handleTempoChange = (e: InputEvent, props: IInputProperties): void => {
        this.setState({ tempo: props.value ?? "" });
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
            return;
        }

        const { selectedIds } = this.state;
        const next = selectedIds.includes(selectedId)
            ? selectedIds.filter((id) => {
                return id !== selectedId;
            })
            : [...selectedIds, selectedId];

        this.setState({ selectedIds: next });
    };

    private handleClose = (returnValue: string): void => {
        const { items, selectedIds, title, timeSignature, barCount, tempo } = this.state;

        if (returnValue !== "accept") {
            this.signal?.notify({
                closure: DialogResponseClosure.Cancel,
                title: "",
                timeSignature: "4/4",
                pulse: "1/4",
                stepResolution: 16,
                barCount: 1,
                tempo: 110,
                selectedItems: [],
            });

            return;
        }

        const signature = timeSignatureOptions.find((option) => {
            return option.signature === timeSignature;
        });

        const selectedItems = items.filter((item) => {
            return selectedIds.includes(item.id);
        });

        this.signal?.notify({
            closure: DialogResponseClosure.Accept,
            title: title.trim() || "Untitled Arrangement",
            timeSignature,
            pulse: signature?.pulse ?? "1/4",
            stepResolution: signature?.stepResolution ?? 16,
            barCount: this.parsePositiveInteger(barCount, 1),
            tempo: this.parsePositiveInteger(tempo, 110),
            selectedItems,
        });
    };

    private parsePositiveInteger(value: string, fallback: number): number {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1) {
            return fallback;
        }

        return parsed;
    }
}
