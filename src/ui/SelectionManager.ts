/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { AppStorage } from "../core/AppStorage.js";
import { EditEntryMode } from "../core/types/general.js";
import {
    ScoreBookChangeReason, type ISbDmTrackPiece, type ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { modelEventAt } from "../core/MeasureProjection.js";
import { addFractions, compareFractions, formatFraction } from "../core/serialisation/numeric-functions.js";
import type { IFraction, IMeasureEvent } from "../core/types/general.js";
import { PlayerPlayState } from "../player/ArrangementPlayer.js";
import { requisitions } from "../supplement/Requisitions.js";
import {
    SelectionGranularity, SelectionMode, SelectionSerializer, type ISelectionEntry,
    type ISelectionHitEntry, type ISelectionHitTester, type ISelectionPoint, type ISelectionRectChange,
    type ISerialisedSelectionEntry, type ISerialisedSelectionState,
} from "./SelectionSerializer.js";
import type { ScoreElementRegistry } from "./ScoreElementRegistry.js";
import { SelectionView } from "./SelectionView.js";

interface ISelectionCoordinate {
    bar: number;
    position: IFraction;
}

interface ISelectionBounds {
    granularity: SelectionGranularity;
    left: ISelectionCoordinate;
    right: ISelectionCoordinate;
    topTrackIndex: number;
    bottomTrackIndex: number;
}

const measureStart: IFraction = { numerator: 0, denominator: 1 };
const measureEnd: IFraction = { numerator: 1, denominator: 1 };

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

    private selectionGestureActive = false;
    private selectionGestureBase: ISelectionEntry[] = [];

    /** Saved selection before playback started, for restoration on stop. */
    private originalSelection?: Map<string, ISelectionEntry>;

    /** Debounce timer id for persisting the selection to localStorage. */
    private saveDebounceId?: ReturnType<typeof setTimeout>;

    /** Pending score-load callbacks that restore selection after the viewer renders. */
    private readonly scoreBookLoadedTimers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * Tracks whether the first scoreBookLoaded event (app startup) has already been processed.
     * On the first load the persisted selection is restored; on subsequent loads (user opens a
     * different song) the selection is cleared.
     */
    private firstLoadDone = false;

    /** Edit mode as last published on `editModeChanged`, used to initialise new selection views. */
    private editMode = false;
    private zenMode = false;
    private selectionBeforeZen?: ISelectionEntry[];
    private anchorBeforeZen?: ISelectionPoint;

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
        requisitions.register("zenModeChanged", this.handleZenModeChanged);
        requisitions.register("zenMeasureToggled", this.handleZenMeasureToggled);
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
        requisitions.unregister("selectionRectChanged", this.handleSelectionRectChanged);
        requisitions.unregister("playerStateChanged", this.handlePlayerStateChanged);
        requisitions.unregister("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
        requisitions.unregister("editModeChanged", this.handleEditModeChanged);
        requisitions.unregister("zenModeChanged", this.handleZenModeChanged);
        requisitions.unregister("zenMeasureToggled", this.handleZenMeasureToggled);
        requisitions.unregister("editEntryModeChanged", this.handleEntryModeChanged);

        if (this.saveDebounceId !== undefined) {
            clearTimeout(this.saveDebounceId);
            this.saveDebounceId = undefined;
        }

        for (const timerId of this.scoreBookLoadedTimers) {
            clearTimeout(timerId);
        }

        this.scoreBookLoadedTimers.clear();

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

        this.view = new SelectionView(this, container, scoreElementRegistry, this.editMode, this.entryMode,
            this.zenMode);
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
    public isCellSelected(measure: ISbDmTrackPiece, start: IFraction): boolean {
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
     * Begins a pointer selection, clears the old selection if needed, and defers the first hit's delta.
     *
     * @param selectionMode The selection mode to use, or the current mode when omitted.
     * @param initialRect The pointer-down hit area, when selection is enabled.
     */
    public beginSelection(selectionMode?: SelectionMode, initialRect?: DOMRect): void {
        if (this.selectionGestureActive) {
            this.finishSelection();
        }

        if (selectionMode !== undefined) {
            this.currentSelectionMode = selectionMode;
        }

        if (this.currentSelectionMode === SelectionMode.Add && this.currentSelection.size > 0) {
            this.selectionGestureBase = [...this.currentSelection.values()];
            this.selectionAnchor ??= this.anchorOf(this.selectionGestureBase[0]);
        } else {
            this.currentSelectionMode = SelectionMode.New;
            this.internalClearSelection();
            this.selectionAnchor = undefined;
            this.selectionGestureBase = [];
        }

        this.selectionGestureActive = true;

        if (initialRect === undefined) {
            return;
        }

        const rawEntries = this.collectEntries(initialRect);
        let entries: ISelectionEntry[];
        if (this.currentSelectionMode === SelectionMode.Add && this.selectionAnchor !== undefined) {
            const possibleEntries = this.gestureEntriesForGranularity(rawEntries, this.selectionAnchor.granularity);
            entries = SelectionManager.closestToClick(initialRect, possibleEntries);
        } else {
            entries = SelectionManager.closestToClick(initialRect, this.resolveRawEntries(rawEntries));
            if (entries.length > 0) {
                this.selectionAnchor = this.anchorOf(entries[0]);
                this.selectionGestureBase = [entries[0]];
            }
        }

        if (entries.length === 0) {
            return;
        }

        if (this.applySelection(entries)) {
            this.publishPlayRange();
        }
    }

    public finishSelection(): void {
        if (!this.selectionGestureActive) {
            return;
        }

        this.selectionGestureActive = false;
        this.selectionGestureBase = [];
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
     * Finishes a pointer selection or resolves a cursor-only click.
     *
     * @param clickRect A tiny rect at the click position.
     * @param cursorOnly True in insert mode, where a click only places the cursor instead of selecting.
     */
    public endSelection(clickRect: DOMRect, cursorOnly = false): void {
        if (this.selectionGestureActive) {
            this.finishSelection();

            return;
        }

        const rawEntries = this.collectEntries(clickRect);

        // Insert mode draws no selection: a click places the cursor on the addressed note, and a click
        // that addresses a coarser element leaves the cursor where it is.
        if (cursorOnly) {
            const cursor = SelectionManager.cursorEntryOf(rawEntries);
            if (cursor === undefined) {
                return;
            }

            this.replaceSelection([SelectionManager.withoutHitRect(cursor)]);
            this.publishPlayRange();

            return;
        }

        let entries: ISelectionEntry[];
        if (this.currentSelectionMode === SelectionMode.Add && this.selectionAnchor !== undefined) {
            const possibleEntries = this.gestureEntriesForGranularity(rawEntries, this.selectionAnchor.granularity);
            entries = SelectionManager.closestToClick(clickRect, possibleEntries);
        } else {
            entries = SelectionManager.closestToClick(clickRect, this.resolveRawEntries(rawEntries));
        }

        if (entries.length === 0) {
            if (this.currentSelectionMode === SelectionMode.New) {
                this.internalClearSelection();
                this.selectionAnchor = undefined;
            }

            return;
        }

        if (this.currentSelectionMode === SelectionMode.New) {
            this.selectionAnchor = this.anchorOf(entries[0]);
        }

        if (this.applySelection(entries)) {
            this.publishPlayRange();
        }
    }

    /**
     * Previews a note at the pointer position before selection is committed.
     *
     * @param clickRect A tiny rect at the pointer position.
     */
    public previewNote(clickRect: DOMRect): void {
        const entries = SelectionManager.closestToClick(clickRect, this.resolveEntries(clickRect));

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
        if (toggleEntries.length === 0) {
            return;
        }

        const allEntriesSelected = toggleEntries.every((entry) => {
            return this.currentSelection.has(this.entryKey(entry));
        });
        if (allEntriesSelected) {
            this.clearSelection();

            return;
        }

        const previousMode = this.currentSelectionMode;
        this.currentSelectionMode = SelectionMode.Add;
        this.selectionGestureBase = [...this.currentSelection.values()];
        const baseAnchor = this.selectionGestureBase.at(0);
        this.selectionAnchor ??= baseAnchor === undefined
            ? this.anchorOf(toggleEntries[0])
            : this.anchorOf(baseAnchor);
        this.applySelection(toggleEntries);
        this.selectionGestureBase = [];
        this.currentSelectionMode = previousMode;
    }

    /**
     * Clears all selection state and publishes a change.
     */
    public clearSelection(): void {
        this.internalClearSelection();
        this.selectionAnchor = undefined;
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

        this.replaceSelection([entry]);
    }

    /**
     * Replaces the current selection with the given entries in a single change.
     *
     * @param entries The entries that become the new selection.
     */
    public replaceSelection(entries: ISelectionEntry[]): void {
        const removed = [...this.currentSelection.values()];
        if (entries.length === 0) {
            this.currentSelection.clear();
            this.selectionAnchor = undefined;
            void requisitions.execute("selectionChanged", { added: [], removed });
            this.schedulePersist();

            return;
        }

        this.selectionAnchor = this.anchorOf(entries[0]);
        const bounds = this.selectionBoundsOf(entries, this.selectionAnchor.granularity);
        const normalized = bounds === undefined
            ? this.entriesWithoutArrangement(entries, this.selectionAnchor.granularity)
            : this.entriesInBounds(bounds);

        this.currentSelection.clear();
        for (const entry of normalized) {
            this.currentSelection.set(this.entryKey(entry), entry);
        }

        void requisitions.execute("selectionChanged", { added: normalized, removed });
        this.schedulePersist();
    }

    /**
     * Picks the one entry a click addresses. A click touches a single element, so when it touches several the
     * entry closest to the click's centre wins; an equally close one wins when it comes later, which is the
     * element later in the DOM.
     *
     * @param rect The click rectangle in viewport coordinates.
     * @param entries The entries the click touched.
     *
     * @returns The one entry the click addresses, or the entries when it touched at most one.
     */
    private static closestToClick(rect: DOMRect, entries: ISelectionHitEntry[]): ISelectionEntry[] {
        if (entries.length <= 1) {
            return entries.map((entry) => {
                return SelectionManager.withoutHitRect(entry);
            });
        }

        const x = rect.left + (rect.width / 2);
        const y = rect.top + (rect.height / 2);

        let closest = entries[0];
        let closestDistance = Number.POSITIVE_INFINITY;

        for (const entry of entries) {
            const distance = SelectionManager.distanceToEntry(x, y, entry);

            // `<=` lets a later entry replace an equally close one, so a tie keeps the element later in the DOM.
            if (distance <= closestDistance) {
                closest = entry;
                closestDistance = distance;
            }
        }

        return [SelectionManager.withoutHitRect(closest)];
    }

    /**
     * @param x The X coordinate to measure from.
     * @param y The Y coordinate to measure from.
     * @param entry The entry to measure to.
     *
     * @returns The distance to the entry's element, 0 when the point lies on it.
     */
    private static distanceToEntry(x: number, y: number, entry: ISelectionHitEntry): number {
        const { rect } = entry;
        const dx = Math.max(rect.left - x, 0, x - rect.right);
        const dy = Math.max(rect.top - y, 0, y - rect.bottom);

        return Math.hypot(dx, dy);
    }

    private static mergeBounds(first: ISelectionBounds, second: ISelectionBounds): ISelectionBounds {
        const left = SelectionManager.compareCoordinates(first.left, second.left) <= 0
            ? first.left
            : second.left;
        const right = SelectionManager.compareCoordinates(first.right, second.right) >= 0
            ? first.right
            : second.right;

        return {
            granularity: first.granularity,
            left,
            right,
            topTrackIndex: Math.min(first.topTrackIndex, second.topTrackIndex),
            bottomTrackIndex: Math.max(first.bottomTrackIndex, second.bottomTrackIndex),
        };
    }

    private static entriesEqual(first: ISelectionEntry, second: ISelectionEntry): boolean {
        const firstCoordinates = SelectionSerializer.coordinatesOf(first);
        const secondCoordinates = SelectionSerializer.coordinatesOf(second);
        const startsEqual = firstCoordinates.start === undefined || secondCoordinates.start === undefined
            ? firstCoordinates.start === secondCoordinates.start
            : compareFractions(firstCoordinates.start, secondCoordinates.start) === 0;
        const endsEqual = firstCoordinates.end === undefined || secondCoordinates.end === undefined
            ? firstCoordinates.end === secondCoordinates.end
            : compareFractions(firstCoordinates.end, secondCoordinates.end) === 0;

        return first.granularity === second.granularity && firstCoordinates.bar === secondCoordinates.bar
            && firstCoordinates.trackId === secondCoordinates.trackId && startsEqual && endsEqual;
    }

    private static compareCoordinates(first: ISelectionCoordinate, second: ISelectionCoordinate): number {
        return first.bar === second.bar
            ? compareFractions(first.position, second.position)
            : first.bar - second.bar;
    }

    /**
     * @param entry A hit-test entry.
     *
     * @returns The entry without the rect of the element it was hit at, which a stored selection does not carry.
     */
    private static withoutHitRect(entry: ISelectionEntry): ISelectionEntry {
        return { granularity: entry.granularity, target: entry.target };
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
     * Checks whether one granularity addresses a coarser level than another. A note and a note group share their
     * level: both address the events of one track.
     *
     * @param candidate The granularity to test.
     * @param selected The granularity it is compared against.
     *
     * @returns True when the candidate addresses the coarser level.
     */
    private static isCoarserGranularity(candidate: SelectionGranularity,
        selected: SelectionGranularity): boolean {
        const level = (granularity: SelectionGranularity): number => {
            return granularity === SelectionGranularity.Note
                ? SelectionManager.granularityRank[SelectionGranularity.NoteGroup]
                : SelectionManager.granularityRank[granularity];
        };

        return level(candidate) < level(selected);
    }

    /**
     * Applies a set of selection entries according to the current mode, computes the delta
     * (added/removed), and publishes the change.
     *
     * @param incoming The entries to apply (typically from a hit-test result).
     *
     * @returns Whether the current selection changed.
     */
    private applySelection(incoming: ISelectionEntry[]): boolean {
        const baseEntries = this.selectionGestureBase.length > 0
            ? this.selectionGestureBase
            : this.currentSelectionMode === SelectionMode.Add
                ? [...this.currentSelection.values()]
                : [];
        if (this.currentSelectionMode === SelectionMode.New && !this.selectionGestureActive && incoming.length > 0) {
            this.selectionAnchor = this.anchorOf(incoming[0]);
        }

        let granularity: SelectionGranularity | undefined;
        if (this.currentSelectionMode === SelectionMode.Add) {
            granularity = this.selectionAnchor?.granularity
                ?? baseEntries.at(0)?.granularity
                ?? incoming.at(0)?.granularity;
        } else if (this.selectionGestureActive) {
            granularity = this.selectionAnchor?.granularity ?? incoming.at(0)?.granularity;
        } else {
            granularity = incoming.at(0)?.granularity ?? this.selectionAnchor?.granularity;
        }

        if (granularity === undefined) {
            return this.setCurrentSelection([]);
        }

        if (this.currentSelectionMode === SelectionMode.New && this.selectionAnchor === undefined
            && incoming.length > 0) {
            this.selectionAnchor = this.anchorOf(incoming[0]);
        }

        const bounds = this.selectionBoundsOf([...baseEntries, ...incoming], granularity);
        const entries = bounds === undefined
            ? this.entriesWithoutArrangement([...baseEntries, ...incoming], granularity)
            : this.entriesInBounds(bounds);

        return this.setCurrentSelection(entries);
    }

    private gestureEntriesForGranularity(
        entries: ISelectionHitEntry[],
        granularity: SelectionGranularity,
    ): ISelectionHitEntry[] {
        if (granularity === SelectionGranularity.Track) {
            return entries.filter((entry) => {
                return entry.granularity === SelectionGranularity.Track
                    || entry.granularity === SelectionGranularity.TrackPiece;
            });
        }

        if (granularity === SelectionGranularity.Note || granularity === SelectionGranularity.NoteGroup) {
            return entries.filter((entry) => {
                return entry.granularity === SelectionGranularity.Note
                    || entry.granularity === SelectionGranularity.NoteGroup;
            });
        }

        return entries.filter((entry) => {
            return entry.granularity === granularity;
        });
    }

    private selectionBoundsOf(
        entries: ISelectionEntry[],
        granularity: SelectionGranularity,
    ): ISelectionBounds | undefined {
        const arrangement = this.dataModel?.arrangement;
        if (arrangement === undefined || arrangement.tracks.length === 0) {
            return undefined;
        }

        const barCount = arrangement.tracks.reduce((maximum, track) => {
            return Math.max(maximum, track.measures.length);
        }, 0);
        const trackIndexes = new Map<number, number>();
        arrangement.tracks.forEach((track, trackIndex) => {
            trackIndexes.set(track.id, trackIndex);
        });

        let bounds: ISelectionBounds | undefined;
        let topTrackIndex = arrangement.tracks.length;
        let bottomTrackIndex = -1;

        for (const entry of entries) {
            // A measure entry stands in for the whole bar, so it covers every track of it — the single measure it
            // holds just happens to be the first track's. It therefore states the bounds only for a bar selection,
            // and an entry coarser than the one being materialized states none at all: both address more than the
            // range holds, which would drag its start towards the whole track, bar or score.
            const statesBounds = entry.granularity === SelectionGranularity.Measure
                ? granularity === SelectionGranularity.Measure
                : !SelectionManager.isCoarserGranularity(entry.granularity, granularity);
            if (!statesBounds) {
                continue;
            }

            const trackId = SelectionSerializer.trackOf(entry).id;
            const entryTrackIndex = trackIndexes.get(trackId);
            if (entryTrackIndex !== undefined) {
                topTrackIndex = Math.min(topTrackIndex, entryTrackIndex);
                bottomTrackIndex = Math.max(bottomTrackIndex, entryTrackIndex);
            }

            const next = this.boundsOfEntry(entry, granularity, trackIndexes, barCount,
                arrangement.tracks.length);
            if (next === undefined) {
                continue;
            }

            if (bounds === undefined) {
                bounds = next;
                continue;
            }

            bounds = SelectionManager.mergeBounds(bounds, next);
        }

        if (bounds !== undefined && granularity !== SelectionGranularity.Measure
            && bottomTrackIndex >= 0) {
            bounds.topTrackIndex = topTrackIndex;
            bounds.bottomTrackIndex = bottomTrackIndex;
        }

        return bounds;
    }

    private boundsOfEntry(
        entry: ISelectionEntry,
        granularity: SelectionGranularity,
        trackIndexes: Map<number, number>,
        barCount: number,
        trackCount: number,
    ): ISelectionBounds | undefined {
        const coordinates = SelectionSerializer.coordinatesOf(entry);
        const trackIndex = trackIndexes.get(coordinates.trackId);
        if (trackIndex === undefined) {
            return undefined;
        }

        if (granularity === SelectionGranularity.Track) {
            return {
                granularity,
                left: { bar: 1, position: measureStart },
                right: { bar: barCount, position: measureEnd },
                topTrackIndex: trackIndex,
                bottomTrackIndex: trackIndex,
            };
        }

        if (granularity === SelectionGranularity.Measure) {
            if (coordinates.bar < 1) {
                return undefined;
            }

            return {
                granularity,
                left: { bar: coordinates.bar, position: measureStart },
                right: { bar: coordinates.bar, position: measureEnd },
                topTrackIndex: 0,
                bottomTrackIndex: trackCount - 1,
            };
        }

        if (granularity === SelectionGranularity.TrackPiece) {
            if (coordinates.bar < 1) {
                return undefined;
            }

            return {
                granularity,
                left: { bar: coordinates.bar, position: measureStart },
                right: { bar: coordinates.bar, position: measureEnd },
                topTrackIndex: trackIndex,
                bottomTrackIndex: trackIndex,
            };
        }

        if (coordinates.bar < 1 || coordinates.start === undefined || coordinates.end === undefined) {
            return undefined;
        }

        return {
            granularity,
            left: { bar: coordinates.bar, position: coordinates.start },
            right: { bar: coordinates.bar, position: coordinates.end },
            topTrackIndex: trackIndex,
            bottomTrackIndex: trackIndex,
        };
    }

    private entriesInBounds(bounds: ISelectionBounds): ISelectionEntry[] {
        const arrangement = this.dataModel?.arrangement;
        if (arrangement === undefined) {
            return [];
        }

        const tracks = arrangement.tracks.slice(bounds.topTrackIndex, bounds.bottomTrackIndex + 1);
        const entries: ISelectionEntry[] = [];

        if (bounds.granularity === SelectionGranularity.Track) {
            for (const track of tracks) {
                entries.push({
                    granularity: SelectionGranularity.Track,
                    target: { granularity: SelectionGranularity.Track, track },
                });
            }

            return entries;
        }

        for (let bar = bounds.left.bar; bar <= bounds.right.bar; bar++) {
            if (bounds.granularity === SelectionGranularity.Measure) {
                const measure = SelectionSerializer.measureOfBar(arrangement, bar);
                if (measure !== undefined) {
                    entries.push({
                        granularity: SelectionGranularity.Measure,
                        target: { granularity: SelectionGranularity.Measure, measure },
                    });
                }

                continue;
            }

            for (const track of tracks) {
                const measure = track.measures.at(bar - 1);
                if (measure === undefined) {
                    continue;
                }

                if (bounds.granularity === SelectionGranularity.TrackPiece) {
                    entries.push({
                        granularity: SelectionGranularity.TrackPiece,
                        target: { granularity: SelectionGranularity.TrackPiece, track, measure },
                    });
                    continue;
                }

                const start = bar === bounds.left.bar ? bounds.left.position : measureStart;
                const end = bar === bounds.right.bar ? bounds.right.position : measureEnd;
                const coveredEvents: IMeasureEvent[] = [];

                for (const event of measure.events) {
                    const eventEnd = addFractions(event.start, event.duration);
                    const selectedStart = compareFractions(event.start, start) > 0 ? event.start : start;
                    const selectedEnd = compareFractions(eventEnd, end) < 0 ? eventEnd : end;
                    if (compareFractions(selectedStart, selectedEnd) >= 0) {
                        continue;
                    }

                    coveredEvents.push(event);
                    if (bounds.granularity === SelectionGranularity.Note) {
                        entries.push({
                            granularity: SelectionGranularity.Note,
                            target: {
                                granularity: SelectionGranularity.Note, measure, event,
                                start: selectedStart, end: selectedEnd
                            },
                        });
                    }
                }

                if (bounds.granularity === SelectionGranularity.NoteGroup && coveredEvents.length > 0) {
                    entries.push({
                        granularity: SelectionGranularity.NoteGroup,
                        target: { granularity: SelectionGranularity.NoteGroup, measure, events: coveredEvents },
                    });
                }
            }
        }

        return entries;
    }

    private entriesWithoutArrangement(
        entries: ISelectionEntry[],
        granularity: SelectionGranularity,
    ): ISelectionEntry[] {
        if (granularity !== SelectionGranularity.NoteGroup) {
            return entries;
        }

        const entriesByMeasure = new Map<ISbDmTrackPiece, ISelectionEntry[]>();
        for (const entry of entries) {
            if (entry.target.granularity !== SelectionGranularity.NoteGroup
                && entry.target.granularity !== SelectionGranularity.Note) {
                continue;
            }

            const measure = entry.target.measure;
            let measureEntries = entriesByMeasure.get(measure);
            if (measureEntries === undefined) {
                measureEntries = [];
                entriesByMeasure.set(measure, measureEntries);
            }

            measureEntries.push(entry);
        }

        const normalized: ISelectionEntry[] = [];
        for (const [measure, measureEntries] of entriesByMeasure) {
            let start: IFraction | undefined;
            let end: IFraction | undefined;
            for (const entry of measureEntries) {
                const coordinates = SelectionSerializer.coordinatesOf(entry);
                if (coordinates.start !== undefined
                    && (start === undefined || compareFractions(coordinates.start, start) < 0)) {
                    start = coordinates.start;
                }

                if (coordinates.end !== undefined
                    && (end === undefined || compareFractions(coordinates.end, end) > 0)) {
                    end = coordinates.end;
                }
            }

            if (start === undefined || end === undefined) {
                continue;
            }

            const events = measure.events.filter((event) => {
                const eventEnd = addFractions(event.start, event.duration);

                return compareFractions(event.start, end) < 0 && compareFractions(eventEnd, start) > 0;
            });
            if (events.length > 0) {
                normalized.push({
                    granularity: SelectionGranularity.NoteGroup,
                    target: { granularity: SelectionGranularity.NoteGroup, measure, events },
                });
            }
        }

        return normalized.length > 0 ? normalized : entries;
    }

    private anchorOf(entry: ISelectionEntry): ISelectionPoint {
        const coordinates = SelectionSerializer.coordinatesOf(entry);

        return {
            granularity: entry.granularity,
            bar: coordinates.bar,
            trackId: coordinates.trackId,
            ...(coordinates.start === undefined ? {} : { position: coordinates.start }),
        };
    }

    private setCurrentSelection(entries: ISelectionEntry[]): boolean {
        const nextSelection = new Map<string, ISelectionEntry>();
        for (const entry of entries) {
            nextSelection.set(this.entryKey(entry), entry);
        }

        const added: ISelectionEntry[] = [];
        const removed: ISelectionEntry[] = [];
        for (const [key, entry] of nextSelection) {
            const previous = this.currentSelection.get(key);
            if (previous === undefined) {
                added.push(entry);
            } else if (!SelectionManager.entriesEqual(previous, entry)) {
                added.push(entry);
                removed.push(previous);
            }
        }

        for (const [key, entry] of this.currentSelection) {
            if (!nextSelection.has(key)) {
                removed.push(entry);
            }
        }

        this.currentSelection.clear();
        for (const [key, entry] of nextSelection) {
            this.currentSelection.set(key, entry);
        }

        const changed = added.length > 0 || removed.length > 0;
        if (changed) {
            void requisitions.execute("selectionChanged", { added, removed });
            this.schedulePersist();
        }

        return changed;
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
    private noteKey(measure: ISbDmTrackPiece, trackId: number, start: IFraction): string {
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
    private filterToDominantGranularity(entries: ISelectionHitEntry[]): ISelectionHitEntry[] {
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
    private resolveEntries(rect: DOMRect): ISelectionHitEntry[] {
        return this.resolveRawEntries(this.collectEntries(rect));
    }

    /**
     * Runs every registered hit tester for the given rectangle.
     *
     * @param rect The selection rectangle in viewport coordinates.
     *
     * @returns All entries the hit testers reported.
     */
    private collectEntries(rect: DOMRect): ISelectionHitEntry[] {
        const rawEntries: ISelectionHitEntry[] = [];
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
    private resolveRawEntries(rawEntries: ISelectionHitEntry[]): ISelectionHitEntry[] {
        const trackEntries = rawEntries.filter((entry) => {
            return entry.granularity === SelectionGranularity.Track;
        });
        if (trackEntries.length > 0) {
            return trackEntries;
        }

        return this.filterToDominantGranularity(rawEntries);
    }

    private handleSelectionRectChanged = (data: ISelectionRectChange): Promise<boolean> => {
        const currentEntries = this.collectEntries(data.rect).map((entry) => {
            return SelectionManager.withoutHitRect(entry);
        });

        if (currentEntries.length === 0) {
            return Promise.resolve(true);
        }

        if (this.applySelection(currentEntries)) {
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
                bars: sorted,
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
        if (this.zenMode) {
            return Promise.resolve(true);
        }

        if (state === PlayerPlayState.Playing || state === PlayerPlayState.Counting) {
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
        const measures = new Map<number, ISbDmTrackPiece>();
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
    private measureOfBar(bar: number): ISbDmTrackPiece | undefined {
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
            this.saveDebounceId = undefined;
        }

        if (this.zenMode) {
            return;
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
        if (entries.length === 0) {
            return undefined;
        }

        const state: ISerialisedSelectionState = {
            version: 1,
            ...(this.selectionAnchor === undefined ? {} : { anchor: this.selectionAnchor }),
            entries: SelectionSerializer.serialise(entries),
        };

        return JSON.stringify(state);
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

        let parsed: unknown;
        try {
            parsed = JSON.parse(state) as unknown;
        } catch {
            return;
        }

        let stored: ISerialisedSelectionEntry[];
        let anchor: ISelectionPoint | undefined;
        if (Array.isArray(parsed)) {
            stored = parsed as ISerialisedSelectionEntry[];
        } else if (typeof parsed === "object" && parsed !== null) {
            const selectionState = parsed as ISerialisedSelectionState;
            if (selectionState.version !== 1 || !Array.isArray(selectionState.entries)) {
                return;
            }

            stored = selectionState.entries;
            anchor = this.isSelectionPoint(selectionState.anchor) ? selectionState.anchor : undefined;
        } else {
            return;
        }

        if (stored.length === 0) {
            return;
        }

        this.replaceSelection(SelectionSerializer.deserialise(arrangement, stored));
        if (anchor !== undefined && arrangement.tracks.some((track) => {
            return track.id === anchor.trackId;
        })) {
            this.selectionAnchor = anchor;
        }
    }

    private isSelectionPoint(value: unknown): value is ISelectionPoint {
        if (typeof value !== "object" || value === null) {
            return false;
        }

        const point = value as ISelectionPoint;
        if (!Number.isInteger(point.granularity) || point.granularity < SelectionGranularity.Track
            || point.granularity > SelectionGranularity.Note || !Number.isInteger(point.bar)
            || !Number.isInteger(point.trackId)) {
            return false;
        }

        const position: unknown = (value as { position?: unknown; }).position;
        if (position === undefined) {
            return true;
        }

        if (typeof position !== "object" || position === null) {
            return false;
        }

        const fraction = position as IFraction;

        return Number.isInteger(fraction.numerator) && Number.isInteger(fraction.denominator)
            && fraction.denominator !== 0;
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
        const timerId = setTimeout(() => {
            this.scoreBookLoadedTimers.delete(timerId);

            if (this.firstLoadDone) {
                if (reason === ScoreBookChangeReason.ScoreLoaded) {
                    this.clearSelection();
                }
            } else {
                this.firstLoadDone = true;
                this.restorePersistedSelection();
            }
        }, 100);
        this.scoreBookLoadedTimers.add(timerId);

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

    private handleZenModeChanged = (enabled: boolean): Promise<boolean> => {
        if (this.zenMode === enabled) {
            return Promise.resolve(true);
        }

        this.zenMode = enabled;
        if (enabled) {
            this.selectionBeforeZen = [...(this.originalSelection ?? this.currentSelection).values()];
            this.anchorBeforeZen = this.selectionAnchor;
            this.originalSelection = undefined;
            this.selectionAnchor = undefined;
            this.replaceSelection([]);
        } else {
            this.replaceSelection(this.selectionBeforeZen ?? []);
            this.selectionAnchor = this.anchorBeforeZen;
            this.selectionBeforeZen = undefined;
            this.anchorBeforeZen = undefined;
        }

        this.publishPlayRange();

        return Promise.resolve(true);
    };

    private handleZenMeasureToggled = (bar: number): Promise<boolean> => {
        if (!this.zenMode) {
            return Promise.resolve(false);
        }

        const measure = this.measureOfBar(bar);
        if (measure !== undefined) {
            this.toggleSelection([{
                granularity: SelectionGranularity.Measure,
                target: { granularity: SelectionGranularity.Measure, measure },
            }]);
            this.publishPlayRange();
        }

        return Promise.resolve(true);
    };

    /**
     * Remembers the entry mode for newly created selection views. Insert draws no selection, so switching to it
     * drops the selection in place — the tools at it belong to overwrite.
     *
     * @param mode The entry mode announced by the app.
     *
     * @returns A resolved promise to satisfy the requisition handler signature.
     */
    private handleEntryModeChanged = (mode: EditEntryMode): Promise<boolean> => {
        this.entryMode = mode;

        if (mode === EditEntryMode.Insert) {
            this.clearSelection();
        }

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
