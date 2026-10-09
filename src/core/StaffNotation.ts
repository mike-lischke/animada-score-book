/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { articulationFromSampleProfile } from "./articulation.js";
import { BeamGeometry, normalStemLengthSpaces, type IBeamNotePlan } from "./BeamGeometry.js";
import { staffSpacePx } from "./MeasureLayout.js";
import {
    MeasureProjection, NoteGroupKind, ProjectedItemKind, pulseLengthAt,
    type INotationGrid, type IProjectedEvent, type IProjectedItem,
} from "./MeasureProjection.js";
import { beamCountOf, fallbackNoteValue, noteValueForEvent, NoteLength, type INoteValue } from "./rest-notation.js";
import { NoteDisplayType, type INoteArticulation, type ISbDmTrackPiece } from "./ScoreBookDataModel.js";
import { HeadMark, StaffInk, type IStaffInk, type IStaffInkNote } from "./StaffInk.js";
import type { IAudioData, IFraction, ISubdivision } from "./types/general.js";

/** Discriminator for staff tree nodes. */
export enum StaffNodeKind {
    Note,
    Subdivision,
}

export interface IStaffNoteNode {
    kind: StaffNodeKind.Note;

    /** Index of this note's event in `ISbDmTrackPiece.events`, matching the resolved note events 1:1. */
    eventIndex: number;

    /** Absolute start within the measure, as a fraction of the whole bar. */
    start: IFraction;

    duration: IFraction;

    /** Tuplet nesting depth (0 at the top level). */
    depth: number;

    glyph: INoteValue;
    beamCount: number;
    displayType: NoteDisplayType;
    noteLine?: number;
    noteStyle?: IAudioData;
    articulation?: INoteArticulation;
}

export interface IStaffSubdivisionNode {
    kind: StaffNodeKind.Subdivision;

    /** The subdivision group in the model, which identifies the group a click addresses. */
    group: ISubdivision;

    start: IFraction;
    span: IFraction;
    actual: number;
    normal: number;
    isTuplet: boolean;
    depth: number;
    children: IStaffTreeNode[];
}

export type IStaffTreeNode = IStaffNoteNode | IStaffSubdivisionNode;

/** What a measure's notation looks like: its node tree and the engraving of its beamed notes. */
export interface IStaffNotation {
    nodes: IStaffTreeNode[];

    /** Map of note event indices to their beam engraving. */
    beamSpans: Map<number, IBeamNotePlan>;
}

/**
 * Resolves the notation a staff row draws, independent of the DOM: the measure's projected items as a node tree,
 * the engraving of its beamed notes, and the ink the notation takes around the row's staff line. The renderer and
 * the row geometry both build on this, so a row is measured with the same rules that draw it.
 */
export class StaffNotation {
    /**
     * @param measure The measure to project.
     * @param grid The arrangement's timing grid.
     * @param centerLine The line the row is drawn around.
     * @param rowWidthPx The row's content width in px, which a beam's slope is derived from.
     *
     * @returns The measure's node tree and the beam engraving of its beamed notes.
     */
    public static project(measure: ISbDmTrackPiece, grid: INotationGrid, centerLine: number,
        rowWidthPx: number): IStaffNotation {
        // A simile holds no content of its own; its mark replaces the notes the measure would draw.
        const items = measure.simile === true ? [] : MeasureProjection.project(measure);
        const nodes = StaffNotation.buildNodes(items, measure, grid);
        const beamSpans = StaffNotation.computeBeamSpans(nodes, measure, grid, centerLine, rowWidthPx);

        return { nodes, beamSpans };
    }

    /**
     * @param nodes The node tree to flatten.
     *
     * @returns Every note node of the tree, in measure order.
     */
    public static collectNotes(nodes: IStaffTreeNode[]): IStaffNoteNode[] {
        const notes: IStaffNoteNode[] = [];

        for (const node of nodes) {
            if (node.kind === StaffNodeKind.Note) {
                notes.push(node);
            } else {
                notes.push(...StaffNotation.collectNotes(node.children));
            }
        }

        return notes;
    }

    /**
     * @param nodes The nodes the row draws.
     * @param beamSpans The beam engraving of the row's beamed notes.
     * @param centerLine The line the row is drawn around.
     *
     * @returns The room the row's notation takes around its reference line.
     */
    public static rowInk(nodes: IStaffTreeNode[], beamSpans: Map<number, IBeamNotePlan>,
        centerLine: number): IStaffInk {
        const notes = StaffNotation.collectNotes(nodes).map((note): IStaffInkNote => {
            const plan = beamSpans.get(note.eventIndex);
            const hasStem = plan !== undefined
                || (note.noteStyle !== undefined && note.glyph.length !== NoteLength.Whole);

            return {
                noteLine: note.noteStyle === undefined ? undefined : (note.noteLine ?? 1),
                stemLengthSpaces: plan !== undefined
                    ? plan.stemLengthPx / staffSpacePx
                    : (hasStem ? normalStemLengthSpaces : undefined),
                beamCount: plan?.strokes.length ?? 0,
                marks: StaffNotation.headMarksOf(note),
            };
        });

        return StaffInk.ofRow(notes, centerLine);
    }

    /**
     * @param note The note to inspect.
     *
     * @returns The marks the note carries. The renderer draws them and the ink bounds reserve their room, so both
     *          read the same rule and a mark that is added to {@link HeadMark} is drawn and fitted in one place.
     */
    public static headMarksOf(note: IStaffNoteNode): HeadMark[] {
        const marks: HeadMark[] = [];

        if (note.articulation?.accent === true) {
            marks.push(HeadMark.Accent);
        }

        if (note.articulation?.ghost === true) {
            marks.push(HeadMark.GhostParenthesis);
        }

        if (note.glyph.dotted) {
            marks.push(HeadMark.Dot);
        }

        return marks;
    }

    /**
     * Converts projected render items into the staff tree, enriching note events with glyph,
     * beam and style data resolved from the measure's note events.
     *
     * @param items The projected items to convert.
     * @param measure The measure the items belong to.
     * @param grid The timing of the arrangement.
     * @param depth The subdivision nesting depth (0 at the top level).
     *
     * @returns The staff tree nodes.
     */
    private static buildNodes(items: IProjectedItem[], measure: ISbDmTrackPiece, grid: INotationGrid,
        depth = 0): IStaffTreeNode[] {
        return items.map((item) => {
            if (item.kind === ProjectedItemKind.Subdivision) {
                return {
                    kind: StaffNodeKind.Subdivision,
                    group: item.group,
                    start: { ...item.start },
                    span: { ...item.span },
                    actual: item.actual,
                    normal: item.normal,
                    isTuplet: item.isTuplet,
                    depth,
                    children: StaffNotation.buildNodes(item.items, measure, grid, depth + 1),
                };
            }

            return StaffNotation.buildNoteNode(item, measure, grid, depth);
        });
    }

    private static buildNoteNode(item: IProjectedEvent, measure: ISbDmTrackPiece, grid: INotationGrid,
        depth: number): IStaffNoteNode {
        const event = item.event;
        const audioData = event.noteStyleId !== undefined
            ? measure.noteEvents[item.eventIndex]?.audioData
            : undefined;

        let glyph: INoteValue = fallbackNoteValue;
        let beamCount = 0;

        if (audioData) {
            // A slot of a plain subdivision can hold a length the grid cannot address — a 2:1 split
            // of a step holds thirty-seconds — and must keep the beams of that length.
            glyph = noteValueForEvent(event.duration, depth, grid.stepsPerBar,
                pulseLengthAt(event.start, grid)) ?? fallbackNoteValue;
            beamCount = beamCountOf(glyph.length);
        }

        let displayType = NoteDisplayType.Oval;
        let noteLine: number | undefined;

        if (audioData) {
            displayType = StaffNotation.displayTypeOf(audioData);
            noteLine = audioData.noteLine;
        }

        return {
            kind: StaffNodeKind.Note,
            eventIndex: item.eventIndex,
            start: { ...event.start },
            duration: { ...event.duration },
            depth,
            glyph,
            beamCount,
            displayType,
            noteLine,
            noteStyle: audioData,
            articulation: event.articulation ?? (audioData
                ? articulationFromSampleProfile(audioData.sampleProfile)
                : undefined),
        };
    }

    /**
     * Resolves the beam engraving of every note from the measure's beam groups. Which events share a
     * beam is a composition rule of the measure and not of the rendering, so the groups come from
     * `MeasureProjection`; `BeamGeometry` then derives the one line a group shares and the strokes and
     * stem endpoints that follow from it.
     *
     * @param nodes The nodes holding the render data of the measure's events.
     * @param measure The measure the nodes belong to.
     * @param grid Timing metrics for the grouping rules.
     * @param centerLine The line the row is drawn around.
     * @param rowWidthPx The row's content width in px, which a beam's slope is derived from.
     *
     * @returns Map of note event indices to their beam engraving.
     */
    private static computeBeamSpans(nodes: IStaffTreeNode[], measure: ISbDmTrackPiece, grid: INotationGrid,
        centerLine: number, rowWidthPx: number): Map<number, IBeamNotePlan> {
        const target = new Map<number, IBeamNotePlan>();
        const notesByEvent = new Map<number, IStaffNoteNode>();
        const halfStep = 1 / (2 * grid.stepsPerBar);

        for (const note of StaffNotation.collectNotes(nodes)) {
            notesByEvent.set(note.eventIndex, note);
        }

        for (const group of MeasureProjection.noteGroups(measure, grid)) {
            if (group.kind !== NoteGroupKind.Beam) {
                continue;
            }

            const run: IStaffNoteNode[] = [];
            for (const eventIndex of group.eventIndexes) {
                const note = notesByEvent.get(eventIndex);
                if (note !== undefined) {
                    run.push(note);
                }
            }

            if (run.length === 0) {
                continue;
            }

            const plans = BeamGeometry.plan(run.map((note) => {
                return {
                    anchor: StaffNotation.fractionValue(note.start) + halfStep,
                    noteLine: note.noteLine ?? 1,
                    beamCount: note.beamCount,
                };
            }), { centerLine, rowWidthPx });

            run.forEach((note, index) => {
                target.set(note.eventIndex, plans[index]);
            });
        }

        return target;
    }

    private static displayTypeOf(noteStyle: IAudioData): NoteDisplayType {
        if ("mainDisplayType" in noteStyle.characteristics) {
            return noteStyle.characteristics.mainDisplayType!;
        }

        return NoteDisplayType.Oval;
    }

    private static fractionValue(fraction: IFraction): number {
        return fraction.numerator / fraction.denominator;
    }
}
