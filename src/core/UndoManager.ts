import { FaviconDirtyService } from "./FavIconDirtyService.js";
import type { ScoreBookDataModel } from "./ScoreBookDataModel.js";
import type { IArrangementSnapshot, ISubdivision } from "./types/general.js";
import { requisitions } from "../supplement/Requisitions.js";
import { UndoRedoStack } from "./UndoRedoStack.js";

/** Encapsulates the application-level undo/redo management. */
export class UndoManager {
    private undoRedoStack;

    /**
     * Creates a new score book from an arrangement snapshot.
     *
     * @param dataModel The data model containing the arrangement and instruments to manage.
     */
    public constructor(private dataModel: ScoreBookDataModel) {
        this.undoRedoStack = new UndoRedoStack(this.dataModel.arrangement!);
        this.updateDirtyState();

        requisitions.register("arrangementMutated", this.handleArrangementMutated);
    }

    /**
     * Unregisters requisition listeners. Call before discarding this instance.
     */
    public dispose(): void {
        requisitions.unregister("arrangementMutated", this.handleArrangementMutated);
    }

    /**
     * Current arrangement snapshot, reflecting the latest title from the live arrangement.
     *
     * @returns The current `IArrangementSnapshot`.
     */
    public get currentState() {
        return this.undoRedoStack.currentState;
    }

    /**
     * Whether an undo is currently possible.
     *
     * @returns True if undo is available.
     */
    public get canUndo() {
        return this.undoRedoStack.canUndo;
    }

    /**
     * Whether a redo is currently possible.
     *
     * @returns True if redo is available.
     */
    public get canRedo() {
        return this.undoRedoStack.canRedo;
    }

    /**
     * Reverts the most recent change if possible and publishes a current-state change.
     *
     * @returns True when the reverted change switched between plain and subdivided notes, so the
     *          caller should clear the current selection.
     */
    public undo = (): boolean => {
        if (!this.undoRedoStack.canUndo) {
            return false;
        }

        const before = this.undoRedoStack.currentState;
        this.undoRedoStack.goBack();
        const after = this.undoRedoStack.currentState;

        this.dataModel.arrangement!.applyArrangementSnapshot(after, this.dataModel.instruments);
        this.updateDirtyState();
        this.dataModel.persistCurrentScore();

        return this.subdivisionStructureChanged(before, after);
    };

    /**
     * Reapplies the next change if possible and publishes a current-state change.
     *
     * @returns True when the reapplied change switched between plain and subdivided notes, so the
     *          caller should clear the current selection.
     */
    public redo = (): boolean => {
        if (!this.undoRedoStack.canRedo) {
            return false;
        }

        const before = this.undoRedoStack.currentState;
        this.undoRedoStack.goForward();
        const after = this.undoRedoStack.currentState;

        this.dataModel.arrangement!.applyArrangementSnapshot(after, this.dataModel.instruments);
        this.updateDirtyState();
        this.dataModel.persistCurrentScore();

        return this.subdivisionStructureChanged(before, after);
    };

    /**
     * Resets undo/redo history, typically after a save.
     * The current arrangement state becomes the new baseline.
     */
    public clearHistory(): void {
        this.undoRedoStack = new UndoRedoStack(this.dataModel.arrangement!);
        this.updateDirtyState();
        void requisitions.execute("undoStackChanged", undefined);
    }

    /**
     * Discards all pending edits by restoring the arrangement to the baseline snapshot
     * (the state captured when this undo manager was created or history was last cleared)
     * and persisting it. Used when the user chooses to ignore unsaved changes.
     */
    public discardChanges = (): void => {
        this.undoRedoStack.reset();
        this.dataModel.arrangement!.applyArrangementSnapshot(this.undoRedoStack.currentState,
            this.dataModel.instruments);
        this.updateDirtyState();
        this.dataModel.persistCurrentScore();
    };

    /**
     * Called by the requisitions system when the data model mutates the arrangement.
     * Records a snapshot into undo history.
     *
     * @returns Always true to signal the event was handled.
     */
    private handleArrangementMutated = async (): Promise<boolean> => {
        this.undoRedoStack.recordSnapshot();
        this.updateDirtyState();

        return Promise.resolve(true);
    };

    /**
     * Compares the subdivision structure of two snapshots. A difference means the transition
     * switched between plain and subdivided notes, which invalidates the current selection.
     *
     * @param before The snapshot before the transition.
     * @param after The snapshot after the transition.
     *
     * @returns True when any measure's subdivision structure changed.
     */
    private subdivisionStructureChanged(before: IArrangementSnapshot, after: IArrangementSnapshot): boolean {
        if (before.tracks.length !== after.tracks.length) {
            return true;
        }

        for (let trackIndex = 0; trackIndex < before.tracks.length; trackIndex++) {
            const beforeMeasures = before.tracks[trackIndex].measures;
            const afterMeasures = after.tracks[trackIndex].measures;

            if (beforeMeasures.length !== afterMeasures.length) {
                return true;
            }

            for (let measureIndex = 0; measureIndex < beforeMeasures.length; measureIndex++) {
                if (!this.sameSubdivisions(beforeMeasures[measureIndex].subdivisions,
                    afterMeasures[measureIndex].subdivisions)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Compares two subdivision lists for structural equality (order and values).
     *
     * @param before The first subdivision list.
     * @param after The second subdivision list.
     *
     * @returns True when both lists describe the same subdivision structure.
     */
    private sameSubdivisions(before: ISubdivision[], after: ISubdivision[]): boolean {
        if (before.length !== after.length) {
            return false;
        }

        for (let index = 0; index < before.length; index++) {
            const left = before[index];
            const right = after[index];

            if (left.startIndex !== right.startIndex || left.actual !== right.actual
                || left.normal !== right.normal || left.isTuplet !== right.isTuplet) {
                return false;
            }
        }

        return true;
    }

    private updateDirtyState() {
        void FaviconDirtyService.setDirty(this.canUndo);
    }
}
