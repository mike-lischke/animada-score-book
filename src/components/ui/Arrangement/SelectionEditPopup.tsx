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
import { NoteLengthToolbar } from "./NoteLengthToolbar.js";
import { NoteStyleBar } from "./NoteStyleBar.js";
import { SubdivisionToolbar } from "./SubdivisionToolbar.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Popup } from "../framework/Popup.js";
import { Separator } from "../Separator.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

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

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
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
                showArrow={false}
            >
                {content}
            </Popup>
        );
    }

    private handleSelectionChanged = (): Promise<boolean> => {
        this.updatePopup();

        return Promise.resolve(true);
    };

    private updatePopup(): void {
        const { editMode, selectionManager, scoreElementRegistry } = this.props;
        const entries = [...selectionManager.currentSelection.values()];
        if (!editMode || entries.length === 0) {
            this.popupRef.current?.close(true);

            return;
        }

        let anchor: HTMLElement | undefined;
        for (let index = entries.length - 1; index >= 0 && anchor === undefined; index--) {
            const elements = scoreElementRegistry.findTargetElements(entries[index].target);
            anchor = elements.find((element) => {
                return element.isConnected;
            });
        }

        if (anchor === undefined) {
            this.popupRef.current?.close(true);

            return;
        }

        const popup = this.popupRef.current;
        if (!popup) {
            return;
        }

        if (popup.isOpen) {
            popup.updatePosition(anchor);
        } else {
            popup.open(anchor);
        }
    }
}
