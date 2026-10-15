/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild, createRef } from "preact";

import type { ISbDmInstrument, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { StaffRowGeometry, type IStaffRowGeometry } from "../../../core/StaffRowGeometry.js";
import { DialogResponseClosure } from "../framework/Dialog.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { UIIcon } from "../framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { SelectionDialog } from "../composites/SelectionDialog.js";
import { TrackToolbar } from "./TrackToolbar.js";
import type { ISelectionToolbarAction } from "./SelectionToolbar.js";

export interface ITrackEditSidebarProps extends ICommonUIProperties {
    tracks: ISbDmTrack[];
    dataModel: ScoreBookDataModel;

    /** The panel's root element, so the viewer can draw its edge over the full height of the score. */
    innerRef?: preact.RefObject<HTMLDivElement | null>;

    /**
     * The shared row geometry of every track, so the sidebar rows line up with the staff rows they belong to.
     * Omitted in grid mode, where the rows keep the grid cell height.
     */
    rowGeometries?: ReadonlyMap<number, IStaffRowGeometry>;
}

/**
 * A sidebar that appears on the right side of the arrangement viewer when edit mode is active.
 * Each track row shows an ellipsis trigger that slides out the track toolbar with track actions:
 * add, duplicate, clear, delete.
 */
export class TrackEditSidebar extends UIComponent<ITrackEditSidebarProps> {
    private toolbarRef = createRef<TrackToolbar | null>();
    private selectionDialogRef = createRef<SelectionDialog | null>();

    public render(): ComponentChild {
        const { tracks, rowGeometries, innerRef } = this.props;

        const className = this.generateFinalClassName(["trackEditSidebar"]);

        const trackRows = tracks.map((track) => {
            const geometry = rowGeometries?.get(track.id);
            const rowStyle = geometry === undefined
                ? undefined
                : {
                    "--track-row-height": StaffRowGeometry.formatPx(geometry.heightPx),
                    "--staff-centre": StaffRowGeometry.formatPx(geometry.centrePx),
                };

            return (
                <Container
                    key={track.id}
                    className="trackEditRow"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.Center}
                    crossAlignment={ChildAlignment.Center}
                    style={rowStyle}
                >
                    <button
                        className="trackEditTrigger"
                        title="Track actions"
                        aria-label="Track actions"
                        onClick={(e) => {
                            this.handleOpenToolbar(track, e);
                        }}
                    >
                        <Icon src={UIIcon.KebabVertical} width={16} height={16} alt="Track actions" />
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
                    innerRef={innerRef}
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    <Container
                        className="trackEditSidebarPanel"
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Stretch}
                    >
                        {trackRows}
                        {emptyState}
                    </Container>
                </Container>
                <TrackToolbar ref={this.toolbarRef} />
                <SelectionDialog ref={this.selectionDialogRef} />
            </>
        );
    }

    private handleOpenToolbar = (track: ISbDmTrack, event: MouseEvent): void => {
        const anchor = event.currentTarget as HTMLElement;

        const items: ISelectionToolbarAction[] = [{
            id: "add",
            tooltip: "Add a new track. Its position in the arrangement depends on the instrument you choose.",
            icon: <Icon src={UIIcon.Add} />,
            onClick: () => {
                void this.handleAdd(track);
            },
        }, {
            id: "duplicate",
            tooltip: "Duplicate this track, including all notes and settings.",
            icon: <Icon src={UIIcon.Copy} />,
            onClick: () => {
                this.handleDuplicate(track);
            },
        }, {
            id: "clear",
            tooltip: "Clear all notes and settings from this track.",
            icon: <Icon src={UIIcon.ClearAll} />,
            onClick: () => {
                this.handleClear(track);
            },
        }, {
            id: "delete",
            tooltip: "Delete this track and all notes in it.",
            icon: <Icon src={UIIcon.Trash} />,
            destructive: true,
            onClick: () => {
                this.handleDelete(track);
            },
        }];

        this.toolbarRef.current?.open(anchor, {
            title: track.instrument.displayName,
            color: track.instrument.color,
            items,
        });
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
