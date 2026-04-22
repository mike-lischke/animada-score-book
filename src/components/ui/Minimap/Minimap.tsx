/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import type { ISbDmArrangement } from "../../../core/ScoreBookDataModel.js";
import { clampValue } from "../../../core/utils.js";
import type { IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import type { ICommonUIProperties } from "../framework/UIComponent.js";
import { UIComponent } from "../framework/UIComponent.js";
import { MiniBarViewer } from "./MiniBarViewer.js";

export interface IVisibleBarRange {
    startBar: number;
    endBar: number;
}

interface IMinimapProps extends ICommonUIProperties {
    arrangement: ISbDmArrangement;
    scoreMetrics: IScoreMetrics;

    onViewportMoved?: (position: number) => void;
    onSelectionChanged?: (startBar: number, endBar: number) => void;
}

interface ISelectionState {
    selectorIsActive: boolean;
    selectionStartBar: number;
    selectionEndBar: number;
    activeSelectorHandle?: SelectorHandle;
}

interface IBarBoundary {
    bar: number;
    contentLeft: number;
    contentRight: number;
}

type SelectorHandle = "start" | "end";

export class Minimap extends UIComponent<IMinimapProps> {
    private minimapRef = createRef<HTMLDivElement>();
    private minimapScrollHostRef = createRef<HTMLDivElement>();
    private contentHostRef = createRef<HTMLDivElement>();
    private zoomHostRef = createRef<HTMLDivElement>();
    private viewportMarkerRef = createRef<HTMLDivElement>();
    private barNumberRef = createRef<HTMLSpanElement>();

    private barSelectorRef = createRef<HTMLDivElement>();
    private barSelectorStartHandleRef = createRef<HTMLDivElement>();
    private barSelectorEndHandleRef = createRef<HTMLDivElement>();

    private viewportMarkerAnimationFrame?: number;

    private isDraggingViewportMarker = false;
    private markerDragOffsetX = 0;
    private activePointerId?: number;

    private readonly selectionState: ISelectionState = {
        selectorIsActive: false,
        selectionStartBar: 0,
        selectionEndBar: 0,
        activeSelectorHandle: undefined,
    };

    private barBoundaryCache: IBarBoundary[] = [];

    /** Initializes zoom and cached bar geometry after the minimap has mounted. */
    public override componentDidMount(): void {
        this.updateZoomLevel();
    }

    /**
     * Refreshes cached geometry and keeps an active selection aligned after relevant prop changes.
     *
     * @param previousProps The props from the previous render cycle.
     */
    public override componentDidUpdate(previousProps: Readonly<IMinimapProps>): void {
        const { arrangement } = this.props;

        const previousBarCount = previousProps.arrangement.timeParams.length;
        const barCount = arrangement.timeParams.length;
        const arrangementStructureChanged = previousProps.arrangement !== arrangement
            || previousProps.arrangement.tracks.length !== arrangement.tracks.length
            || previousBarCount !== barCount;

        super.componentDidUpdate(previousProps, this.state);

        if (arrangementStructureChanged && this.selectionState.selectorIsActive) {
            this.setSelectionState(false);
        }

        if (arrangementStructureChanged) {
            this.updateZoomLevel();

            return;
        }

        if (this.selectionState.selectorIsActive) {
            this.updateSelectorPosition();
        }
    }

    /** Removes global pointer listeners and any pending animation frame. */
    public override componentWillUnmount(): void {
        super.componentWillUnmount();

        document.removeEventListener("pointermove", this.handleDocumentPointerMove);
        document.removeEventListener("pointerup", this.handleDocumentPointerUp);
        document.removeEventListener("pointercancel", this.handleDocumentPointerUp);

        if (this.viewportMarkerAnimationFrame !== undefined) {
            cancelAnimationFrame(this.viewportMarkerAnimationFrame);
            this.viewportMarkerAnimationFrame = undefined;
        }
    }

    /**
     * Renders the minimap bars, viewport marker, and optional selection overlay.
     *
     * @returns The rendered minimap content.
     */
    public override render(): ComponentChild {
        const { arrangement } = this.props;

        const className = this.generateFinalClassName(["minimap"]);
        const barCount = arrangement.timeParams.length;

        return (
            <Container
                innerRef={this.minimapRef}
                className={className}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Stretch}
                onPointerDown={this.handleMinimapPointerDown}
                onDblClick={this.handleMinimapDoubleClick}
            >
                <Container id="minimapScrollHost"
                    innerRef={this.minimapScrollHostRef}
                    orientation={Orientation.TopDown}
                    mainAlignment={ChildAlignment.Start}
                    crossAlignment={ChildAlignment.Start}
                >
                    <Container id="minimapContentHost" innerRef={this.contentHostRef}>
                        <Container id="minimapZoomHost" innerRef={this.zoomHostRef}>
                            {Array.from({ length: barCount }, (_, i) => {
                                const barNumber = i + 1;

                                return (
                                    <MiniBarViewer
                                        key={barNumber}
                                        barNumber={barNumber}
                                        arrangement={arrangement}
                                    />
                                );
                            })}
                        </Container>
                    </Container>
                </Container>
                <Container
                    id="minimapViewportMarker"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.Center}
                    crossAlignment={ChildAlignment.Center}
                    innerRef={this.viewportMarkerRef}
                >
                    <span id="barNumber" ref={this.barNumberRef}>1</span>
                </Container>
                <div id="minimapBarSelector" ref={this.barSelectorRef}></div>
                <div id="minimapBarSelectorStartHandle"
                    className="minimap-bar-selector-handle"
                    ref={this.barSelectorStartHandleRef}
                />
                <div id="minimapBarSelectorEndHandle"
                    className="minimap-bar-selector-handle"
                    ref={this.barSelectorEndHandleRef}
                />
            </Container>
        );
    }

    /**
     * Called from the track viewer when it is scrolled, with the new normalized scroll position (0..1) and the index
     * of the leftmost visible note.
     *
     * @param viewportWidth The width of the track viewer's viewport, relative to the full scroll range.
     * @param viewportPosition The new scroll position, as a value between 0 and 1.
     * @param bars The range of visible bars in the track viewer.
     */
    public handleTrackViewerScrolled = (viewportWidth: number, viewportPosition: number,
        bars: IVisibleBarRange): void => {
        // Use the normalized position to move the viewport marker, so that it stays in sync with the track viewer.
        this.updateViewportMarker(viewportWidth, viewportPosition, bars);

        // Scroll the minimap to the given position too.
        const minimapScrollHost = this.minimapScrollHostRef.current;
        if (minimapScrollHost) {
            const scrollLeft = viewportPosition * (minimapScrollHost.scrollWidth - minimapScrollHost.clientWidth);
            minimapScrollHost.scrollLeft = scrollLeft;
        }

        // Keep the selection bar and handles in sync with the new scroll position.
        if (this.selectionState.selectorIsActive) {
            this.updateSelectorPosition();
        }
    };

    /**
     * Converts an absolute scroll left position to a relative position between 0 and 1, based on the given
     * maximum scroll left.
     *
     * @param scrollLeft The absolute scroll left position.
     * @param maxScrollLeft The maximum scroll left value.
     *
     * @returns The relative scroll position between 0 and 1.
     */
    private toRelativePosition(scrollLeft: number, maxScrollLeft: number): number {
        if (maxScrollLeft <= 0) {
            return 0;
        }

        return clampValue(scrollLeft / maxScrollLeft, 0, 1);
    }

    /**
     * Derives the initial selection range from the viewport marker label.
     *
     * @param barCount The number of available bars in the arrangement.
     * @returns The normalized start and end bar numbers.
     */
    private getInitialSelectionRange(barCount: number): [number, number] {
        if (barCount <= 0) {
            return [0, 0];
        }

        // Determine start and end bar from the marker. If the marker shows a range, use the start bar
        // as the selection start. If it shows a single bar, use that as the selection start.
        const markerText = this.barNumberRef.current?.textContent ?? "1";
        const parts = markerText.split("-").map((part) => {
            return part.trim();
        });

        if (parts.length === 1) {
            parts.push(parts[0]);
        }

        return [
            Number.parseInt(parts[0], 10),
            Number.parseInt(parts[1], 10),
        ];
    }

    /** Adjusts the minimap zoom so all track rows fit into the available height. */
    private updateZoomLevel(): void {
        const { arrangement } = this.props;

        const minimapScrollHost = this.minimapScrollHostRef.current;
        if (!minimapScrollHost) {
            return;
        }

        const trackCount = arrangement.tracks.length;
        if (trackCount === 0) {
            return;
        }

        const firstTrackRow = minimapScrollHost.querySelector<HTMLElement>(".mini-bar-track-row");
        if (!firstTrackRow) {
            return;
        }

        const availableHeight = minimapScrollHost.clientHeight;
        if (availableHeight <= 0) {
            return;
        }

        const zoomLevel = parseFloat(this.zoomHostRef.current?.style.zoom ?? "100%") || 100;
        const currentZoomFactor = Math.max(zoomLevel / 100, 0.01);
        const scaledTrackRowHeight = firstTrackRow.getBoundingClientRect().height;

        // Each track row has a 2px gap (margin), so we need to account for that in the unscaled height calculation.
        const unscaledTrackRowHeight = (scaledTrackRowHeight / currentZoomFactor) + (trackCount * 2);
        if (unscaledTrackRowHeight <= 0) {
            return;
        }

        const unscaledContentHeight = unscaledTrackRowHeight * trackCount;
        const nextZoomLevel = clampValue((availableHeight / unscaledContentHeight) * 100, 5, 30);
        if (Math.abs(nextZoomLevel - zoomLevel) > 0.2) {
            this.zoomHostRef.current!.style.zoom = `${nextZoomLevel}%`;
        }

        this.rebuildBarBoundaryCache();
    }

    /**
     * Positions and sizes the viewport marker to match the current viewer viewport.
     *
     * @param normalizedViewportWidth The visible viewport width normalized to the full content width.
     * @param normalizedViewportPosition The viewport scroll position normalized to the full scroll range.
     * @param bars The currently visible bar range.
     */
    private updateViewportMarker = (normalizedViewportWidth: number, normalizedViewportPosition: number,
        bars: IVisibleBarRange): void => {
        // The given position is a normalized value between 0 and 1, representing the scroll position of the
        // track viewer. We need to convert this to an absolute scroll left value for the viewport marker.
        const minimapScrollHost = this.minimapScrollHostRef.current;
        const minimapContentHost = this.contentHostRef.current;
        const marker = this.viewportMarkerRef.current;
        if (!minimapScrollHost || !minimapContentHost || !marker) {
            return;
        }

        // Hide the viewport marker if the content is not scrollable, to avoid showing an empty marker.
        if (normalizedViewportWidth >= 1) {
            marker.style.display = "none";

            return;
        } else {
            marker.style.display = "flex";
        }

        // Step 1: adjust the marker width to match the width of a bar.
        const contentWidth = minimapContentHost.getBoundingClientRect().width;
        const viewportWidth = normalizedViewportWidth * contentWidth;
        marker.style.width = `${viewportWidth}px`;

        // Step 2: move the marker to the correct horizontal position based on the given normalized position.
        const hostWidth = minimapScrollHost.getBoundingClientRect().width;
        marker.style.left = `${Math.floor(normalizedViewportPosition * (hostWidth - viewportWidth))}px`;

        // Step 3: update the bar number displayed in the marker.
        if (bars.startBar === bars.endBar) {
            this.barNumberRef.current!.textContent = bars.startBar.toString();
        } else {
            this.barNumberRef.current!.textContent = `${bars.startBar} - ${bars.endBar}`;
        }
    };

    /**
     * Checks whether the given pointer position lies inside a visible element.
     *
     * @param event The pointer or mouse event to test.
     * @param element The target element to test against.
     * @returns True if the point lies within the element's visible bounds.
     */
    private isPointInsideElement(event: MouseEvent | PointerEvent, element: HTMLElement | null): boolean {
        if (!element || element.style.display === "none") {
            return false;
        }

        const rect = element.getBoundingClientRect();

        return event.clientX >= rect.left
            && event.clientX <= rect.right
            && event.clientY >= rect.top
            && event.clientY <= rect.bottom;
    }

    /**
     * Dispatches pointer interactions to selector handles, the viewport marker, or the minimap content.
     *
     * @param event The pointer event originating from the minimap.
     */
    private handleMinimapPointerDown = (event: PointerEvent): void => {
        if (this.selectionState.selectorIsActive
            && this.isPointInsideElement(event, this.barSelectorStartHandleRef.current)) {
            this.beginSelectorHandleDrag("start", event, this.barSelectorStartHandleRef.current);

            return;
        }

        if (this.selectionState.selectorIsActive
            && this.isPointInsideElement(event, this.barSelectorEndHandleRef.current)) {
            this.beginSelectorHandleDrag("end", event, this.barSelectorEndHandleRef.current);

            return;
        }

        if (this.isPointInsideElement(event, this.viewportMarkerRef.current)) {
            if (event.detail !== 2) {
                this.beginViewportMarkerDrag(event);
            } else {
                event.preventDefault();
                event.stopPropagation();
            }

            return;
        }

        this.handleContentPointerDown(event);
    };

    /**
     * Toggles the bar selection when the viewport marker is double-clicked.
     *
     * @param event The double-click event.
     */
    private handleMinimapDoubleClick = (event: MouseEvent): void => {
        if (!this.isPointInsideElement(event, this.viewportMarkerRef.current)) {
            return;
        }

        this.setSelectionState(!this.selectionState.selectorIsActive);
        event.preventDefault();
        event.stopPropagation();
    };

    /**
     * Converts a pointer hit on the minimap into a normalized viewport position.
     *
     * @param event The pointer event on the scrollable minimap area.
     */
    private handleContentPointerDown = (event: PointerEvent): void => {
        const minimapContentHost = this.contentHostRef.current;
        const minimapScrollHost = this.minimapScrollHostRef.current;
        if (!minimapContentHost || !minimapScrollHost) {
            return;
        }

        if (!this.isPointInsideElement(event, minimapScrollHost)) {
            return;
        }

        const { onViewportMoved } = this.props;

        const scrollHostRect = minimapScrollHost.getBoundingClientRect();
        const contentX = (event.clientX - scrollHostRect.left) + minimapScrollHost.scrollLeft;
        const position = contentX / minimapContentHost.getBoundingClientRect().width;

        onViewportMoved?.(position);
    };

    /**
     * Starts dragging the viewport marker and records the local drag offset.
     *
     * @param event The pointer event that began the drag.
     */
    private beginViewportMarkerDrag(event: PointerEvent): void {
        const marker = this.viewportMarkerRef.current;
        if (!marker) {
            return;
        }

        this.isDraggingViewportMarker = true;
        this.activePointerId = event.pointerId;
        this.markerDragOffsetX = event.clientX - marker.getBoundingClientRect().left;

        marker.setPointerCapture(event.pointerId);

        document.addEventListener("pointermove", this.handleDocumentPointerMove);
        document.addEventListener("pointerup", this.handleDocumentPointerUp);
        document.addEventListener("pointercancel", this.handleDocumentPointerUp);

        event.preventDefault();
        event.stopPropagation();
    }

    /** Repositions the selection overlay and handles for the current selected bar range. */
    private updateSelectorPosition(): void {
        const { selectionStartBar, selectionEndBar } = this.selectionState;

        const selector = this.barSelectorRef.current;
        const startHandle = this.barSelectorStartHandleRef.current;
        const endHandle = this.barSelectorEndHandleRef.current;
        const minimap = this.minimapRef.current;

        if (!selector || !startHandle || !endHandle || !minimap) {
            return;
        }

        const startBarSelector = `.mini-bar-viewer[data-bar="${selectionStartBar}"]`;
        const endBarSelector = `.mini-bar-viewer[data-bar="${selectionEndBar}"]`;
        const startBarElement = minimap.querySelector<HTMLElement>(startBarSelector);
        const endBarElement = minimap.querySelector<HTMLElement>(endBarSelector);

        if (!startBarElement || !endBarElement) {
            return;
        }

        const minimapRect = minimap.getBoundingClientRect();
        const startRect = startBarElement.getBoundingClientRect();
        const endRect = endBarElement.getBoundingClientRect();

        const left = Math.floor(startRect.left - minimapRect.left);
        const right = Math.ceil(endRect.right - minimapRect.left);
        const width = Math.max(1, right - left);

        selector.style.left = `${left}px`;
        selector.style.width = `${width}px`;

        startHandle.style.left = `${left}px`;
        endHandle.style.left = `${left + width}px`;
    }

    /**
     * Shows or hides the selection overlay and initializes its range when activated.
     *
     * @param active Whether the selection overlay should be active.
     */
    private setSelectionState(active: boolean): void {
        if (this.selectionState.selectorIsActive === active) {
            return;
        }

        const selector = this.barSelectorRef.current;
        const startHandle = this.barSelectorStartHandleRef.current;
        const endHandle = this.barSelectorEndHandleRef.current;

        if (!selector || !startHandle || !endHandle) {
            return;
        }

        const { arrangement, onSelectionChanged } = this.props;

        if (active) {
            const barCount = arrangement.timeParams.length;
            if (barCount <= 0) {
                this.selectionState.selectorIsActive = false;
                selector.style.display = "none";
                startHandle.style.display = "none";
                endHandle.style.display = "none";

                window.getSelection()?.removeAllRanges();

                return;
            }

            this.selectionState.selectorIsActive = true;
            const [rawStartBar, rawEndBar] = this.getInitialSelectionRange(barCount);

            const clampedStart = clampValue(Number.isFinite(rawStartBar) ? rawStartBar : 1, 1, barCount);
            const clampedEnd = clampValue(Number.isFinite(rawEndBar) ? rawEndBar : clampedStart, 1, barCount);

            this.selectionState.selectionStartBar = Math.min(clampedStart, clampedEnd);
            this.selectionState.selectionEndBar = Math.max(clampedStart, clampedEnd);

            this.updateSelectorPosition();

            selector.style.display = "block";
            startHandle.style.display = "block";
            endHandle.style.display = "block";

            onSelectionChanged?.(this.selectionState.selectionStartBar, this.selectionState.selectionEndBar);
        } else {
            this.selectionState.selectorIsActive = false;
            selector.style.display = "none";
            startHandle.style.display = "none";
            endHandle.style.display = "none";

            onSelectionChanged?.(0, 0);
        }

        window.getSelection()?.removeAllRanges();
    }

    /**
     * Starts dragging one of the selection handles.
     *
     * @param handle The handle being dragged.
     * @param event The pointer event that started the drag.
     * @param handleElement The DOM element for the dragged handle.
     */
    private beginSelectorHandleDrag(handle: SelectorHandle, event: PointerEvent,
        handleElement: HTMLDivElement | null): void {
        if (!handleElement) {
            return;
        }

        this.selectionState.activeSelectorHandle = handle;
        this.activePointerId = event.pointerId;
        handleElement.setPointerCapture(event.pointerId);

        document.addEventListener("pointermove", this.handleDocumentPointerMove);
        document.addEventListener("pointerup", this.handleDocumentPointerUp);
        document.addEventListener("pointercancel", this.handleDocumentPointerUp);

        event.preventDefault();
        event.stopPropagation();
    }

    /**
     * Ends any active drag interaction owned by the minimap.
     *
     * @param event The pointer event that ended or cancelled the drag.
     */
    private handleDocumentPointerUp = (event: PointerEvent): void => {
        if (this.activePointerId !== undefined && event.pointerId !== this.activePointerId) {
            return;
        }

        this.isDraggingViewportMarker = false;
        this.selectionState.activeSelectorHandle = undefined;
        this.activePointerId = undefined;

        document.removeEventListener("pointermove", this.handleDocumentPointerMove);
        document.removeEventListener("pointerup", this.handleDocumentPointerUp);
        document.removeEventListener("pointercancel", this.handleDocumentPointerUp);
    };

    /**
     * Maps a client X coordinate to the nearest bar number in the cached minimap layout.
     *
     * @param clientX The pointer x-coordinate in client-space.
     * @param handle The handle being dragged, used to resolve edge cases when the pointer is between two bars.
     *
     * @returns The nearest bar number, if one can be resolved.
     */
    private barNumberFromClientX(clientX: number, handle: SelectorHandle): number | undefined {
        const minimapScrollHost = this.minimapScrollHostRef.current;
        if (!minimapScrollHost || this.barBoundaryCache.length === 0) {
            return undefined;
        }

        const scrollHostRect = minimapScrollHost.getBoundingClientRect();
        const contentX = (clientX - scrollHostRect.left) + minimapScrollHost.scrollLeft;

        // Get the first bar who's right bound is >= the given coordinate.
        const firstBar = this.barBoundaryCache.find((boundary) => {
            return contentX <= boundary.contentRight;
        }) ?? this.barBoundaryCache[0];

        // If we are in the left half of this bar, we can return it immediately as the closest match,
        // otherwise we return the next bar.
        if (contentX <= (firstBar.contentLeft + firstBar.contentRight) / 2) {
            return handle === "end" ? firstBar.bar - 1 : firstBar.bar;
        }

        return handle === "end" ? firstBar.bar : firstBar.bar + 1;
    }

    /** Rebuilds cached bar boundaries in scroll-content coordinates for fast hit testing. */
    private rebuildBarBoundaryCache(): void {
        const minimap = this.minimapRef.current;
        const minimapScrollHost = this.minimapScrollHostRef.current;
        if (!minimap || !minimapScrollHost) {
            this.barBoundaryCache = [];

            return;
        }

        const scrollHostRect = minimapScrollHost.getBoundingClientRect();
        const scrollLeft = minimapScrollHost.scrollLeft;

        this.barBoundaryCache = Array.from(minimap.querySelectorAll<HTMLElement>(".mini-bar-viewer"))
            .map((element) => {
                const barNumber = Number.parseInt(element.dataset.bar ?? "0", 10);
                const rect = element.getBoundingClientRect();

                return {
                    bar: barNumber,
                    contentLeft: (rect.left - scrollHostRect.left) + scrollLeft,
                    contentRight: (rect.right - scrollHostRect.left) + scrollLeft,
                };
            })
            .filter((entry) => {
                return entry.bar > 0;
            });
    }

    /**
     * Snaps the dragged selection handle to the nearest whole-bar boundary and updates the range.
     *
     * @param event The pointer event driving the drag.
     * @param handle The handle that is currently being dragged.
     */
    private handleSelectorHandleDrag(event: PointerEvent, handle: SelectorHandle): void {
        const { arrangement, onSelectionChanged } = this.props;

        const barNumber = this.barNumberFromClientX(event.clientX, handle);
        if (barNumber === undefined) {
            return;
        }

        const barCount = arrangement.timeParams.length;
        const clamped = clampValue(barNumber, 1, barCount);

        if (handle === "start") {
            const newBar = Math.min(clamped, this.selectionState.selectionEndBar);
            if (newBar === this.selectionState.selectionStartBar) {
                return;
            }

            this.selectionState.selectionStartBar = newBar;
        } else {
            const newBar = Math.max(clamped, this.selectionState.selectionStartBar);
            if (newBar === this.selectionState.selectionEndBar) {
                return;
            }

            this.selectionState.selectionEndBar = newBar;
        }

        this.updateSelectorPosition();

        onSelectionChanged?.(this.selectionState.selectionStartBar, this.selectionState.selectionEndBar);
    }

    /**
     * Routes document-level pointer moves to either selector resizing or viewport dragging.
     *
     * @param event The active document-level pointer move event.
     */
    private handleDocumentPointerMove = (event: PointerEvent): void => {
        if (this.activePointerId !== undefined && event.pointerId !== this.activePointerId) {
            return;
        }

        const { activeSelectorHandle } = this.selectionState;
        if (activeSelectorHandle) {
            this.handleSelectorHandleDrag(event, activeSelectorHandle);

            return;
        }

        if (!this.isDraggingViewportMarker) {
            return;
        }

        const minimapScrollHost = this.minimapScrollHostRef.current;
        const marker = this.viewportMarkerRef.current;
        if (!minimapScrollHost || !marker) {
            return;
        }

        const scrollHostRect = minimapScrollHost.getBoundingClientRect();
        const markerLeft = (event.clientX - scrollHostRect.left) - this.markerDragOffsetX;
        const markerWidth = marker.getBoundingClientRect().width;
        const markerScrollWidth = Math.max(0, scrollHostRect.width - markerWidth);
        const position = this.toRelativePosition(markerLeft, markerScrollWidth);

        const { onViewportMoved } = this.props;
        onViewportMoved?.(position);
    };

}
