/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";
import { createRef } from "preact";

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { EditEntryMode } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";
import { SelectionGranularity } from "../../../ui/SelectionSerializer.js";
import { ArticulationToolbar } from "./ArticulationToolbar.js";
import { EntryModeButton } from "./EntryModeButton.js";
import { NoteLengthToolbar } from "./NoteLengthToolbar.js";
import { NoteStyleBar } from "./NoteStyleBar.js";
import { SubdivisionToolbar } from "./SubdivisionToolbar.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Popup } from "../framework/Popup.js";
import { Separator } from "../Separator.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface ISelectionPopupGeometry {
    anchor: HTMLElement;
    bounds: DOMRect;
}

export interface ISelectionEditPopupProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
    scoreElementRegistry: ScoreElementRegistry;
    editMode: boolean;
    entryMode: EditEntryMode;
    trackViewMode: "grid" | "staff";
}

/** Hosts note and selection-structure tools at the currently selected score elements. */
export class SelectionEditPopup extends UIComponent<ISelectionEditPopupProps> {
    private popupRef = createRef<Popup | null>();
    private selectionGestureInProgress = false;

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("selectionGestureChanged", this.handleSelectionGestureChanged);
        this.updatePopup();
    }

    public override componentDidUpdate(previousProps: ISelectionEditPopupProps): void {
        const { editMode, entryMode, trackViewMode } = this.props;

        if (previousProps.editMode !== editMode || previousProps.entryMode !== entryMode
            || previousProps.trackViewMode !== trackViewMode) {
            this.updatePopup();
        }
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("selectionGestureChanged", this.handleSelectionGestureChanged);
        this.popupRef.current?.close(true);
    }

    public render(): ComponentChild {
        const { dataModel, selectionManager, editMode, entryMode, trackViewMode } = this.props;
        const entries = [...selectionManager.currentSelection.values()];
        const hasNoteTargets = entries.some((entry) => {
            return entry.granularity === SelectionGranularity.Note
                || entry.granularity === SelectionGranularity.NoteGroup;
        });
        const allNoteTargets = entries.length > 0 && entries.every((entry) => {
            return entry.granularity === SelectionGranularity.Note
                || entry.granularity === SelectionGranularity.NoteGroup;
        });
        const allTrackPieces = entries.length > 0 && entries.every((entry) => {
            return entry.granularity === SelectionGranularity.TrackPiece;
        });
        const allMeasures = entries.length > 0 && entries.every((entry) => {
            return entry.granularity === SelectionGranularity.Measure;
        });

        let noteTools: ComponentChild;
        let noteLengthTools: ComponentChild;
        let deleteAction: ComponentChild;
        if (hasNoteTargets) {
            noteTools = (
                <Container
                    className="selectionNoteTools"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <NoteStyleBar
                        dataModel={dataModel}
                        selectionManager={selectionManager}
                        trackViewMode={trackViewMode}
                        entryMode={entryMode}
                    />
                    <ArticulationToolbar
                        dataModel={dataModel}
                        selectionManager={selectionManager}
                        entryMode={entryMode}
                    />
                </Container>
            );

            if (trackViewMode === "staff") {
                noteLengthTools = (
                    <NoteLengthToolbar
                        dataModel={dataModel}
                        selectionManager={selectionManager}
                        entryMode={entryMode}
                    />
                );
            }

        }

        const isCursorOnly = trackViewMode === "staff" && entryMode === EditEntryMode.Insert
            && entries.every((entry) => {
                return entry.granularity === SelectionGranularity.Note;
            });
        if (entries.length > 0 && !isCursorOnly) {
            deleteAction = <Button
                className="selectionDeleteButton"
                data-tooltip="Delete selection"
                caption="Delete"
                onClick={() => {
                    void requisitions.execute("selectionDeleteRequested", undefined);
                }}
            />;
        }

        const showTuplets = allNoteTargets;
        const showSimile = trackViewMode === "staff" && allTrackPieces;
        const showRepeatBars = trackViewMode === "staff" && allMeasures;

        let structureTools: ComponentChild;
        if (showTuplets || showSimile || showRepeatBars) {
            structureTools = (
                <>
                    <Separator />
                    <SubdivisionToolbar
                        selectionManager={selectionManager}
                        dataModel={dataModel}
                        showTuplets={showTuplets}
                        showSimile={showSimile}
                        showRepeatBars={showRepeatBars}
                    />
                </>
            );
        }

        // The insert/overwrite choice only exists in the staff view, so the grid view gets no header row.
        let headerRow: ComponentChild;
        if (trackViewMode === "staff") {
            headerRow = (
                <Container
                    className="selectionEditHeader"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.End}
                    crossAlignment={ChildAlignment.Center}
                >
                    <EntryModeButton entryMode={entryMode} />
                </Container>
            );
        }

        let content: ComponentChild;
        if (editMode && entries.length > 0) {
            content = (
                <Container
                    id="selectionEditActions"
                    className="selectionEditActions"
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Stretch}
                    gap={8}
                >
                    {headerRow}
                    {noteTools}
                    {noteLengthTools}
                    {structureTools}
                    {deleteAction}
                </Container>
            );
        }

        return (
            <Popup
                id="selectionEditPopup"
                ref={this.popupRef}
                className="selection-edit-popup"
                placement={ComponentPlacement.BottomCenter}
                offset={8}
                boundsProvider={this.selectionBounds}
                showArrow={false}
            >
                {content}
            </Popup>
        );
    }

    private selectionBounds = (): DOMRect | undefined => {
        return this.selectionGeometry()?.bounds;
    };

    private handleSelectionChanged = (): Promise<boolean> => {
        if (this.selectionGestureInProgress) {
            return Promise.resolve(true);
        }

        this.updatePopup();

        // The rendered content follows the selection, which the popup reads while rendering. Opening the popup
        // does not re-render this component, so the new selection has to be drawn again explicitly.
        this.forceUpdate();

        return Promise.resolve(true);
    };

    private handleSelectionGestureChanged = (active: boolean): Promise<boolean> => {
        this.selectionGestureInProgress = active;
        if (active) {
            this.popupRef.current?.close(true);
        } else {
            this.updatePopup();
            this.forceUpdate();
        }

        return Promise.resolve(true);
    };

    private updatePopup(): void {
        const { editMode, selectionManager } = this.props;
        if (!editMode || selectionManager.currentSelection.size === 0 || this.selectionGestureInProgress) {
            this.popupRef.current?.close(true);

            return;
        }

        const geometry = this.selectionGeometry();
        if (geometry === undefined) {
            this.popupRef.current?.close(true);

            return;
        }

        const popup = this.popupRef.current;
        if (!popup) {
            return;
        }

        if (popup.isOpen) {
            popup.updatePosition(geometry.anchor);
        } else {
            popup.open(geometry.anchor);
        }
    }

    private selectionGeometry(): ISelectionPopupGeometry | undefined {
        const { selectionManager, scoreElementRegistry } = this.props;
        const entries = [...selectionManager.currentSelection.values()];
        let anchor: HTMLElement | undefined;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;

        for (let index = entries.length - 1; index >= 0; index--) {
            const elements = scoreElementRegistry.findTargetElements(entries[index].target);
            for (const element of elements) {
                if (!element.isConnected) {
                    continue;
                }

                anchor ??= element;
                const rect = element.getBoundingClientRect();
                left = Math.min(left, rect.left);
                top = Math.min(top, rect.top);
                right = Math.max(right, rect.right);
                bottom = Math.max(bottom, rect.bottom);
            }
        }

        if (anchor === undefined) {
            return undefined;
        }

        return { anchor, bounds: new DOMRect(left, top, right - left, bottom - top) };
    }
}
