/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, RefObject } from "preact";
import { createRef } from "preact";

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { modelEventAt } from "../../../core/MeasureProjection.js";
import { compareFractions } from "../../../core/serialisation/numeric-functions.js";
import { EditEntryMode, TrackViewMode } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { ScoreElementKind, ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";
import {
    SelectionGranularity, type ISelectionEntry, type ISelectionTarget,
} from "../../../ui/SelectionSerializer.js";
import { NoteToolbar } from "./NoteToolbar.js";
import { TrackPieceToolbar } from "./TrackPieceToolbar.js";
import { SelectionToolbar } from "./SelectionToolbar.js";
import { Popup } from "../framework/Popup.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface ISelectionPlacement {
    anchor: HTMLElement;

    /**
     * The span of the addressed elements the popup hangs under and is centered on; absent while the selection
     * is out of view.
     */
    bounds?: DOMRect;
}

export interface ISelectionEditPopupProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
    scoreElementRegistry: ScoreElementRegistry;
    editMode: boolean;
    entryMode: EditEntryMode;
    trackViewMode: TrackViewMode;

    /**
     * The element the score is drawn in, which holds the rows and the selected elements. A press on it addresses
     * score elements, so the selection it produces decides what happens to the popup.
     */
    scoreHost: RefObject<HTMLElement | null>;
}

/**
 * Hosts note and selection-structure tools at the currently selected score elements. The popup hangs under the
 * visible part of the selection and hides while the selection is scrolled out of view.
 */
export class SelectionEditPopup extends UIComponent<ISelectionEditPopupProps> {
    private popupRef = createRef<Popup | null>();
    private selectionGestureInProgress = false;
    private staffWindowFrame = 0;
    private lastBounds?: DOMRect;
    private dismissed = false;

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("selectionCursorChanged", this.handleCursorChanged);
        requisitions.register("selectionGestureChanged", this.handleSelectionGestureChanged);
        requisitions.register("staffWindowChanged", this.handleStaffWindowChanged);
        requisitions.register("arrangementMutated", this.handleStaffWindowChanged);
        requisitions.register("arrangementReverted", this.handleArrangementReverted);
        requisitions.register("selectionEditPopupCloseRequested", this.handleCloseRequested);
        document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
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
        requisitions.unregister("selectionCursorChanged", this.handleCursorChanged);
        requisitions.unregister("selectionGestureChanged", this.handleSelectionGestureChanged);
        requisitions.unregister("staffWindowChanged", this.handleStaffWindowChanged);
        requisitions.unregister("arrangementMutated", this.handleStaffWindowChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
        requisitions.unregister("selectionEditPopupCloseRequested", this.handleCloseRequested);
        document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);

        if (this.staffWindowFrame !== 0) {
            cancelAnimationFrame(this.staffWindowFrame);
            this.staffWindowFrame = 0;
        }

        this.popupRef.current?.close(true);
    }

    public render(): ComponentChild {
        const { editMode, trackViewMode, scoreHost } = this.props;
        const entries = this.toolEntries;
        const isTrackPieceSelection = SelectionEditPopup.isTrackPieceSelection(entries, trackViewMode);

        let content: ComponentChild;
        if (editMode) {
            content = isTrackPieceSelection ? this.renderTrackPieceTools() : this.renderNoteTools();
        }

        return (
            <Popup
                id="selectionEditPopup"
                ref={this.popupRef}
                className={`selection-edit-popup ${SelectionToolbar.surfaceClassName}`}
                placement={ComponentPlacement.BottomCenter}
                offset={8}
                boundsProvider={this.selectionBounds}
                anchorArea={scoreHost.current ?? undefined}
                persistent
                dismissOnEscape
                onClose={this.handlePopupClosed}
                showArrow={false}
                restoreFocusOnClose={false}
            >
                {content}
            </Popup>
        );
    }

    /**
     * Whether the popup hosts tools for the entries. The bar action strip shows the bar actions above every bar,
     * so a selection of whole bars carries no tools here.
     *
     * @param entries The selection entries.
     * @param trackViewMode The view mode the score is shown in.
     *
     * @returns True when the popup shows tools for the selection.
     */
    private static carriesTools(entries: ISelectionEntry[], trackViewMode: TrackViewMode): boolean {
        return NoteToolbar.carriesTools(entries) || SelectionEditPopup.isTrackPieceSelection(entries, trackViewMode);
    }

    /**
     * Whether the entries address the track pieces a staff view selects as one piece.
     *
     * @param entries The selection entries.
     * @param trackViewMode The view mode the score is shown in.
     *
     * @returns True when the popup shows the tools of a track piece.
     */
    private static isTrackPieceSelection(entries: ISelectionEntry[], trackViewMode: TrackViewMode): boolean {
        return trackViewMode === TrackViewMode.Staff && entries.length > 0 && entries.every((entry) => {
            return entry.granularity === SelectionGranularity.TrackPiece;
        });
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

            const rect = SelectionEditPopup.viewportRect(parent, parent.getBoundingClientRect());
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
     * Score elements report their rects divided by the viewer's zoom, while elements outside the score report
     * theirs as they are. Placement compares both kinds, so every rect is taken into viewport coordinates.
     *
     * @param element The element the rect was taken from.
     * @param rect The rect the element reports.
     *
     * @returns The rect in viewport coordinates.
     */
    private static viewportRect(element: HTMLElement, rect: DOMRect): DOMRect {
        const scale = ScoreElementRegistry.zoomScaleOf(element);
        if (scale === 1) {
            return rect;
        }

        return new DOMRect(rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale);
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
     * A run spans its whole slot, while the notation it draws sits at one point inside it: a note head at its
     * onset, a rest centred in the slot. Hiding follows that drawing, so a whole-bar rest does not keep the
     * popup around until the slot's far edge leaves the view.
     *
     * @param element A rendered score element.
     *
     * @returns The element drawing the notation inside a run, or undefined for other element kinds.
     */
    private static contentElementOf(element: HTMLElement): HTMLElement | undefined {
        if (!element.classList.contains("staff-note-viewer-run")) {
            return undefined;
        }

        return element.querySelector<HTMLElement>(".staff-note-head, .staff-note-viewer-rest-symbol") ?? undefined;
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
     * Renders the tools a note selection offers: the styles, values, articulations and tuplets of the addressed
     * notes, as the card the selection popups share draws them.
     *
     * @returns The note tools.
     */
    private renderNoteTools(): ComponentChild {
        const { dataModel, selectionManager, entryMode, trackViewMode } = this.props;

        return (
            <NoteToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                trackViewMode={trackViewMode}
                entryMode={entryMode}
            />
        );
    }

    private selectionBounds = (): DOMRect | undefined => {
        const bounds = this.selectionPlacement()?.bounds;
        if (bounds === undefined && !this.selectionGestureInProgress) {
            void this.handleCloseRequested();

            return undefined;
        }

        this.lastBounds = bounds ?? this.lastBounds;

        return this.lastBounds;
    };

    private handleSelectionChanged = (): Promise<boolean> => {
        const { selectionManager } = this.props;

        // A gesture clears the selection before it selects what the pointer hit, so an empty selection reported
        // while one runs is a transient state — closing the popup on it would only make the popup blink.
        if (this.selectionGestureInProgress && selectionManager.currentSelection.size === 0) {
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

    private handleCursorChanged = (): Promise<boolean> => {
        this.dismissed = false;

        return this.handleSelectionChanged();
    };

    private handleCloseRequested = (): Promise<boolean> => {
        this.dismissed = true;
        this.popupRef.current?.close(true);

        return Promise.resolve(true);
    };

    private handlePopupClosed = (): void => {
        this.dismissed = true;
    };

    private handleDocumentPointerDown = (event: PointerEvent): void => {
        const { scoreHost } = this.props;
        const path = event.composedPath();
        if (scoreHost.current !== null && path.includes(scoreHost.current)) {
            return;
        }

        const interactiveSelector = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), "
            + "textarea:not(:disabled), summary, label, [role='button'], [role='menuitem'], [role='switch'], "
            + "[role='checkbox'], [role='radio'], [role='slider'], [role='tab'], [tabindex]:not([tabindex='-1']), "
            + "[contenteditable]:not([contenteditable='false']), .selection-edit-popup";
        if (path.some((target) => {
            return target instanceof Element && target.matches(interactiveSelector);
        })) {
            return;
        }

        void this.handleCloseRequested();
    };

    private handleSelectionGestureChanged = (active: boolean): Promise<boolean> => {
        this.selectionGestureInProgress = active;
        if (active) {
            this.dismissed = false;
        }

        // A gesture that ends on what is already selected publishes no change, yet it may have closed the popup
        // — a click outside does — so the state is settled again when the gesture ends.
        if (!active) {
            this.updatePopup();
            this.forceUpdate();
        }

        return Promise.resolve(true);
    };

    /**
     * A revert restores the selection with the arrangement, so the popup belongs to what comes back — a close it
     * took on the way, while the restored rows were still being laid out, must not keep it hidden.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
    private handleArrangementReverted = (): Promise<boolean> => {
        this.dismissed = false;

        return this.handleStaffWindowChanged();
    };

    /**
     * Re-places the popup once the frame that changed its anchor's layout is over.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
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

    private get toolEntries(): ISelectionEntry[] {
        const { selectionManager } = this.props;

        return selectionManager.currentCursor === undefined
            ? [...selectionManager.currentSelection.values()] : [selectionManager.currentCursor];
    }

    private updatePopup(): void {
        const { editMode, trackViewMode } = this.props;
        const entries = this.toolEntries;

        if (!editMode) {
            this.popupRef.current?.close(true);
            this.lastBounds = undefined;
            this.dismissed = false;

            return;
        }

        if (this.dismissed) {
            return;
        }

        if (entries.length === 1 && !this.cursorExists(entries[0])) {
            void this.handleCloseRequested();

            return;
        }

        if (!SelectionEditPopup.carriesTools(entries, trackViewMode)) {
            return;
        }

        const geometry = this.selectionPlacement();
        if (geometry?.bounds === undefined) {
            if (!this.selectionGestureInProgress) {
                void this.handleCloseRequested();
            }

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

    private cursorExists(entry: ISelectionEntry): boolean {
        const { dataModel } = this.props;
        const { target } = entry;
        if (target.granularity !== SelectionGranularity.Note) {
            return true;
        }

        const { measure, event } = target;
        const track = dataModel.arrangement?.tracks.find((candidate) => {
            return candidate === measure.track;
        });
        if (!track?.measures.includes(measure)) {
            return false;
        }

        const currentEvent = modelEventAt(measure, target.start ?? event.start);
        if (currentEvent === undefined || compareFractions(currentEvent.start, event.start) !== 0) {
            return false;
        }

        if (currentEvent.noteStyleId === undefined && currentEvent !== event) {
            return event.noteStyleId === undefined && compareFractions(currentEvent.duration, event.duration) === 0;
        }

        return true;
    }

    /**
     * Resolves where the popup is placed for the current selection: the row it hangs on, and the span it is
     * centered on, which is absent while nothing of the selection is in view.
     *
     * @returns The placement, or undefined when the selection has no rendered row to hang on.
     */
    private selectionPlacement(): ISelectionPlacement | undefined {
        const { scoreElementRegistry } = this.props;
        const entries = this.toolEntries;
        let anchor: HTMLElement | undefined;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        let contentLeft = Infinity;
        let contentRight = -Infinity;

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
                const rect = SelectionEditPopup.viewportRect(element, element.getBoundingClientRect());
                left = Math.min(left, rect.left);
                top = Math.min(top, rect.top);
                right = Math.max(right, rect.right);
                bottom = Math.max(bottom, rect.bottom);

                const content = SelectionEditPopup.contentElementOf(element);
                if (content !== undefined) {
                    const contentRect = SelectionEditPopup.viewportRect(content, content.getBoundingClientRect());
                    contentLeft = Math.min(contentLeft, contentRect.left);
                    contentRight = Math.max(contentRight, contentRect.right);
                }
            }
        }

        if (anchor === undefined) {
            return undefined;
        }

        // The popup hangs under the lower edge of the span. That edge leaves the view when the content is
        // scrolled away, which hides the popup until the selection is shown again. Horizontally the drawn
        // notation decides, because a run spans its whole slot and would otherwise outlast its own drawing.
        const view = SelectionEditPopup.visibleAreaOf(anchor);
        const center = left > right ? undefined : SelectionEditPopup.anchorCenter(left, right, view);
        const contentShown = contentLeft > contentRight
            || (contentRight > view.left && contentLeft < view.right);
        if (center === undefined || !contentShown || bottom < view.top || bottom > view.bottom) {
            return { anchor };
        }

        // Everything above is measured in viewport coordinates, which is where the popup, being drawn outside the
        // score, is placed in.
        return { anchor, bounds: new DOMRect(center, top, 0, bottom - top) };
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
