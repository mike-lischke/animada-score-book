import { FaviconDirtyService } from "./FavIconDirtyService.js";
import type { ScoreBookDataModel } from "./ScoreBookDataModel.js";
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
     */
    public undo = (): void => {
        if (!this.undoRedoStack.canUndo) {
            return;
        }

        this.undoRedoStack.goBack();
        this.dataModel.arrangement!.applyArrangementSnapshot(this.undoRedoStack.currentState,
            this.dataModel.instruments);
        this.updateDirtyState();
        this.dataModel.persistCurrentScore();
    };

    /**
     * Reapplies the next change if possible and publishes a current-state change.
     */
    public redo = (): void => {
        if (!this.undoRedoStack.canRedo) {
            return;
        }

        this.undoRedoStack.goForward();
        this.dataModel.arrangement!.applyArrangementSnapshot(this.undoRedoStack.currentState,
            this.dataModel.instruments);
        this.updateDirtyState();
        this.dataModel.persistCurrentScore();
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

    private updateDirtyState() {
        void FaviconDirtyService.setDirty(this.canUndo);
    }
}
