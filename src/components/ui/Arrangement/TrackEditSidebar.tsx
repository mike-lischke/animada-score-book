/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild, createRef } from "preact";

import type { ISbDmInstrument, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { DialogResponseClosure } from "../framework/Dialog.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { RadialMenu, type IRadialMenuItem } from "../framework/RadialMenu.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ComponentPlacement, type ICommonUIProperties, UIComponent } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { SelectionDialog } from "../composites/SelectionDialog.js";

export interface ITrackEditSidebarProps extends ICommonUIProperties {
    tracks: ISbDmTrack[];
    dataModel: ScoreBookDataModel;
}

/**
 * A sidebar that appears on the right side of the arrangement viewer when edit mode is active.
 * Each track row shows an ellipsis trigger that opens a radial menu with track actions:
 * delete, insert below, duplicate, clear.
 */
export class TrackEditSidebar extends UIComponent<ITrackEditSidebarProps> {
    private radialMenuRef = createRef<RadialMenu>();
    private selectionDialogRef = createRef<SelectionDialog>();

    public render(): ComponentChild {
        const { tracks } = this.props;

        const className = this.generateFinalClassName([
            "trackEditSidebar",
            "rounded-xl shadow-md border border-base-200",
        ]);

        const trackRows = tracks.map((track) => {
            return (
                <Container
                    key={track.id}
                    className="trackEditRow"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <button
                        className="trackEditTrigger"
                        title="Track actions"
                        aria-label="Track actions"
                        onClick={(e) => {
                            this.handleOpenMenu(track, e);
                        }}
                    >
                        <Icon src={UIIcon.KebabVertical} width={24} height={24} alt="Track actions" />
                    </button>
                </Container>
            );
        });

        const emptyState = tracks.length === 0 ? (
            <div className="trackEditEmpty">No tracks</div>
        ) : undefined;

        return (
            <>
                <Container
                    className={className}
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    <div className="trackEditSidebarHeader">Track Actions</div>
                    <Container
                        className="trackEditSidebarPanel"
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Stretch}
                    >
                        {trackRows}
                        {emptyState}
                    </Container>
                </Container>
                <RadialMenu ref={this.radialMenuRef} />
                <SelectionDialog ref={this.selectionDialogRef} />
            </>
        );
    }

    private handleOpenMenu = (track: ISbDmTrack, event: MouseEvent): void => {
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();

        const items: IRadialMenuItem[] = [{
            id: "add",
            label: "Add ›",
            tooltip: "Add a new track. Its position in the arrangement depends on the instrument you choose.",
            icon: <Icon src={UIIcon.Add} width={20} height={20} />,
            onClick: () => {
                void this.handleAdd(track);
            },
        }, {
            id: "duplicate",
            label: "Duplicate",
            tooltip: "Duplicate this track, including all notes and settings.",
            icon: <Icon src={UIIcon.Copy} width={20} height={20} />,
            onClick: () => {
                this.handleDuplicate(track);
            },
        }, {
            id: "clear",
            label: "Clear",
            tooltip: "Clear all notes and settings from this track.",
            icon: <Icon src={UIIcon.ClearAll} width={20} height={20} />,
            onClick: () => {
                this.handleClear(track);
            },
        }, {
            id: "delete",
            label: "Delete ›",
            tooltip: "Delete this track and all notes in it.",
            icon: <Icon src={UIIcon.Trash} width={20} height={20} />,
            onClick: () => {
                this.handleDelete(track);
            },
        }];

        this.radialMenuRef.current?.open(rect, ComponentPlacement.LeftCenter, items, 80);
    };

    private handleAdd = async (track: ISbDmTrack): Promise<void> => {
        const { dataModel } = this.props;
        const instruments = [...dataModel.instruments].sort((left, right) => {
            return left.displayOrder - right.displayOrder || left.displayName.localeCompare(right.displayName);
        });

        const selection = await this.selectionDialogRef.current?.show({
            title: "Add Tracks",
            message: "Choose the instruments for the new tracks.",
            items: instruments.map((instrument) => {
                return {
                    id: instrument.typeId,
                    label: instrument.displayName,
                    icon: instrument.image.filePath,
                    value: instrument,
                };
            }),
            multiSelect: true,
            defaultItemId: track.instrument.typeId,
            acceptLabel: "Add Tracks",
            cancelLabel: "Cancel",
        });

        if (selection?.closure !== DialogResponseClosure.Accept) {
            return;
        }

        const selectedInstruments = (selection.selectedItems ?? [])
            .map((item) => {
                return dataModel.instruments.find((entry) => {
                    return entry.typeId === item.id;
                });
            })
            .filter((instrument): instrument is ISbDmInstrument => {
                return instrument !== undefined;
            });

        for (const instrument of selectedInstruments) {
            dataModel.addTrack(instrument);
        }
    };

    private handleDelete = (track: ISbDmTrack): void => {
        this.props.dataModel.removeTrack(track);
    };

    private handleDuplicate = (track: ISbDmTrack): void => {
        const { dataModel } = this.props;

        dataModel.duplicateTrack(track);
    };

    private handleClear = (track: ISbDmTrack): void => {
        const { dataModel } = this.props;

        dataModel.clearTrack(track);
    };
}
