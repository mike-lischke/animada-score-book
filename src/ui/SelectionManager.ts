/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { AppStorage } from "../core/AppStorage.js";
import type { ISbDmNoteEvent, ISbDmTrack } from "../core/ScoreBookDataModel.js";
import { ScoreBookChangeReason } from "../core/ScoreBookDataModel.js";
import type { PlayerPlayState } from "../player/ArrangementPlayer.js";
import { requisitions } from "../supplement/Requisitions.js";
import {
    SelectionGranularity, SelectionMode, type ISelectionEntry, type ISelectionHitTester, type ISelectionPoint,
    type ISelectionRectChange,
} from "./selection-types.js";
import { SelectionView } from "./SelectionView.js";

interface ITrackSelection {
    selectedNotes: Set<ISbDmNoteEvent>;
    range: [ISbDmNoteEvent | undefined, ISbDmNoteEvent | undefined];
}

/**
 * Manages selections across tracks and publishes selection changes.
 *
 * Maintains two parallel data structures during the transition to the new MVC model:
 * - {@link currentTrackSelections} (old): per-track Map used by edit commands and legacy interaction.
 * - {@link currentSelection} (new): granular, model-level entries for the SelectionView and future features
 *   (clipboard, drag-drop, templates).
 */
export class SelectionManager {
    /** Current selections per track, including selected notes and range per track. */
    public readonly currentTrackSelections: Map<ISbDmTrack, ITrackSelection> = new Map<ISbDmTrack, ITrackSelection>();

    /**
     * Granular selection entries keyed by a stable string identifier.
     * Keys follow the pattern `"granularity:bar:trackId[:step/noteId]"`.
     */
    public readonly currentSelection: Map<string, ISelectionEntry> = new Map<string, ISelectionEntry>();

    /** Anchor point for range selections in the new model. */
    public selectionAnchor?: ISelectionPoint;

    /**
     * Granularity priority for disambiguation. Higher number = more specific.
     * When mixed granularities appear in a hit-test result, only the most specific is kept.
     */
    private static readonly granularityRank: Record<SelectionGranularity, number> = {
        [SelectionGranularity.Track]: 1,
        [SelectionGranularity.Measure]: 2,
        [SelectionGranularity.TrackPiece]: 3,
        [SelectionGranularity.NoteGroup]: 4,
        [SelectionGranularity.Note]: 5,
    };

    /** Current selection interaction mode. */
    private currentSelectionMode: SelectionMode = SelectionMode.New;

    private readonly hitTesters = new Set<ISelectionHitTester>();

    /** Hit-test result from the previous rect change, used for differential updates. */
    private previousEntries: ISelectionEntry[] = [];

    /** Saved selection before playback started, for restoration on stop. */
    private originalSelection?: Map<string, ISelectionEntry>;

    /** Debounce timer id for persisting the selection to localStorage. */
    private saveDebounceId?: ReturnType<typeof setTimeout>;

    /**
     * Tracks whether the first scoreBookLoaded event (app startup) has already been processed.
     * On the first load the persisted selection is restored; on subsequent loads (user opens a
     * different song) the selection is cleared.
     */
    private firstLoadDone = false;

    /** Owned view — handles pointer events, rect drawing, and DOM updates. Created lazily when the container is set. */
    private view?: SelectionView;

    private anchor?: ISbDmNoteEvent;
    private lastClickedNote?: ISbDmNoteEvent;
    private lastMouseDownNote?: ISbDmNoteEvent;

    public constructor() {
        requisitions.register("selectionRectChanged", this.handleSelectionRectChanged);
        requisitions.register("playerStateChanged", this.handlePlayerStateChanged);
        requisitions.register("scoreBookLoaded", this.handleScoreBookLoaded);
    }

    public get selectionMode(): SelectionMode {
        return this.currentSelectionMode;
    }

    public set selectionMode(mode: SelectionMode) {
        if (this.currentSelectionMode !== mode) {
            this.currentSelectionMode = mode;

            // TODO: update the selection toolbar UI to reflect the new mode.
        }
    }

    public dispose(): void {
        if (this.view) {
            this.view.dispose();
            this.view = undefined;
        }
    }

    /**
     * Sets the DOM element that hosts selection pointer events.
     * Must be called before any selection interaction can occur.
     *
     * @param container The DOM element to listen for pointer events on.
     */
    public setEventContainer(container: HTMLElement): void {
        if (this.view) {
            this.view.dispose();
        }

        this.view = new SelectionView(this, container);
    }

    public registerHitTester(tester: ISelectionHitTester): void {
        this.hitTesters.add(tester);
    }

    public unregisterHitTester(tester: ISelectionHitTester): void {
        this.hitTesters.delete(tester);
    }

    /**
     * Checks if a note is currently selected.
     *
     * @param note The note to check.
     * @returns True if the note is selected.
     */
    public isSelected(note: ISbDmNoteEvent): boolean {
        if (!this.currentTrackSelections.has(note.track)) {
            return false;
        }

        return this.currentTrackSelections.get(note.track)!.selectedNotes.has(note);
    }

    /**
     * Handles a click on a note, updating selections accordingly.
     * - Clicking the current anchor again (and it is the only selection) will clear the selection.
     * - Clicking selects a contiguous range between the anchor and the clicked note.
     *
     * @param clickedNote The clicked note.
     */
    public handleClick(clickedNote: ISbDmNoteEvent): void {
        // Special case: deselect when clicking the anchor if it's the only note selected.
        // This mirrors the legacy behavior where a second click on the anchor toggles it off.
        if (clickedNote === this.anchor && this.currentTrackSelections.size === 1) {
            const onlySelection = this.currentTrackSelections.get(this.anchor.track);
            const isOnlySelected = onlySelection?.selectedNotes.size === 1
                && onlySelection.selectedNotes.has(clickedNote);
            if (isOnlySelected) {
                this.clearSelection();

                return;
            }
        }

        // Selecting a single note is simpler than a range selection, so when starting from scratch
        // or re-anchoring on the same note we restart the selection using the clicked note.
        if (!this.currentTrackSelections.size || clickedNote === this.anchor) {
            this.restartSelection(clickedNote);

            return;
        }

        this.lastClickedNote = clickedNote;

        // Step 1: rejig selection tracks before anything else.
        this.recalcSelectedTracks(clickedNote);

        if (this.currentTrackSelections.size === 1) {
            const trackSelection = this.currentTrackSelections.get(this.anchor!.track)!;
            const noteIterator = this.anchor!.track.notes;

            this.deselectUntilMatch(trackSelection, noteIterator, (note) => {
                return note === this.anchor || note === clickedNote;
            });
            this.selectUntilMatch(trackSelection, noteIterator, (note) => {
                return note === this.anchor || note === clickedNote;
            });
            this.deselectUntilNoMoreSelected(trackSelection, noteIterator);
        } else {
            const anchorISbDmNoteEvent = document.getElementById(`note-${this.anchor!.id}`);
            const clickedISbDmNoteEvent = document.getElementById(`note-${clickedNote.id}`);
            const { left: anchorLeft, right: anchorRight } = anchorISbDmNoteEvent!.getBoundingClientRect();
            const { left: clickedNoteLeft, right: clickedNoteRight } = clickedISbDmNoteEvent!.getBoundingClientRect();
            const leftBound = anchorLeft < clickedNoteLeft ? anchorLeft : clickedNoteLeft;
            const rightBound = anchorRight > clickedNoteRight ? anchorRight : clickedNoteRight;

            // In this case, we know no track contains both anchor and clickedNote. Some may not include either.
            for (const track of this.currentTrackSelections.keys()) {
                const trackSelection = this.currentTrackSelections.get(track)!;
                const noteIterator = track.notes;
                const [knownNote, knownNoteIsOnLeftEdge, knownNoteIsOnRightEdge] =
                    this.anchor!.track === track
                        ? [this.anchor, anchorLeft === leftBound, anchorRight === rightBound]
                        : clickedNote.track === track
                            ? [clickedNote, clickedNoteLeft === leftBound, clickedNoteRight === rightBound]
                            : [undefined];

                if (knownNote) {
                    const leftEdgeTest = knownNoteIsOnLeftEdge
                        ? (note: ISbDmNoteEvent) => {
                            return note === knownNote;
                        }
                        : this.getAboutHalfCoveredTest(leftBound, rightBound);
                    this.deselectUntilMatch(trackSelection, noteIterator, leftEdgeTest);

                    if (knownNoteIsOnRightEdge) {
                        if (!knownNoteIsOnLeftEdge) {
                            this.selectUntilMatch(trackSelection, noteIterator, (note) => {
                                return note === knownNote;
                            });
                        }
                    } else {
                        this.selectUntilNoMoreMatches(trackSelection, noteIterator,
                            this.getAboutHalfCoveredTest(leftBound, rightBound));
                    }

                    this.deselectUntilNoMoreSelected(trackSelection, noteIterator);
                } else {
                    const inclusionTest = this.getAboutHalfCoveredTest(leftBound, rightBound);

                    this.deselectUntilMatch(trackSelection, noteIterator, inclusionTest);
                    this.selectUntilNoMoreMatches(trackSelection, noteIterator, inclusionTest);
                    this.deselectUntilNoMoreSelected(trackSelection, noteIterator);
                }
            }
        }

        void requisitions.execute("selectionChanged", { added: [], removed: [] });
    }

    /**
     * Records the note where a drag selection begins.
     *
     * @param note The note where the mouse was pressed.
     */
    public handleMouseDown(note: ISbDmNoteEvent): void {
        this.lastMouseDownNote = note;
    }

    /**
     * Handles a drag selection up to the given note, restarting selection if necessary.
     *
     * @param note The note reached by the drag.
     */
    public handleDragSelect(note: ISbDmNoteEvent): void {
        if (this.anchor !== this.lastMouseDownNote) {
            this.restartSelection(this.lastMouseDownNote);
        }

        this.handleClick(note);
    }

    /**
     * Whether any selection exists (old or new model).
     *
     * @returns True if at least one selection entry exists.
     */
    public get hasSelection(): boolean {
        return this.currentTrackSelections.size > 0 || this.currentSelection.size > 0;
    }

    /**
     * Checks if a note is selected in the new model.
     *
     * @param bar The measure number (1-based).
     * @param trackId The track identifier.
     * @param noteId The note event identifier.
     *
     * @returns True if the note is selected.
     */
    public isNoteSelected(bar: number, trackId: number, noteId: number): boolean {
        return this.currentSelection.has(`note:${bar}:${trackId}:${noteId}`);
    }

    /**
     * Checks if a measure is selected in the new model.
     *
     * @param bar The measure number (1-based).
     *
     * @returns True if the measure is selected.
     */
    public isMeasureSelected(bar: number): boolean {
        return this.currentSelection.has(`measure:${bar}`);
    }

    /**
     * Checks if a track is selected in the new model.
     *
     * @param trackId The track identifier.
     *
     * @returns True if the track is selected.
     */
    public isTrackSelected(trackId: number): boolean {
        return this.currentSelection.has(`track:${trackId}`);
    }

    /**
     * Called by the SelectionView when a new drag selection begins, to allow the manager to reset state if needed.
     * The current selection is only cleared if the current selection mode is New.
     *
     * @param selectionMode The selection mode to use for the new selection. If omitted, the current mode is used.
     */
    public beginSelection(selectionMode?: SelectionMode): void {
        this.anchor = undefined;
        this.lastClickedNote = undefined;
        this.previousEntries = [];

        if (selectionMode) {
            this.currentSelectionMode = selectionMode;
        }

        if (this.currentSelectionMode === SelectionMode.New) {
            this.internalClearSelection();
        }
    }

    /**
     * Re-publishes the full current selection state so that newly mounted UI components
     * can apply selection decoration. Called after view mode switches (grid ↔ staff).
     */
    public republishSelection(): void {
        if (this.currentSelection.size > 0) {
            const allEntries = [...this.currentSelection.values()];
            void requisitions.execute("selectionChanged", { added: allEntries, removed: [] });
        }
    }

    /**
     * Called by the SelectionView when a click (pointer down + up without significant movement) ends the interaction.
     * Runs a hit-test at the click position and applies the result using the current {@link selectionMode}.
     *
     * @param clickRect A tiny rect at the click position.
     */
    public endSelection(clickRect: DOMRect): void {
        this.previousEntries = [];

        const entries = this.resolveEntries(clickRect);

        if (entries.length === 0) {
            if (this.currentSelectionMode === SelectionMode.New) {
                this.internalClearSelection();
            }

            return;
        }

        // Reject mixed-granularity additions: Add/Invert only work within the same level.
        if (this.currentSelection.size > 0 && this.currentSelectionMode !== SelectionMode.New) {
            if (this.wouldMixGranularities(entries)) {
                return;
            }
        }

        if (this.currentSelectionMode === SelectionMode.New) {
            this.internalClearSelection();
        }

        this.applySelection(entries);
        this.publishPlayRange();
    }

    /**
     * Selects one or more whole measures, optionally filtered by track.
     *
     * @param barNumbers The measure numbers to select (1-based).
     * @param trackIds Optional track filter; when omitted all tracks in the measure are implied.
     */
    public selectMeasures(barNumbers: number[], trackIds?: number[]): void {
        const entries: ISelectionEntry[] = [];
        for (const bar of barNumbers) {
            if (trackIds) {
                for (const trackId of trackIds) {
                    entries.push({ granularity: SelectionGranularity.Measure, bar, trackId });
                }
            } else {
                entries.push({ granularity: SelectionGranularity.Measure, bar, trackId: 0 });
            }
        }

        this.applySelection(entries);
    }

    /**
     * Selects track-piece entries (track × measure combinations).
     *
     * @param newEntries The entries to add to the selection.
     */
    public selectTrackPieces(newEntries: ISelectionEntry[]): void {
        this.applySelection(newEntries);
    }

    /**
     * Selects note entries.
     *
     * @param newEntries The entries to add to the selection.
     */
    public selectNotes(newEntries: ISelectionEntry[]): void {
        this.applySelection(newEntries);
    }

    /**
     * Selects entire tracks (all measures of each track).
     *
     * @param trackIds The track identifiers to select.
     */
    public selectTracks(trackIds: number[]): void {
        const entries: ISelectionEntry[] = trackIds.map((trackId) => {
            return { granularity: SelectionGranularity.Track, bar: 0, trackId };
        });

        this.applySelection(entries);
    }

    /**
     * Toggles the selection state of the given entries.
     * Entries that are already selected are removed; others are added.
     *
     * @param toggleEntries The entries to toggle.
     */
    public toggleSelection(toggleEntries: ISelectionEntry[]): void {
        const previousMode = this.currentSelectionMode;
        this.currentSelectionMode = SelectionMode.Invert;
        this.applySelection(toggleEntries);
        this.currentSelectionMode = previousMode;
    }

    /**
     * Clears all selection state and publishes a change.
     */
    public clearSelection(): void {
        const wasClear = this.internalClearSelection();
        if (wasClear) {
            this.anchor = undefined;
            this.lastClickedNote = undefined;
        }
    }

    /**
     * Applies a set of selection entries according to the current mode, computes the delta
     * (added/removed), and publishes the change.
     *
     * @param incoming The entries to apply (typically from a hit-test result).
     */
    private applySelection(incoming: ISelectionEntry[]): void {
        const added: ISelectionEntry[] = [];
        const removed: ISelectionEntry[] = [];

        const toggleEntry = (entry: ISelectionEntry): void => {
            const key = this.entryKey(entry);
            if (this.currentSelection.has(key)) {
                this.currentSelection.delete(key);
                removed.push(entry);
            } else {
                this.currentSelection.set(key, entry);
                added.push(entry);
            }
        };

        switch (this.currentSelectionMode) {
            case SelectionMode.New: {
                for (const entry of incoming) {
                    toggleEntry(entry);
                }

                break;
            }

            case SelectionMode.Add: {
                for (const entry of incoming) {
                    const key = this.entryKey(entry);
                    if (!this.currentSelection.has(key)) {
                        this.currentSelection.set(key, entry);
                        added.push(entry);
                    }
                }

                break;
            }

            default: {
                for (const entry of incoming) {
                    toggleEntry(entry);
                }
            }
        }

        if (added.length > 0 || removed.length > 0) {
            void requisitions.execute("selectionChanged", { added, removed });
        }

        this.schedulePersist();
    }

    /**
     * Does the work of clearing selection state and publishing the change, without modifying the anchor or
     * other interaction state.
     *
     * @returns True if there was a selection to clear, false otherwise.
     */
    private internalClearSelection(): boolean {
        const hadSelection = this.currentTrackSelections.size > 0 || this.currentSelection.size > 0;
        if (hadSelection) {
            const removed = [...this.currentSelection.values()];
            this.currentTrackSelections.clear();
            this.currentSelection.clear();
            this.previousEntries = [];
            void requisitions.execute("selectionChanged", { added: [], removed });
            void requisitions.execute("playRangeChanged", undefined);

            this.schedulePersist();

            return true;
        }

        return false;
    }

    /**
     * Builds a stable string key for a selection entry.
     *
     * @param entry The entry to derive a key from.
     *
     * @returns A string key unique to the entry's granularity and position.
     */
    private entryKey(entry: ISelectionEntry): string {
        const { granularity, bar, trackId, startStep, endStep, noteId } = entry;
        switch (granularity) {
            case SelectionGranularity.Track: {
                return `track:${trackId}`;
            }

            case SelectionGranularity.Measure: {
                return `measure:${bar}`;
            }

            case SelectionGranularity.TrackPiece: {
                return `trackPiece:${bar}:${trackId}`;
            }

            case SelectionGranularity.NoteGroup: {
                return `noteGroup:${bar}:${trackId}:${startStep}-${endStep}`;
            }

            case SelectionGranularity.Note: {
                return noteId !== undefined
                    ? `note:${bar}:${trackId}:${noteId}`
                    : `note:${bar}:${trackId}:step${startStep}`;
            }

            default: {
                return "";
            }
        }
    }

    private restartSelection(note?: ISbDmNoteEvent): void {
        this.currentTrackSelections.clear();

        if (note) {
            this.currentTrackSelections.set(note.track, this.createTrackSelection(note));
        }

        this.anchor = note;
        void requisitions.execute("selectionChanged", { added: [], removed: [] });
    }

    private recalcSelectedTracks(clickedNote: ISbDmNoteEvent): void {
        const allTracks = this.anchor!.track.arrangement.tracks;
        const anchorTrackIndex = allTracks.indexOf(this.anchor!.track);
        const clickedTrackIndex = allTracks.indexOf(clickedNote.track);
        const [start, end] = anchorTrackIndex < clickedTrackIndex
            ? [anchorTrackIndex, clickedTrackIndex]
            : [clickedTrackIndex, anchorTrackIndex];

        let index = 0;
        for (; index < start; index++) {
            this.currentTrackSelections.delete(allTracks[index]);
        }
        for (; index <= end; index++) {
            if (!this.currentTrackSelections.has(allTracks[index])) {
                this.currentTrackSelections.set(allTracks[index], this.createTrackSelection());
            }
        }
        for (; index < allTracks.length; index++) {
            this.currentTrackSelections.delete(allTracks[index]);
        }
    }

    private createTrackSelection(note?: ISbDmNoteEvent): ITrackSelection {
        if (note) {
            return {
                selectedNotes: new Set<ISbDmNoteEvent>().add(note),
                range: [note, note]
            };
        }

        return {
            selectedNotes: new Set(),
            range: [undefined, undefined],
        };
    }

    private getAboutHalfCoveredTest(leftBound: number, rightBound: number): ((note: ISbDmNoteEvent) => boolean) {
        const selectionWidth = rightBound - leftBound;

        return (note: ISbDmNoteEvent) => {
            const testElement = document.getElementById(`note-${note.id}`)!;
            const { left, right, width } = testElement.getBoundingClientRect();

            if (right > rightBound) {
                if (left > rightBound) {
                    // This element is to the right of the selection area, with no overlap.
                    return false;
                }
                if (left > leftBound) {
                    // This element covers the right edge of the selection area.
                    return (rightBound - left) / width > 0.4;
                }
                // This element is wider than the selection area, and completely covers it.

                return selectionWidth / width > 0.4;
            } else {
                if (right < leftBound) {
                    // This element is to the left of the selection area, with no overlap.
                    return false;
                }
                if (left < leftBound) {
                    // This element covers the left edge of the selection area.
                    return (right - leftBound) / width > 0.4;
                }
                // This element is completely inside the selection area.

                return true;
            }
        };
    }

    private deselectUntilMatch(trackSelection: ITrackSelection, iterator: IterableIterator<ISbDmNoteEvent>,
        matches: (note: ISbDmNoteEvent) => boolean): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;

            if (matches(note)) {
                trackSelection.range[0] = note;
                // For cases where there's only one selected note in this track.
                trackSelection.range[1] = note;
                trackSelection.selectedNotes.add(note);

                return;
            }

            trackSelection.selectedNotes.delete(note);
        }
    }

    private selectUntilMatch(trackSelection: ITrackSelection, iterator: IterableIterator<ISbDmNoteEvent>,
        matches: (note: ISbDmNoteEvent) => boolean): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;
            trackSelection.selectedNotes.add(note);

            if (matches(note)) {
                trackSelection.range[1] = note;

                return;
            }
        }
    }

    private selectUntilNoMoreMatches(trackSelection: ITrackSelection, iterator: IterableIterator<ISbDmNoteEvent>,
        matches: (note: ISbDmNoteEvent) => boolean): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;

            if (matches(note)) {
                trackSelection.selectedNotes.add(note);
                trackSelection.range[1] = note;
            } else {
                trackSelection.selectedNotes.delete(note);

                return;
            }
        }
    }

    private deselectUntilNoMoreSelected(trackSelection: ITrackSelection,
        iterator: IterableIterator<ISbDmNoteEvent>): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;

            if (trackSelection.selectedNotes.has(note)) {
                trackSelection.selectedNotes.delete(note);
            } else {
                return;
            } // Once we find no more selected notes, we're done.
        }
    }

    /**
     * Filters entries to the most specific granularity present, discarding all others.
     * When any Note entries exist only Notes are kept; otherwise NoteGroups; then TrackPieces; etc.
     *
     * @param entries The raw hit-test results, potentially at mixed granularities.
     * @returns Only the entries at the most specific granularity found.
     */
    private filterToDominantGranularity(entries: ISelectionEntry[]): ISelectionEntry[] {
        let bestRank = 0;
        for (const entry of entries) {
            const rank = SelectionManager.granularityRank[entry.granularity];
            if (rank > bestRank) {
                bestRank = rank;
            }
        }

        if (bestRank === 0) {
            return [];
        }

        return entries.filter((entry) => {
            return SelectionManager.granularityRank[entry.granularity] === bestRank;
        });
    }

    /**
     * Collects and resolves hit-test results for a given rectangle.
     * Track-level entries from TrackControls take priority; otherwise the dominant granularity wins.
     *
     * @param rect The selection rectangle in viewport coordinates.
     *
     * @returns The resolved entries, possibly empty.
     */
    private resolveEntries(rect: DOMRect): ISelectionEntry[] {
        const rawEntries: ISelectionEntry[] = [];
        for (const tester of this.hitTesters) {
            rawEntries.push(...tester.hitTest(rect));
        }

        if (rawEntries.some((e) => {
            return e.granularity === SelectionGranularity.Track;
        })) {
            return rawEntries.filter((e) => {
                return e.granularity === SelectionGranularity.Track;
            });
        }

        return this.filterToDominantGranularity(rawEntries);
    }

    /**
     * Checks whether the given entries would mix granularities with the current selection.
     *
     * @param entries The candidate entries.
     *
     * @returns True if applying the entries would result in mixed granularities.
     */
    private wouldMixGranularities(entries: ISelectionEntry[]): boolean {
        if (entries.length === 0) {
            return false;
        }

        const newGranularity = entries[0].granularity;

        return [...this.currentSelection.values()].some((entry) => {
            return entry.granularity !== newGranularity;
        });
    }

    private handleSelectionRectChanged = (data: ISelectionRectChange): Promise<boolean> => {
        const currentEntries = this.resolveEntries(data.rect);

        // Reject mixed-granularity drag in Add/Invert mode.
        if (currentEntries.length > 0 && this.currentSelection.size > 0
            && this.currentSelectionMode !== SelectionMode.New) {
            if (this.wouldMixGranularities(currentEntries)) {
                this.previousEntries = [];

                return Promise.resolve(true);
            }
        }

        // Generate a list of ids for entries that are currently selected.
        const previousKeys = new Set(this.previousEntries.map((e) => {
            return this.entryKey(e);
        }));

        // Do the same for the current hit-test result.
        const currentKeys = new Set(currentEntries.map((e) => {
            return this.entryKey(e);
        }));

        // Now create lists of entries that need to be toggled.
        const toggleEntries: ISelectionEntry[] = [];

        for (const entry of currentEntries) {
            if (!previousKeys.has(this.entryKey(entry))) {
                toggleEntries.push(entry);
            }
        }

        for (const entry of this.previousEntries) {
            if (!currentKeys.has(this.entryKey(entry))) {
                toggleEntries.push(entry);
            }
        }

        this.previousEntries = currentEntries;
        if (toggleEntries.length > 0) {
            this.applySelection(toggleEntries);

            this.publishPlayRange();
        }

        return Promise.resolve(true);
    };

    private publishPlayRange(): void {
        const bars = new Set<number>();
        for (const entry of this.currentSelection.values()) {
            if (entry.bar > 0) {
                bars.add(entry.bar);
            }
        }

        if (bars.size > 0) {
            const sorted = [...bars].sort((a, b) => {
                return a - b;
            });

            void requisitions.execute("playRangeChanged", {
                from: sorted[0],
                to: sorted[sorted.length - 1],
            });
        } else {
            void requisitions.execute("playRangeChanged", undefined);
        }
    }

    /**
     * Reacts to playback state changes. When playback starts and the current selection is not at measure
     * granularity, the selection is temporarily replaced with the containing measures so the play range
     * is valid. When playback stops, the original fine-grained selection is restored.
     *
     * @param state The new playback state.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
    private handlePlayerStateChanged = (state: PlayerPlayState): Promise<boolean> => {
        if (state === "playing" || state === "counting") {
            this.switchToMeasureSelection();
        } else {
            this.restoreOriginalSelection();
        }

        return Promise.resolve(true);
    };

    /**
     * If the current selection contains entries that are not at measure granularity,
     * saves the original selection and replaces it with measure-level entries for the containing bars.
     * Does nothing if all entries are already at measure granularity.
     */
    private switchToMeasureSelection(): void {
        if (this.currentSelection.size === 0 || this.originalSelection) {
            return;
        }

        const hasNonMeasure = [...this.currentSelection.values()].some((entry) => {
            return entry.granularity !== SelectionGranularity.Measure;
        });
        if (!hasNonMeasure) {
            return;
        }

        // Save the original selection for later restoration.
        this.originalSelection = new Map(this.currentSelection);

        // Collect all distinct bar numbers from the current selection.
        const barSet = new Set<number>();
        for (const entry of this.currentSelection.values()) {
            if (entry.bar > 0) {
                barSet.add(entry.bar);
            }
        }

        const measureEntries: ISelectionEntry[] = [...barSet].map((bar) => {
            return {
                granularity: SelectionGranularity.Measure,
                bar,
                trackId: 0,
            };
        });

        // Replace the selection with measure-level entries.
        const removed = [...this.currentSelection.values()];
        this.currentSelection.clear();
        for (const entry of measureEntries) {
            this.currentSelection.set(this.entryKey(entry), entry);
        }

        void requisitions.execute("selectionChanged", { added: measureEntries, removed });
        this.publishPlayRange();
    }

    /**
     * Restores the original selection that was saved before playback started, then clears the saved state.
     * Does nothing if no original selection was saved.
     */
    private restoreOriginalSelection(): void {
        if (!this.originalSelection) {
            return;
        }

        const saved = this.originalSelection;
        this.originalSelection = undefined;

        const removed = [...this.currentSelection.values()];
        this.currentSelection.clear();
        for (const [key, entry] of saved) {
            this.currentSelection.set(key, entry);
        }

        const added = [...saved.values()];
        void requisitions.execute("selectionChanged", { added, removed });
        this.publishPlayRange();
    }

    /**
     * Schedules a debounced write of the current selection to localStorage.
     * Clears any pending save and sets a new 300 ms timer to avoid excessive writes during rapid
     * selection changes (e.g. drag operations).
     */
    private schedulePersist(): void {
        if (this.saveDebounceId) {
            clearTimeout(this.saveDebounceId);
        }

        this.saveDebounceId = setTimeout(() => {
            this.saveDebounceId = undefined;
            this.persistSelection();
        }, 300);
    }

    /**
     * Serialises the current selection and writes it to localStorage via AppStorage.
     * An empty or cleared selection removes the stored state.
     */
    private persistSelection(): void {
        const entries = [...this.currentSelection.values()];

        const settings = AppStorage.loadUISettings() ?? {};
        const viewSettings = settings.viewSettings ?? {};

        if (entries.length > 0) {
            viewSettings.selectionState = JSON.stringify(entries);
        } else {
            delete viewSettings.selectionState;
        }

        settings.viewSettings = viewSettings;
        AppStorage.saveUISettings(settings);
    }

    /**
     * Restores a previously persisted selection from localStorage, if one exists.
     * Called when the scorebook finishes loading so the arrangement and DOM are ready.
     */
    private restorePersistedSelection(): void {
        const state = AppStorage.loadUISettings()?.viewSettings?.selectionState;
        if (!state) {
            return;
        }

        let entries: ISelectionEntry[];
        try {
            entries = JSON.parse(state) as ISelectionEntry[];
        } catch {
            return;
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            return;
        }

        const removed = [...this.currentSelection.values()];
        this.currentSelection.clear();
        for (const entry of entries) {
            this.currentSelection.set(this.entryKey(entry), entry);
        }

        void requisitions.execute("selectionChanged", { added: entries, removed });
        this.publishPlayRange();
    }

    /**
     * Handles the scoreBookLoaded requisition.
     * On the first call (app startup) the persisted selection is restored from localStorage.
     * On subsequent ScoreLoaded events (user loads a different song) the selection is cleared.
     * Non-structural changes like renames are ignored.
     *
     * @param reason What triggered the event.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
    private handleScoreBookLoaded = (reason: ScoreBookChangeReason): Promise<boolean> => {
        if (reason === ScoreBookChangeReason.EntryRenamed) {
            return Promise.resolve(true);
        }

        // Delay slightly so the arrangement viewer has time to render its DOM before selection overlays
        // are applied.
        setTimeout(() => {
            if (this.firstLoadDone) {
                if (reason === ScoreBookChangeReason.ScoreLoaded) {
                    this.clearSelection();
                }
            } else {
                this.firstLoadDone = true;
                this.restorePersistedSelection();
            }
        }, 100);

        return Promise.resolve(true);
    };
}
