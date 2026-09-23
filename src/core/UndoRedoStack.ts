import { requisitions } from "../supplement/Requisitions.js";
import { getArrangementSnapshot } from "./serialisation/snapshots.js";
import type { IArrangementSnapshot } from "./types/general.js";
import type { ISbDmArrangement } from "./ScoreBookDataModel.js";

export interface IHistoryState {
    arrangementSnapshot: IArrangementSnapshot;

    /** Serialised selection the UI reported for this state, restored with the snapshot. */
    selection?: string;

    timestamp: number;
}

/**
 * Manages undo/redo history for an arrangement.
 *
 * - Stores a timeline of arrangement snapshots as `past` and `future`.
 * - Publishes when `canUndo`/`canRedo` changes for UI controls.
 */
export class UndoRedoStack {
    private past: IHistoryState[];
    private future: IHistoryState[] = [];

    /**
     * Creates a new undo/redo stack bound to an arrangement.
     * Initializes history with the current arrangement snapshot as the present state.
     *
     * @param arrangementView The arrangement to track and snapshot.
     */
    public constructor(private readonly arrangementView: Readonly<ISbDmArrangement>) {
        this.past = [{ arrangementSnapshot: getArrangementSnapshot(arrangementView), timestamp: Date.now() }];
    }

    /**
     * Whether there exists at least one prior history state to revert to.
     *
     * @returns True if undo is possible, otherwise false.
     */
    public get canUndo(): boolean {
        return this.past.length > 1;
    }

    /**
     * Whether there exists at least one future history state to advance to.
     *
     * @returns True if redo is possible, otherwise false.
     */
    public get canRedo(): boolean {
        return this.future.length > 0;
    }

    /**
     * The current arrangement snapshot for applying state (e.g., after undo/redo).
     *
     * @returns The current `IArrangementSnapshot`.
     */
    public get currentState(): IArrangementSnapshot {
        return this.past[this.past.length - 1].arrangementSnapshot;
    }

    /**
     * The selection the state the arrangement stands at was recorded with. It is the selection the
     * state was left in, which is where an undo returns the cursor to.
     *
     * @returns The serialised selection, or undefined for a state without a recorded one.
     */
    public get currentSelection(): string | undefined {
        return this.past[this.past.length - 1].selection;
    }

    /**
     * The selection the state the next redo returns to was recorded with.
     *
     * @returns The serialised selection, or undefined for a state without a recorded one.
     */
    public get futureSelection(): string | undefined {
        return this.future[this.future.length - 1]?.selection;
    }

    /**
     * Records a snapshot of the current arrangement state into history.
     * Clears the `future` stack and publishes availability changes.
     *
     * @param selection The selection state the UI works in, so an undo restores the cursor as well.
     */
    public recordSnapshot(selection?: string): void {
        const hadFuture = this.future.length > 0;
        const wasFirstEdit = this.past.length === 1;

        this.past.push({
            arrangementSnapshot: getArrangementSnapshot(this.arrangementView),
            selection,
            timestamp: Date.now(),
        });

        if (hadFuture) {
            this.future.splice(0);
        }

        if (hadFuture || wasFirstEdit) {
            void requisitions.execute("undoStackChanged", undefined);
        }
    }

    /**
     * Drops all recorded history and restores the baseline snapshot as the current state.
     * The first entry (the state captured when the stack was created) is kept as the present state.
     */
    public reset(): void {
        if (this.past.length === 1 && this.future.length === 0) {
            return;
        }

        this.past = [this.past[0]];
        this.future = [];
        void requisitions.execute("undoStackChanged", undefined);
    }

    /**
     * Moves the current history state into `future` (undo) and publishes availability changes.
     */
    public goBack(): void {
        if (this.past.length < 2) {
            return;
        }

        const wasLastUndo = this.past.length === 2;
        const wasFirstRedo = this.future.length === 0;

        this.future.push(this.past.pop()!);

        if (wasLastUndo || wasFirstRedo) {
            void requisitions.execute("undoStackChanged", undefined);
        }
    }

    /**
     * Moves the next `future` state back into `past` (redo) and publishes availability changes.
     */
    public goForward(): void {
        if (this.future.length === 0) {
            return;
        }

        const wasLastRedo = this.future.length === 1;
        const wasFirstUndo = this.past.length === 1;

        this.past.push(this.future.pop()!);

        if (wasLastRedo || wasFirstUndo) {
            void requisitions.execute("undoStackChanged", undefined);
        }
    }
}
