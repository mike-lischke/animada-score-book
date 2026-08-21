/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IRect } from "../core/types/general.js";
import { requisitions } from "../supplement/Requisitions.js";
import type { SelectionManager } from "./SelectionManager.js";
import type { ISelectionDelta, ISelectionEntry } from "./selection-types.js";
import { SelectionGranularity, SelectionMode } from "./selection-types.js";

const selectionRectClass = "selection-rect";
const selectionOverlayClass = "selection-overlay";
const selectionCursorClass = "selection-cursor";
const noteSelectedClass = "note-selected";
const staffNoteRunClass = "staff-note-viewer-run";
const formElementNames = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA"]);

/**
 * Pure view layer for selection — handles pointer events, draws the selection rectangle,
 * and renders selection decoration as absolutely-positioned overlays.
 *
 * Communicates with the SelectionManager exclusively through requisitions:
 * - Publishes {@link ISelectionRectChange} when the rect changes during a drag.
 * - Listens to {@link ISelectionDelta} to update overlay elements.
 */
export class SelectionView {
    private rectElement?: HTMLDivElement;
    private captureElement?: HTMLElement;
    private horizontalScrollHost?: HTMLElement;
    private verticalScrollHost?: HTMLElement;

    private dragPending = false;
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private startScrollLeft = 0;
    private startScrollTop = 0;
    private startVerticalScrollTop = 0;
    private lastPointerX = 0;
    private lastPointerY = 0;
    private autoScrollTimer?: ReturnType<typeof setInterval>;
    private autoScrollDX = 0;
    private autoScrollDY = 0;

    /**
     * Ratio of viewport pixels to CSS pixels inside #trackViewerContainer.
     * Viewport-pixel deltas from getBoundingClientRect() are divided by this
     * factor to obtain CSS-pixel values for overlay positioning. CSS-pixel
     * constants (offsetY, heightOffset, etc.) are never divided.
     */
    private zoomFactor = 1;

    public constructor(private manager: SelectionManager, private eventContainer: HTMLElement) {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("editModeChanged", this.handleEditModeChanged);
        eventContainer.addEventListener("pointerdown", this.handlePointerDown);
        document.addEventListener("keydown", this.handleKeyDown);
        document.addEventListener("keyup", this.handleKeyUp);
    }

    public dispose(): void {
        this.cancelDrag();
        this.eventContainer.removeEventListener("pointerdown", this.handlePointerDown);
        document.removeEventListener("keydown", this.handleKeyDown);
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("editModeChanged", this.handleEditModeChanged);
    }

    /**
     * Sets the scroll host elements whose scroll positions are tracked during drag selection
     * so the selection rectangle stays anchored to the content. Also enables edge auto-scroll.
     *
     * @param horizontal The horizontally-scrollable container (typically `#trackViewerHost`).
     * @param vertical The vertically-scrollable container (typically the arrangement viewer parent).
     */
    public setScrollHosts(horizontal: HTMLElement, vertical: HTMLElement): void {
        this.horizontalScrollHost = horizontal;
        this.verticalScrollHost = vertical;
    }

    private handlePointerDown = (event: PointerEvent): void => {
        if (event.defaultPrevented || this.isFormElement(event.target)) {
            return;
        }

        // Clear any lingering text selection so the score's custom selection is the only one.
        window.getSelection()?.removeAllRanges();

        this.captureElement = event.target instanceof HTMLElement ? event.target : document.body;
        this.captureElement.setPointerCapture(event.pointerId);

        this.captureElement.addEventListener("pointermove", this.handlePointerMove);
        this.captureElement.addEventListener("pointerup", this.handlePointerUp);
        this.captureElement.addEventListener("lostpointercapture", this.handlePointerUp);

        this.dragPending = true;
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;

        const half = 2;
        const clickRect = new DOMRect(event.clientX - half, event.clientY - half,
            (half * 2) + 1, (half * 2) + 1);
        this.manager.previewNote(clickRect);

        if (this.horizontalScrollHost) {
            this.startScrollLeft = this.horizontalScrollHost.scrollLeft;
            this.startScrollTop = this.horizontalScrollHost.scrollTop;
            this.horizontalScrollHost.addEventListener("scroll", this.handleScroll, { passive: true });
        }

        if (this.verticalScrollHost && this.verticalScrollHost !== this.horizontalScrollHost) {
            this.startVerticalScrollTop = this.verticalScrollHost.scrollTop;
            this.verticalScrollHost.addEventListener("scroll", this.handleScroll, { passive: true });
        }

        this.createRectElement(event.clientX, event.clientY);

        event.preventDefault();
    };

    private handlePointerMove = (event: PointerEvent): void => {
        if ((!this.dragPending && !this.isDragging) || !this.rectElement) {
            return;
        }

        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;

        this.updateRectElement(event.clientX, event.clientY);
        this.updateAutoScroll(event.clientX, event.clientY);

        const rect = this.rectElement.getBoundingClientRect();
        if (rect.width > 2 || rect.height > 2) {
            if (this.dragPending) {
                const selectionMode = event.shiftKey || event.altKey || event.metaKey
                    ? this.selectionModeFromEvent(event)
                    : undefined;
                this.manager.beginSelection(selectionMode);

                this.dragPending = false;
                this.isDragging = true;
            }

            void requisitions.execute("selectionRectChanged", { rect });
        }
    };

    private handlePointerUp = (event: PointerEvent): void => {
        if (!this.isDragging && this.dragPending) {
            // The user pressed and released without significant movement — treat as a click.
            // The selection mode is already live on the manager via handleKeyDown/handleKeyUp.
            // Use a small rect (5×5) instead of a single point so the hit-test is as forgiving
            // as a minimal drag (which requires width > 2 || height > 2 before firing).
            const half = 2;
            const clickRect = new DOMRect(this.startX - half, this.startY - half,
                (half * 2) + 1, (half * 2) + 1);
            this.manager.endSelection(clickRect);
        }

        if (this.isDragging) {
            //event.preventDefault();
        }

        this.cancelDrag();
    };

    /**
     * Adjusts the selection start point when any scroll host scrolls during a drag,
     * keeping the anchor pinned to the content rather than the viewport.
     *
     * @param event The scroll event from one of the registered scroll hosts.
     */
    private handleScroll = (event: Event): void => {
        if (!this.rectElement) {
            return;
        }

        const target = event.target;
        let deltaX = 0;
        let deltaY = 0;
        let handled = false;

        const hHost = this.horizontalScrollHost;
        if (hHost && target === hHost) {
            deltaX = hHost.scrollLeft - this.startScrollLeft;
            deltaY = hHost.scrollTop - this.startScrollTop;
            this.startScrollLeft = hHost.scrollLeft;
            this.startScrollTop = hHost.scrollTop;
            handled = true;
        }

        const vHost = this.verticalScrollHost;
        if (vHost && target === vHost) {
            const verticalDelta = vHost.scrollTop - this.startVerticalScrollTop;
            deltaY += verticalDelta;
            this.startVerticalScrollTop = vHost.scrollTop;
            handled = true;
        }

        if (!handled) {
            return;
        }

        this.startX -= deltaX;
        this.startY -= deltaY;

        this.updateRectElement(this.lastPointerX, this.lastPointerY);

        if (this.isDragging) {
            const rect = this.rectElement.getBoundingClientRect();
            void requisitions.execute("selectionRectChanged", { rect });
        }
    };

    private selectionModeFromEvent(event: KeyboardEvent | MouseEvent): SelectionMode {
        if (event.shiftKey) {
            return SelectionMode.Add;
        } else if (event.altKey || event.metaKey) {
            return SelectionMode.Invert;
        } else {
            return SelectionMode.New;
        }
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (this.handleArrowKey(event)) {
            return;
        }

        if (event.key === "Escape" && this.isDragging) {
            this.cancelDrag();
        } else {
            this.manager.selectionMode = this.selectionModeFromEvent(event);
        }
    };

    private handleKeyUp = (): void => {
        // Revert to New mode when modifier keys are released.
        if (!this.isDragging && !this.dragPending) {
            this.manager.selectionMode = SelectionMode.New;
        }
    };

    private handleArrowKey(event: KeyboardEvent): boolean {
        if (this.isDragging || this.isFormElement(event.target)
            || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            return false;
        }

        const entries = [...this.manager.currentSelection.values()];
        if (entries.length !== 1 || entries[0].granularity !== SelectionGranularity.Note) {
            return false;
        }

        const entry = entries[0];
        const contentHost = this.eventContainer.querySelector<HTMLElement>("#trackViewerContentHost");
        if (!contentHost) {
            return false;
        }

        const noteElement = this.findNoteElements(contentHost, entry).at(0);
        if (!noteElement) {
            return false;
        }

        const isStaffMode = noteElement.classList.contains(staffNoteRunClass);
        const target = isStaffMode
            ? this.findStaffArrowTarget(noteElement, event.key)
            : this.findArrowTarget(noteElement, event.key);

        if (!target) {
            return false;
        }

        const row = target.closest<HTMLElement>(
            isStaffMode ? ".bar-track-row.staff-mode" : ".grid-measure-row",
        );
        if (!row) {
            return false;
        }

        const bar = row.getAttribute("data-bar");
        const trackId = row.getAttribute("data-track");
        const stepIndex = target.getAttribute("data-step-index");
        if (!bar || !trackId || stepIndex === null) {
            return false;
        }

        const noteId = target.getAttribute("data-note-id");
        this.manager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            bar: parseInt(bar, 10),
            trackId: parseInt(trackId, 10),
            startStep: parseInt(stepIndex, 10),
            endStep: parseInt(stepIndex, 10),
            noteId: noteId === null ? undefined : parseInt(noteId, 10),
        });
        event.preventDefault();

        return true;
    }

    private findStaffArrowTarget(noteElement: HTMLElement, key: string): HTMLElement | undefined {
        const row = noteElement.closest<HTMLElement>(".bar-track-row.staff-mode");
        if (!row) {
            return undefined;
        }

        const navigableRuns = (rowElement: HTMLElement): HTMLElement[] => {
            return [...rowElement.querySelectorAll<HTMLElement>(".staff-note-viewer-run[data-step-index]")]
                .filter((run) => {
                    return run.querySelector(
                        ".staff-note-viewer-note-symbol, .staff-note-viewer-rest-symbol",
                    ) !== null;
                });
        };

        if (key === "ArrowLeft" || key === "ArrowRight") {
            const contentHost = this.eventContainer.querySelector<HTMLElement>("#trackViewerContentHost");
            const trackId = row.getAttribute("data-track");
            if (!contentHost || !trackId) {
                return undefined;
            }

            const rows = [...contentHost.querySelectorAll<HTMLElement>(
                `.bar-track-row.staff-mode[data-track="${trackId}"]`,
            )].sort((left, right) => {
                return parseInt(left.getAttribute("data-bar") ?? "0", 10)
                    - parseInt(right.getAttribute("data-bar") ?? "0", 10);
            });

            const rowIndex = rows.indexOf(row);
            const rowRuns = navigableRuns(row);
            const runIndex = rowRuns.indexOf(noteElement);
            const direction = key === "ArrowLeft" ? -1 : 1;

            if (runIndex + direction >= 0 && runIndex + direction < rowRuns.length) {
                return rowRuns[runIndex + direction];
            }

            const adjacentRowIndex = rowIndex + direction;
            if (adjacentRowIndex < 0 || adjacentRowIndex >= rows.length) {
                return undefined;
            }

            const adjacentRuns = navigableRuns(rows[adjacentRowIndex]);
            if (adjacentRuns.length === 0) {
                return undefined;
            }

            return direction < 0 ? adjacentRuns[adjacentRuns.length - 1] : adjacentRuns[0];
        }

        const contentHost = this.eventContainer.querySelector<HTMLElement>("#trackViewerContentHost");
        const bar = row.getAttribute("data-bar");
        if (!contentHost || !bar) {
            return undefined;
        }

        const rows = [...contentHost.querySelectorAll<HTMLElement>(
            `.bar-track-row.staff-mode[data-bar="${bar}"]`,
        )];
        const rowIndex = rows.indexOf(row);
        const direction = key === "ArrowUp" ? -1 : 1;
        const adjacentRowIndex = rowIndex + direction;
        if (adjacentRowIndex < 0 || adjacentRowIndex >= rows.length) {
            return undefined;
        }

        const adjacentRuns = navigableRuns(rows[adjacentRowIndex]);
        if (adjacentRuns.length === 0) {
            return undefined;
        }

        const cursorX = noteElement.getBoundingClientRect().left;
        const runAtCursor = adjacentRuns.find((run) => {
            const runRect = run.getBoundingClientRect();

            return cursorX >= runRect.left && cursorX < runRect.right;
        });
        if (runAtCursor) {
            return runAtCursor;
        }

        return adjacentRuns.reduce((closest, run) => {
            const closestDistance = Math.abs(closest.getBoundingClientRect().left - cursorX);
            const runDistance = Math.abs(run.getBoundingClientRect().left - cursorX);

            return runDistance < closestDistance ? run : closest;
        });
    }

    private findArrowTarget(noteElement: HTMLElement, key: string): HTMLElement | undefined {
        const row = noteElement.closest<HTMLElement>(".grid-measure-row");
        if (!row) {
            return undefined;
        }

        const cells = (): HTMLElement[] => {
            return [...row.querySelectorAll<HTMLElement>(".note-viewer[data-step-index]")];
        };

        if (key === "ArrowLeft" || key === "ArrowRight") {
            const contentHost = this.eventContainer.querySelector<HTMLElement>("#trackViewerContentHost");
            const trackId = row.getAttribute("data-track");
            if (!contentHost || !trackId) {
                return undefined;
            }

            const rows = [...contentHost.querySelectorAll<HTMLElement>(
                `.grid-measure-row[data-track="${trackId}"]`,
            )].sort((left, right) => {
                return parseInt(left.getAttribute("data-bar") ?? "0", 10)
                    - parseInt(right.getAttribute("data-bar") ?? "0", 10);
            });
            const rowIndex = rows.indexOf(row);
            const rowCells = cells();
            const cellIndex = rowCells.indexOf(noteElement);
            const direction = key === "ArrowLeft" ? -1 : 1;

            if (cellIndex + direction >= 0 && cellIndex + direction < rowCells.length) {
                return rowCells[cellIndex + direction];
            }

            const adjacentRowIndex = rowIndex + direction;
            if (adjacentRowIndex < 0 || adjacentRowIndex >= rows.length) {
                return undefined;
            }

            const adjacentRow = rows[adjacentRowIndex];

            const adjacentCells = [...adjacentRow.querySelectorAll<HTMLElement>(
                ".note-viewer[data-step-index]",
            )];
            if (adjacentCells.length === 0) {
                return undefined;
            }

            if (direction < 0) {
                return adjacentCells[adjacentCells.length - 1];
            }

            return adjacentCells[0];
        }

        const contentHost = this.eventContainer.querySelector<HTMLElement>("#trackViewerContentHost");
        const bar = row.getAttribute("data-bar");
        if (!contentHost || !bar) {
            return undefined;
        }

        const rows = [...contentHost.querySelectorAll<HTMLElement>(
            `.grid-measure-row[data-bar="${bar}"]`,
        )];
        const rowIndex = rows.indexOf(row);
        const direction = key === "ArrowUp" ? -1 : 1;
        const adjacentRowIndex = rowIndex + direction;
        if (adjacentRowIndex < 0 || adjacentRowIndex >= rows.length) {
            return undefined;
        }

        const adjacentRow = rows[adjacentRowIndex];

        const adjacentCells = [...adjacentRow.querySelectorAll<HTMLElement>(
            ".note-viewer[data-step-index]",
        )];

        if (adjacentCells.length === 0) {
            return undefined;
        }

        const cursorX = noteElement.getBoundingClientRect().left;
        const cellAtCursor = adjacentCells.find((cell) => {
            const cellRect = cell.getBoundingClientRect();

            return cursorX >= cellRect.left && cursorX < cellRect.right;
        });
        if (cellAtCursor) {
            return cellAtCursor;
        }

        return adjacentCells.reduce((closest, cell) => {
            const closestDistance = Math.abs(closest.getBoundingClientRect().left - cursorX);
            const cellDistance = Math.abs(cell.getBoundingClientRect().left - cursorX);

            return cellDistance < closestDistance ? cell : closest;
        });
    }

    private cancelDrag(): void {
        this.isDragging = false;
        this.dragPending = false;
        this.stopAutoScroll();
        this.removeRectElement();

        if (this.horizontalScrollHost) {
            this.horizontalScrollHost.removeEventListener("scroll", this.handleScroll);
            this.startScrollLeft = 0;
            this.startScrollTop = 0;
        }

        if (this.verticalScrollHost && this.verticalScrollHost !== this.horizontalScrollHost) {
            this.verticalScrollHost.removeEventListener("scroll", this.handleScroll);
            this.startVerticalScrollTop = 0;
        }

        if (this.captureElement) {
            this.captureElement.removeEventListener("pointermove", this.handlePointerMove);
            this.captureElement.removeEventListener("pointerup", this.handlePointerUp);
            this.captureElement.removeEventListener("lostpointercapture", this.handlePointerUp);
            this.captureElement = undefined;
        }
    }

    /**
     * Starts, updates or stops auto-scroll based on the pointer's distance from the scroll host edges.
     * The further the pointer is outside the host, the faster the scroll speed.
     *
     * @param clientX The current pointer X position in viewport coordinates.
     * @param clientY The current pointer Y position in viewport coordinates.
     */
    private updateAutoScroll(clientX: number, clientY: number): void {
        if (!this.horizontalScrollHost && !this.verticalScrollHost) {
            return;
        }

        const edgeThreshold = 10;
        let scrollDX = 0;
        let scrollDY = 0;

        // Horizontal auto-scroll on the horizontal host.
        if (this.horizontalScrollHost) {
            const hostRect = this.horizontalScrollHost.getBoundingClientRect();
            const distLeft = clientX - hostRect.left;
            const distRight = hostRect.right - clientX;

            if (distLeft < edgeThreshold) {
                scrollDX = -Math.max(1, Math.ceil((edgeThreshold - distLeft) / 2));
            } else if (distRight < edgeThreshold) {
                scrollDX = Math.max(1, Math.ceil((edgeThreshold - distRight) / 2));
            }
        }

        // Vertical auto-scroll on the vertical host.
        const verticalHost = this.verticalScrollHost ?? this.horizontalScrollHost;
        if (verticalHost) {
            const hostRect = verticalHost.getBoundingClientRect();
            const distTop = clientY - hostRect.top;
            const distBottom = hostRect.bottom - clientY;

            if (distTop < edgeThreshold) {
                scrollDY = -Math.max(1, Math.ceil((edgeThreshold - distTop) / 2));
            } else if (distBottom < edgeThreshold) {
                scrollDY = Math.max(1, Math.ceil((edgeThreshold - distBottom) / 2));
            }
        }

        this.autoScrollDX = scrollDX;
        this.autoScrollDY = scrollDY;

        if (scrollDX !== 0 || scrollDY !== 0) {
            this.autoScrollTimer ??= setInterval(() => {
                if (this.autoScrollDX !== 0 && this.horizontalScrollHost) {
                    this.horizontalScrollHost.scrollBy(this.autoScrollDX, 0);
                }

                if (this.autoScrollDY !== 0) {
                    const vh = this.verticalScrollHost ?? this.horizontalScrollHost;
                    if (vh) {
                        vh.scrollBy(0, this.autoScrollDY);
                    }
                }
            }, 16);
        } else {
            this.stopAutoScroll();
        }
    }

    private stopAutoScroll(): void {
        if (this.autoScrollTimer) {
            clearInterval(this.autoScrollTimer);
            this.autoScrollTimer = undefined;
            this.autoScrollDX = 0;
            this.autoScrollDY = 0;
        }
    }

    private createRectElement(x: number, y: number): void {
        this.removeRectElement();

        const rect = document.createElement("div");
        rect.className = selectionRectClass;
        rect.style.left = `${x}px`;
        rect.style.top = `${y}px`;
        rect.style.width = "0px";
        rect.style.height = "0px";

        document.body.appendChild(rect);
        this.rectElement = rect;
    }

    private updateRectElement(currentX: number, currentY: number): void {
        if (!this.rectElement) {
            return;
        }

        const left = Math.min(this.startX, currentX);
        const top = Math.min(this.startY, currentY);
        const width = Math.abs(currentX - this.startX);
        const height = Math.abs(currentY - this.startY);

        this.rectElement.style.left = `${left}px`;
        this.rectElement.style.top = `${top}px`;
        this.rectElement.style.width = `${width}px`;
        this.rectElement.style.height = `${height}px`;
    }

    private removeRectElement(): void {
        if (this.rectElement) {
            this.rectElement.remove();
            this.rectElement = undefined;
        }
    }

    private handleSelectionChanged = (_delta: ISelectionDelta): Promise<boolean> => {
        this.updateTrackViewerOverlays();

        return Promise.resolve(true);
    };

    private handleEditModeChanged = (enabled: boolean): Promise<boolean> => {
        if (!enabled) {
            const overlayContainer = this.eventContainer.querySelector<HTMLElement>(
                "#trackViewerDecorationOverlay",
            );
            const cursor = overlayContainer?.querySelector<HTMLElement>(`.${selectionCursorClass}`);
            if (cursor) {
                cursor.style.display = "none";
            }
        }

        return Promise.resolve(true);
    };

    /**
     * Renders selection decoration as absolutely-positioned overlay divs inside
     * {@link trackViewerDecorationOverlay}. Adjacent selection rects are merged:
     * contiguous notes within the same bar×track form one overlay; track-pieces
     * merge vertically (consecutive tracks) and horizontally (consecutive bars);
     * whole-track selections merge across consecutive tracks; whole-measure
     * selections merge across consecutive bars.
     */
    private updateTrackViewerOverlays(): void {
        const overlayContainer = this.eventContainer.querySelector<HTMLElement>(
            "#trackViewerDecorationOverlay",
        );
        if (!overlayContainer) {
            return;
        }

        // Remove all existing selection overlays.
        overlayContainer.querySelectorAll(`.${selectionOverlayClass}`).forEach((el) => {
            el.remove();
        });

        const cursor = this.getSelectionCursor(overlayContainer);
        cursor.style.display = "none";

        // Clear any legacy note CSS highlights.
        const contentHost = this.eventContainer.querySelector<HTMLElement>("#trackViewerContentHost");
        if (contentHost) {
            contentHost.querySelectorAll(`.selected, .${noteSelectedClass}`).forEach((el) => {
                el.classList.remove("selected", noteSelectedClass);
            });
        }

        if (this.manager.currentSelection.size === 0) {
            return;
        }

        if (!contentHost) {
            return;
        }

        const containerRect = overlayContainer.getBoundingClientRect();

        // Measure the actual zoom factor from the DOM: offsetWidth gives CSS pixels,
        // getBoundingClientRect().width gives viewport pixels (post-zoom). The ratio is
        // the effective zoom factor, which is more reliable than parsing style.zoom.
        const cssW = contentHost.offsetWidth;
        const viewportW = contentHost.getBoundingClientRect().width;
        this.zoomFactor = cssW > 0 ? viewportW / cssW : 1;

        // Separate entries by granularity.
        const trackEntries: ISelectionEntry[] = [];
        const measureEntries: ISelectionEntry[] = [];
        const trackPieceEntries: ISelectionEntry[] = [];
        const noteEntries: ISelectionEntry[] = [];

        for (const entry of this.manager.currentSelection.values()) {
            switch (entry.granularity) {
                case SelectionGranularity.Track: {
                    trackEntries.push(entry);

                    break;
                }

                case SelectionGranularity.Measure: {
                    measureEntries.push(entry);

                    break;
                }

                case SelectionGranularity.TrackPiece: {
                    trackPieceEntries.push(entry);

                    break;
                }

                default: {
                    noteEntries.push(entry);
                }
            }
        }

        // Notes / note-groups: merged overlays for contiguous steps within the same bar×track.
        this.renderNoteOverlays(contentHost, overlayContainer, containerRect, noteEntries);

        // Track-pieces: merge vertically (consecutive tracks within a bar) and
        // horizontally (same track across consecutive bars).
        this.renderTrackPieceOverlays(contentHost, overlayContainer, containerRect, trackPieceEntries);

        // Whole-track: merge consecutive track IDs into one tall overlay per group.
        this.renderTrackOverlays(contentHost, overlayContainer, containerRect, trackEntries);

        // Whole-measure: merge consecutive bar numbers into one wide overlay per group.
        this.renderMeasureOverlays(contentHost, overlayContainer, containerRect, measureEntries);
    }

    // ---- Note overlays (grid + staff) ------------------------------------------------

    /**
     * Renders selection decoration for note and note-group entries.
     *
     * - Single notes in staff mode get the {@link noteSelectedClass} CSS class
     *   so that note heads and stems are coloured directly.
     * - Note groups (beamed groups etc.) always use background overlays so they
     *   are visually distinct from individually selected notes.
     * - In grid mode all entries use background overlays.
     *
     * @param contentHost The host element containing the track rows.
     * @param overlayContainer The container to append overlays to.
     * @param containerRect The overlay container's bounding rect.
     * @param entries The note/note-group selection entries to render.
     */
    private renderNoteOverlays(contentHost: HTMLElement, overlayContainer: HTMLElement,
        containerRect: DOMRect, entries: ISelectionEntry[]): void {
        if (entries.length === 0) {
            return;
        }

        const cursor = this.getSelectionCursor(overlayContainer);

        // Separate single-note from note-group entries.
        const singleNotes: ISelectionEntry[] = [];
        const noteGroups: ISelectionEntry[] = [];

        for (const entry of entries) {
            if (entry.granularity === SelectionGranularity.NoteGroup) {
                noteGroups.push(entry);
            } else {
                singleNotes.push(entry);
            }
        }

        // Detect view mode from the first element.
        const firstElements = singleNotes.length > 0
            ? this.findNoteElements(contentHost, singleNotes[0])
            : this.findNoteElements(contentHost, noteGroups[0]);
        const isStaffMode = firstElements.length > 0
            && firstElements[0].classList.contains(staffNoteRunClass);

        // Position the cursor directly before a single selected note in both view modes.
        if (singleNotes.length === 1) {
            const rect = this.findNoteCursorRect(contentHost, singleNotes[0], isStaffMode);
            if (rect) {
                this.positionSelectionCursor(cursor, containerRect, rect, isStaffMode ? -4 : 0);
            }
        }

        // Single notes in staff mode: apply CSS class for head/stem colouring.
        if (isStaffMode && singleNotes.length > 0) {
            for (const entry of singleNotes) {
                const elements = this.findNoteElements(contentHost, entry);
                for (const el of elements) {
                    el.classList.add(noteSelectedClass);
                }
            }
        }

        // Note groups and grid-mode single notes: use background overlays.
        if (isStaffMode) {
            // Staff-mode note groups: query the row directly and create one
            // merged overlay per group from all run elements in the step range,
            // shifted up so the overlay sits near the tuplet bracket, not at note level.
            //
            // Runs have flex:1-1-0 so they stretch — we use the runs for gap-free
            // coverage between adjacent steps but narrow the left/right edges to the
            // inner note-content elements so the overlay hugs the actual note symbols.
            const contentSelector = [
                ".staff-note-viewer-note-symbol",
                ".staff-note-head",
                ".staff-note-viewer-rest-symbol",
            ].join(", ");

            for (const entry of noteGroups) {
                const row = contentHost.querySelector<HTMLElement>(
                    `[data-bar="${entry.bar}"][data-track="${entry.trackId}"]`,
                );
                if (!row) {
                    continue;
                }

                const startStep = entry.startStep ?? 0;
                const endStep = entry.endStep ?? startStep;
                const runs: HTMLElement[] = [];

                for (let step = startStep; step <= endStep; step++) {
                    const el = row.querySelector<HTMLElement>(`[data-step-index="${step}"]`);
                    if (el) {
                        runs.push(el);
                    }
                }

                if (runs.length === 0) {
                    continue;
                }

                // Runs sit at margin-top:64px inside the 80px viewer. Extend the
                // overlay upward to the viewer top edge (0px) and downward
                // through the 20px margin-bottom (+2px).
                const offsetY = -64;
                const heightOffset = 84;

                // Compute the union rect of all runs (gap-free horizontal coverage).
                let minTop = Infinity;
                let maxBottom = -Infinity;
                let minLeft = Infinity;
                let maxRight = -Infinity;

                for (const run of runs) {
                    const r = this.computeElementRect(run, containerRect);
                    const absTop = r.y + containerRect.top;
                    const absBottom = absTop + r.height;

                    if (absTop < minTop) {
                        minTop = absTop;
                    }

                    if (absBottom > maxBottom) {
                        maxBottom = absBottom;
                    }

                    const rawRect = run.getBoundingClientRect();
                    if (rawRect.left < minLeft) {
                        minLeft = rawRect.left;
                    }

                    if (rawRect.right > maxRight) {
                        maxRight = rawRect.right;
                    }
                }

                // Narrow left edge to the first run's inner content, with 10 px padding
                // but never beyond the run's own bounding box.
                const firstContent = runs[0].querySelector<HTMLElement>(contentSelector);
                if (firstContent) {
                    const firstRect = firstContent.getBoundingClientRect();
                    minLeft = Math.max(minLeft, firstRect.left - (10 * this.zoomFactor));
                }

                // Narrow right edge to the last run's inner content.
                const lastContent = runs[runs.length - 1].querySelector<HTMLElement>(contentSelector);
                if (lastContent) {
                    const lastRect = lastContent.getBoundingClientRect();
                    maxRight = lastRect.right + (2 * this.zoomFactor);
                }

                // Convert viewport-pixel deltas to CSS pixels. offsetY/heightOffset
                // are CSS pixels and must not be divided.
                const z = this.zoomFactor;

                this.createOverlay(overlayContainer, {
                    x: (minLeft - containerRect.left) / z,
                    y: ((minTop - containerRect.top) / z) + offsetY,
                    width: (maxRight - minLeft) / z,
                    height: ((maxBottom - minTop) / z) + heightOffset,
                });
            }

            return;
        }

        // Grid mode: group by bar+track, then sort by startStep and merge contiguous steps.
        const byBarTrack = new Map<string, ISelectionEntry[]>();
        for (const entry of entries) {
            const key = `${entry.bar}:${entry.trackId}`;
            let list = byBarTrack.get(key);
            if (!list) {
                list = [];
                byBarTrack.set(key, list);
            }

            list.push(entry);
        }

        for (const [, groupEntries] of byBarTrack) {
            groupEntries.sort((a, b) => {
                return (a.startStep ?? 0) - (b.startStep ?? 0);
            });

            let groupElements: HTMLElement[] = [];
            let lastEndStep: number | undefined;

            for (const entry of groupEntries) {
                const elements = this.findNoteElements(contentHost, entry);
                if (elements.length === 0) {
                    continue;
                }

                const startStep = entry.startStep ?? 0;
                const endStep = entry.endStep ?? startStep;

                if (lastEndStep !== undefined && startStep !== lastEndStep + 1) {
                    this.createMergedOverlay(overlayContainer, containerRect, groupElements);
                    groupElements = [];
                }

                groupElements.push(...elements);
                lastEndStep = endStep;
            }

            if (groupElements.length > 0) {
                this.createMergedOverlay(overlayContainer, containerRect, groupElements);
            }
        }
    }

    /**
     * Finds the DOM element(s) for a note or note-group selection entry.
     * For note groups that span a step range all elements in the range are returned
     * so the overlay covers the full width of the group.
     *
     * @param scope The element to query within.
     * @param entry The selection entry identifying the note or group.
     *
     * @returns The matching elements, or an empty array if none found.
     */
    private findNoteElements(scope: HTMLElement, entry: ISelectionEntry): HTMLElement[] {
        if (entry.noteId !== undefined) {
            const el = scope.querySelector<HTMLElement>(`[data-note-id="${entry.noteId}"]`);

            return el ? [el] : [];
        }

        if (entry.startStep !== undefined) {
            const endStep = entry.endStep ?? entry.startStep;
            const elements: HTMLElement[] = [];

            for (let step = entry.startStep; step <= endStep; step++) {
                const el = scope.querySelector<HTMLElement>(
                    `[data-bar="${entry.bar}"][data-track="${entry.trackId}"] [data-step-index="${step}"]`,
                );
                if (el) {
                    elements.push(el);
                }
            }

            return elements;
        }

        return [];
    }

    /**
     * Computes the rectangle that should anchor the selection cursor for a single note.
     * In grid mode this is the note cell. In staff mode the horizontal position comes from the
     * note/rest symbol while the vertical position is corrected to the single-line reference, so
     * the cursor stays put when notes on different staff lines are selected.
     *
     * @param scope The element to query within.
     * @param entry The selection entry identifying the note or group.
     * @param isStaffMode Whether the arrangement is rendered in staff mode.
     *
     * @returns The cursor anchor rectangle, or undefined if none found.
     */
    private findNoteCursorRect(scope: HTMLElement, entry: ISelectionEntry,
        isStaffMode: boolean): DOMRect | undefined {
        const elements = this.findNoteElements(scope, entry);
        if (elements.length === 0) {
            return undefined;
        }

        const noteElement = elements[0];
        if (!isStaffMode) {
            return noteElement.getBoundingClientRect();
        }

        const symbol = noteElement.querySelector<HTMLElement>(
            ".staff-note-viewer-note-symbol, .staff-note-viewer-rest-symbol",
        );
        if (!symbol) {
            return noteElement.getBoundingClientRect();
        }

        const runRect = noteElement.getBoundingClientRect();
        const symbolRect = symbol.getBoundingClientRect();

        // Anchor the cursor to the run and move it so the cursor matches the single-line note position.
        const baseTranslateY = 8;
        const singleLineTop = runRect.top + ((runRect.height - symbolRect.height) / 2) - baseTranslateY;
        const glyphLeft = this.staffGlyphLeftEdge(noteElement, symbol);

        return new DOMRect(glyphLeft, singleLineTop, symbolRect.width, symbolRect.height);
    }

    private staffGlyphLeftEdge(run: HTMLElement, symbol: HTMLElement): number {
        const symbolRect = symbol.getBoundingClientRect();

        // Rest glyphs are centred in the sprite with a small inset. Use a nominal inset —
        // the exact value differs by a couple of pixels between rest types.
        if (symbol.classList.contains("staff-note-viewer-rest-symbol")) {
            return symbolRect.left + 5;
        }

        const head = run.querySelector<HTMLElement>(".staff-note-head");
        const headRect = head?.getBoundingClientRect();
        const centerX = headRect
            ? headRect.left + (headRect.width / 2)
            : symbolRect.left + (symbolRect.width / 2);

        if (head?.classList.contains("cross")) {
            const cross = head.querySelector<HTMLElement>(".staff-note-head-cross-svg");

            return cross ? cross.getBoundingClientRect().left : centerX - 7;
        }

        if (head?.classList.contains("square")) {
            return centerX - 14;
        }

        if (head?.classList.contains("triangle")) {
            return centerX - 7;
        }

        if (head?.classList.contains("diamond")) {
            return centerX - 5.5;
        }

        // Oval: the head is drawn at the left edge of the note sprite.
        return symbolRect.left + 1;
    }

    // ---- Track-piece overlays --------------------------------------------------------

    /**
     * Renders merged overlays for track-piece selections. Within each bar consecutive
     * track rows are merged vertically; the resulting per-bar groups are then merged
     * horizontally when the same track set appears in consecutive bars.
     *
     * @param contentHost The host element containing the track rows.
     * @param overlayContainer The container to append overlays to.
     * @param containerRect The overlay container's bounding rect.
     * @param entries The track-piece selection entries to render.
     */
    private renderTrackPieceOverlays(contentHost: HTMLElement, overlayContainer: HTMLElement,
        containerRect: DOMRect, entries: ISelectionEntry[]): void {
        if (entries.length === 0) {
            return;
        }

        // 1. Group entries by bar.
        const byBar = new Map<number, Set<number>>();
        for (const entry of entries) {
            let trackIds = byBar.get(entry.bar);
            if (!trackIds) {
                trackIds = new Set();
                byBar.set(entry.bar, trackIds);
            }

            trackIds.add(entry.trackId);
        }

        // 2. Within each bar, merge consecutive tracks into per-bar groups.
        //    Each group is: { bar, firstTrack, lastTrack, elements }.
        interface IBarGroup {
            bar: number;
            firstTrack: number;
            lastTrack: number;
            elements: HTMLElement[];
        }

        const barGroups: IBarGroup[] = [];

        for (const [bar, selectedTrackIds] of byBar) {
            const rows = contentHost.querySelectorAll<HTMLElement>(`[data-bar="${bar}"][data-track]`);
            const rowData: Array<{ trackId: number; el: HTMLElement; }> = [];

            for (const row of rows) {
                if (!(row instanceof HTMLElement)) {
                    continue;
                }

                const trackId = parseInt(row.getAttribute("data-track") ?? "", 10);
                if (!isNaN(trackId)) {
                    rowData.push({ trackId, el: row });
                }
            }

            // Group consecutive selected tracks within this bar.
            let group: HTMLElement[] = [];
            let groupTrackIds: number[] = [];

            for (const { trackId, el } of rowData) {
                if (selectedTrackIds.has(trackId)) {
                    group.push(el);
                    groupTrackIds.push(trackId);
                } else if (group.length > 0) {
                    barGroups.push({
                        bar,
                        firstTrack: groupTrackIds[0],
                        lastTrack: groupTrackIds[groupTrackIds.length - 1],
                        elements: group,
                    });
                    group = [];
                    groupTrackIds = [];
                }
            }

            if (group.length > 0) {
                barGroups.push({
                    bar,
                    firstTrack: groupTrackIds[0],
                    lastTrack: groupTrackIds[groupTrackIds.length - 1],
                    elements: group,
                });
            }
        }

        if (barGroups.length === 0) {
            return;
        }

        // 3. Merge across consecutive bars: groups that share the same [firstTrack, lastTrack]
        //    in consecutive bars are merged horizontally.
        barGroups.sort((a, b) => {
            return a.bar - b.bar || a.firstTrack - b.firstTrack;
        });

        const merged: IBarGroup[] = [];
        let current = barGroups[0];

        for (let i = 1; i < barGroups.length; i++) {
            const next = barGroups[i];
            if (next.bar === current.bar + 1
                && next.firstTrack === current.firstTrack
                && next.lastTrack === current.lastTrack) {
                // Extend: collect elements from the next bar too.
                current.elements.push(...next.elements);
            } else {
                merged.push(current);
                current = next;
            }
        }

        merged.push(current);

        // 4. Create overlays. Track pieces stay within the row (no upward offset), so they
        //    don't overlap the accent zone of the track above. The bottom edge aligns with
        //    the row bottom, matching whole-track overlays.
        for (const group of merged) {
            this.createMergedOverlay(overlayContainer, containerRect, group.elements, 0, 0);
        }
    }

    // ---- Whole-track overlays --------------------------------------------------------

    /**
     * Renders merged overlays for whole-track selections. Tracks that are visually
     * consecutive in DOM order are merged into one tall overlay per contiguous block,
     * regardless of gaps in track IDs.
     *
     * @param contentHost The host element containing the track rows.
     * @param overlayContainer The container to append overlays to.
     * @param containerRect The overlay container's bounding rect.
     * @param entries The whole-track selection entries to render.
     */
    private renderTrackOverlays(contentHost: HTMLElement, overlayContainer: HTMLElement,
        containerRect: DOMRect, entries: ISelectionEntry[]): void {
        if (entries.length === 0) {
            return;
        }

        const selectedTrackIds = new Set(entries.map((e) => {
            return e.trackId;
        }));

        // Iterate through all rows of bar 1 in DOM order. Consecutive rows whose
        // track ID is selected form a group; unselected rows break the group.
        const firstBarRows = contentHost.querySelectorAll<HTMLElement>("[data-bar=\"1\"][data-track]");
        const groups: number[][] = [];
        let group: number[] = [];

        for (const row of firstBarRows) {
            if (!(row instanceof HTMLElement)) {
                continue;
            }

            const trackId = parseInt(row.getAttribute("data-track") ?? "", 10);
            if (!isNaN(trackId) && selectedTrackIds.has(trackId)) {
                group.push(trackId);
            } else if (group.length > 0) {
                groups.push(group);
                group = [];
            }
        }

        if (group.length > 0) {
            groups.push(group);
        }

        for (const trackIds of groups) {
            const selectors = trackIds.map((id) => {
                return `[data-track="${id}"]`;
            });

            const rect = this.computeMergedRect(contentHost, selectors.join(","), containerRect);
            if (rect) {
                this.createOverlay(overlayContainer, rect);
            }
        }
    }

    /**
     * Renders merged overlays for whole-measure selections. Bars that are visually
     * consecutive in DOM order are merged into one wide overlay per contiguous block,
     * regardless of gaps in bar numbers.
     *
     * @param contentHost The host element containing the track rows.
     * @param overlayContainer The container to append overlays to.
     * @param containerRect The overlay container's bounding rect.
     * @param entries The whole-measure selection entries to render.
     */
    private renderMeasureOverlays(contentHost: HTMLElement, overlayContainer: HTMLElement,
        containerRect: DOMRect, entries: ISelectionEntry[]): void {
        if (entries.length === 0) {
            return;
        }

        const selectedBars = new Set(entries.map((e) => {
            return e.bar;
        }));

        // Iterate through all bar elements in DOM order, deduplicating by bar number
        // so each bar is only considered the first time it appears.
        const barElements = contentHost.querySelectorAll<HTMLElement>("[data-bar]");
        const groups: number[][] = [];
        let group: number[] = [];
        const seen = new Set<number>();

        for (const el of barElements) {
            if (!(el instanceof HTMLElement)) {
                continue;
            }

            const bar = parseInt(el.getAttribute("data-bar") ?? "", 10);
            if (isNaN(bar) || seen.has(bar)) {
                continue;
            }

            seen.add(bar);

            if (selectedBars.has(bar)) {
                group.push(bar);
            } else if (group.length > 0) {
                groups.push(group);
                group = [];
            }
        }

        if (group.length > 0) {
            groups.push(group);
        }

        for (const barNumbers of groups) {
            const selectors = barNumbers.map((bar) => {
                return `[data-bar="${bar}"]`;
            });

            const rect = this.computeMergedRect(contentHost, selectors.join(","), containerRect);
            if (rect) {
                rect.x += 4;
                rect.width -= 8;
                this.createOverlay(overlayContainer, rect);
            }
        }
    }

    private createMergedOverlay(overlayContainer: HTMLElement, containerRect: DOMRect,
        elements: HTMLElement[], offsetY = 0, heightOffset = 0): void {
        let minLeft = Infinity;
        let minTop = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;

        // Horizontal bounds use raw element rects to avoid margin-induced over-extension.
        // Vertical bounds use margin-expanded rects so adjacent track rows touch without gaps.
        for (const el of elements) {
            const r = this.computeElementRect(el, containerRect);
            const absTop = r.y + containerRect.top;
            const absBottom = absTop + r.height;

            if (absTop < minTop) {
                minTop = absTop;
            }

            if (absBottom > maxBottom) {
                maxBottom = absBottom;
            }

            const rawRect = el.getBoundingClientRect();
            if (rawRect.left < minLeft) {
                minLeft = rawRect.left;
            }

            if (rawRect.right > maxRight) {
                maxRight = rawRect.right;
            }
        }

        // Convert viewport-pixel deltas to CSS pixels. offsetY/heightOffset are
        // already CSS pixels and must not be divided.
        const z = this.zoomFactor;

        this.createOverlay(overlayContainer, {
            x: (minLeft - containerRect.left) / z,
            y: ((minTop - containerRect.top) / z) + offsetY,
            width: (maxRight - minLeft) / z,
            height: ((maxBottom - minTop) / z) + heightOffset,
        });
    }

    /**
     * Computes an element's bounding rect relative to a container, expanded to include margins
     * so that adjacent selection overlays touch without gaps.
     *
     * @param el The element to measure.
     * @param containerRect The container's bounding rect.
     *
     * @returns The expanded rect relative to the container.
     */
    private computeElementRect(el: HTMLElement, containerRect: DOMRect): IRect {
        const elRect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const marginTop = parseFloat(style.marginTop) || 0;
        const marginRight = parseFloat(style.marginRight) || 0;
        const marginBottom = parseFloat(style.marginBottom) || 0;
        const marginLeft = parseFloat(style.marginLeft) || 0;

        // All values in viewport pixels for consistent min/max computation.
        // Callers convert to CSS pixels before passing to createOverlay.
        return {
            x: elRect.left - (marginLeft * this.zoomFactor) - containerRect.left,
            y: elRect.top - (marginTop * this.zoomFactor) - containerRect.top,
            width: elRect.width + ((marginLeft + marginRight) * this.zoomFactor),
            height: elRect.height + ((marginTop + marginBottom) * this.zoomFactor),
        };
    }

    /**
     * Computes a bounding rectangle that covers all elements matching the selector,
     * relative to the overlay container.
     *
     * Horizontal bounds use raw element rects to avoid margin-induced over-extension;
     * vertical bounds use margin-expanded rects so adjacent track rows touch without gaps.
     *
     * @param scope The element to query within.
     * @param selector The CSS selector for target elements.
     * @param containerRect The overlay container's bounding rect in viewport coordinates.
     *
     * @returns The merged rect relative to the container, or undefined if no elements match.
     */
    private computeMergedRect(scope: HTMLElement, selector: string, containerRect: DOMRect): IRect | undefined {
        const elements = scope.querySelectorAll(selector);
        if (elements.length === 0) {
            return undefined;
        }

        let minLeft = Infinity;
        let minTop = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;

        for (const el of elements) {
            if (!(el instanceof HTMLElement)) {
                continue;
            }

            const r = this.computeElementRect(el, containerRect);
            const absTop = r.y + containerRect.top;
            const absBottom = absTop + r.height;

            if (absTop < minTop) {
                minTop = absTop;
            }

            if (absBottom > maxBottom) {
                maxBottom = absBottom;
            }

            const rawRect = el.getBoundingClientRect();
            if (rawRect.left < minLeft) {
                minLeft = rawRect.left;
            }

            if (rawRect.right > maxRight) {
                maxRight = rawRect.right;
            }
        }

        const z = this.zoomFactor;

        return {
            x: (minLeft - containerRect.left) / z,
            y: (minTop - containerRect.top) / z,
            width: (maxRight - minLeft) / z,
            height: (maxBottom - minTop) / z,
        };
    }

    private createOverlay(container: HTMLElement, rect: IRect): void {
        const overlay = document.createElement("div");
        overlay.className = selectionOverlayClass;
        overlay.style.position = "absolute";
        overlay.style.left = `${rect.x - 2}px`;
        overlay.style.top = `${rect.y}px`;
        overlay.style.width = `${rect.width + 4}px`;
        overlay.style.height = `${rect.height}px`;
        container.appendChild(overlay);
    }

    private getSelectionCursor(container: HTMLElement): HTMLElement {
        const existingCursor = container.querySelector<HTMLElement>(`.${selectionCursorClass}`);
        if (existingCursor) {
            return existingCursor;
        }

        const cursor = document.createElement("div");
        cursor.className = selectionCursorClass;
        cursor.style.position = "absolute";
        container.appendChild(cursor);

        return cursor;
    }

    private positionSelectionCursor(cursor: HTMLElement, containerRect: DOMRect,
        elementRect: DOMRect, offsetX = 0): void {
        cursor.style.display = "block";
        cursor.style.left = `${((elementRect.left - containerRect.left) / this.zoomFactor) + offsetX}px`;
        cursor.style.top = `${((elementRect.top - containerRect.top) / this.zoomFactor) - 4}px`;
        cursor.style.height = `${(elementRect.height / this.zoomFactor) + 8}px`;
    }

    private isFormElement(target: EventTarget | null): boolean {
        return target instanceof HTMLElement && formElementNames.has(target.tagName);
    }
}
