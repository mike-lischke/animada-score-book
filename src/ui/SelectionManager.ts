/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { AppStorage } from "../core/AppStorage.js";
import { EditEntryMode } from "../core/types/general.js";
import {
    ScoreBookChangeReason, type ISbDmTrackMeasure, type ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { modelEventAt } from "../core/MeasureProjection.js";
import { addFractions, compareFractions, formatFraction } from "../core/serialisation/numeric-functions.js";
import type { IFraction, IMeasureEvent } from "../core/types/general.js";
import type { PlayerPlayState } from "../player/ArrangementPlayer.js";
import { requisitions } from "../supplement/Requisitions.js";
import {
    SelectionGranularity, SelectionMode, SelectionSerializer, type ISelectionEntry,
    type ISelectionHitTester, type ISelectionPoint, type ISelectionRectChange, type ISerialisedSelectionEntry,
} from "./SelectionSerializer.js";
import type { ScoreElementRegistry } from "./ScoreElementRegistry.js";
import { SelectionView } from "./SelectionView.js";

/**
 * Returns the end of a list of measure events, which is the end of its last event.
 *
 * @param events The events to measure.
 *
 * @returns The end of the events' span.
 */
const endOfEvents = (events: IMeasureEvent[]): IFraction => {
    const last = events[events.length - 1];

    return addFractions(last.start, last.duration);
};

/**
 * Manages selections across tracks and publishes selection changes.
 */
export class SelectionManager {
    /**
     * Granular selection entries keyed by a stable string identifier derived from the model objects
     * an entry addresses.
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

    /** Edit mode as last published on `editModeChanged`, used to initialise new selection views. */
    private editMode = false;

    /**
     * Entry mode as last published on `editEntryModeChanged`, used to initialise new selection views. The
     * persisted value is the start value, because the app only announces a mode the user switched to.
     */
    private entryMode = AppStorage.loadUISettings()?.entryMode ?? EditEntryMode.Insert;

    /** Owned view — handles pointer events, rect drawing, and DOM updates. Created lazily when the container is set. */
    private view?: SelectionView;

    public constructor(private readonly dataModel?: ScoreBookDataModel) {
        requisitions.register("selectionRectChanged", this.handleSelectionRectChanged);
        requisitions.register("playerStateChanged", this.handlePlayerStateChanged);
        requisitions.register("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.register("arrangementReverted", this.handleArrangementReverted);
        requisitions.register("editModeChanged", this.handleEditModeChanged);
        requisitions.register("editEntryModeChanged", this.handleEntryModeChanged);
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
        requisitions.unregister("editModeChanged", this.handleEditModeChanged);
        requisitions.unregister("editEntryModeChanged", this.handleEntryModeChanged);

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
     * @param scoreElementRegistry The optional registry of rendered score elements.
     */
    public setEventContainer(container: HTMLElement, scoreElementRegistry?: ScoreElementRegistry): void {
        if (this.view) {
            this.view.dispose();
        }

        this.view = new SelectionView(this, container, scoreElementRegistry, this.editMode, this.entryMode);
    }

    /**
     * Sets the scroll host elements for the selection view.
     * Must be called after {@link setEventContainer}.
     *
     * @param horizontal The horizontally-scrollable container (typically `#trackViewerHost`).
     * @param vertical The vertically-scrollable container.
     */
    public setScrollHosts(horizontal: HTMLElement, vertical: HTMLElement): void {
        this.view?.setScrollHosts(horizontal, vertical);
    }

    public registerHitTester(tester: ISelectionHitTester): void {
        this.hitTesters.add(tester);
    }

    public unregisterHitTester(tester: ISelectionHitTester): void {
        this.hitTesters.delete(tester);
    }

    /**
     * Whether any selection exists.
     *
     * @returns True if at least one selection entry exists.
     */
    public get hasSelection(): boolean {
        return this.currentSelection.size > 0;
    }

    /**
     * Checks whether a grid cell is selected.
     *
     * @param measure The measure the cell belongs to.
     * @param start The exact start of the cell within the measure.
     *
     * @returns True if the cell is selected.
     */
    public isCellSelected(measure: ISbDmTrackMeasure, start: IFraction): boolean {
        return this.currentSelection.has(this.noteKey(measure, measure.track.id, start));
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
     * @param cursorOnly True in insert mode, where a click only places the cursor instead of selecting.
     */
    public endSelection(clickRect: DOMRect, cursorOnly = false): void {
        this.previousEntries = [];

        const rawEntries = this.collectEntries(clickRect);

        // Insert mode draws no selection: a click places the cursor on the addressed note, and a click
        // that addresses a coarser element leaves the cursor where it is.
        if (cursorOnly) {
            const cursor = SelectionManager.cursorEntryOf(rawEntries);
            if (cursor === undefined) {
                return;
            }

            this.replaceSelection([cursor]);
            this.publishPlayRange();

            return;
        }

        const entries = this.resolveRawEntries(rawEntries);

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
            this.replaceSelection(entries);
        } else {
            this.applySelection(entries);
        }

        this.publishPlayRange();
    }

    /**
     * Previews a note at the pointer position before selection is committed.
     *
     * @param clickRect A tiny rect at the pointer position.
     */
    public previewNote(clickRect: DOMRect): void {
        const entries = this.resolveEntries(clickRect);

        const noteIds: number[] = [];
        for (const entry of entries) {
            const { target } = entry;
            if (target.granularity !== SelectionGranularity.Note) {
                continue;
            }

            // Only a note's own start cell previews the note; cells inside its duration and
            // subdivision slots do not address a note event.
            const { measure } = target;
            const cellStart = target.start ?? target.event.start;
            const modelEvent = modelEventAt(measure, cellStart);
            if (modelEvent === undefined || compareFractions(modelEvent.start, cellStart) !== 0) {
                continue;
            }

            const noteEvent = measure.noteEvents.at(measure.events.indexOf(modelEvent));
            if (noteEvent !== undefined) {
                noteIds.push(noteEvent.id);
            }
        }

        if (noteIds.length > 0) {
            void requisitions.execute("notesClicked", noteIds);
        }
    }

    /**
     * Selects one or more whole measures, optionally filtered by track.
     *
     * @param barNumbers The measure numbers to select (1-based).
     * @param trackIds Optional track filter; when omitted all tracks in the measure are implied.
     */
    public selectMeasures(barNumbers: number[], trackIds?: number[]): void {
        const arrangement = this.dataModel?.arrangement;
        if (!arrangement) {
            return;
        }

        const tracks = trackIds === undefined
            ? arrangement.tracks
            : arrangement.tracks.filter((track) => {
                return trackIds.includes(track.id);
            });

        const entries: ISelectionEntry[] = [];
        for (const bar of barNumbers) {
            for (const track of tracks) {
                const measure = track.measures.at(bar - 1);
                if (measure) {
                    entries.push({
                        granularity: SelectionGranularity.Measure,
                        target: { granularity: SelectionGranularity.Measure, measure },
                    });
                }
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
        const arrangement = this.dataModel?.arrangement;

        const entries: ISelectionEntry[] = [];
        for (const trackId of trackIds) {
            const track = arrangement?.tracks.find((candidate) => {
                return candidate.id === trackId;
            });

            if (track) {
                entries.push({
                    granularity: SelectionGranularity.Track,
                    target: { granularity: SelectionGranularity.Track, track },
                });
            }
        }

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
        this.internalClearSelection();
    }

    /**
     * Selects exactly one grid cell, replacing the current selection.
     *
     * @param entry The grid note or rest cell to select.
     */
    public selectSingleNote(entry: ISelectionEntry): void {
        if (entry.granularity !== SelectionGranularity.Note) {
            return;
        }

        const removed = [...this.currentSelection.values()];
        const key = this.entryKey(entry);
        this.currentSelection.clear();
        this.currentSelection.set(key, entry);
        this.previousEntries = [];

        void requisitions.execute("selectionChanged", { added: [entry], removed });
        this.schedulePersist();
    }

    /**
     * Replaces the current selection with the given entries in a single change.
     *
     * @param entries The entries that become the new selection.
     */
    public replaceSelection(entries: ISelectionEntry[]): void {
        const removed = [...this.currentSelection.values()];
        this.currentSelection.clear();
        for (const entry of entries) {
            this.currentSelection.set(this.entryKey(entry), entry);
        }

        this.previousEntries = [];

        void requisitions.execute("selectionChanged", { added: entries, removed });
        this.schedulePersist();
    }

    /**
     * Picks the note the cursor can take from hit-test entries. The cursor addresses one note, so the
     * coarser granularities a hit test offers (track, measure, track piece) are dropped.
     *
     * @param entries The hit-test entries to pick from.
     *
     * @returns The addressed note, or undefined when the entries hold none.
     */
    private static cursorEntryOf(entries: ISelectionEntry[]): ISelectionEntry | undefined {
        return entries.find((entry) => {
            return entry.granularity === SelectionGranularity.Note;
        });
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
                this.addEntry(entry, added, removed);
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
                    if (!this.currentSelection.has(this.entryKey(entry))) {
                        this.addEntry(entry, added, removed);
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
     * Adds an entry that is not selected yet. A note group replaces the selected group it covers or
     * is covered by, so a selection never holds a group together with a nesting one.
     *
     * @param entry The entry to add.
     * @param added Collects the entries that enter the selection.
     * @param removed Collects the entries that leave the selection.
     */
    private addEntry(entry: ISelectionEntry, added: ISelectionEntry[], removed: ISelectionEntry[]): void {
        this.dropNestingGroups(entry, removed);
        this.currentSelection.set(this.entryKey(entry), entry);
        added.push(entry);
    }

    /**
     * Removes the selected note groups that nest with an entry about to be applied. Groups of one
     * track overlap only when one covers the other, and the group a user picks is the group they
     * mean, so picking a group replaces the group it covers or is covered by.
     *
     * @param incoming The entry that is about to be applied.
     * @param removed Collects the entries that leave the selection.
     */
    private dropNestingGroups(incoming: ISelectionEntry, removed: ISelectionEntry[]): void {
        const { target } = incoming;
        if (target.granularity !== SelectionGranularity.NoteGroup) {
            return;
        }

        const incomingStart = target.events[0].start;
        const incomingEnd = endOfEvents(target.events);

        for (const [key, entry] of [...this.currentSelection]) {
            const other = entry.target;
            if (other.granularity !== SelectionGranularity.NoteGroup || other.measure !== target.measure) {
                continue;
            }

            const otherStart = other.events[0].start;
            const otherEnd = endOfEvents(other.events);
            const incomingCovers = compareFractions(incomingStart, otherStart) <= 0
                && compareFractions(otherEnd, incomingEnd) <= 0;
            const otherCovers = compareFractions(otherStart, incomingStart) <= 0
                && compareFractions(incomingEnd, otherEnd) <= 0;

            if (incomingCovers || otherCovers) {
                this.currentSelection.delete(key);
                removed.push(entry);
            }
        }
    }

    /**
     * Does the work of clearing selection state and publishing the change, without modifying the anchor or
     * other interaction state.
     *
     * @returns True if there was a selection to clear, false otherwise.
     */
    private internalClearSelection(): boolean {
        const hadSelection = this.currentSelection.size > 0;
        if (hadSelection) {
            const removed = [...this.currentSelection.values()];
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
        const { target } = entry;

        switch (target.granularity) {
            case SelectionGranularity.Track: {
                return `track:${target.track.id}`;
            }

            case SelectionGranularity.Measure: {
                return `measure:${target.measure.number}`;
            }

            case SelectionGranularity.TrackPiece: {
                return `trackPiece:${target.measure.number}:${target.track.id}`;
            }

            case SelectionGranularity.NoteGroup: {
                // The span identifies the group: groups nest, so two of them can start at the same
                // event and only the end tells them apart.
                const { events } = target;
                const last = events[events.length - 1];

                return `noteGroup:${target.measure.number}:${target.measure.track.id}:`
                    + `${formatFraction(events[0].start)}-${formatFraction(addFractions(last.start, last.duration))}`;
            }

            case SelectionGranularity.Note: {
                return this.noteKey(target.measure, target.measure.track.id,
                    target.start ?? target.event.start);
            }
        }
    }

    /**
     * Builds the key of a grid cell, which is addressed by its measure and exact start.
     *
     * @param measure The measure the cell belongs to.
     * @param trackId The track identity.
     * @param start The exact cell start within the measure.
     *
     * @returns The cell's selection key.
     */
    private noteKey(measure: ISbDmTrackMeasure, trackId: number, start: IFraction): string {
        return `note:${measure.number}:${trackId}:${formatFraction(start)}`;
    }

    /**
     * Filters entries to the most specific granularity present, discarding all others.
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
        return this.resolveRawEntries(this.collectEntries(rect));
    }

    /**
     * Runs every registered hit tester for the given rectangle.
     *
     * @param rect The selection rectangle in viewport coordinates.
     *
     * @returns All entries the hit testers reported.
     */
    private collectEntries(rect: DOMRect): ISelectionEntry[] {
        const rawEntries: ISelectionEntry[] = [];
        for (const tester of this.hitTesters) {
            rawEntries.push(...tester.hitTest(rect));
        }

        return rawEntries;
    }

    /**
     * Resolves raw hit-test entries to the level the selection takes.
     *
     * @param rawEntries The entries the hit testers reported.
     *
     * @returns The resolved entries, possibly empty.
     */
    private resolveRawEntries(rawEntries: ISelectionEntry[]): ISelectionEntry[] {
        const trackEntries = rawEntries.filter((entry) => {
            return entry.granularity === SelectionGranularity.Track;
        });
        if (trackEntries.length > 0) {
            return trackEntries;
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
            const { target } = entry;
            if (target.granularity !== SelectionGranularity.Track) {
                bars.add(target.measure.number);
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

        // Collect the measures of the selected bars.
        const measures = new Map<number, ISbDmTrackMeasure>();
        for (const entry of this.currentSelection.values()) {
            const coordinates = SelectionSerializer.coordinatesOf(entry);
            if (coordinates.bar < 1) {
                continue;
            }

            const measure = this.measureOfBar(coordinates.bar);
            if (measure !== undefined) {
                measures.set(coordinates.bar, measure);
            }
        }

        const measureEntries: ISelectionEntry[] = [...measures.values()].map((measure) => {
            return {
                granularity: SelectionGranularity.Measure,
                bar: measure.number,
                trackId: measure.track.id,
                target: { granularity: SelectionGranularity.Measure, measure },
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
     * Returns one of the bar's measures, which represents the bar for a measure-level selection.
     *
     * @param bar The one-based measure number.
     *
     * @returns A measure of that bar, or undefined when no track has it.
     */
    private measureOfBar(bar: number): ISbDmTrackMeasure | undefined {
        for (const track of this.dataModel?.arrangement?.tracks ?? []) {
            const measure = track.measures.at(bar - 1);
            if (measure) {
                return measure;
            }
        }

        return undefined;
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
     * The current selection in the form the history stores it.
     *
     * @returns The serialised selection, or undefined when nothing is selected.
     */
    public get serialisedSelection(): string | undefined {
        const entries = [...this.currentSelection.values()];

        return entries.length === 0 ? undefined : JSON.stringify(SelectionSerializer.serialise(entries));
    }

    /**
     * Serialises the current selection and writes it to localStorage via AppStorage.
     * An empty or cleared selection removes the stored state.
     */
    private persistSelection(): void {
        const state = this.serialisedSelection;

        const settings = AppStorage.loadUISettings() ?? {};
        const viewSettings = settings.viewSettings ?? {};

        if (state === undefined) {
            delete viewSettings.selectionState;
        } else {
            viewSettings.selectionState = state;
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
        if (state !== undefined) {
            this.applySerialisedSelection(state);
        }
    }

    /**
     * Resolves a serialised selection against the current arrangement and applies it whole, so the
     * cursor lands where the selection was made. Entries whose element no longer exists are dropped.
     *
     * @param state The serialised selection state.
     */
    private applySerialisedSelection(state: string): void {
        const arrangement = this.dataModel?.arrangement;
        if (!arrangement) {
            return;
        }

        let stored: ISerialisedSelectionEntry[];
        try {
            stored = JSON.parse(state) as ISerialisedSelectionEntry[];
        } catch {
            return;
        }

        if (!Array.isArray(stored) || stored.length === 0) {
            return;
        }

        this.replaceSelection(SelectionSerializer.deserialise(arrangement, stored));
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

    /**
     * Remembers the edit mode published by the app. A selection view is created when the arrangement
     * viewer mounts, which can happen after this requisition was sent, so the new view would start
     * without a delete button unless it is told the current state.
     *
     * @param enabled Whether edit mode is active.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
    private handleEditModeChanged = (enabled: boolean): Promise<boolean> => {
        this.editMode = enabled;

        return Promise.resolve(true);
    };

    /**
     * Remembers the entry mode for newly created selection views.
     *
     * @param mode The entry mode announced by the app.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
    private handleEntryModeChanged = (mode: EditEntryMode): Promise<boolean> => {
        this.entryMode = mode;

        return Promise.resolve(true);
    };

    /**
     * Reacts to an undo/redo by re-resolving the selection against the current arrangement and
     * restoring the cursor the restored state was last edited in.
     *
     * @param selectionState The serialised selection of the restored history state, if it has one.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
    private handleArrangementReverted = (selectionState?: string): Promise<boolean> => {
        this.reResolveSelection();

        if (selectionState !== undefined) {
            this.applySerialisedSelection(selectionState);
        }

        return Promise.resolve(true);
    };

    /**
     * Re-resolves the selection against the current arrangement. An undo/redo replaces the model
     * objects, so the entries are serialised to their coordinates and resolved back; entries whose
     * element no longer exists are dropped. Publishes a change only when the selection differs.
     */
    private reResolveSelection(): void {
        const arrangement = this.dataModel?.arrangement;
        if (!arrangement) {
            this.internalClearSelection();

            return;
        }

        const previous = [...this.currentSelection.values()];
        const resolved = SelectionSerializer.deserialise(arrangement, SelectionSerializer.serialise(previous));

        const previousKeys = new Set(previous.map((entry) => {
            return this.entryKey(entry);
        }));
        const resolvedKeys = new Set(resolved.map((entry) => {
            return this.entryKey(entry);
        }));

        const added = resolved.filter((entry) => {
            return !previousKeys.has(this.entryKey(entry));
        });
        const removed = previous.filter((entry) => {
            return !resolvedKeys.has(this.entryKey(entry));
        });

        this.currentSelection.clear();
        for (const entry of resolved) {
            this.currentSelection.set(this.entryKey(entry), entry);
        }

        if (added.length > 0 || removed.length > 0) {
            void requisitions.execute("selectionChanged", { added, removed });
            this.publishPlayRange();
            this.schedulePersist();
        }
    }
}
