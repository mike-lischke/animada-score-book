/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IRadialMenuHost, IRadialMenuItem } from "../components/ui/framework/RadialMenu.js";
import { ComponentPlacement } from "../components/ui/framework/UIComponent.js";
import { AppStorage } from "../core/AppStorage.js";
import { Articulation, articulationOf, resolveNoteStyleForArticulation } from "../core/articulation.js";
import { getSharedAudioContext } from "../core/audio-context.js";
import { modelEventAt } from "../core/MeasureProjection.js";
import { defaultEntryValue, noteValueFraction, type INoteValue } from "../core/rest-notation.js";
import { compareFractions, reduceFraction } from "../core/serialisation/numeric-functions.js";
import type {
    IEventResizeRequest, INoteStyleAssignment, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { EditEntryMode, type IAudioData, type IFraction, type IMeasureEvent } from "../core/types/general.js";
import { AudioBufferPlayer } from "../player/AudioBufferPlayer.js";
import type { ISubdivisionCreationRequest } from "../supplement/Requisitions.js";
import { selectionEventsOf, selectionToClearRanges } from "./selection-ranges.js";
import { ScoreElementKind, type ScoreElementRegistry } from "./ScoreElementRegistry.js";
import type { SelectionManager } from "./SelectionManager.js";
import {
    addressesNoteCells, SelectionGranularity, SelectionSerializer, type INoteTarget, type ISelectionDelta,
    type ISelectionEntry,
} from "./SelectionSerializer.js";

/** The bar line as a bar fraction. */
const barLine: IFraction = { numerator: 1, denominator: 1 };

/** The start of a measure as a bar fraction. */
const measureStart: IFraction = { numerator: 0, denominator: 1 };

/** An event a selection entry addresses, as the data model addresses it: track, measure, position. */
export interface IAddressedEvent {
    trackId: number;
    bar: number;
    start: IFraction;
}

/**
 * A position inside a measure, addressed by the exact fraction of the measure. Every view uses this
 * form: the grid derives the raster cell from the fraction, the staff addresses free positions.
 */
export interface IMeasurePosition {
    bar: number;
    trackId: number;
    start: IFraction;
}

/** The collaborators an editor needs to turn input into edits and to show its actions. */
export interface IMeasureEditorInput {
    /** The element the input events arrive on; an action returns focus to it. */
    eventContainer: HTMLElement;

    selectionManager: SelectionManager;
    scoreElementRegistry: ScoreElementRegistry;

    /** The menu that shows the note action menu. Views without one leave it undefined. */
    noteActionMenu?: IRadialMenuHost;
}

/** A subdivision a selection covers completely, as the deletion needs to address it. */
interface IEmptySubdivisionCandidate {
    trackId: number;
    bar: number;
    start: IFraction;
    startIndex: number;
    actual: number;
}

/**
 * The edits and the input actions both views share. The edits address notes through selection entries
 * and exact fractions, so they are independent of the position format a view uses: `GridMeasureEditor`
 * adds cells, the raster and subdivision slots on top, `StaffMeasureEditor` free positions (ADR-0005).
 *
 * Input arrives as actions of this base rather than as positions, so a caller never needs to know
 * which view it serves: the cursor, the entry values and the position resolution live in the view.
 */
export abstract class MeasureEditor {
    /** Whether input edits the score. The app reports it; every input action is gated on it. */
    public editMode = false;

    /** The position the input addresses: set by a hit test and by a selection change. */
    protected cursor?: IMeasurePosition;

    protected readonly selectionManager: SelectionManager;
    protected readonly scoreElementRegistry: ScoreElementRegistry;

    /** The note value the next entry uses, including its augmentation dot. */
    protected noteValue: INoteValue;

    /** The CSS class of the rendered element that carries a cursor position in this view. */
    protected abstract readonly cursorElementClass: string;

    /** The rendered kind of the element that carries a cursor position in this view. */
    protected abstract readonly cursorElementKind: ScoreElementKind;

    private readonly eventContainer: HTMLElement;
    private readonly noteActionMenu?: IRadialMenuHost;
    private currentEntryMode: EditEntryMode = EditEntryMode.Insert;
    private articulation?: Articulation;

    public constructor(protected readonly dataModel: ScoreBookDataModel, input: IMeasureEditorInput) {
        const settings = AppStorage.loadUISettings();

        this.selectionManager = input.selectionManager;
        this.scoreElementRegistry = input.scoreElementRegistry;
        this.eventContainer = input.eventContainer;
        this.noteActionMenu = input.noteActionMenu;
        this.noteValue = settings?.entryNoteValue ?? defaultEntryValue;
        this.articulation = settings?.entryArticulation;
    }

    /**
     * How note entry makes room. Entering the overwrite mode adopts the articulation of the current
     * selection, which is what the toolbar shows; returning to insert mode restores the values the
     * user chose for the next entry (ADR-0011).
     *
     * @returns The mode the entries use.
     */
    public get entryMode(): EditEntryMode {
        return this.currentEntryMode;
    }

    public set entryMode(mode: EditEntryMode) {
        if (this.currentEntryMode === mode) {
            return;
        }

        this.currentEntryMode = mode;

        if (mode === EditEntryMode.Overwrite) {
            this.adoptCursorArticulation();

            return;
        }

        const settings = AppStorage.loadUISettings();

        this.noteValue = settings?.entryNoteValue ?? defaultEntryValue;
        this.articulation = settings?.entryArticulation;
    }

    /**
     * The note value the next entry uses, as the entry toolbars state it.
     *
     * @returns The current note value.
     */
    public get entryNoteValue(): INoteValue {
        return this.noteValue;
    }

    /**
     * Whether the view offers a note action menu, which input opens on the secondary button.
     *
     * @returns True when the view has a menu.
     */
    public get hasNoteActionMenu(): boolean {
        return this.noteActionMenu !== undefined;
    }

    /**
     * Resolves the element an input event addresses and makes it the cursor.
     *
     * @param target The event target to resolve.
     *
     * @returns True when the target addresses a position of this view.
     */
    public hitTest(target: EventTarget | null): boolean {
        if (!this.editMode) {
            return false;
        }

        const position = this.positionAt(target);
        if (position === undefined) {
            return false;
        }

        this.cursor = position;

        return true;
    }

    /**
     * Opens the note action menu of the view at the cursor. A view without a menu does nothing, so
     * the action is safe to send to every view.
     */
    public openNoteActionMenu(): void {
        const menu = this.noteActionMenu;
        const cursor = this.cursor;
        if (menu === undefined || cursor === undefined) {
            return;
        }

        const element = this.elementAt(cursor);
        const items = this.noteActionItems();
        if (element === undefined || items.length === 0) {
            return;
        }

        menu.open(element.getBoundingClientRect(), ComponentPlacement.TopCenter, items, 90, {
            startAngle: 180,
            angleSpan: items.length <= 5 ? 180 : 360,
            clockwise: true,
        });
    }

    /**
     * Writes a note of the given style. Insert mode writes at the cursor; overwrite mode writes at the
     * cursor for a single cell and restyles the selection when it addresses several elements (ADR-0011).
     *
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns True when the edit was applied.
     */
    public enterNote(noteStyleId: string): boolean {
        if (!this.editMode) {
            return false;
        }

        const entries = this.selectionEntries();

        return this.entryMode === EditEntryMode.Overwrite && this.isMultiCellSelection(entries)
            ? this.enterNoteForSelection(entries, noteStyleId)
            : this.writeNoteAtCursor(noteStyleId);
    }

    /**
     * Writes a rest. A selection of several elements has no cursor of its own, so it replaces what is
     * selected — the same edit a delete performs.
     *
     * @returns True when the edit was applied.
     */
    public enterRest(): boolean {
        if (!this.editMode) {
            return false;
        }

        const entries = this.selectionEntries();
        const replacesSelection = this.entryMode === EditEntryMode.Overwrite && entries.length > 1;

        return replacesSelection ? this.deleteSelection() : this.writeRestAtCursor();
    }

    /**
     * Removes the content the cursor addresses. A view without a cursor edit falls back to clearing
     * the selection, so the key never does nothing while a selection is present.
     *
     * @returns True when content changed.
     */
    public deleteForward(): boolean {
        return this.deleteSelection();
    }

    /**
     * Deletes what a delete request addresses: an empty subdivision that the selection covers
     * completely is a model edit, everything else is cleared element by element.
     *
     * @returns True when content changed.
     */
    public deleteSelectionRequested(): boolean {
        const entries = this.selectionEntries();
        if (entries.length === 0) {
            return false;
        }

        if (this.deleteEmptySubdivisionsForSelection(entries)) {
            this.selectionManager.clearSelection();

            return true;
        }

        return this.deleteSelection();
    }

    /**
     * Adopts the note value of the entry toolbars for the next entry and applies it to the selection
     * where the view resizes existing content (ADR-0011).
     *
     * @param value The selected note value, including its augmentation dot.
     *
     * @returns True when the selection changed.
     */
    public setNoteLength(value: INoteValue): boolean {
        this.noteValue = value;

        return this.resizeSelectionForLengthChange();
    }

    /**
     * Adopts the articulation of the articulation toolbar. In the overwrite mode every selected note
     * takes its own style's variant of the articulation; in the insert mode the value only configures
     * the next entry.
     *
     * @param articulation The selected articulation.
     *
     * @returns True when the selection changed.
     */
    public setArticulation(articulation: Articulation): boolean {
        this.articulation = articulation;

        if (!this.editMode || this.entryMode !== EditEntryMode.Overwrite) {
            return false;
        }

        const entries = this.selectionEntries();
        if (!this.setSelectionArticulation(entries, articulation)) {
            return false;
        }

        this.selectionManager.replaceSelection(this.refreshSelection(entries));

        return true;
    }

    /**
     * Checks whether a note value can be applied to the current selection: a length change needs a
     * selection and a value the view can represent at the cursor.
     *
     * @param value The note value to check.
     *
     * @returns True when the value applies.
     */
    public canApplyNoteLength(value: INoteValue): boolean {
        return this.selectionManager.hasSelection && this.noteLengthAtCursor(value) !== undefined;
    }

    /**
     * Returns the note styles at the cursor, supplied by the instrument of its track.
     *
     * @returns The note styles, or an empty array when there is no cursor.
     */
    public noteStylesAtCursor(): IAudioData[] {
        const cursor = this.cursor;

        return cursor === undefined ? [] : this.getNoteStyles(cursor.trackId);
    }

    /**
     * Follows a selection change: a single entry that addresses a cursor position becomes the cursor,
     * and a cleared selection drops it.
     *
     * @param delta The selection change to follow.
     */
    public cursorFromSelection(delta: ISelectionDelta): void {
        if (delta.added.length === 0 && !this.selectionManager.hasSelection) {
            this.cursor = undefined;

            return;
        }

        const added = delta.added[0];
        if (delta.added.length !== 1 || !this.isCursorEntry(added)) {
            return;
        }

        const cursor = this.cursorOf(added);
        if (cursor === undefined) {
            return;
        }

        this.cursor = cursor;

        // The articulation of the addressed event only configures the next entry in overwrite mode;
        // in insert mode the toolbar keeps the articulation the user chose.
        const { target } = added;
        if (this.entryMode === EditEntryMode.Overwrite && target.granularity === SelectionGranularity.Note) {
            this.articulation = this.articulationOfTarget(target);
        }
    }

    /**
     * Removes the content before the cursor, so the content behind it moves up.
     *
     * @returns True when content changed.
     */
    public deleteBackward(): boolean {
        return this.deleteContentBeforeCursor();
    }

    /**
     * Creates a subdivision at the cursor or covering the selection (ADR-0007).
     *
     * @param request The requested subdivision size.
     *
     * @returns True when the subdivision was created.
     */
    public createSubdivision(request: ISubdivisionCreationRequest): boolean {
        return this.createRequestedSubdivision(request);
    }

    /**
     * Clears the note content described by the given selection entries, honouring their
     * granularity. The data model batches the changes into one undo step and notifies the
     * affected tracks so viewers recompute their note structure.
     *
     * @param entries The selection entries to clear.
     *
     * @returns True when any content changed.
     */
    public clearSelection(entries: ISelectionEntry[]): boolean {
        return this.dataModel.clearRanges(selectionToClearRanges(entries));
    }

    /**
     * Applies a note style to all elements described by the given selection entries, honouring their
     * granularity. The style is applied only when all selected elements belong to the same
     * instrument. The data model batches the changes into one undo step.
     *
     * @param entries The selection entries to fill.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when any content changed.
     */
    public setSelectionNoteStyle(entries: ISelectionEntry[], noteStyleId: string): boolean {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return false;
        }

        const ranges = selectionToClearRanges(entries);
        if (ranges.length === 0) {
            return false;
        }

        const trackIds = new Set(ranges.map((range) => {
            return range.trackId;
        }));
        const instrumentIds = new Set<number>();
        for (const trackId of trackIds) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === trackId;
            });
            if (track) {
                instrumentIds.add(track.instrument.id);
            }
        }

        if (instrumentIds.size > 1) {
            return false;
        }

        return this.dataModel.setNoteStyleRanges(ranges, noteStyleId);
    }

    /**
     * Applies an articulation to the notes the selection addresses. Each note keeps its own voice and
     * takes that voice's variant of the articulation, so the change lands on the matching sample. Notes
     * without a style, and those whose instrument offers no such variant, are left alone.
     *
     * @param entries The selection entries to change.
     * @param articulation The articulation to apply.
     *
     * @returns True when at least one note changed.
     */
    public setSelectionArticulation(entries: ISelectionEntry[], articulation: Articulation): boolean {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return false;
        }

        const assignments: INoteStyleAssignment[] = [];

        for (const covered of selectionEventsOf(arrangement, entries)) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === covered.measure.track.id;
            });
            if (track === undefined) {
                continue;
            }

            const noteStyles = track.instrument.noteStyles;
            for (const index of covered.indexes) {
                const event = covered.measure.events[index];
                if (event.noteStyleId === undefined) {
                    continue;
                }

                const styleId = resolveNoteStyleForArticulation(noteStyles, event.noteStyleId, articulation);
                if (styleId !== undefined && styleId !== event.noteStyleId) {
                    assignments.push({
                        trackId: track.id,
                        bar: covered.measure.number,
                        start: event.start,
                        noteStyleId: styleId,
                    });
                }
            }
        }

        return assignments.length > 0 && this.dataModel.setNoteStyles(assignments);
    }

    /**
     * Deletes the subdivisions the selection covers completely, provided none of their slots holds a
     * note. A tuplet that still holds content is left alone, so a selection of slots never destroys
     * written notes. The edits address the model by track, measure and exact start, so they work the
     * same in both views.
     *
     * @param entries The selection entries to delete.
     *
     * @returns True when at least one complete empty subdivision was deleted.
     */
    public deleteEmptySubdivisionsForSelection(entries: ISelectionEntry[]): boolean {
        if (entries.length === 0) {
            return false;
        }

        const candidates = new Map<string, IEmptySubdivisionCandidate>();
        for (const entry of entries) {
            const target = entry.target;
            if (target.granularity !== SelectionGranularity.Note) {
                return false;
            }

            const { measure } = target;
            const cellStart = target.start ?? target.event.start;
            const eventIndex = measure.events.findIndex((event) => {
                return compareFractions(event.start, cellStart) === 0;
            });
            const subdivision = measure.subdivisions.find((candidate) => {
                return eventIndex >= candidate.startIndex
                    && eventIndex < candidate.startIndex + candidate.actual;
            });
            if (!subdivision
                || measure.events.slice(subdivision.startIndex, subdivision.startIndex + subdivision.actual)
                    .some((event) => {
                        return event.noteStyleId !== undefined;
                    })) {
                return false;
            }

            const key = `${measure.track.id}:${measure.number}:${subdivision.startIndex}`;
            candidates.set(key, {
                trackId: measure.track.id,
                bar: measure.number,
                start: { ...measure.events[subdivision.startIndex].start },
                startIndex: subdivision.startIndex,
                actual: subdivision.actual,
            });
        }

        for (const candidate of candidates.values()) {
            const measure = this.resolveMeasure(candidate.trackId, candidate.bar);
            if (!measure) {
                return false;
            }

            const complete = measure.events
                .slice(candidate.startIndex, candidate.startIndex + candidate.actual)
                .every((event) => {
                    return entries.some((entry) => {
                        const target = entry.target;

                        return target.granularity === SelectionGranularity.Note
                            && target.measure === measure
                            && compareFractions(target.start ?? target.event.start, event.start) === 0;
                    });
                });
            if (!complete) {
                return false;
            }
        }

        let deleted = false;
        for (const candidate of candidates.values()) {
            deleted = this.dataModel.deleteSubdivisionAt(candidate.trackId, candidate.bar, candidate.start)
                || deleted;
        }

        return deleted;
    }

    /**
     * Applies a note value to the events addressed by the selection entries. Notes in different
     * tracks are resized independently, each track rippling its own following notes; a rest takes the
     * value by moving the content behind it. Only what the entries address is resized: selections
     * that span whole measures or tracks keep their duration.
     *
     * @param entries The selection entries to resize.
     * @param value The selected note value, including its augmentation dot.
     *
     * @returns True when at least one duration changed.
     */
    public resizeSelection(entries: ISelectionEntry[], value: INoteValue): boolean {
        const requestsByTrack = new Map<number, IEventResizeRequest[]>();

        for (const entry of entries) {
            for (const addressed of this.addressedEventsOf(entry)) {
                const measure = this.resolveMeasure(addressed.trackId, addressed.bar);
                const duration = measure === undefined
                    ? undefined
                    : this.noteValueDurationFor(value, measure);
                if (duration === undefined) {
                    continue;
                }

                const request = { bar: addressed.bar, start: addressed.start, duration };
                const requests = requestsByTrack.get(addressed.trackId);
                if (requests) {
                    requests.push(request);
                } else {
                    requestsByTrack.set(addressed.trackId, [request]);
                }
            }
        }

        let changed = false;
        for (const [trackId, requests] of requestsByTrack) {
            changed = this.dataModel.resizeEvents(trackId, requests) || changed;
        }

        return changed;
    }

    /**
     * Re-resolves the given selection entries against the current measure content, so selections stay
     * accurate after structural edits such as filling a range with a note style. An edit replaces the
     * events, so the entries are serialised to their coordinates and resolved back; entries whose
     * element no longer exists are dropped.
     *
     * @param entries The selection entries to refresh.
     *
     * @returns The entries holding the current model objects.
     */
    public refreshSelection(entries: ISelectionEntry[]): ISelectionEntry[] {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return entries;
        }

        return SelectionSerializer.deserialise(arrangement, SelectionSerializer.serialise(entries));
    }

    /**
     * Returns all note styles offered by the instrument a track plays.
     *
     * @param trackId The track whose instrument supplies the styles.
     *
     * @returns The instrument's note styles, or an empty array when the track does not exist.
     */
    public getNoteStyles(trackId: number): IAudioData[] {
        const track = this.trackOf(trackId);

        return track ? Object.values(track.instrument.noteStyles) : [];
    }

    /**
     * Resolves the score position an input event addresses. The view decides which rendered element
     * carries a cursor, so the lookup is driven by its cursor element class and kind.
     *
     * @param target The event target to resolve.
     *
     * @returns The position, or undefined when the target addresses no element of this view.
     */
    protected positionAt(target: EventTarget | null): IMeasurePosition | undefined {
        if (!(target instanceof HTMLElement)) {
            return undefined;
        }

        const element = target.closest<HTMLElement>(this.cursorElementClass);
        const location = element === null ? undefined : this.scoreElementRegistry.getLocation(element);
        if (location?.kind !== this.cursorElementKind || location.start === undefined) {
            return undefined;
        }

        return { bar: location.bar, trackId: location.trackId, start: { ...location.start } };
    }

    /**
     * Returns the rendered element of a cursor position.
     *
     * @param position The position to resolve.
     *
     * @returns The live element, or undefined when nothing is rendered at the position.
     */
    protected elementAt(position: IMeasurePosition): HTMLElement | undefined {
        return this.scoreElementRegistry.findPositionElement(position.bar, position.trackId,
            this.cursorElementKind, undefined, position.start);
    }

    /**
     * Makes a position the cursor and selects the element rendered there.
     *
     * @param position The position to select.
     */
    protected selectCursorAt(position: IMeasurePosition): void {
        this.cursor = position;

        const element = this.elementAt(position);
        const event = element === undefined ? undefined : this.scoreElementRegistry.getTarget(element);
        const measure = element === undefined ? undefined : this.scoreElementRegistry.getLocation(element)?.measure;
        if (event === undefined || !("duration" in event) || measure === undefined) {
            return;
        }

        this.selectionManager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            target: { granularity: SelectionGranularity.Note, measure, event, start: { ...position.start } },
        });
    }

    /**
     * Returns the entries of the current selection.
     *
     * @returns The selection entries.
     */
    protected selectionEntries(): ISelectionEntry[] {
        return [...this.selectionManager.currentSelection.values()];
    }

    /**
     * Clears the content the selection describes and drops the selection, because the cleared
     * elements no longer hold it.
     *
     * @returns True when content was deleted.
     */
    protected deleteSelection(): boolean {
        const entries = this.selectionEntries();
        if (entries.length === 0 || !this.clearSelection(entries)) {
            return false;
        }

        this.selectionManager.clearSelection();

        return true;
    }

    /**
     * Applies a note style to every element the selection addresses.
     *
     * @param entries The selection entries to fill.
     * @param noteStyleId The selected instrument note-style id.
     *
     * @returns True when the edit was applied.
     */
    protected enterNoteForSelection(entries: ISelectionEntry[], noteStyleId: string): boolean {
        if (!this.setSelectionNoteStyle(entries, noteStyleId)) {
            return false;
        }

        // The edit replaces the events, so the selection keeps its span with fresh note ids.
        this.selectionManager.replaceSelection(this.refreshSelection(entries));
        this.focusInput();

        return true;
    }

    /**
     * Checks whether a selection addresses more than one cell or a coarser element, which the
     * overwrite mode restyles instead of writing at the cursor.
     *
     * @param entries The selection entries to inspect.
     *
     * @returns True when the selection covers more than one cell.
     */
    protected isMultiCellSelection(entries: ISelectionEntry[]): boolean {
        if (entries.length === 0) {
            return false;
        }

        return entries.length > 1 || entries[0].granularity !== SelectionGranularity.Note;
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
    protected resolveNoteStyle(styles: IAudioData[], noteStyleId: string): IAudioData | undefined {
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

        return styles.find((candidate) => {
            return candidate.id === articulatedId;
        }) ?? requested;
    }

    /**
     * Plays a written note as a preview, using the arrangement's main volume.
     *
     * @param style The style that was written, or undefined when nothing was written.
     */
    protected playNote(style: IAudioData | undefined): void {
        if (!style?.audioBuffer) {
            return;
        }

        const volume = (this.dataModel.arrangement?.mainVolume ?? 100) / 100;

        new AudioBufferPlayer(style.audioBuffer, getSharedAudioContext(), 0, volume);
    }

    /**
     * Returns focus to the element the input events arrive on, so typing continues at the cursor after
     * an action that a menu triggered.
     */
    protected focusInput(): void {
        this.eventContainer.focus({ preventScroll: true });
    }

    /**
     * Returns the items of the note action menu, in the order the menu shows them. The grid builds
     * them from the addressed instrument; a view without a menu offers no items.
     *
     * @returns The menu items.
     */
    protected noteActionItems(): IRadialMenuItem[] {
        return [];
    }

    /**
     * Writes the note style an action menu picked at the cursor.
     *
     * @param noteStyleId The picked note-style id.
     *
     * @returns True when the edit was applied.
     */
    protected applyNoteActionStyle(noteStyleId: string): boolean {
        return this.writeNoteAtCursor(noteStyleId);
    }

    /**
     * Collects the events the selection addresses, in measure order and without duplicates. A
     * subdivision copies their content into its leading slots, so the notes it replaces keep their
     * sound.
     *
     * @param entries The selection entries to read.
     *
     * @returns The addressed events, ordered by their start.
     */
    protected selectedEventsOf(entries: ISelectionEntry[]): IMeasureEvent[] {
        const events: IMeasureEvent[] = [];

        for (const entry of entries) {
            const { target } = entry;
            if (target.granularity === SelectionGranularity.Track
                || target.granularity === SelectionGranularity.Measure
                || target.granularity === SelectionGranularity.TrackPiece) {
                continue;
            }

            const addressed = target.granularity === SelectionGranularity.Note
                ? [modelEventAt(target.measure, target.start ?? target.event.start) ?? target.event]
                : target.events;
            for (const event of addressed) {
                if (!events.includes(event)) {
                    events.push(event);
                }
            }
        }

        return events.sort((left, right) => {
            return compareFractions(left.start, right.start);
        });
    }

    /**
     * Converts a note value into its duration as a fraction of the measure. The arrangement's step
     * resolution counts steps per whole note, the measure's resolution steps per bar. The duration
     * stays a fraction: the grid adds its raster on top, because a value the raster cannot address
     * has no cell, while the staff places any value the meter can express.
     *
     * @param value The selected note value, including its augmentation dot.
     * @param measure The measure the duration is expressed in.
     *
     * @returns The duration as a fraction of the measure, or undefined when the value is invalid.
     */
    protected noteValueDurationFor(value: INoteValue, measure: ISbDmTrackMeasure): IFraction | undefined {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

        const fraction = noteValueFraction(value);
        const duration = reduceFraction(arrangement.timeParams.stepResolution * fraction.numerator,
            fraction.denominator * measure.meter.stepResolution);

        return compareFractions(duration, barLine) <= 0 ? duration : undefined;
    }

    /**
     * Checks whether a note starts exactly at the given position. A position inside a longer note
     * does not count: both views address what starts there, and a run of the staff always starts at
     * its event.
     *
     * @param trackId The track containing the position.
     * @param bar The one-based measure number.
     * @param start The exact position as a fraction of the measure.
     *
     * @returns True when a note starts at the position.
     */
    protected hasNoteStartAt(trackId: number, bar: number, start: IFraction): boolean {
        const measure = this.resolveMeasure(trackId, bar);
        const event = measure?.events.find((candidate) => {
            return compareFractions(candidate.start, start) === 0;
        });

        return event?.noteStyleId !== undefined;
    }

    /**
     * Finds the earliest note start inside the given span.
     *
     * @param trackId The track whose measure is inspected.
     * @param bar The one-based measure number.
     * @param start The span start, exclusive.
     * @param end The span end, exclusive.
     *
     * @returns The note start, or undefined when no note starts inside the span.
     */
    protected nextNoteStart(trackId: number, bar: number, start: IFraction,
        end: IFraction): IFraction | undefined {
        const measure = this.resolveMeasure(trackId, bar);
        if (!measure) {
            return undefined;
        }

        let earliest: IFraction | undefined;
        for (const event of measure.events) {
            if (event.noteStyleId === undefined
                || compareFractions(event.start, start) <= 0 || compareFractions(event.start, end) >= 0) {
                continue;
            }

            if (earliest === undefined || compareFractions(event.start, earliest) < 0) {
                earliest = event.start;
            }
        }

        return earliest;
    }

    /**
     * Resolves a note style of the instrument a track plays.
     *
     * @param trackId The track whose instrument supplies the style.
     * @param noteStyleId The note-style id to resolve.
     *
     * @returns The note style, or undefined when the track or the style does not exist.
     */
    protected noteStyleOf(trackId: number, noteStyleId: string): IAudioData | undefined {
        return this.trackOf(trackId)?.instrument.noteStyles[noteStyleId];
    }

    /**
     * Resolves a track of the current arrangement.
     *
     * @param trackId The track to resolve.
     *
     * @returns The track, or undefined when the arrangement does not contain it.
     */
    protected trackOf(trackId: number): ISbDmTrack | undefined {
        return this.dataModel.arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });
    }

    /**
     * Resolves the measure of a track at a one-based bar number.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     *
     * @returns The measure, or undefined when the track or measure does not exist.
     */
    protected resolveMeasure(trackId: number, bar: number): ISbDmTrackMeasure | undefined {
        return this.trackOf(trackId)?.measures[bar - 1];
    }

    /**
     * Resolves the events a selection entry addresses. A note addresses the event it was selected at,
     * a note group every event it contains; coarser granularities describe whole measures or tracks
     * and address no events at all. What the data model finds at an address — a note or a rest —
     * decides how a length change applies.
     *
     * @param entry The selection entry to resolve.
     *
     * @returns The addressed events, in measure order.
     */
    protected abstract addressedEventsOf(entry: ISelectionEntry): IAddressedEvent[];

    /** Removes the content before the cursor; the view owns the cursor and its navigation. */
    protected abstract deleteContentBeforeCursor(): boolean;

    /** Creates the requested subdivision in the address space of the view. */
    protected abstract createRequestedSubdivision(request: ISubdivisionCreationRequest): boolean;

    /** Writes a note of the given style at the cursor. */
    protected abstract writeNoteAtCursor(noteStyleId: string): boolean;

    /** Writes a rest at the cursor. */
    protected abstract writeRestAtCursor(): boolean;

    /** The duration a note value covers at the cursor, or undefined when the view cannot represent it. */
    protected abstract noteLengthAtCursor(value: INoteValue): IFraction | undefined;

    /** Whether a selection entry is a cursor position for this view. */
    protected abstract isCursorEntry(entry: ISelectionEntry): boolean;

    /**
     * Applies the adopted note value to the selection. Only the staff view resizes existing content;
     * the grid uses the value for the next entry (ADR-0003, ADR-0011).
     *
     * @returns True when the selection changed.
     */
    protected abstract resizeSelectionForLengthChange(): boolean;

    /**
     * Adopts the articulation of the element the cursor addresses, so the overwrite mode writes what
     * the articulation bar shows after a mode switch.
     */
    private adoptCursorArticulation(): void {
        const entries = this.selectionEntries();
        const only = entries.length === 1 ? entries[0] : undefined;

        if (only?.granularity !== SelectionGranularity.Note
            || only.target.granularity !== SelectionGranularity.Note) {
            return;
        }

        this.articulation = this.articulationOfTarget(only.target);
    }

    /**
     * Resolves the articulation of the note event a target addresses.
     *
     * @param target The note target to look up.
     *
     * @returns The articulation, or undefined for a plain note and for an event without a style.
     */
    private articulationOfTarget(target: INoteTarget): Articulation | undefined {
        const noteIndex = target.measure.events.indexOf(target.event);
        const noteEvent = noteIndex < 0 ? undefined : target.measure.noteEvents.at(noteIndex);
        const style = noteEvent?.audioData;

        return style === undefined ? undefined : articulationOf(style);
    }

    /**
     * Derives the cursor a selection entry describes: the exact start of the addressed note cells, or
     * the start of the measure for a coarser entry.
     *
     * @param entry The entry added to the selection.
     *
     * @returns The cursor position, or undefined for an entry that addresses no measure.
     */
    private cursorOf(entry: ISelectionEntry): IMeasurePosition | undefined {
        const { target } = entry;
        if (target.granularity === SelectionGranularity.Track) {
            return undefined;
        }

        const exact = addressesNoteCells(target)
            ? SelectionSerializer.coordinatesOf(entry).start ?? measureStart
            : measureStart;

        return { bar: target.measure.number, trackId: target.measure.track.id, start: { ...exact } };
    }
}
