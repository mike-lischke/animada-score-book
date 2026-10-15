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
import { ScoreElementKind, type ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";
import {
    SelectionGranularity, type ISelectionEntry, type ISelectionTarget,
} from "../../../ui/SelectionSerializer.js";
import { ArticulationToolbar } from "./ArticulationToolbar.js";
import { NoteLengthToolbar } from "./NoteLengthToolbar.js";
import { NoteStyleBar } from "./NoteStyleBar.js";
import { SubdivisionToolbar } from "./SubdivisionToolbar.js";
import { TrackPieceToolbar } from "./TrackPieceToolbar.js";
import { SelectionToolbar } from "./SelectionToolbar.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Popup } from "../framework/Popup.js";
import { Separator } from "../Separator.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface ISelectionPlacement {
    anchor: HTMLElement;

    /** The point above the selection the popup is centered on; absent while the selection is out of view. */
    bounds?: DOMRect;
}

export interface ISelectionEditPopupProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
    scoreElementRegistry: ScoreElementRegistry;
    editMode: boolean;
    entryMode: EditEntryMode;
    trackViewMode: "grid" | "staff";
}

/**
 * Hosts note and selection-structure tools at the currently selected score elements. The popup hangs above the
 * visible part of the selection and hides while the selection is scrolled out of view.
 */
export class SelectionEditPopup extends UIComponent<ISelectionEditPopupProps> {
    private popupRef = createRef<Popup | null>();
    private selectionGestureInProgress = false;
    private staffWindowFrame = 0;

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("selectionGestureChanged", this.handleSelectionGestureChanged);
        requisitions.register("staffWindowChanged", this.handleStaffWindowChanged);
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
        requisitions.unregister("staffWindowChanged", this.handleStaffWindowChanged);

        if (this.staffWindowFrame !== 0) {
            cancelAnimationFrame(this.staffWindowFrame);
            this.staffWindowFrame = 0;
        }

        this.popupRef.current?.close(true);
    }

    public render(): ComponentChild {
        const { selectionManager, editMode, trackViewMode } = this.props;
        const entries = [...selectionManager.currentSelection.values()];

        // A track-piece selection in the staff view gets its own layout, everything else the shared tools.
        const isTrackPieceSelection = trackViewMode === "staff" && entries.length > 0 && entries.every((entry) => {
            return entry.granularity === SelectionGranularity.TrackPiece;
        });

        let content: ComponentChild;
        if (editMode && entries.length > 0) {
            content = isTrackPieceSelection ? this.renderTrackPieceTools() : this.renderGenericTools(entries);
        }

        let className: string;
        if (isTrackPieceSelection) {
            className = `selection-edit-popup ${SelectionToolbar.surfaceClassName}`;
        } else {
            className = "selection-edit-popup";
        }

        return (
            <Popup
                id="selectionEditPopup"
                ref={this.popupRef}
                className={className}
                placement={ComponentPlacement.TopCenter}
                offset={8}
                boundsProvider={this.selectionBounds}
                showArrow={false}
            >
                {content}
            </Popup>
        );
    }

    /**
     * @param element The element to measure the visible part of.
     *
     * @returns The area the ancestors of the element show of it, in viewport coordinates.
     */
    private static visibleAreaOf(element: HTMLElement): DOMRect {
        let left = -Infinity;
        let top = -Infinity;
        let right = Infinity;
        let bottom = Infinity;

        // A clipped or scrollable ancestor states how much of its content is on screen, so what all of the
        // element's ancestors still show of it is the area the element is visible in.
        for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
            const { overflowX, overflowY } = getComputedStyle(parent);
            if (overflowX === "visible" && overflowY === "visible") {
                continue;
            }

            const rect = parent.getBoundingClientRect();
            if (overflowX !== "visible") {
                left = Math.max(left, rect.left);
                right = Math.min(right, rect.right);
            }

            if (overflowY !== "visible") {
                top = Math.max(top, rect.top);
                bottom = Math.min(bottom, rect.bottom);
            }
        }

        return new DOMRect(left, top, right - left, bottom - top);
    }

    /**
     * Centers the anchor over the selection: over both of its ends while both are in view, over the visible one
     * and the view side the other one lies behind while only one is, and over the view while the selection covers
     * it. A selection that is scrolled fully past one of the view's sides has no anchor at all.
     *
     * @param left The left edge of the rendered selection.
     * @param right The right edge of the rendered selection.
     * @param view The area the score view shows.
     *
     * @returns The x the anchor is centered on, or undefined while nothing of the selection is shown.
     */
    private static anchorCenter(left: number, right: number, view: DOMRect): number | undefined {
        if (right <= view.left || left >= view.right) {
            return undefined;
        }

        if (left < view.left) {
            return (view.left + right) / 2;
        }

        if (right > view.right) {
            return (left + view.right) / 2;
        }

        return (left + right) / 2;
    }

    /**
     * Renders the tools of a track-piece selection: the title and the piece actions.
     *
     * @returns The track-piece tools.
     */
    private renderTrackPieceTools(): ComponentChild {
        const { dataModel, selectionManager } = this.props;

        return (
            <TrackPieceToolbar dataModel={dataModel} selectionManager={selectionManager} />
        );
    }

    /**
     * Renders the note and structure tools every other selection kind shares.
     *
     * @param entries The selection entries, never empty.
     *
     * @returns The shared tools.
     */
    private renderGenericTools(entries: ISelectionEntry[]): ComponentChild {
        const { dataModel, selectionManager, entryMode, trackViewMode } = this.props;
        const hasNoteTargets = entries.some((entry) => {
            return entry.granularity === SelectionGranularity.Note
                || entry.granularity === SelectionGranularity.NoteGroup;
        });
        const allNoteTargets = entries.every((entry) => {
            return entry.granularity === SelectionGranularity.Note
                || entry.granularity === SelectionGranularity.NoteGroup;
        });
        const allMeasures = entries.every((entry) => {
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
                title="Delete selection"
                caption="Delete"
                onClick={() => {
                    void requisitions.execute("selectionDeleteRequested", undefined);
                }}
            />;
        }

        const showTuplets = allNoteTargets;
        const showRepeatBars = trackViewMode === "staff" && allMeasures;

        let structureTools: ComponentChild;
        if (showTuplets || showRepeatBars) {
            structureTools = (
                <>
                    <Separator />
                    <SubdivisionToolbar
                        selectionManager={selectionManager}
                        dataModel={dataModel}
                        showTuplets={showTuplets}
                        showSimile={false}
                        showRepeatBars={showRepeatBars}
                    />
                </>
            );
        }

        return (
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

    private selectionBounds = (): DOMRect | undefined => {
        return this.selectionPlacement()?.bounds;
    };

    private handleSelectionChanged = (): Promise<boolean> => {
        // A gesture clears the selection before it selects what the pointer hit, so an empty selection reported
        // while one runs is a transient state — closing the popup on it would only make the popup blink.
        if (this.selectionGestureInProgress && this.props.selectionManager.currentSelection.size === 0) {
            return Promise.resolve(true);
        }

        // A drag replaces the selection as it goes, so the popup follows the rectangle while it is drawn: the
        // anchor it is placed by is read from the selection that the hit test has just replaced.
        this.updatePopup();

        // The rendered content follows the selection, which the popup reads while rendering. Opening the popup
        // does not re-render this component, so the new selection has to be drawn again explicitly.
        this.forceUpdate();

        return Promise.resolve(true);
    };

    private handleSelectionGestureChanged = (active: boolean): Promise<boolean> => {
        this.selectionGestureInProgress = active;

        // A gesture that ends on what is already selected publishes no change, yet it may have closed the popup
        // — a click outside does — so the state is settled again when the gesture ends.
        if (!active) {
            this.updatePopup();
            this.forceUpdate();
        }

        return Promise.resolve(true);
    };

    private handleStaffWindowChanged = (): Promise<boolean> => {
        // Measures that mounted with the window are laid out by the time the frame that mounted them is over, and
        // the window changes while the view is resized: placing the popup right away would read bounds that are
        // still moving — and opening it inside the resize that moved them makes the browser report an observation
        // loop, because the popup observes its anchor.
        if (this.staffWindowFrame === 0) {
            this.staffWindowFrame = requestAnimationFrame(() => {
                this.staffWindowFrame = 0;
                this.updatePopup();
            });
        }

        return Promise.resolve(true);
    };

    private updatePopup(): void {
        const { editMode, selectionManager } = this.props;
        if (!editMode || selectionManager.currentSelection.size === 0) {
            this.popupRef.current?.close(true);

            return;
        }

        const geometry = this.selectionPlacement();
        if (geometry === undefined) {
            this.popupRef.current?.close(true);

            return;
        }

        const popup = this.popupRef.current;
        if (!popup) {
            return;
        }

        // Bounds are missing while the selection is out of view. The popup stays open then and is hidden by them,
        // which is what makes it appear again once the selection is scrolled back in.
        if (popup.isOpen) {
            popup.updatePosition(geometry.anchor);
        } else {
            popup.open(geometry.anchor);
        }
    }

    /**
     * Resolves where the popup is placed for the current selection: the row it hangs on, and the point it is
     * centered on, which is absent while nothing of the selection is in view.
     *
     * @returns The placement, or undefined when the selection has no rendered row to hang on.
     */
    private selectionPlacement(): ISelectionPlacement | undefined {
        const { selectionManager, scoreElementRegistry } = this.props;
        const entries = [...selectionManager.currentSelection.values()];
        let anchor: HTMLElement | undefined;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;

        for (let index = entries.length - 1; index >= 0; index--) {
            const { target } = entries[index];

            // The popup is placed by the bounds of the addressed elements, but it hangs on the track row they
            // are drawn in: the row outlives the notation an edit re-renders, so the popup stays open.
            anchor ??= this.anchorOf(target);

            for (const element of scoreElementRegistry.findTargetElements(target)) {
                if (!element.isConnected) {
                    continue;
                }

                anchor ??= element;
                const rect = element.getBoundingClientRect();
                left = Math.min(left, rect.left);
                top = Math.min(top, rect.top);
                right = Math.max(right, rect.right);
            }
        }

        if (anchor === undefined) {
            return undefined;
        }

        // The anchor sits on the top edge of the selection. That edge leaves the view when the content is
        // scrolled away, which hides the popup until the anchor is shown again.
        const view = SelectionEditPopup.visibleAreaOf(anchor);
        const center = left > right ? undefined : SelectionEditPopup.anchorCenter(left, right, view);
        if (center === undefined || top < view.top || top > view.bottom) {
            return { anchor };
        }

        return { anchor, bounds: new DOMRect(center, top, 0, 0) };
    }

    /**
     * Resolves the element the popup hangs on: the track row the addressed target is drawn in.
     *
     * @param target The model objects the selection addresses.
     *
     * @returns The row element, or undefined when no row of the target is rendered.
     */
    private anchorOf(target: ISelectionTarget): HTMLElement | undefined {
        const { scoreElementRegistry } = this.props;

        // A whole track or measure covers the pieces of several tracks or bars, which the registry resolves
        // itself; every other target names the one piece it addresses.
        const rows = target.granularity === SelectionGranularity.Track
            || target.granularity === SelectionGranularity.Measure
            ? scoreElementRegistry.findTargetElements(target, ScoreElementKind.TrackRow)
            : scoreElementRegistry.findElements(ScoreElementKind.TrackRow, target.measure.number,
                target.measure.track.id);

        return rows.find((element) => {
            return element.isConnected;
        });
    }
}
