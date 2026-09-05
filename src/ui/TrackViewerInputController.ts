/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { NoteStyleSymbolViewer } from "../components/ui/Note/NoteStyleSymbolViewer.js";
import { ComponentPlacement } from "../components/ui/framework/UIComponent.js";
import { RadialMenu, type IRadialMenuItem } from "../components/ui/framework/RadialMenu.js";
import { AudioBufferPlayer } from "../player/AudioBufferPlayer.js";
import { getSharedAudioContext } from "../core/audio-context.js";
import { GridMeasureEditor, type IGridEditorPosition } from "./GridMeasureEditor.js";
import { ScoreElementKind, type ScoreElementRegistry } from "./ScoreElementRegistry.js";
import { SelectionGranularity, type ISelectionDelta, type ISelectionEntry } from "./selection-types.js";
import type { SelectionManager } from "./SelectionManager.js";
import { requisitions, type ISubdivisionCreationRequest } from "../supplement/Requisitions.js";
import { h } from "preact";

/** View-specific editor input target. Pointer events cover mouse, touch and pen input. */
export interface ITrackViewerEditorInput {
    handlePointerDown?(event: PointerEvent): boolean;
    handlePointerUp?(event: PointerEvent): boolean;
    handlePointerCancel?(event: PointerEvent): boolean;
    handleKeyDown?(event: KeyboardEvent, position?: IGridEditorPosition): boolean;
}

/** Routes edit input without owning selection or rendering concerns. */
export class TrackViewerInputController {
    private static readonly longPressDuration = 500;
    private static readonly longPressMoveTolerance = 10;

    private editMode = false;
    private viewMode: "grid" | "staff" = "grid";
    private editor?: ITrackViewerEditorInput;
    private longPressTimer?: ReturnType<typeof setTimeout>;
    private longPressPointerId?: number;
    private longPressTarget?: HTMLElement;
    private currentPosition?: IGridEditorPosition;

    public constructor(
        private readonly eventContainer: HTMLElement,
        private readonly radialMenu: RadialMenu,
        private readonly selectionManager: SelectionManager,
        private readonly scoreElementRegistry: ScoreElementRegistry,
    ) {
    }

    public attach(): void {
        this.eventContainer.addEventListener("pointerdown", this.handlePointerDown);
        this.eventContainer.addEventListener("pointerup", this.handlePointerUp);
        this.eventContainer.addEventListener("pointercancel", this.handlePointerCancel);
        this.eventContainer.addEventListener("pointermove", this.handlePointerMove);
        this.eventContainer.addEventListener("contextmenu", this.handleContextMenu);
        this.eventContainer.addEventListener("keydown", this.handleKeyDown);
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("selectionDeleteRequested", this.handleSelectionDeleteRequested);
        requisitions.register("noteEntryRequested", this.handleNoteEntryRequested);
        requisitions.register("subdivisionCreationRequested", this.handleSubdivisionCreationRequested);
    }

    public dispose(): void {
        this.eventContainer.removeEventListener("pointerdown", this.handlePointerDown);
        this.eventContainer.removeEventListener("pointerup", this.handlePointerUp);
        this.eventContainer.removeEventListener("pointercancel", this.handlePointerCancel);
        this.eventContainer.removeEventListener("pointermove", this.handlePointerMove);
        this.eventContainer.removeEventListener("contextmenu", this.handleContextMenu);
        this.eventContainer.removeEventListener("keydown", this.handleKeyDown);
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("selectionDeleteRequested", this.handleSelectionDeleteRequested);
        requisitions.unregister("noteEntryRequested", this.handleNoteEntryRequested);
        requisitions.unregister("subdivisionCreationRequested", this.handleSubdivisionCreationRequested);
        this.clearLongPress();
        this.editor = undefined;
    }

    public setEditMode(enabled: boolean): void {
        this.editMode = enabled;
    }

    public setViewMode(mode: "grid" | "staff"): void {
        this.viewMode = mode;
    }

    public setEditor(editor: ITrackViewerEditorInput | undefined): void {
        this.editor = editor;
    }

    public setGridEditor(editor: GridMeasureEditor | undefined): void {
        this.editor = editor;
    }

    private handlePointerDown = (event: PointerEvent): void => {
        if (!this.editMode || this.viewMode !== "grid" || !this.editor?.handlePointerDown) {
            return;
        }

        if (this.editor.handlePointerDown(event)) {
            event.preventDefault();
        }

        this.eventContainer.focus({ preventScroll: true });

        const position = this.getGridPosition(event.target);
        if (!position) {
            return;
        }

        this.currentPosition = position;

        if (event.pointerType === "mouse" && event.button === 2) {
            this.openNoteMenu(position, event.target);
            event.preventDefault();

            return;
        }

        if (event.pointerType === "touch") {
            this.startLongPress(event, position);
        }
    };

    private handlePointerUp = (event: PointerEvent): void => {
        this.clearLongPress(event.pointerId);

        if (!this.editMode || this.viewMode !== "grid" || !this.editor?.handlePointerUp) {
            return;
        }

        if (this.editor.handlePointerUp(event)) {
            event.preventDefault();
        }
    };

    private handlePointerCancel = (event: PointerEvent): void => {
        this.clearLongPress(event.pointerId);

        if (!this.editMode || this.viewMode !== "grid" || !this.editor?.handlePointerCancel) {
            return;
        }

        if (this.editor.handlePointerCancel(event)) {
            event.preventDefault();
        }
    };

    private handlePointerMove = (event: PointerEvent): void => {
        const target = this.longPressTarget;
        if (this.longPressPointerId !== event.pointerId || !target) {
            return;
        }

        const startRect = target.getBoundingClientRect();
        const movedX = Math.abs(event.clientX - (startRect.left + (startRect.width / 2)));
        const movedY = Math.abs(event.clientY - (startRect.top + (startRect.height / 2)));
        if (movedX > TrackViewerInputController.longPressMoveTolerance
            || movedY > TrackViewerInputController.longPressMoveTolerance) {
            this.clearLongPress(event.pointerId);
        }
    };

    private handleContextMenu = (event: MouseEvent): void => {
        if (this.editMode && this.viewMode === "grid" && this.getGridPosition(event.target)) {
            event.preventDefault();
        }
    };

    private startLongPress(event: PointerEvent, position: IGridEditorPosition): void {
        this.clearLongPress();
        this.longPressPointerId = event.pointerId;
        this.longPressTarget = this.getGridCell(event.target);
        this.longPressTimer = setTimeout(() => {
            const target = this.longPressTarget;
            this.clearLongPress();
            if (!target) {
                return;
            }

            this.openNoteMenu(position, target);
        }, TrackViewerInputController.longPressDuration);
    }

    private clearLongPress(pointerId?: number): void {
        if (pointerId !== undefined && this.longPressPointerId !== pointerId) {
            return;
        }

        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }

        this.longPressPointerId = undefined;
        this.longPressTarget = undefined;
    }

    private openNoteMenu(position: IGridEditorPosition, target: EventTarget | null): void {
        if (!(this.editor instanceof GridMeasureEditor)) {
            return;
        }

        const cell = this.getGridCell(target);
        if (!cell) {
            return;
        }

        const items: IRadialMenuItem[] = this.editor.getNoteStyles(position).map((style, index) => {
            const name = style.symbol?.shortDescription ?? style.id;
            const tooltip = style.symbol?.description ?? name;

            return {
                id: style.id,
                label: name,
                tooltip: `${tooltip} (${index + 1})`,
                icon: h(NoteStyleSymbolViewer, { noteStyle: style, "data-tooltip": "inherit" }),
                onClick: () => {
                    const selectedStyle = this.editor instanceof GridMeasureEditor
                        ? this.editor.setNote(position, style.id)
                        : undefined;
                    const volume = this.editor instanceof GridMeasureEditor
                        ? this.editor.getMainVolume()
                        : 1;
                    this.playNote(selectedStyle, volume);
                    this.advanceCursor(cell);
                    this.eventContainer.focus({ preventScroll: true });
                },
            };
        });
        if (items.length === 0) {
            return;
        }

        this.radialMenu.open(cell.getBoundingClientRect(), ComponentPlacement.TopCenter, items, 90, {
            startAngle: 180,
            angleSpan: items.length <= 5 ? 180 : 360,
            clockwise: true,
        });
    }

    private getGridPosition(target: EventTarget | null): IGridEditorPosition | undefined {
        const cell = this.getGridCell(target);
        if (!cell) {
            return undefined;
        }

        const location = this.scoreElementRegistry.getLocation(cell);
        if (location?.kind !== ScoreElementKind.GridCell || location.step === undefined) {
            return undefined;
        }

        return {
            bar: location.bar,
            trackId: location.trackId,
            step: location.step,
            start: location.start,
        };
    }

    private getGridCell(target: EventTarget | null): HTMLElement | undefined {
        if (!(target instanceof HTMLElement)) {
            return undefined;
        }

        const cell = target.closest<HTMLElement>(".note-viewer");
        const location = cell ? this.scoreElementRegistry.getLocation(cell) : undefined;

        return location?.kind === ScoreElementKind.GridCell ? cell ?? undefined : undefined;
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.editMode || !this.editor?.handleKeyDown) {
            return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
            this.handleDelete(event);

            return;
        }

        if (this.viewMode !== "grid") {
            return;
        }

        if (this.editor instanceof GridMeasureEditor && this.currentPosition) {
            const shortcutIndex = Number.parseInt(event.key, 10) - 1;
            const styles = this.editor.getNoteStyles(this.currentPosition);
            if (shortcutIndex >= 0 && shortcutIndex < styles.length) {
                this.enterNote(styles[shortcutIndex].id);
                event.preventDefault();

                return;
            }
        }

        if (this.editor.handleKeyDown(event, this.currentPosition)) {
            event.preventDefault();
        }
    };

    private handleDelete(event: KeyboardEvent): void {
        if (!(this.editor instanceof GridMeasureEditor)) {
            return;
        }

        const handled = event.key === "Backspace"
            ? this.deleteBeforeCursor(this.editor)
            : this.deleteAtCursor(this.editor);

        if (handled) {
            event.preventDefault();
        }
    }

    private handleSelectionDeleteRequested = (): Promise<boolean> => {
        if (!(this.editor instanceof GridMeasureEditor)) {
            return Promise.resolve(false);
        }

        const entries = [...this.selectionManager.currentSelection.values()];
        if (entries.length === 0) {
            return Promise.resolve(false);
        }

        if (this.editor.deleteEmptySubdivisionsForSelection(entries)) {
            this.selectionManager.clearSelection();

            return Promise.resolve(true);
        }

        return Promise.resolve(this.deleteAtCursor(this.editor));
    };

    /**
     * Deletes the note content at the cursor position (the current selection).
     *
     * @param editor The grid editor performing the edit.
     *
     * @returns True when content was deleted.
     */
    private deleteAtCursor(editor: GridMeasureEditor): boolean {
        const entries = [...this.selectionManager.currentSelection.values()];
        if (entries.length === 0) {
            return false;
        }

        editor.clearSelection(entries);

        if (this.viewMode === "grid" && this.currentPosition) {
            // Keep the selection on the now-empty cells so multi-cell selections survive the delete.
            const clearedEntries = entries.map((entry) => {
                return { ...entry, noteId: undefined };
            });

            this.selectionManager.replaceSelection(clearedEntries);
        }

        return true;
    }

    /**
     * Deletes the content immediately before the cursor. A subdivision containing the previous
     * slot is removed as a whole; otherwise the note of the previous cell is cleared.
     *
     * @param editor The grid editor performing the edit.
     *
     * @returns True when content was deleted.
     */
    private deleteBeforeCursor(editor: GridMeasureEditor): boolean {
        const position = this.currentPosition;
        if (!position) {
            return false;
        }

        const cell = this.getGridCellForPosition(position);
        const previousCell = cell ? this.findPreviousGridCell(cell) : undefined;
        const previousPosition = previousCell ? this.getGridPosition(previousCell) : undefined;
        if (!previousPosition) {
            return false;
        }

        if (editor.hasEmptySubdivisionAt(position)) {
            editor.deleteSubdivisionAt(position);
            this.selectCursorPosition(previousPosition);

            return true;
        }

        editor.clearNote(previousPosition);
        this.selectCursorPosition(previousPosition);

        return true;
    }

    private handleNoteEntryRequested = (noteStyleId: string): Promise<boolean> => {
        if (!this.editMode || this.viewMode !== "grid") {
            return Promise.resolve(false);
        }

        return Promise.resolve(this.enterNote(noteStyleId));
    };

    private handleSubdivisionCreationRequested = (request: ISubdivisionCreationRequest): Promise<boolean> => {
        if (!this.editMode || this.viewMode !== "grid" || !(this.editor instanceof GridMeasureEditor)) {
            return Promise.resolve(false);
        }

        const entries = [...this.selectionManager.currentSelection.values()];

        if (this.isMultiCellSelection(entries)) {
            return Promise.resolve(this.editor.createSubdivisionForSelection(entries, request.actual));
        }

        const position = this.currentPosition;

        return Promise.resolve(position !== undefined
            && this.editor.createSubdivisionAtCursor(position, request.actual, request.normal));
    };

    private enterNote(noteStyleId: string): boolean {
        const entries = [...this.selectionManager.currentSelection.values()];
        if (this.isMultiCellSelection(entries)) {
            return this.enterNoteForSelection(noteStyleId, entries);
        }

        const position = this.currentPosition;
        if (!(this.editor instanceof GridMeasureEditor) || !position) {
            return false;
        }

        const style = this.editor.getNoteStyles(position)
            .find((candidate) => {
                return candidate.id === noteStyleId;
            });
        if (!style) {
            return false;
        }

        const selectedStyle = this.editor.setNote(position, style.id);
        this.playNote(selectedStyle, this.editor.getMainVolume());
        this.advanceCursorForPosition(position);
        this.eventContainer.focus({ preventScroll: true });

        return true;
    }

    private enterNoteForSelection(noteStyleId: string, entries: ISelectionEntry[]): boolean {
        if (!(this.editor instanceof GridMeasureEditor)) {
            return false;
        }

        const applied = this.editor.setSelectionNoteStyle(entries, noteStyleId);
        if (!applied) {
            // Either the style is already applied to every cell (no-op) or the selection spans
            // multiple instruments. Keep the selection untouched in both cases.
            return false;
        }

        // Keep the selection on the now-filled cells with fresh note ids and refresh the
        // note-style marking.
        const refreshedEntries = this.editor.refreshSelection(entries);
        this.selectionManager.replaceSelection(refreshedEntries);
        this.eventContainer.focus({ preventScroll: true });

        return true;
    }

    private isMultiCellSelection(entries: ISelectionEntry[]): boolean {
        if (entries.length === 0) {
            return false;
        }

        if (entries.length > 1) {
            return true;
        }

        return entries[0].granularity !== SelectionGranularity.Note;
    }

    private handleSelectionChanged = (delta: ISelectionDelta): Promise<boolean> => {
        const added = delta.added[0];
        if (delta.added.length === 1 && added.granularity === SelectionGranularity.Note
            && added.startStep !== undefined) {
            this.currentPosition = {
                bar: added.bar,
                trackId: added.trackId,
                step: added.startStep,
                start: added.start,
            };
        }

        return Promise.resolve(true);
    };

    private playNote(style: ReturnType<GridMeasureEditor["setNote"]>, volume: number): void {
        if (!style?.audioBuffer) {
            return;
        }

        new AudioBufferPlayer(style.audioBuffer, getSharedAudioContext(), 0, volume);
    }

    private advanceCursorForPosition(position: IGridEditorPosition): void {
        const cell = this.getGridCellForPosition(position);
        if (cell) {
            this.advanceCursor(cell);
        }
    }

    private advanceCursor(cell: HTMLElement): void {
        const nextCell = this.findNextGridCell(cell);
        if (!nextCell) {
            return;
        }

        const position = this.getGridPosition(nextCell);
        if (!position) {
            return;
        }

        this.selectCursorCell(nextCell);
    }

    private selectCursorCell(cell: HTMLElement): void {
        const position = this.getGridPosition(cell);
        if (!position) {
            return;
        }

        const noteId = this.scoreElementRegistry.getLocation(cell)?.noteId;
        this.selectCursorPosition(position, noteId);
    }

    private selectCursorPosition(position: IGridEditorPosition, noteId?: number): void {
        this.currentPosition = position;
        this.selectionManager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            bar: position.bar,
            trackId: position.trackId,
            startStep: position.step,
            endStep: position.step,
            noteId,
            start: position.start,
        });
    }

    private findNextGridCell(cell: HTMLElement): HTMLElement | undefined {
        const row = cell.closest<HTMLElement>(".grid-measure-row");
        if (!row) {
            return undefined;
        }

        const rowLocation = this.scoreElementRegistry.getLocation(row);
        if (!rowLocation) {
            return undefined;
        }

        const cells = this.getGridCells(rowLocation.bar, rowLocation.trackId);
        const cellIndex = cells.indexOf(cell);
        if (cellIndex + 1 < cells.length) {
            return cells[cellIndex + 1];
        }

        const rows = this.getTrackRows(rowLocation.trackId);
        rows.sort((left, right) => {
            return (this.scoreElementRegistry.getLocation(left)?.bar ?? 0)
                - (this.scoreElementRegistry.getLocation(right)?.bar ?? 0);
        });
        const rowIndex = rows.indexOf(row);
        if (rowIndex < 0 || rowIndex + 1 >= rows.length) {
            return undefined;
        }

        const nextRowLocation = this.scoreElementRegistry.getLocation(rows[rowIndex + 1]);

        return nextRowLocation
            ? this.getGridCells(nextRowLocation.bar, nextRowLocation.trackId).at(0)
            : undefined;
    }

    private findPreviousGridCell(cell: HTMLElement): HTMLElement | undefined {
        const row = cell.closest<HTMLElement>(".grid-measure-row");
        if (!row) {
            return undefined;
        }

        const rowLocation = this.scoreElementRegistry.getLocation(row);
        if (!rowLocation) {
            return undefined;
        }

        const cells = this.getGridCells(rowLocation.bar, rowLocation.trackId);
        const cellIndex = cells.indexOf(cell);
        if (cellIndex > 0) {
            return cells[cellIndex - 1];
        }

        const rows = this.getTrackRows(rowLocation.trackId);
        rows.sort((left, right) => {
            return (this.scoreElementRegistry.getLocation(left)?.bar ?? 0)
                - (this.scoreElementRegistry.getLocation(right)?.bar ?? 0);
        });
        const rowIndex = rows.indexOf(row);
        if (rowIndex <= 0) {
            return undefined;
        }

        const previousRow = rows[rowIndex - 1];
        const previousRowLocation = this.scoreElementRegistry.getLocation(previousRow);
        const previousCells = previousRowLocation
            ? this.getGridCells(previousRowLocation.bar, previousRowLocation.trackId)
            : [];

        return previousCells[previousCells.length - 1];
    }

    private getGridCellForPosition(position: IGridEditorPosition): HTMLElement | undefined {
        const elements = this.scoreElementRegistry.findSelectionElements({
            granularity: SelectionGranularity.Note,
            bar: position.bar,
            trackId: position.trackId,
            startStep: position.step,
            endStep: position.step,
            start: position.start,
        }, ScoreElementKind.GridCell);

        return elements.at(0);
    }

    private getTrackRows(trackId: number): HTMLElement[] {
        return this.scoreElementRegistry.findElements(ScoreElementKind.TrackRow)
            .filter((row) => {
                return row.classList.contains("grid-measure-row")
                    && this.scoreElementRegistry.getLocation(row)?.trackId === trackId;
            });
    }

    private getGridCells(bar: number, trackId: number): HTMLElement[] {
        return this.scoreElementRegistry.findElements(ScoreElementKind.GridCell, bar, trackId);
    }

}
