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
import { addFractions, compareFractions } from "../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction } from "../core/types/general.js";
import { GridMeasureEditor, type IGridEditorPosition } from "./GridMeasureEditor.js";
import { MeasureEditor } from "./MeasureEditor.js";
import { StaffMeasureEditor, type IInsertedStaffNote, type IStaffEditorPosition } from "./StaffMeasureEditor.js";
import { ScoreElementKind, type ScoreElementRegistry } from "./ScoreElementRegistry.js";
import {
    addressesNoteCells, SelectionGranularity, SelectionSerializer, type ISelectionDelta, type ISelectionEntry,
    type ISelectionTarget,
} from "./SelectionSerializer.js";
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

/** The start of a measure as a bar fraction. */
const measureStart: IFraction = { numerator: 0, denominator: 1 };

/** The bar line as a bar fraction. */
const barLine: IFraction = { numerator: 1, denominator: 1 };

/** The cursor position of the current view: a grid cell or a staff run. */
type ICursorPosition = IGridEditorPosition | IStaffEditorPosition;

/** Routes edit input without owning selection or rendering concerns. */
export class TrackViewerInputController {
    public editMode = false;
    public viewMode: "grid" | "staff" = "grid";

    private static readonly longPressDuration = 500;
    private static readonly longPressMoveTolerance = 10;

    private gridEditor?: GridMeasureEditor;
    private staffEditor?: StaffMeasureEditor;
    private longPressTimer?: ReturnType<typeof setTimeout>;
    private longPressPointerId?: number;
    private longPressTarget?: HTMLElement;
    private currentPosition?: ICursorPosition;
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
        this.gridEditor = undefined;
        this.staffEditor = undefined;
    }

    public setEditors(gridEditor: GridMeasureEditor, staffEditor: StaffMeasureEditor): void {
        this.gridEditor = gridEditor;
        this.staffEditor = staffEditor;
    }

    private handlePointerDown = (event: PointerEvent): void => {
        if (!this.editMode || this.viewMode !== "grid") {
            return;
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
    };

    private handlePointerCancel = (event: PointerEvent): void => {
        this.clearLongPress(event.pointerId);
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
        const editor = this.gridEditor;
        const cell = this.getGridCell(target);
        if (editor === undefined || !cell) {
            return;
        }

        const items: IRadialMenuItem[] = editor.getNoteStyles(position.trackId).map((style, index) => {
            const name = style.symbol?.shortDescription ?? style.id;
            const tooltip = style.symbol?.description ?? name;

            return {
                id: style.id,
                label: name,
                tooltip: `${tooltip} (${index + 1})`,
                icon: h(NoteStyleSymbolViewer, { noteStyle: style, "data-tooltip": "inherit" }),
                onClick: () => {
                    const selectedStyle = editor.setNote(position, style.id);
                    this.playNote(selectedStyle, editor.getMainVolume());
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

    /**
     * Resolves the staff position of a rendered run.
     *
     * @param target The event target to resolve.
     *
     * @returns The exact staff position, or undefined when the target is not a run.
     */
    private getStaffPosition(target: EventTarget | null): IStaffEditorPosition | undefined {
        if (!(target instanceof HTMLElement)) {
            return undefined;
        }

        const run = target.closest<HTMLElement>(".staff-note-viewer-run");
        if (!run) {
            return undefined;
        }

        const location = this.scoreElementRegistry.getLocation(run);
        if (location?.kind !== ScoreElementKind.StaffRun || location.start === undefined) {
            return undefined;
        }

        return { bar: location.bar, trackId: location.trackId, start: { ...location.start } };
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.editMode || this.currentEditor() === undefined) {
            return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
            this.handleDelete(event);

            return;
        }

        const shortcutIndex = Number.parseInt(event.key, 10) - 1;

        if ((event.altKey || event.metaKey) && !event.ctrlKey && !event.shiftKey) {
            const length = noteLengthShortcuts[shortcutIndex];
            const canSelectLength = shortcutIndex >= 0 && shortcutIndex < noteLengthShortcuts.length
                && this.selectionManager.hasSelection
                && this.noteLengthDurationOf(length) !== undefined;
            if (canSelectLength) {
                void requisitions.execute("noteLengthChanged", length);
                event.preventDefault();

                return;
            }
        }

        if (!event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
            const styles = this.noteStylesAtCursor();
            if (shortcutIndex >= 0 && shortcutIndex < styles.length) {
                this.enterNote(styles[shortcutIndex].id);
                event.preventDefault();

                return;
            }
        }
    };

    private handleDelete(event: KeyboardEvent): void {
        const handled = event.key === "Backspace"
            ? this.deleteBeforeCursor()
            : this.deleteSelection();

        if (handled) {
            event.preventDefault();
        }
    }

    private handleSelectionDeleteRequested = (): Promise<boolean> => {
        const entries = [...this.selectionManager.currentSelection.values()];
        if (entries.length === 0) {
            return Promise.resolve(false);
        }

        // Removing a whole empty subdivision is a subdivision edit, so it belongs to the grid editor
        // even when the selection was made in the staff view.
        if (this.gridEditor?.deleteEmptySubdivisionsForSelection(entries)) {
            this.selectionManager.clearSelection();

            return Promise.resolve(true);
        }

        return Promise.resolve(this.deleteSelection());
    };

    /**
     * Deletes the content described by the current selection.
     *
     * @returns True when content was deleted.
     */
    private deleteSelection(): boolean {
        const editor = this.currentEditor();
        const entries = [...this.selectionManager.currentSelection.values()];
        if (editor === undefined || entries.length === 0) {
            return false;
        }

        if (!editor.clearSelection(entries)) {
            return false;
        }

        // The cleared elements no longer hold the selected content, so the selection is dropped.
        this.selectionManager.clearSelection();

        return true;
    }

    /**
     * Deletes the content immediately before the cursor: in the grid the previous cell's note or the
     * subdivision containing the previous slot, in the staff the previous run.
     *
     * @returns True when content was deleted.
     */
    private deleteBeforeCursor(): boolean {
        const position = this.currentPosition;
        if (position === undefined) {
            return false;
        }

        return "step" in position
            ? this.deleteBeforeGridCursor(position)
            : this.deleteBeforeStaffCursor(position);
    }

    private deleteBeforeGridCursor(position: IGridEditorPosition): boolean {
        const editor = this.gridEditor;
        if (editor === undefined) {
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
        } else {
            editor.clearNote(previousPosition);
        }

        this.selectCursorPosition(previousPosition);

        return true;
    }

    private deleteBeforeStaffCursor(position: IStaffEditorPosition): boolean {
        const editor = this.staffEditor;

        // Backspace removes the event before the cursor, so a selection of several elements has no
        // target of its own.
        if (editor === undefined || this.selectionManager.currentSelection.size > 1) {
            return false;
        }

        const currentRun = this.getStaffRunForPosition(position);
        const previousRun = currentRun ? this.findPreviousStaffRun(currentRun) : undefined;
        const previousPosition = previousRun ? this.getStaffPosition(previousRun) : undefined;
        if (previousPosition === undefined) {
            return false;
        }

        // The event leaves no rest behind. Where shifting is impossible — a track holding
        // subdivisions — it is cleared to a rest instead, so Backspace never does nothing silently.
        if (!editor.deleteEventWithShift(previousPosition) && !editor.clearNote(previousPosition)) {
            return false;
        }

        this.selectStaffCursor(previousPosition);

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
        const editor = this.staffEditor;
        if (this.editMode && this.viewMode === "staff" && editor !== undefined) {
            const entries = [...this.selectionManager.currentSelection.values()];

            if (editor.resizeSelection(entries, length)) {
                this.selectionManager.replaceSelection(editor.refreshSelection(entries));
            }
        }

        return Promise.resolve(true);
    };

    private handleArticulationChanged = (articulation: Articulation): Promise<boolean> => {
        this.articulation = articulation;

        return Promise.resolve(true);
    };

    private handleSubdivisionCreationRequested = (request: ISubdivisionCreationRequest): Promise<boolean> => {
        const editor = this.gridEditor;
        if (!this.editMode || this.viewMode !== "grid" || editor === undefined) {
            return Promise.resolve(false);
        }

        const entries = [...this.selectionManager.currentSelection.values()];

        if (this.isMultiCellSelection(entries)) {
            return Promise.resolve(editor.createSubdivisionForSelection(entries, request.actual));
        }

        const position = this.currentPosition;

        return Promise.resolve(position !== undefined && "step" in position
            && editor.createSubdivisionAtCursor(position, request.actual, request.normal));
    };

    private enterNote(noteStyleId: string): boolean {
        const entries = [...this.selectionManager.currentSelection.values()];
        if (this.isMultiCellSelection(entries)) {
            return this.enterNoteForSelection(noteStyleId, entries);
        }

        const position = this.currentPosition;
        if (position === undefined) {
            return false;
        }

        return "step" in position
            ? this.enterGridNote(position, noteStyleId)
            : this.enterStaffNote(position, noteStyleId);
    }

    /**
     * Writes a note in the grid view. A cell that addresses a subdivision slot keeps the slot's own
     * duration and only changes its style; every other cell resolves the insertion through the grid,
     * which shortens the note to the free space before the next note (ADR-0003).
     *
     * @param position The grid cell to write to.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns True when the edit was applied.
     */
    private enterGridNote(position: IGridEditorPosition, noteStyleId: string): boolean {
        const editor = this.gridEditor;
        if (editor === undefined) {
            return false;
        }

        const style = this.resolveNoteStyle(editor.getNoteStyles(position.trackId), noteStyleId);
        if (style === undefined) {
            return false;
        }

        let selectedStyle: IAudioData | undefined;
        if (position.start !== undefined) {
            selectedStyle = editor.setNote(position, style.id);
        } else {
            const duration = editor.noteLengthDuration(this.noteLength, position);
            const insertion = duration === undefined ? undefined : editor.resolveNoteInsertion(position, duration);
            selectedStyle = insertion === undefined
                ? undefined
                : editor.insertNote(insertion.position, insertion.duration, style.id);
        }

        this.playNote(selectedStyle, editor.getMainVolume());
        this.advanceCursorForPosition(position);
        this.eventContainer.focus({ preventScroll: true });

        return true;
    }

    /**
     * Writes a note in the staff view. A run holding a note or addressing a subdivision slot keeps
     * its own duration and only changes its style; a rest run is filled with the selected length,
     * which shifts the following notes (ADR-0003).
     *
     * @param position The staff position to write to.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns True when the edit was applied.
     */
    private enterStaffNote(position: IStaffEditorPosition, noteStyleId: string): boolean {
        const editor = this.staffEditor;
        if (editor === undefined) {
            return false;
        }

        const style = this.resolveNoteStyle(editor.getNoteStyles(position.trackId), noteStyleId);
        if (style === undefined) {
            return false;
        }

        if (editor.hasNoteAt(position) || editor.isSubdivisionSlot(position)) {
            this.playNote(editor.setNote(position, style.id), editor.getMainVolume());

            return true;
        }

        const duration = editor.noteLengthDuration(this.noteLength, position);
        const inserted = duration === undefined
            ? undefined
            : editor.insertNoteWithShift(position, duration, style.id);

        this.playNote(inserted?.style, editor.getMainVolume());
        if (inserted !== undefined) {
            this.advanceStaffCursor(inserted);
        }

        this.eventContainer.focus({ preventScroll: true });

        return true;
    }

    /**
     * Resolves the style to write: the requested one, or its articulation variant when an
     * articulation is selected.
     *
     * @param styles The styles the addressed instrument offers.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns The style to write, or undefined when the instrument does not offer it.
     */
    private resolveNoteStyle(styles: IAudioData[], noteStyleId: string): IAudioData | undefined {
        const requested = styles.find((candidate) => {
            return candidate.id === noteStyleId;
        });
        if (requested === undefined || this.articulation === undefined) {
            return requested;
        }

        const articulatedId = resolveNoteStyleForArticulation(
            Object.fromEntries(styles.map((style) => {
                return [style.id, style];
            })),
            requested.id,
            this.articulation,
        );
        if (articulatedId === undefined) {
            return requested;
        }

        return styles.find((candidate) => {
            return candidate.id === articulatedId;
        }) ?? requested;
    }

    private enterNoteForSelection(noteStyleId: string, entries: ISelectionEntry[]): boolean {
        const editor = this.currentEditor();
        if (editor === undefined) {
            return false;
        }

        const applied = editor.setSelectionNoteStyle(entries, noteStyleId);
        if (!applied) {
            // Either the style is already applied to every element (no-op) or the selection spans
            // multiple instruments. Keep the selection untouched in both cases.
            return false;
        }

        // Keep the selection on the now-filled elements with fresh note ids and refresh the
        // note-style marking.
        const refreshedEntries = editor.refreshSelection(entries);
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
        const isCursorEntry = delta.added.length === 1 && (added.granularity === SelectionGranularity.Note
            || (this.viewMode === "staff" && added.granularity === SelectionGranularity.TrackPiece));
        if (isCursorEntry) {
            this.setCursorFromEntry(added);

            const { target } = added;
            if (target.granularity === SelectionGranularity.Note) {
                const noteIndex = target.measure.events.indexOf(target.event);
                const noteEvent = noteIndex < 0 ? undefined : target.measure.noteEvents.at(noteIndex);
                const style = noteEvent?.audioData;

                this.articulation = style === undefined ? undefined : articulationOf(style);
            }
        }

        return Promise.resolve(true);
    };

    /**
     * Derives the cursor from the entry that was just selected. The grid cursor is the addressed
     * cell, the staff cursor the exact start of the addressed run; an entry without an exact
     * position starts at the measure.
     *
     * @param entry The entry added to the selection.
     */
    private setCursorFromEntry(entry: ISelectionEntry): void {
        const { target } = entry;
        if (target.granularity === SelectionGranularity.Track) {
            return;
        }

        const { measure } = target;
        const exact = addressesNoteCells(target)
            ? SelectionSerializer.coordinatesOf(entry).start ?? measureStart
            : measureStart;

        // A grid cell is addressed by its step alone; only a subdivision slot carries its exact start.
        const slot = SelectionSerializer.addressesSubdivisionSlot(target);

        this.currentPosition = this.viewMode === "staff"
            ? { bar: measure.number, trackId: measure.track.id, start: { ...exact } }
            : {
                bar: measure.number,
                trackId: measure.track.id,
                step: SelectionSerializer.cellOf(exact, measure),
                start: slot ? { ...exact } : undefined,
            };
    }

    private playNote(style: IAudioData | undefined, volume: number): void {
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

    /**
     * Moves the staff cursor behind a written note: to the exact position after it, or to the start
     * of the following bar when the note ends at the bar line.
     *
     * @param inserted The note that was written.
     */
    private advanceStaffCursor(inserted: IInsertedStaffNote): void {
        const end = addFractions(inserted.start, inserted.duration);
        const next = compareFractions(end, barLine) < 0
            ? { bar: inserted.bar, trackId: inserted.trackId, start: end }
            : { bar: inserted.bar + 1, trackId: inserted.trackId, start: measureStart };

        if (this.getStaffRunForPosition(next) !== undefined) {
            this.selectStaffCursor(next);
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

        this.selectCursorPosition(position);
    }

    private selectCursorPosition(position: IGridEditorPosition): void {
        this.currentPosition = position;

        const cell = this.getGridCellForPosition(position);
        const event = cell === undefined ? undefined : this.scoreElementRegistry.getTarget(cell);
        const measure = cell === undefined ? undefined : this.scoreElementRegistry.getLocation(cell)?.measure;
        const target: ISelectionTarget | undefined = event === undefined || !("duration" in event)
            || measure === undefined
            ? undefined
            : { granularity: SelectionGranularity.Note, measure, event, start: position.start };
        if (target === undefined) {
            return;
        }

        this.selectionManager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            target,
        });
    }

    /**
     * Selects the staff run at the given position and makes it the cursor.
     *
     * @param position The exact staff position to select.
     */
    private selectStaffCursor(position: IStaffEditorPosition): void {
        this.currentPosition = position;

        const run = this.getStaffRunForPosition(position);
        const event = run === undefined ? undefined : this.scoreElementRegistry.getTarget(run);
        const measure = run === undefined ? undefined : this.scoreElementRegistry.getLocation(run)?.measure;
        if (event === undefined || !("duration" in event) || measure === undefined) {
            return;
        }

        this.selectionManager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            target: { granularity: SelectionGranularity.Note, measure, event, start: { ...position.start } },
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
        return this.scoreElementRegistry.findPositionElement(position.bar, position.trackId,
            ScoreElementKind.GridCell, position.step, position.start);
    }

    private getStaffRunForPosition(position: IStaffEditorPosition): HTMLElement | undefined {
        return this.scoreElementRegistry.findPositionElement(position.bar, position.trackId,
            ScoreElementKind.StaffRun, undefined, position.start);
    }

    /**
     * Returns the editor of the current view. The edits both views share — note styles, selection
     * clears, volume — go through it, so their call sites do not branch on the view mode (ADR-0005).
     *
     * @returns The editor of the current view.
     */
    private currentEditor(): MeasureEditor | undefined {
        return this.viewMode === "staff" ? this.staffEditor : this.gridEditor;
    }

    /**
     * Returns the note styles at the cursor, supplied by the instrument of its track.
     *
     * @returns The note styles, or an empty array when there is no cursor.
     */
    private noteStylesAtCursor(): IAudioData[] {
        const position = this.currentPosition;

        return position === undefined ? [] : this.currentEditor()?.getNoteStyles(position.trackId) ?? [];
    }

    /**
     * Resolves the duration of a note length at the cursor in the current view.
     *
     * @param length The note length to resolve.
     *
     * @returns The duration as a fraction of the bar, or undefined when the view cannot represent it.
     */
    private noteLengthDurationOf(length: NoteLength): IFraction | undefined {
        const position = this.currentPosition;
        if (position === undefined) {
            return undefined;
        }

        if ("step" in position) {
            return this.gridEditor?.noteLengthDuration(length, position);
        }

        return this.staffEditor?.noteLengthDuration(length, position);
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
