/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { NoteStyleSymbolViewer } from "../components/ui/Note/NoteStyleSymbolViewer.js";
import { ComponentPlacement } from "../components/ui/framework/UIComponent.js";
import { RadialMenu, type IRadialMenuItem } from "../components/ui/framework/RadialMenu.js";
import { AudioBufferPlayer } from "../player/AudioBufferPlayer.js";
import { getSharedAudioContext } from "../core/audio-context.js";
import { NoteLength } from "../core/rest-notation.js";
import { Articulation, articulationOf, resolveNoteStyleForArticulation } from "../core/articulation.js";
import { addFractions, compareFractions, reduceFraction } from "../core/serialisation/numeric-functions.js";
import { GridMeasureEditor, type IGridEditorPosition } from "./GridMeasureEditor.js";
import { ScoreElementKind, type ScoreElementRegistry } from "./ScoreElementRegistry.js";
import { SelectionGranularity, type ISelectionDelta, type ISelectionEntry } from "./SelectionSerializer.js";
import type { SelectionManager } from "./SelectionManager.js";
import { requisitions, type ISubdivisionCreationRequest } from "../supplement/Requisitions.js";
import { h } from "preact";

const noteLengthShortcuts = [
    NoteLength.Whole,
    NoteLength.Half,
    NoteLength.Quarter,
    NoteLength.Eighth,
    NoteLength.Sixteenth,
    NoteLength.ThirtySecond,
];

/** View-specific editor input target. Pointer events cover mouse, touch and pen input. */
export interface ITrackViewerEditorInput {
    handlePointerDown?(event: PointerEvent): boolean;
    handlePointerUp?(event: PointerEvent): boolean;
    handlePointerCancel?(event: PointerEvent): boolean;
    handleKeyDown?(event: KeyboardEvent, position?: IGridEditorPosition): boolean;
}

/** Routes edit input without owning selection or rendering concerns. */
export class TrackViewerInputController {
    public editMode = false;
    public viewMode: "grid" | "staff" = "grid";

    private static readonly longPressDuration = 500;
    private static readonly longPressMoveTolerance = 10;

    private editor?: ITrackViewerEditorInput;
    private longPressTimer?: ReturnType<typeof setTimeout>;
    private longPressPointerId?: number;
    private longPressTarget?: HTMLElement;
    private currentPosition?: IGridEditorPosition;
    private noteLength = NoteLength.Quarter;
    private articulation?: Articulation;

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
        requisitions.register("noteLengthChanged", this.handleNoteLengthChanged);
        requisitions.register("articulationChanged", this.handleArticulationChanged);
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
        requisitions.unregister("noteLengthChanged", this.handleNoteLengthChanged);
        requisitions.unregister("articulationChanged", this.handleArticulationChanged);
        this.clearLongPress();
        this.editor = undefined;
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

        if ((event.altKey || event.metaKey) && !event.ctrlKey && !event.shiftKey) {
            const shortcutIndex = Number.parseInt(event.key, 10) - 1;
            const length = noteLengthShortcuts[shortcutIndex];
            const canSelectLength = shortcutIndex >= 0 && shortcutIndex < noteLengthShortcuts.length
                && this.selectionManager.hasSelection
                && this.editor instanceof GridMeasureEditor
                && this.currentPosition !== undefined
                && this.editor.noteLengthDuration(length, this.currentPosition) !== undefined;
            if (canSelectLength) {
                void requisitions.execute("noteLengthChanged", length);
                event.preventDefault();

                return;
            }
        }

        if (!event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey
            && this.editor instanceof GridMeasureEditor && this.currentPosition) {
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

        if (!editor.clearSelection(entries)) {
            return false;
        }

        // Keep the selection at the same score positions. The removed note ids must not remain in
        // the entries because staff rendering replaces those notes with newly identified rests.
        const clearedEntries = entries.map((entry) => {
            return { ...entry, noteId: undefined };
        });

        this.selectionManager.replaceSelection(clearedEntries);

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

        if (this.viewMode === "staff") {
            return this.deleteBeforeStaffCursor(editor, position);
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

    private deleteBeforeStaffCursor(editor: GridMeasureEditor, position: IGridEditorPosition): boolean {
        const currentRun = this.getStaffRunForPosition(position);
        const previousRun = currentRun ? this.findPreviousStaffRun(currentRun) : undefined;
        const location = previousRun ? this.scoreElementRegistry.getLocation(previousRun) : undefined;
        if (location?.step === undefined) {
            return false;
        }

        const previousPosition = {
            bar: location.bar,
            trackId: location.trackId,
            step: location.step,
            start: location.start,
        };

        if (location.noteId !== undefined) {
            editor.clearSelection([{
                granularity: SelectionGranularity.Note,
                bar: location.bar,
                trackId: location.trackId,
                startStep: location.step,
                endStep: location.step,
                noteId: location.noteId,
                start: location.start,
            }]);
        }

        this.selectCursorPosition(previousPosition);

        return true;
    }

    private handleNoteEntryRequested = (noteStyleId: string): Promise<boolean> => {
        if (!this.editMode) {
            return Promise.resolve(false);
        }

        return Promise.resolve(this.enterNote(noteStyleId));
    };

    private handleNoteLengthChanged = (length: NoteLength): Promise<boolean> => {
        this.noteLength = length;

        // Duration changes only exist in the staff view; the grid works with fixed steps.
        if (this.editMode && this.viewMode === "staff" && this.editor instanceof GridMeasureEditor) {
            const entries = [...this.selectionManager.currentSelection.values()];

            if (this.editor.resizeSelection(entries, length)) {
                this.selectionManager.replaceSelection(this.editor.refreshSelection(entries));
            }
        }

        return Promise.resolve(true);
    };

    private handleArticulationChanged = (articulation: Articulation): Promise<boolean> => {
        this.articulation = articulation;

        return Promise.resolve(true);
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

        const styles = this.editor.getNoteStyles(position);
        const requestedStyle = styles
            .find((candidate) => {
                return candidate.id === noteStyleId;
            });
        if (!requestedStyle) {
            return false;
        }

        const articulatedStyleId = this.articulation === undefined
            ? undefined
            : resolveNoteStyleForArticulation(
                Object.fromEntries(styles.map((style) => {
                    return [style.id, style];
                })),
                requestedStyle.id,
                this.articulation,
            );
        const style = articulatedStyleId === undefined
            ? requestedStyle
            : styles.find((candidate) => {
                return candidate.id === articulatedStyleId;
            })!;

        // Grid cells with an exact start, subdivision slots and existing notes keep their own
        // duration. A staff rest run is filled like an empty grid cell instead, so the selected
        // note length applies to it.
        const fillsExactSlot = position.start !== undefined
            && (this.viewMode !== "staff"
                || this.editor.hasNoteAt(position) || this.editor.isSubdivisionSlot(position));

        let selectedStyle: ReturnType<GridMeasureEditor["setNote"]>;
        let insertedPosition = position;
        let insertedDuration: ReturnType<GridMeasureEditor["noteLengthDuration"]>;
        if (fillsExactSlot) {
            selectedStyle = this.editor.setNote(position, style.id);
        } else {
            const duration = this.editor.noteLengthDuration(this.noteLength, position);

            if (this.viewMode === "staff") {
                // Staff entries are not tied to grid steps: the note keeps the selected length and
                // later notes give way instead of the note being shortened.
                const entry = duration === undefined
                    ? undefined
                    : this.editor.insertNoteWithShift(position, duration, style.id);
                selectedStyle = entry?.style;
                insertedPosition = entry?.position ?? position;
                insertedDuration = entry?.duration;
            } else {
                const insertion = duration === undefined
                    ? undefined
                    : this.editor.resolveNoteInsertion(position, duration);
                insertedPosition = insertion?.position ?? position;
                insertedDuration = insertion?.duration;
                selectedStyle = insertion === undefined
                    ? undefined
                    : this.editor.insertNote(insertion.position, insertion.duration, style.id);
            }
        }

        this.playNote(selectedStyle, this.editor.getMainVolume());
        if (this.viewMode === "staff" && insertedDuration !== undefined) {
            this.advanceStaffCursor(insertedPosition, insertedDuration);
        } else {
            this.advanceCursorForPosition(position);
        }

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
        if (delta.added.length === 0 && !this.selectionManager.hasSelection) {
            this.currentPosition = undefined;

            return Promise.resolve(true);
        }

        const added = delta.added[0];
        if (delta.added.length === 1 && (added.granularity === SelectionGranularity.Note
            || (this.viewMode === "staff" && added.granularity === SelectionGranularity.TrackPiece))) {
            this.currentPosition = {
                bar: added.bar,
                trackId: added.trackId,
                step: added.startStep ?? 0,
                start: added.start,
            };

            if (added.granularity === SelectionGranularity.Note && added.noteId !== undefined
                && this.editor instanceof GridMeasureEditor) {
                const style = this.editor.findNote(added.noteId)?.note?.audioData;
                this.articulation = style === undefined ? undefined : articulationOf(style);
            }
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

    private advanceStaffCursor(position: IGridEditorPosition, duration: NonNullable<ReturnType<
        GridMeasureEditor["noteLengthDuration"]>>): void {
        if (!(this.editor instanceof GridMeasureEditor)) {
            return;
        }

        const cell = this.editor.resolveCell(position);
        if (!cell) {
            return;
        }

        const measure = cell.track.measures[position.bar - 1];
        const start = position.start ?? reduceFraction(position.step, measure.meter.stepResolution);
        const end = addFractions(start, duration);

        let nextPosition: IGridEditorPosition;

        if (compareFractions(end, { numerator: 1, denominator: 1 }) >= 0) {
            if (position.bar >= cell.track.measures.length) {
                return;
            }

            nextPosition = { bar: position.bar + 1, trackId: position.trackId, step: 0 };
        } else {
            const step = end.numerator * measure.meter.stepResolution / end.denominator;
            if (!Number.isInteger(step)) {
                return;
            }

            nextPosition = { bar: position.bar, trackId: position.trackId, step };
        }

        this.selectCursorPosition(nextPosition);
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

    private getStaffRunForPosition(position: IGridEditorPosition): HTMLElement | undefined {
        return this.scoreElementRegistry.findSelectionElements({
            granularity: SelectionGranularity.Note,
            bar: position.bar,
            trackId: position.trackId,
            startStep: position.step,
            endStep: position.step,
            start: position.start,
        }, ScoreElementKind.StaffRun).at(0);
    }

    private findPreviousStaffRun(run: HTMLElement): HTMLElement | undefined {
        const row = run.closest<HTMLElement>(".staff-measure-track-row");
        const rowLocation = row ? this.scoreElementRegistry.getLocation(row) : undefined;
        if (!row || !rowLocation) {
            return undefined;
        }

        const runs = this.getStaffRuns(row);
        const runIndex = runs.indexOf(run);
        if (runIndex > 0) {
            return runs[runIndex - 1];
        }

        const rows = this.scoreElementRegistry.findElements(ScoreElementKind.TrackRow, undefined, rowLocation.trackId)
            .filter((candidate) => {
                return candidate.classList.contains("staff-measure-track-row");
            }).sort((left, right) => {
                return (this.scoreElementRegistry.getLocation(left)?.bar ?? 0)
                    - (this.scoreElementRegistry.getLocation(right)?.bar ?? 0);
            });
        const rowIndex = rows.indexOf(row);
        if (rowIndex <= 0) {
            return undefined;
        }

        return this.getStaffRuns(rows[rowIndex - 1]).at(-1);
    }

    private getStaffRuns(row: HTMLElement): HTMLElement[] {
        return [...row.querySelectorAll<HTMLElement>(".staff-note-viewer-run")]
            .filter((run) => {
                return run.querySelector(
                    ".staff-note-viewer-note-symbol, .staff-note-viewer-rest-symbol",
                ) !== null;
            });
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
