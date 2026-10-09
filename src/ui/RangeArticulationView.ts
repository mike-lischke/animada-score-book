/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createElement, render } from "preact";

import { staffSpacePx } from "../core/MeasureLayout.js";
import { HairpinEnd, RangeArticulations } from "../core/RangeArticulations.js";
import type { ScoreBookDataModel } from "../core/ScoreBookDataModel.js";
import { ScoreSymbol } from "../core/ScoreSymbols.js";
import { compareFractions } from "../core/serialisation/numeric-functions.js";
import type {
    IForteMark, IHairpin, IRangeArticulation, IRangeArticulationAnchor,
} from "../core/types/general.js";
import { RangeArticulationKind } from "../core/types/general.js";
import { requisitions, RangeArticulationTool } from "../supplement/Requisitions.js";
import { ScoreSymbolView } from "../components/ui/framework/ScoreSymbolView.js";
import { ScoreElementKind, type ScoreElementRegistry } from "./ScoreElementRegistry.js";
import type { ISelectionDelta } from "./SelectionSerializer.js";
import type { SelectionManager } from "./SelectionManager.js";

/** Which part of a marking a handle drags. */
enum RangeHandle {
    Move,
    From,
    To,
}

/** The container the markings are drawn into, inside the pointer-transparent decoration layer. */
const layerId = "rangeArticulationLayer";

const svgNamespace = "http://www.w3.org/2000/svg";

/** Smallest px width a hairpin preview keeps, so a nearly closed preview stays visible. */
const minimumHairpinWidthPx = 4;

/**
 * Height a hairpin opens to, in staff spaces. It stays well under the note row, so the two strokes never reach into
 * the notes of the system above the one they belong to.
 */
const hairpinOpeningSpaces = 1.2;

/** How far right of the pointer its drag image follows, in px, so the cursor does not cover the icon. */
const dragImageOffsetPx = 12;

/** How long the image of a carried marking takes to glide back to its place when nothing took it, in ms. */
const dragReturnMs = 180;

/**
 * How close the pointer has to come to a target until a drag snaps to it, in px: to a note horizontally, and to the
 * marking zone of a row vertically. A pointer farther away than that, or outside the score, aims at nothing.
 */
const snapDistancePx = staffSpacePx * 2;

/** A point in the content's own pixel space, which is the space the decoration layer is laid out in. */
interface IPoint {
    x: number;
    y: number;
}

/** The track row a pointer position falls into. */
interface ILocatedRow {
    bar: number;
    trackId: number;
}

/** The event a drag is near enough to take, together with the track it lies in. */
interface ISnappedTarget {
    trackId: number;
    anchor: IRangeArticulationAnchor;
}

/** The box of a carried marking: where it stood, where the pointer grabbed it, and how big it is. */
interface IDragImageBox {
    home: IPoint;
    grab: IPoint;
    width: number;
    height: number;
}

/** The chronological hairpin a gesture would create, together with whether the model would accept it. */
interface IHairpinDraft {
    hairpin: IHairpin;
    valid: boolean;
}

/** The place an active drag names, together with whether the model would accept the marking there. */
interface IDragTarget {
    moved: IRangeArticulation;
    settles: boolean;
}

/**
 * Draws the hairpins and `f` markings of the staff view and runs the placing modes that create them.
 *
 * The view is imperative, like {@link SelectionView}: it appends its overlays to the decoration layer and
 * resolves the position of an anchor from the rendered note element of that anchor. Every position is
 * therefore recomputed whenever the staff window, a track or the arrangement changed, which keeps a marking
 * correct while the virtualized staff window mounts and unmounts measures.
 *
 * Moving a marking follows the placing modes: the pointer carries an image of it and the place it would land at
 * is previewed, while the stored marking keeps its place until the drop commits the move.
 */
export class RangeArticulationView {
    private tool = RangeArticulationTool.None;
    private staffMode: boolean;
    private decorationLayer?: HTMLElement;
    private dragImage?: HTMLElement;
    private refreshFrame?: number;

    /** Ratio of viewport pixels to the content's own pixels, which the CSS zoom of the viewer decides. */
    private zoomFactor = 1;

    private strokeWidth = staffSpacePx * 0.16;
    private lastPointerX = 0;
    private lastPointerY = 0;
    private pointerInside = false;

    /** The marking whose handles are shown, and the handle the pointer currently drags. */
    private selectedId?: number;
    private dragId?: number;
    private dragHandle = RangeHandle.Move;
    private dragAnchor?: IRangeArticulationAnchor;
    private dragTrackId?: number;

    /** How many notes the grabbed note lies behind the first end of the hairpin an active move carries. */
    private dragGrabOffset?: number;

    /** Where the grabbed marking stood when the drag started, together with the place it was grabbed at. */
    private dragImageBox?: IDragImageBox;

    /** The image of a carried marking that is on its way back to the place it was taken from. */
    private returningImage?: HTMLElement;

    public constructor(private readonly contentHost: HTMLElement, private readonly dataModel: ScoreBookDataModel,
        private readonly selectionManager: SelectionManager, private readonly registry: ScoreElementRegistry,
        staffMode: boolean) {
        this.staffMode = staffMode;

        requisitions.register("rangeArticulationToolChanged", this.handleToolChanged);
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("trackChanged", this.handleRefreshRequest);
        requisitions.register("arrangementChanged", this.handleRefreshRequest);
        requisitions.register("staffWindowChanged", this.handleRefreshRequest);

        contentHost.addEventListener("pointerdown", this.handlePointerDown, true);
        contentHost.addEventListener("pointermove", this.handlePointerMove);
        contentHost.addEventListener("pointerup", this.handlePointerUp);
        contentHost.addEventListener("pointerleave", this.handlePointerLeave);
        contentHost.addEventListener("pointerdown", this.handleMarkingPointerDown, true);
        document.addEventListener("keydown", this.handleKeyDown);
    }

    public dispose(): void {
        this.removeDragImage();
        this.eventHandlersOff();

        requisitions.unregister("rangeArticulationToolChanged", this.handleToolChanged);
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("trackChanged", this.handleRefreshRequest);
        requisitions.unregister("arrangementChanged", this.handleRefreshRequest);
        requisitions.unregister("staffWindowChanged", this.handleRefreshRequest);

        if (this.refreshFrame !== undefined) {
            cancelAnimationFrame(this.refreshFrame);
            this.refreshFrame = undefined;
        }
    }

    /**
     * Applies the view mode of the arrangement viewer.
     *
     * @param staffMode True while the staff view is shown, which is the only view the markings live in.
     */
    public setStaffMode(staffMode: boolean): void {
        if (this.staffMode === staffMode) {
            return;
        }

        this.staffMode = staffMode;
        if (!staffMode) {
            this.leaveTool();
        }

        this.scheduleRefresh();
    }

    private eventHandlersOff(): void {
        this.contentHost.removeEventListener("pointerdown", this.handlePointerDown, true);
        this.contentHost.removeEventListener("pointermove", this.handlePointerMove);
        this.contentHost.removeEventListener("pointerup", this.handlePointerUp);
        this.contentHost.removeEventListener("pointerleave", this.handlePointerLeave);
        this.contentHost.removeEventListener("pointerdown", this.handleMarkingPointerDown, true);
        document.removeEventListener("keydown", this.handleKeyDown);
    }

    private handleToolChanged = (tool: RangeArticulationTool): Promise<boolean> => {
        const effective = this.staffMode ? tool : RangeArticulationTool.None;
        if (this.tool !== effective) {
            this.tool = effective;
            this.removeDragImage();
            this.holdPointer(effective !== RangeArticulationTool.None);
            this.scheduleRefresh();
        }

        return Promise.resolve(true);
    };

    /**
     * Keeps the pointer on the score while a placing mode is active: every other part of the app is made inert, so
     * a press cannot leave the mode or change anything else until the mode ends.
     *
     * @param active True while a placing mode owns the pointer.
     */
    private holdPointer(active: boolean): void {
        document.body.classList.toggle("range-articulation-mode", active);
    }

    private scheduleRefresh(): void {
        if (this.refreshFrame !== undefined) {
            cancelAnimationFrame(this.refreshFrame);
        }

        this.refreshFrame = requestAnimationFrame(() => {
            this.refreshFrame = undefined;
            this.refresh();
        });
    }

    /**
     * A marking and a score selection are alternatives, so the score's own selection takes the selection back.
     *
     * @param delta The entries that were added to and removed from the score selection.
     *
     * @returns True, always.
     */
    private handleSelectionChanged = (delta: ISelectionDelta): Promise<boolean> => {
        if (delta.added.length > 0 && this.selectedId !== undefined) {
            this.selectedId = undefined;
            this.scheduleRefresh();
        }

        return Promise.resolve(true);
    };

    private handleRefreshRequest = (): Promise<boolean> => {
        this.scheduleRefresh();

        return Promise.resolve(true);
    };

    private handlePointerDown = (event: PointerEvent): void => {
        if (this.tool === RangeArticulationTool.None || !this.staffMode || event.button !== 0) {
            return;
        }

        // The placing mode owns the pointer while it is active: neither the selection rectangle nor the note
        // input reacts to the same press, so a stray press cannot leave the mode or change the score.
        event.preventDefault();
        event.stopPropagation();
        this.contentHost.setPointerCapture(event.pointerId);
    };

    private handlePointerMove = (event: PointerEvent): void => {
        if (this.dragId !== undefined) {
            this.followDrag(event.clientX, event.clientY);

            return;
        }

        if (this.tool === RangeArticulationTool.None || !this.staffMode) {
            return;
        }

        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        this.pointerInside = true;
        this.showDragImage(event.clientX, event.clientY);
        this.scheduleRefresh();
    };

    private handlePointerUp = (event: PointerEvent): void => {
        if (this.dragId !== undefined && event.button === 0) {
            if (this.contentHost.hasPointerCapture(event.pointerId)) {
                this.contentHost.releasePointerCapture(event.pointerId);
            }

            this.finishDrag();

            return;
        }

        if (this.tool === RangeArticulationTool.None || !this.staffMode || event.button !== 0) {
            return;
        }

        if (this.contentHost.hasPointerCapture(event.pointerId)) {
            this.contentHost.releasePointerCapture(event.pointerId);
        }

        this.placeMarking(event.clientX, event.clientY);
    };

    /**
     * Selects the marking a press lands on and starts the drag it names: a handle resizes the marking, the marking
     * itself moves. A press that misses every marking clears the selection.
     *
     * @param event The pointer event of the press.
     */
    private handleMarkingPointerDown = (event: PointerEvent): void => {
        if (this.tool !== RangeArticulationTool.None || !this.staffMode || event.button !== 0) {
            return;
        }

        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        // A handle is a sibling of the marking it belongs to, so it carries the marking's id itself.
        const handleElement = target.closest<HTMLElement>(".range-articulation-handle");
        const element = target.closest<HTMLElement>(".range-articulation");
        const id = Number(handleElement?.dataset.articulationId ?? element?.dataset.articulationId);
        if (!Number.isFinite(id)) {
            if (this.selectedId !== undefined) {
                this.selectedId = undefined;
                this.scheduleRefresh();
            }

            return;
        }

        this.selectedId = id;

        // A marking takes the selection over from the score, so a press does not leave both of them selected.
        this.selectionManager.clearSelection();

        // The marking owns this press: the score must not select the note behind it as well.
        event.preventDefault();
        event.stopPropagation();

        // A press that misses the handles moves the marking itself, which keeps the note it was grabbed at.
        const handle = handleElement?.dataset.end;
        const existing = this.articulationById(id);
        this.dragId = id;
        this.dragHandle = handle === "from" ? RangeHandle.From : handle === "to" ? RangeHandle.To : RangeHandle.Move;
        this.dragGrabOffset = this.dragHandle === RangeHandle.Move && existing !== undefined
            ? this.grabOffsetOf(existing, event.clientX)
            : undefined;
        this.dragImageBox = this.dragHandle === RangeHandle.Move && element !== null
            ? this.grabBoxOf(element, event)
            : undefined;
        this.clearDragTarget();
        this.contentHost.setPointerCapture(event.pointerId);

        this.scheduleRefresh();
    };

    /**
     * Follows the pointer while a marking is dragged: a move leaves the stored marking where it is, carries an image
     * of it and previews the place it would land at, the way a placing mode does it. A resize edits the marking
     * itself instead.
     *
     * @param clientX The pointer's viewport x.
     * @param clientY The pointer's viewport y.
     */
    private followDrag(clientX: number, clientY: number): void {
        const { dragId } = this;
        const existing = dragId === undefined ? undefined : this.articulationById(dragId);
        if (existing === undefined) {
            return;
        }

        if (this.dragHandle === RangeHandle.Move) {
            // A move carries the marking, so an image of it follows the pointer. A resize stretches the marking,
            // which follows the pointer itself and therefore needs no image of its own.
            this.showDragImage(clientX, clientY, existing);
        }

        this.updateDragTarget(clientX, clientY, existing);
        this.scheduleRefresh();
    }

    /**
     * Takes the event the pointer is near as the drag's target.
     *
     * @param clientX The pointer's viewport x.
     * @param clientY The pointer's viewport y.
     * @param existing The marking being dragged.
     */
    private updateDragTarget(clientX: number, clientY: number, existing: IRangeArticulation): void {
        const target = this.snappedTarget(clientX, clientY, existing);

        // A move shows the place it would drop, so it loses the target the moment the pointer aims at none. A resize
        // keeps what it has, so a pointer that left every note leaves the dragged width as it is.
        if (target === undefined) {
            if (this.dragHandle === RangeHandle.Move) {
                this.clearDragTarget();
            }

            return;
        }

        this.dragTrackId = target.trackId;
        this.dragAnchor = target.anchor;
    }

    /**
     * @param clientX The pointer's viewport x.
     * @param clientY The pointer's viewport y.
     * @param existing The marking being dragged.
     *
     * @returns The event the pointer is near enough to be dragged onto, or undefined when it is near none.
     */
    private snappedTarget(clientX: number, clientY: number,
        existing: IRangeArticulation): ISnappedTarget | undefined {
        const row = this.locateNearestRow(clientX, clientY);
        if (row === undefined) {
            return undefined;
        }

        // A hairpin hangs on notes, an f may sit on a rest as well. A move may leave the track, a resize stays in
        // the track the marking belongs to.
        const notesOnly = RangeArticulations.isHairpin(existing);
        const trackId = this.dragHandle === RangeHandle.Move ? row.trackId : existing.trackId;

        // The pointer itself names the target of an f drag and of a resize, so both have to be near it. A hairpin
        // move only takes the note the pointer grabbed, which the marking zone of its row bounds already.
        const carriesHairpin = this.dragHandle === RangeHandle.Move && notesOnly;
        const anchor = this.nearestAnchor(row.bar, trackId, clientX, notesOnly,
            carriesHairpin ? undefined : snapDistancePx);
        if (anchor === undefined) {
            return undefined;
        }

        // A resize follows the pointer itself, so it takes an anchor only where the model accepts the marking. A
        // move names the place and leaves the judgement to its preview and to its drop.
        if (this.dragHandle !== RangeHandle.Move
            && !this.settles(this.resizedArticulation(existing, trackId, anchor))) {
            return undefined;
        }

        return { trackId, anchor };
    }

    /**
     * Ends the active drag and forgets what it carried, whether it was dropped or cancelled. The marking stays where
     * the model has it, so a cancelled drag leaves the arrangement untouched.
     *
     * @param snapsBack True to let the image glide back to the place it came from, which is what a drag that found no
     * place to drop does.
     */
    private endDrag(snapsBack: boolean): void {
        const home = this.dragImageBox?.home;
        this.dragId = undefined;
        this.dragGrabOffset = undefined;
        this.dragImageBox = undefined;
        this.clearDragTarget();

        if (snapsBack && home !== undefined) {
            this.slideDragImageBack(home);
        } else {
            this.removeDragImage();
        }

        this.scheduleRefresh();
    }

    /** Forgets the target, which is what a drag that aims at nothing leaves behind. */
    private clearDragTarget(): void {
        this.dragAnchor = undefined;
        this.dragTrackId = undefined;
    }

    /**
     * @param clientX The pointer's viewport x.
     * @param clientY The pointer's viewport y.
     *
     * @returns The track row a drag aims at, which is the row nearest to the pointer: a drag steers at the notes of a
     * row, so it has to be able to leave the band it started in and reach another track. Undefined when no row lies
     * within the snap distance, which keeps a pointer that left the score from aiming at a row it never reached.
     */
    private locateNearestRow(clientX: number, clientY: number): ILocatedRow | undefined {
        let best: ILocatedRow | undefined;
        let bestDistance = snapDistancePx;

        for (const row of this.contentHost.querySelectorAll<HTMLElement>(".staff-measure-track-row")) {
            const rect = row.getBoundingClientRect();
            if (clientX < rect.left || clientX > rect.right) {
                continue;
            }

            const distance = clientY < rect.top
                ? rect.top - clientY
                : clientY > rect.bottom ? clientY - rect.bottom : 0;

            if (distance >= bestDistance) {
                continue;
            }

            const location = this.registry.getLocation(row);
            if (location !== undefined) {
                bestDistance = distance;
                best = { bar: location.bar, trackId: location.trackId };
            }
        }

        return best;
    }

    /**
     * @returns The marking an active drag would drop, together with whether the model accepts it there. Undefined
     * when no drag is running, or when the dragged place cannot hold the marking at all.
     */
    private dragTarget(): IDragTarget | undefined {
        const moved = this.draggedArticulation();

        return moved === undefined ? undefined : { moved, settles: this.settles(moved) };
    }

    /**
     * @param moved The marking to judge.
     *
     * @returns True when the model would accept that marking at its place, which is what a preview, a live resize and
     * a drop all have to hold.
     */
    private settles(moved: IRangeArticulation): boolean {
        const arrangement = this.dataModel.arrangement;
        if (arrangement === undefined) {
            return false;
        }

        const others = (arrangement.rangeArticulations?.all ?? []).filter((candidate) => {
            return candidate.id !== moved.id;
        });
        const valid = RangeArticulations.isHairpin(moved)
            ? RangeArticulations.isValidHairpin(arrangement, moved)
            : RangeArticulations.isValidForteMark(arrangement, moved);

        return valid && !RangeArticulations.conflicts(moved, others);
    }

    /**
     * @returns The marking the active drag would create: the stored marking with its dragged handle or its dragged
     * body at the anchor the pointer named. Undefined when no drag runs, or when the drag cannot place the marking
     * on the target track.
     */
    private draggedArticulation(): IRangeArticulation | undefined {
        const { dragId, dragAnchor, dragTrackId, dragHandle } = this;
        if (dragId === undefined || dragAnchor === undefined) {
            return undefined;
        }

        const existing = this.articulationById(dragId);
        if (existing === undefined) {
            return undefined;
        }

        const trackId = dragTrackId ?? existing.trackId;

        // A move carries a hairpin along, which is the one drag that has to look at all of the notes it covers.
        if (dragHandle === RangeHandle.Move && RangeArticulations.isHairpin(existing)) {
            return this.movedHairpin(existing, trackId, dragAnchor);
        }

        return this.resizedArticulation(existing, trackId, dragAnchor);
    }

    /**
     * @param existing The marking being dragged.
     * @param trackId The track the marking is dragged in.
     * @param anchor The anchor its dragged end is taken to.
     *
     * @returns The marking a drag of one end to that anchor would create: an f at the anchor, a hairpin with the
     * dragged end there.
     */
    private resizedArticulation(existing: IRangeArticulation, trackId: number,
        anchor: IRangeArticulationAnchor): IRangeArticulation {
        if (!RangeArticulations.isHairpin(existing)) {
            return { ...existing, trackId, at: { ...anchor } };
        }

        const end = this.dragHandle === RangeHandle.From ? HairpinEnd.From : HairpinEnd.To;

        return RangeArticulations.withMovedEnd({ ...existing, trackId }, end, anchor);
    }

    /**
     * @param drag The target the active drag names.
     *
     * @returns The marking a resize shows while it runs: the dragged end follows the pointer, and it only ever took
     * an anchor the model accepted. Undefined for a move, which previews the place it would land at instead.
     */
    private resizedMarking(drag: IDragTarget | undefined): IRangeArticulation | undefined {
        if (this.dragHandle === RangeHandle.Move) {
            return undefined;
        }

        return drag?.moved;
    }

    /**
     * Drops the dragged marking: the place the drag showed becomes its position, which the model commits as one
     * edit. A drag that names no place the model accepts changes nothing.
     */
    private finishDrag(): void {
        const { dragId, dragAnchor, dragHandle } = this;
        const trackId = this.dragTrackId;
        const drag = this.dragTarget();
        if (drag === undefined || !drag.settles || dragId === undefined || dragAnchor === undefined
            || trackId === undefined) {
            // Nothing took the marking, so its image glides back to where it came from.
            this.endDrag(true);

            return;
        }

        this.endDrag(false);

        const { moved } = drag;
        if (dragHandle === RangeHandle.Move) {
            // The marking the drop showed replaces the old one: a hairpin with both of its ends, an f at its event.
            if (RangeArticulations.isHairpin(moved)) {
                this.dataModel.moveHairpin(dragId, trackId, moved.from, moved.to);
            } else {
                this.dataModel.moveForteMark(dragId, trackId, moved.at);
            }

            return;
        }

        const end = dragHandle === RangeHandle.From ? HairpinEnd.From : HairpinEnd.To;
        this.dataModel.moveHairpinAnchor(dragId, trackId, end, dragAnchor);
    }

    private articulationById(id: number): IRangeArticulation | undefined {
        return this.dataModel.arrangement?.rangeArticulations?.find(id);
    }

    /**
     * @param hairpin The hairpin being moved.
     * @param trackId The track it is moved in.
     * @param anchor The anchor the pointer is on.
     *
     * @returns The hairpin at that anchor, with the notes it covered and the place it was grabbed at kept, or
     * undefined when its notes or the anchor do not fit the track.
     */
    private movedHairpin(hairpin: IHairpin, trackId: number,
        anchor: IRangeArticulationAnchor): IHairpin | undefined {
        const moved = RangeArticulations.translate(hairpin, this.noteAnchorsOf(hairpin.trackId),
            this.noteAnchorsOf(trackId), anchor, this.dragGrabOffset ?? 0);

        return moved === undefined ? undefined : { ...moved, trackId };
    }

    /**
     * @param element The element of the marking the press landed on.
     * @param event The pointer event of the press.
     *
     * @returns The box that marking stood in. The image that follows the pointer keeps it, so the marking is carried
     * exactly where it was grabbed.
     */
    private grabBoxOf(element: HTMLElement, event: PointerEvent): IDragImageBox {
        const rect = element.getBoundingClientRect();

        return {
            home: { x: rect.left, y: rect.top },
            grab: { x: event.clientX, y: event.clientY },
            width: rect.width,
            height: rect.height,
        };
    }

    /**
     * @param existing The marking the press landed on.
     * @param clientX The pointer's viewport x.
     *
     * @returns How many notes the grabbed note lies behind the hairpin's first end, which is what a move keeps so the
     * hairpin follows the pointer at the place it was grabbed. Undefined for an f, which has no ends.
     */
    private grabOffsetOf(existing: IRangeArticulation, clientX: number): number | undefined {
        if (!RangeArticulations.isHairpin(existing)) {
            return undefined;
        }

        const grabbed = this.nearestAnchor(undefined, existing.trackId, clientX, true);

        return grabbed === undefined
            ? undefined
            : RangeArticulations.grabOffset(this.noteAnchorsOf(existing.trackId), existing, grabbed);
    }

    private handlePointerLeave = (): void => {
        this.pointerInside = false;
        if (this.dragHandle === RangeHandle.Move) {
            // A move loses its target with the pointer; a resize keeps the width it was dragged to.
            this.clearDragTarget();
        }

        this.removeDragImage();
        this.scheduleRefresh();
    };

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            if (this.tool !== RangeArticulationTool.None) {
                event.stopPropagation();
                this.leaveTool();
            } else if (this.dragId !== undefined) {
                // A drag is a gesture of its own, so Escape ends it without committing it, like a placing mode does.
                event.stopPropagation();
                this.endDrag(true);
            } else if (this.selectedId !== undefined) {
                // A selected marking stands in for the score selection, so Escape takes it back the same way it
                // clears a score selection.
                this.selectedId = undefined;
                this.scheduleRefresh();
            }

            return;
        }

        if (this.tool !== RangeArticulationTool.None || this.dragId !== undefined) {
            return;
        }

        if (event.key !== "Delete" && event.key !== "Backspace") {
            return;
        }

        const { selectedId } = this;
        if (selectedId === undefined) {
            return;
        }

        // The marking owns the key, so deleting it never reaches the score selection behind it.
        event.preventDefault();
        event.stopPropagation();
        this.selectedId = undefined;
        this.dataModel.removeRangeArticulation(selectedId);
    };

    /** Leaves the placing mode and tells the toolbar, which is the one that shows the mode. */
    private leaveTool(): void {
        this.removeDragImage();
        this.pointerInside = false;

        if (this.tool === RangeArticulationTool.None) {
            this.scheduleRefresh();

            return;
        }

        this.tool = RangeArticulationTool.None;
        this.holdPointer(false);
        this.scheduleRefresh();
        void requisitions.execute("rangeArticulationToolChanged", RangeArticulationTool.None);
    }

    /**
     * Places the marking of the active mode at the pointer: the note the pointer names carries it, and a hairpin
     * reaches from there to the nearest note the model accepts, which the user then sizes by its handles.
     *
     * @param clientX The pointer's viewport x.
     * @param clientY The pointer's viewport y.
     */
    private placeMarking(clientX: number, clientY: number): void {
        const row = this.locateRow(clientX, clientY);
        const notesOnly = this.tool === RangeArticulationTool.Hairpin;
        const anchor = row === undefined
            ? undefined
            : this.nearestAnchor(row.bar, row.trackId, clientX, notesOnly);
        if (row === undefined || anchor === undefined) {
            return;
        }

        if (this.tool === RangeArticulationTool.Forte) {
            this.dataModel.insertForteMark(row.trackId, anchor);
        } else {
            const hairpin = this.initialHairpin(row.trackId, anchor);
            if (hairpin !== undefined) {
                this.dataModel.insertHairpin(hairpin.kind, row.trackId, hairpin.from, hairpin.to);
            }
        }

        this.leaveTool();
    }

    /**
     * @param trackId The track the clicked anchor belongs to.
     * @param from The anchor the click named.
     *
     * @returns The hairpin a click places: it opens towards the nearest note after the clicked one, and towards the
     * nearest note before it when nothing after it works. The next note may lie in a following measure, so a
     * hairpin may reach over the barline. Undefined when the track holds no such note.
     */
    private initialHairpin(trackId: number, from: IRangeArticulationAnchor): IHairpin | undefined {
        const anchors = this.noteAnchorsOf(trackId);
        const index = anchors.findIndex((candidate) => {
            return RangeArticulations.compareAnchors(candidate, from) === 0;
        });
        if (index < 0) {
            return undefined;
        }

        // The nearest note after the clicked one first, then the nearest one before it.
        const candidates = [...anchors.slice(index + 1), ...anchors.slice(0, index).reverse()];

        for (const candidate of candidates) {
            const draft = this.hairpinDraft(from, candidate, trackId);
            if (draft?.valid) {
                return draft.hairpin;
            }
        }

        return undefined;
    }

    /**
     * Builds the hairpin a gesture between two anchors would create and checks it against the model rules.
     *
     * @param tip The anchor the gesture started on.
     * @param other The anchor the pointer currently names.
     * @param trackId The track both anchors belong to.
     *
     * @returns The draft hairpin and whether it may be committed, or undefined when both anchors are the same.
     */
    private hairpinDraft(tip: IRangeArticulationAnchor, other: IRangeArticulationAnchor,
        trackId: number): IHairpinDraft | undefined {
        const comparison = RangeArticulations.compareAnchors(tip, other);
        if (comparison === 0) {
            return undefined;
        }

        const from = comparison < 0 ? tip : other;
        const to = comparison < 0 ? other : tip;
        const kind = comparison < 0 ? RangeArticulationKind.Crescendo : RangeArticulationKind.Decrescendo;
        const hairpin: IHairpin = { id: 0, trackId, kind, from: { ...from }, to: { ...to } };

        const arrangement = this.dataModel.arrangement;
        const valid = arrangement !== undefined
            && RangeArticulations.isValidHairpin(arrangement, hairpin)
            && !RangeArticulations.conflicts(hairpin, arrangement.rangeArticulations?.all ?? []);

        return { hairpin, valid };
    }

    private refresh(): void {
        this.updateMetrics();

        const layer = this.ensureLayer();
        if (layer === undefined) {
            return;
        }

        layer.replaceChildren();
        if (!this.staffMode) {
            return;
        }

        const arrangement = this.dataModel.arrangement;
        if (arrangement === undefined) {
            return;
        }

        const drag = this.dragTarget();

        // A resize edits the marking itself and follows the pointer live, because its handles belong to the marking.
        // A move leaves the marking where it is and previews the place it would land at instead.
        const resized = this.resizedMarking(drag);

        for (const articulation of arrangement.rangeArticulations?.all ?? []) {
            const shown = articulation.id === this.dragId && resized !== undefined ? resized : articulation;
            const element = this.buildMarking(shown);
            if (element !== undefined) {
                element.dataset.articulationId = `${articulation.id}`;
                layer.append(element);
            }

            if (articulation.id === this.selectedId) {
                for (const handle of this.buildHandles(shown)) {
                    layer.append(handle);
                }

                // A marking without handles says it is selected through its colour, like a selected note does.
                if (element !== undefined) {
                    element.classList.add("range-articulation-selected");
                }
            }
        }

        this.renderPreview(layer);
        this.renderDragPreview(layer, drag);
    }

    /** @returns The layer the markings are drawn into, creating it on first use. */
    private ensureLayer(): HTMLElement | undefined {
        this.decorationLayer ??= this.contentHost.querySelector<HTMLElement>(`#${layerId}`) ?? undefined;

        return this.decorationLayer;
    }

    private updateMetrics(): void {
        const style = getComputedStyle(document.documentElement);
        const contentWidth = this.contentHost.offsetWidth;
        const viewportWidth = this.contentHost.getBoundingClientRect().width;
        this.zoomFactor = contentWidth > 0 ? viewportWidth / contentWidth : 1;

        const thickness = Number.parseFloat(style.getPropertyValue("--hairpin-thickness"));
        this.strokeWidth = Number.isFinite(thickness) && thickness > 0 ? thickness : staffSpacePx * 0.16;
    }

    /**
     * @param row The track row to measure.
     *
     * @returns The middle of the row's marking band, in the content's own pixel space. The row geometry states it as
     *          the band's offset from the row's middle, which sits below the notation's ink so a hairpin clears the
     *          accents. Falls back to the band below the staff for a row that states none.
     */
    private bandMiddleOf(row: HTMLElement): number | undefined {
        const bandCentre = Number.parseFloat(
            getComputedStyle(row).getPropertyValue("--staff-band-centre"),
        );
        const hostRect = this.contentHost.getBoundingClientRect();

        if (Number.isFinite(bandCentre)) {
            const rect = row.getBoundingClientRect();

            return ((rect.top - hostRect.top) / this.zoomFactor)
                + ((rect.height / this.zoomFactor) / 2) + bandCentre;
        }

        const bottom = this.staffBottomOf(row);

        return bottom === undefined ? undefined : bottom + (staffSpacePx * 2);
    }

    /**
     * @param row The track row to measure.
     *
     * @returns The bottom edge of the row's staff, in the content's own pixel space: the lowest line the row
     * draws, which is what every marking of the row stands below.
     */
    private staffBottomOf(row: HTMLElement): number | undefined {
        const lines = Array.from(row.querySelectorAll<HTMLElement>(".staff-note-viewer-line"));
        const lowest = lines.at(-1);
        if (lowest === undefined) {
            return undefined;
        }

        const hostRect = this.contentHost.getBoundingClientRect();
        const rect = lowest.getBoundingClientRect();

        return (rect.bottom - hostRect.top) / this.zoomFactor;
    }

    /**
     * @param bar The measure to search in.
     * @param trackId The track to search in.
     * @param anchor The anchor to resolve.
     *
     * @returns The point in the row's marking band above the anchor's event, in the content's own pixel space.
     */
    private anchorPoint(bar: number, trackId: number, anchor: IRangeArticulationAnchor): IPoint | undefined {
        const runs = this.registry.findElements(ScoreElementKind.StaffRun, bar, trackId);
        const hostRect = this.contentHost.getBoundingClientRect();

        for (const run of runs) {
            const location = this.registry.getLocation(run);
            if (location?.start === undefined || compareFractions(location.start, anchor.start) !== 0) {
                continue;
            }

            const symbol = run.querySelector<HTMLElement>(".staff-note-head, .staff-note-viewer-rest-symbol") ?? run;
            const rect = symbol.getBoundingClientRect();
            const row = run.closest<HTMLElement>(".staff-measure-track-row");
            const bandY = row === null ? undefined : this.bandMiddleOf(row);

            return {
                x: (rect.left + (rect.width / 2) - hostRect.left) / this.zoomFactor,
                y: bandY ?? (rect.bottom - hostRect.top) / this.zoomFactor,
            };
        }

        return undefined;
    }

    /**
     * @param clientX The pointer's viewport x.
     * @param clientY The pointer's viewport y.
     *
     * @returns The track row whose band holds the position, or undefined outside a band. A marking stands in the
     * band the row geometry places below the row's notation, so the row's own box holds it.
     */
    private locateRow(clientX: number, clientY: number): ILocatedRow | undefined {
        for (const row of this.contentHost.querySelectorAll<HTMLElement>(".staff-measure-track-row")) {
            const rect = row.getBoundingClientRect();
            if (clientX < rect.left || clientX > rect.right) {
                continue;
            }

            if (clientY < rect.top || clientY > rect.bottom) {
                continue;
            }

            const location = this.registry.getLocation(row);
            if (location !== undefined) {
                return { bar: location.bar, trackId: location.trackId };
            }
        }

        return undefined;
    }

    /**
     * Resolves the event that lies nearest to a viewport x.
     *
     * @param bar Optional one-based measure to search in, which the placing modes pass because their click names the
     * measure it landed in. A drag searches every rendered measure, so its hairpin can travel over a barline.
     * @param trackId The track to search in.
     * @param clientX The pointer's viewport x.
     * @param notesOnly True to consider sounding notes only, which is what a hairpin anchors to.
     * @param withinPx Optional greatest distance a candidate may lie at, in viewport px. A drag passes it, so it only
     * snaps to a note the pointer is really near.
     *
     * @returns The nearest event's anchor, or undefined when no candidate lies that close.
     */
    private nearestAnchor(bar: number | undefined, trackId: number, clientX: number, notesOnly: boolean,
        withinPx?: number): IRangeArticulationAnchor | undefined {
        let best: IRangeArticulationAnchor | undefined;
        let bestDistance = withinPx ?? Number.POSITIVE_INFINITY;

        for (const run of this.registry.findElements(ScoreElementKind.StaffRun, bar, trackId)) {
            const target = this.registry.getTarget(run);
            const location = this.registry.getLocation(run);
            if (target === undefined || location === undefined || !("duration" in target)) {
                continue;
            }

            const event = target;
            if (notesOnly && event.noteStyleId === undefined) {
                continue;
            }

            const symbol = run.querySelector<HTMLElement>(".staff-note-head, .staff-note-viewer-rest-symbol") ?? run;
            const rect = symbol.getBoundingClientRect();
            const distance = Math.abs(clientX - (rect.left + (rect.width / 2)));
            if (distance < bestDistance) {
                bestDistance = distance;
                best = { bar: location.bar, start: { ...event.start } };
            }
        }

        return best;
    }

    private buildMarking(articulation: IRangeArticulation,
        className = "range-articulation"): HTMLElement | undefined {
        if (RangeArticulations.isHairpin(articulation)) {
            return this.buildHairpinMarking(articulation, className);
        }

        const point = this.anchorPoint(articulation.at.bar, articulation.trackId, articulation.at);

        return point === undefined
            ? undefined
            : this.buildForteElement(point, `${className} range-articulation-forte`);
    }

    private buildHairpinMarking(hairpin: IHairpin, className = "range-articulation"): HTMLElement | undefined {
        const from = this.anchorPoint(hairpin.from.bar, hairpin.trackId, hairpin.from);
        const to = this.anchorPoint(hairpin.to.bar, hairpin.trackId, hairpin.to);
        if (from === undefined || to === undefined) {
            return undefined;
        }

        return this.buildHairpinElement(hairpin.kind, from, to, className);
    }

    /**
     * @param articulation The selected marking to build the handles for.
     *
     * @returns The handles a drag moves, which are the two ends of a hairpin. An f holds a single position that no
     * handle moves, so it shows none.
     */
    private buildHandles(articulation: IRangeArticulation): HTMLElement[] {
        if (!RangeArticulations.isHairpin(articulation)) {
            return [];
        }

        const handles: HTMLElement[] = [];
        const from = this.anchorPoint(articulation.from.bar, articulation.trackId, articulation.from);
        const to = this.anchorPoint(articulation.to.bar, articulation.trackId, articulation.to);
        if (from !== undefined) {
            handles.push(this.buildHandle(articulation.id, "from", from));
        }

        if (to !== undefined) {
            handles.push(this.buildHandle(articulation.id, "to", to));
        }

        return handles;
    }

    private buildHandle(id: number, end: string, point: IPoint): HTMLElement {
        const handle = document.createElement("div");
        handle.className = "range-articulation-handle";
        handle.dataset.articulationId = `${id}`;
        handle.dataset.end = end;
        handle.style.left = `${point.x}px`;
        handle.style.top = `${point.y}px`;

        return handle;
    }

    private buildForteElement(point: IPoint, className: string): HTMLElement {
        const element = document.createElement("div");
        element.className = className;
        element.style.left = `${point.x}px`;
        element.style.top = `${point.y}px`;
        render(createElement(ScoreSymbolView, {
            symbol: ScoreSymbol.Forte,
            staffSpace: staffSpacePx,
            inkBox: true,
        }), element);

        return element;
    }

    /**
     * Draws a hairpin as line geometry: two strokes that meet in the tip and open towards the other anchor.
     *
     * @param kind Whether the hairpin opens with a rising or a falling level.
     * @param from The chronologically first anchor's point.
     * @param to The chronologically second anchor's point.
     * @param className The class the element is drawn with, which also decides its layer.
     *
     * @returns The hairpin element, placed below the row it belongs to.
     */
    private buildHairpinElement(kind: RangeArticulationKind, from: IPoint, to: IPoint,
        className: string): HTMLElement {
        const opening = staffSpacePx * hairpinOpeningSpaces;
        const tip = kind === RangeArticulationKind.Crescendo ? from : to;
        const open = kind === RangeArticulationKind.Crescendo ? to : from;
        const width = Math.max(Math.abs(open.x - tip.x), minimumHairpinWidthPx);

        const element = this.buildHairpinGeometry(kind, width, opening, this.strokeWidth);
        element.className = className;
        element.style.left = `${Math.min(tip.x, open.x)}px`;
        element.style.top = `${tip.y - (opening / 2)}px`;

        return element;
    }

    /**
     * Draws a hairpin as line geometry, positioned at its own origin. Callers place the result, which is what lets the
     * score and the image that follows the pointer share one drawing.
     *
     * @param kind Whether the hairpin opens with a rising or a falling level.
     * @param width The width of the span between its ends, in px.
     * @param opening The height it opens to, in px.
     * @param strokeWidth The width of its strokes, in px.
     *
     * @returns The hairpin geometry.
     */
    private buildHairpinGeometry(kind: RangeArticulationKind, width: number, opening: number,
        strokeWidth: number): HTMLElement {
        const element = document.createElement("div");
        element.style.width = `${width}px`;
        element.style.height = `${opening}px`;

        const svg = document.createElementNS(svgNamespace, "svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${opening}`);
        svg.setAttribute("preserveAspectRatio", "none");

        const tipX = kind === RangeArticulationKind.Crescendo ? 0 : width;
        const openX = kind === RangeArticulationKind.Crescendo ? width : 0;
        const path = document.createElementNS(svgNamespace, "path");
        path.setAttribute("d", `M ${tipX} ${opening / 2} L ${openX} 0 M ${tipX} ${opening / 2} L ${openX} ${opening}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", `${strokeWidth}`);
        svg.append(path);
        element.append(svg);

        return element;
    }

    /**
     * Draws the content of the active placing mode: the marking the pointer position would place, dimmed, so the
     * user sees where it lands before the click does it.
     *
     * @param layer The layer the preview is drawn into.
     */
    private renderPreview(layer: HTMLElement): void {
        if (this.tool === RangeArticulationTool.None || !this.pointerInside) {
            return;
        }

        const row = this.locateRow(this.lastPointerX, this.lastPointerY);
        const notesOnly = this.tool === RangeArticulationTool.Hairpin;
        const anchor = row === undefined
            ? undefined
            : this.nearestAnchor(row.bar, row.trackId, this.lastPointerX, notesOnly);
        if (row === undefined || anchor === undefined) {
            return;
        }

        if (this.tool === RangeArticulationTool.Forte) {
            const point = this.anchorPoint(row.bar, row.trackId, anchor);
            if (point !== undefined && this.forteWouldSettle(row.trackId, anchor)) {
                layer.append(this.buildForteElement(point,
                    "range-articulation range-articulation-forte range-articulation-preview"));
            }

            return;
        }

        const hairpin = this.initialHairpin(row.trackId, anchor);
        if (hairpin === undefined) {
            return;
        }

        const from = this.anchorPoint(hairpin.from.bar, row.trackId, hairpin.from);
        const to = this.anchorPoint(hairpin.to.bar, row.trackId, hairpin.to);
        if (from !== undefined && to !== undefined) {
            layer.append(this.buildHairpinElement(hairpin.kind, from, to,
                "range-articulation range-articulation-preview"));
        }
    }

    /**
     * Draws where a dragged marking would land: the marking itself, dimmed, at the event the pointer names, the way
     * a placing mode shows what a click would place. The stored marking keeps its place until the drop.
     *
     * @param layer The layer the preview is drawn into.
     * @param drag The target the active drag names.
     */
    private renderDragPreview(layer: HTMLElement, drag: IDragTarget | undefined): void {
        if (drag === undefined || !drag.settles || this.dragHandle !== RangeHandle.Move) {
            return;
        }

        const preview = this.buildMarking(drag.moved, "range-articulation range-articulation-preview");
        if (preview !== undefined) {
            layer.append(preview);
        }
    }

    /**
     * @param trackId The track the marking would belong to.
     * @param anchor The anchor the click would place it at.
     *
     * @returns True when the model would accept an `f` there. The preview shows only what a click would really
     * place, so a position that the model refuses — a missing event or a hairpin in the way — shows nothing.
     */
    private forteWouldSettle(trackId: number, anchor: IRangeArticulationAnchor): boolean {
        const arrangement = this.dataModel.arrangement;
        if (arrangement === undefined) {
            return false;
        }

        const mark: IForteMark = {
            id: 0,
            trackId,
            kind: RangeArticulationKind.Forte,
            at: anchor,
        };

        return RangeArticulations.isValidForteMark(arrangement, mark)
            && !RangeArticulations.conflicts(mark, arrangement.rangeArticulations?.all ?? []);
    }

    /**
     * @param trackId The track to look through.
     *
     * @returns The note anchors of the track that are rendered right now, in chronological order. The staff view
     * renders a window of measures only, so the list ends at its edges.
     */
    private noteAnchorsOf(trackId: number): IRangeArticulationAnchor[] {
        const anchors: IRangeArticulationAnchor[] = [];

        for (const run of this.registry.findElements(ScoreElementKind.StaffRun, undefined, trackId)) {
            const target = this.registry.getTarget(run);
            const location = this.registry.getLocation(run);
            if (target === undefined || location === undefined || !("duration" in target)
                || target.noteStyleId === undefined) {
                continue;
            }

            anchors.push({ bar: location.bar, start: { ...target.start } });
        }

        return anchors.sort((left, right) => {
            return RangeArticulations.compareAnchors(left, right);
        });
    }

    /**
     * Shows the image that follows the pointer.
     *
     * @param clientX The pointer's viewport x.
     * @param clientY The pointer's viewport y.
     * @param source The marking the pointer carries, or undefined while a placing mode draws a marking that does not
     * exist yet.
     */
    private showDragImage(clientX: number, clientY: number, source?: IRangeArticulation): void {
        if (this.dragImage === undefined) {
            this.dragImage = this.buildDragImage(source);
            document.body.append(this.dragImage);
        }

        // A carried marking sits at the place it was grabbed, so its ends stay where the user had them. The icon of a
        // placing tool has no such place, so it keeps following right of the cursor.
        const box = source === undefined ? undefined : this.dragImageBox;
        if (box === undefined) {
            this.dragImage.style.left = `${clientX + dragImageOffsetPx}px`;
            this.dragImage.style.top = `${clientY}px`;

            return;
        }

        this.dragImage.style.left = `${clientX + box.home.x - box.grab.x}px`;
        this.dragImage.style.top = `${clientY + box.home.y - box.grab.y}px`;
    }

    /**
     * Lets the image of a carried marking glide back to the place it was taken from, which is what a platform does
     * when a drag ends over something that cannot take it.
     *
     * @param home The place the carried marking stood at, in viewport px.
     */
    private slideDragImageBack(home: IPoint): void {
        const image = this.dragImage;
        if (image === undefined) {
            return;
        }

        this.dragImage = undefined;
        this.returningImage = image;

        const animation = image.animate([
            { left: image.style.left, top: image.style.top },
            { left: `${home.x}px`, top: `${home.y}px` },
        ], { duration: dragReturnMs, easing: "ease-out", fill: "forwards" });
        const release = (): void => {
            image.remove();
            if (this.returningImage === image) {
                this.returningImage = undefined;
            }
        };

        animation.onfinish = release;
    }

    /**
     * @param source The marking the image stands for, or undefined for the marking a placing mode would create.
     *
     * @returns The image that follows the pointer: the marking drawn the way the score draws it, or the icon of the
     * placing tool.
     */
    private buildDragImage(source: IRangeArticulation | undefined): HTMLElement {
        const image = document.createElement("div");
        image.className = "range-articulation-drag-image";

        if (source === undefined) {
            this.appendToolIcon(image);

            return image;
        }

        // A carried marking repeats itself in the size it has in the score, so the grab offset placed it right.
        image.classList.add("range-articulation-drag-image-carried");
        if (this.dragImageBox !== undefined) {
            image.style.width = `${this.dragImageBox.width}px`;
            image.style.height = `${this.dragImageBox.height}px`;
        }

        if (RangeArticulations.isHairpin(source)) {
            this.appendHairpin(image, source);
        } else {
            // The ink box is what the score draws for an f, so the image matches its size and its place.
            render(createElement(ScoreSymbolView, {
                symbol: ScoreSymbol.Forte, staffSpace: staffSpacePx, inkBox: true,
            }), image);
        }

        return image;
    }

    /**
     * Shows a carried hairpin the way the score draws it, scaled to the zoom of the space the image is drawn in.
     *
     * @param image The image to draw into.
     * @param hairpin The hairpin the pointer carries.
     */
    private appendHairpin(image: HTMLElement, hairpin: IHairpin): void {
        const from = this.anchorPoint(hairpin.from.bar, hairpin.trackId, hairpin.from);
        const to = this.anchorPoint(hairpin.to.bar, hairpin.trackId, hairpin.to);
        if (from === undefined || to === undefined) {
            this.appendToolIcon(image);

            return;
        }

        // The image repeats the hairpin as it stands in the score, scaled to the zoom of the space it is drawn in.
        const width = Math.max(Math.abs(to.x - from.x), minimumHairpinWidthPx) * this.zoomFactor;
        const opening = staffSpacePx * hairpinOpeningSpaces * this.zoomFactor;
        image.append(this.buildHairpinGeometry(hairpin.kind, width, opening, this.strokeWidth * this.zoomFactor));
    }

    /**
     * Shows the icon of the active tool, which stands for a marking that does not exist yet.
     *
     * @param image The image to draw into.
     */
    private appendToolIcon(image: HTMLElement): void {
        if (this.tool === RangeArticulationTool.Forte) {
            render(createElement(ScoreSymbolView, { symbol: ScoreSymbol.Forte, staffSpace: staffSpacePx }), image);

            return;
        }

        const svg = document.createElementNS(svgNamespace, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "24");
        svg.setAttribute("height", "24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("aria-hidden", "true");

        const path = document.createElementNS(svgNamespace, "path");
        path.setAttribute("d", "M20 7 L4 12 L20 17");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.append(path);
        image.append(svg);
    }

    private removeDragImage(): void {
        if (this.dragImage !== undefined) {
            render(null, this.dragImage);
            this.dragImage.remove();
            this.dragImage = undefined;
        }
    }
}
