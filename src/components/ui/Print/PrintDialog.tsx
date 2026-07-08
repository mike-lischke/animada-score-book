/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../framework/Button.js";
import { CheckState, Toggle } from "../framework/Toggle.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Dialog } from "../framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { Icon } from "../framework/Icon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import type { BarsPerLine, IPrintOptions } from "./PrintView.js";

/** Compact descriptor for tracks — passed in by the caller when opening the dialog. */
export interface IPrintTrackInfo {
    id: number;
    name: string;
}

interface IPrintDialogState {
    options: IPrintOptions;
    availableTracks: IPrintTrackInfo[];
}

interface IPrintDialogProps extends ICommonUIProperties {
    /**
     * Called when the user accepts the dialog. The dialog is already closed when this is invoked.
     * The handler is responsible for triggering the actual print flow.
     */
    onAccept?: (options: IPrintOptions) => void;
}

/**
 * Modal dialog that lets the user configure the print / PDF export.
 */
export class PrintDialog extends UIComponent<IPrintDialogProps, IPrintDialogState> {
    private dialogRef = createRef<Dialog>();

    public constructor(props: IPrintDialogProps) {
        super(props);

        this.state = {
            options: {
                barsPerLine: "auto",
                showLegend: true,
                viewMode: "grid",
                selectedTrackIds: undefined,
            },
            availableTracks: [],
        };
    }

    public render(): ComponentChild {
        const { options, availableTracks } = this.state;

        const barsPerLineValues: BarsPerLine[] = ["auto", 1, 2, 4, 8];
        const barsPerLineItems: IDropdownItem[] = barsPerLineValues.map((value) => {
            return {
                label: value === "auto" ? "Auto" : String(value),
                onClick: () => {
                    this.updateOption("barsPerLine", value);
                },
            };
        });

        const barsPerLineLabel = options.barsPerLine === "auto" ? "Auto" : String(options.barsPerLine);
        const isTrackSelected = (id: number): boolean => {
            return options.selectedTrackIds === undefined || options.selectedTrackIds.has(id);
        };

        return (
            <Dialog
                ref={this.dialogRef}
                id="printDialog"
                onClose={this.handleClose}
                actions={[
                    <Button id="print-button-cancel" value="cancel" caption="Cancel" />,
                    <Button id="print-button-print" value="print" caption="Print" />,
                ]}
            >
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={Codicon.FilePdf} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Print / Export to PDF
                </Container>

                <Container className="form-card" orientation={Orientation.TopDown}>
                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="form-row-label">Bars per line</span>
                        <Dropdown
                            caption={barsPerLineLabel}
                            items={barsPerLineItems}
                            selectedItem={barsPerLineLabel}
                            closeOnSelect
                        />
                    </Container>

                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="form-row-label">Include legend</span>
                        <Toggle
                            id="print-show-legend"
                            checkState={options.showLegend ? CheckState.Checked : CheckState.Unchecked}
                            onChange={(_e, checkState) => {
                                this.updateOption("showLegend", checkState === CheckState.Checked);
                            }}
                        />
                    </Container>

                    <Container
                        className="form-row form-row-stacked"
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Stretch}
                    >
                        <span className="form-row-label">Tracks</span>
                        <Container
                            className="form-row-values"
                            orientation={Orientation.TopDown}
                            crossAlignment={ChildAlignment.Start}
                        >
                            {availableTracks.length === 0 && (
                                <span style={{ opacity: 0.6 }}>(no tracks)</span>
                            )}
                            {availableTracks.map((track) => {
                                return (
                                    <Container
                                        key={`track-${track.id}`}
                                        orientation={Orientation.LeftToRight}
                                        crossAlignment={ChildAlignment.Center}
                                        style={{ padding: "2px 0" }}
                                    >
                                        <Toggle
                                            id={`print-track-${track.id}`}
                                            checkState={isTrackSelected(track.id)
                                                ? CheckState.Checked : CheckState.Unchecked}
                                            onChange={(_e, checkState) => {
                                                this.toggleTrack(track.id, checkState === CheckState.Checked);
                                            }}
                                        />
                                        <span style={{ marginLeft: "8px" }}>{track.name}</span>
                                    </Container>
                                );
                            })}
                        </Container>
                    </Container>
                </Container>
            </Dialog>
        );
    }

    /**
     * Open the dialog, seeding the options and the list of selectable tracks.
     *
     * @param seed Partial options used to override the defaults / previous values.
     * @param availableTracks Tracks that can be toggled in the dialog.
     */
    public open(seed?: Partial<IPrintOptions>, availableTracks: IPrintTrackInfo[] = []): void {
        const { options, availableTracks: previousTracks } = this.state;
        const merged: IPrintOptions = { ...options, ...seed };

        // Detect whether the caller passed the same set of tracks as last time. If the
        // arrangement changed (different track ids), discard the previous selection and
        // select all tracks again.
        const previousIds = previousTracks.map((track) => {
            return track.id;
        }).sort();
        const currentIds = availableTracks.map((track) => {
            return track.id;
        }).sort();
        const sameArrangement = previousIds.length === currentIds.length
            && previousIds.every((id, index) => {
                return id === currentIds[index];
            });

        if (!sameArrangement || merged.selectedTrackIds === undefined) {
            merged.selectedTrackIds = new Set(currentIds);
        }

        this.setState({ options: merged, availableTracks }, () => {
            this.dialogRef.current?.open();
        });
    }

    private updateOption<K extends keyof IPrintOptions>(key: K, value: IPrintOptions[K]): void {
        const { options } = this.state;
        this.setState({ options: { ...options, [key]: value } });
    }

    private toggleTrack(trackId: number, checked: boolean): void {
        const { options } = this.state;
        const next = new Set(options.selectedTrackIds ?? []);
        if (checked) {
            next.add(trackId);
        } else {
            next.delete(trackId);
        }

        this.setState({ options: { ...options, selectedTrackIds: next } });
    }

    private handleClose = (returnValue: string): void => {
        const { onAccept } = this.props;
        const { options } = this.state;

        if (returnValue === "print") {
            onAccept?.(options);
        }
    };
}
