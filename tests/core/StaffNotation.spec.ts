/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import type { INotationGrid } from "../../src/core/MeasureProjection.js";
import { Damping, NoteDisplayType, type ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
import { NoteLength } from "../../src/core/rest-notation.js";
import { HeadMark } from "../../src/core/StaffInk.js";
import {
    StaffNodeKind, StaffNotation, type IStaffNoteNode, type IStaffSubdivisionNode, type IStaffTreeNode,
} from "../../src/core/StaffNotation.js";
import type { ISubdivision } from "../../src/core/types/general.js";

/** A 4/4 grid, which is all the notation rules these tests call need. */
const grid: INotationGrid = { stepsPerBar: 16, beatGroups: [4, 4, 4, 4] };

/**
 * @param noteLine The staff line the resolved note sits on.
 *
 * @returns Audio data for a note on that line, as the track player resolves it.
 */
const audioDataOf = (noteLine: number) => {
    return { id: "1", noteLine, characteristics: {}, sampleProfile: {} };
};

/**
 * Builds a one-measure piece holding a single quarter note on the given staff line.
 *
 * @param noteLine The staff line the note sits on.
 * @param accent Whether the note carries an accent.
 *
 * @returns A minimal track piece holding one sounding note.
 */
const measureWithNote = (noteLine: number, accent = false): ISbDmTrackPiece => {
    return {
        events: [{
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 4 },
            noteStyleId: "1",
            articulation: accent ? { damping: Damping.Open, accent: true, ghost: false } : undefined,
        }],
        subdivisions: [],
        meter: { stepResolution: 16 },
        noteEvents: [{ audioData: audioDataOf(noteLine) }],
    } as unknown as ISbDmTrackPiece;
};

/**
 * Builds a note node the tests can place in a tree by hand.
 *
 * @param eventIndex The index of the note's event in its measure.
 * @param options The marks the note carries.
 * @param options.accent Whether the note carries an accent.
 * @param options.ghost Whether the note carries ghost parentheses.
 * @param options.dotted Whether the note carries an augmentation dot.
 *
 * @returns A note node with the given event index and marks.
 */
const noteNode = (eventIndex: number,
    options: { accent?: boolean; ghost?: boolean; dotted?: boolean; } = {}): IStaffNoteNode => {
    const carriesArticulation = options.accent === true || options.ghost === true;

    return {
        kind: StaffNodeKind.Note,
        eventIndex,
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 4 },
        depth: 0,
        glyph: { length: NoteLength.Quarter, dotted: options.dotted === true },
        beamCount: 0,
        displayType: NoteDisplayType.Oval,
        articulation: carriesArticulation
            ? { damping: Damping.Open, accent: options.accent === true, ghost: options.ghost === true }
            : undefined,
    };
};

/**
 * @param children The nodes the subdivision holds.
 *
 * @returns A tuplet subdivision node wrapping the given children.
 */
const subdivisionNode = (children: IStaffTreeNode[]): IStaffSubdivisionNode => {
    return {
        kind: StaffNodeKind.Subdivision,
        group: {} as ISubdivision,
        start: { numerator: 0, denominator: 1 },
        span: { numerator: 1, denominator: 4 },
        actual: 3,
        normal: 2,
        isTuplet: true,
        depth: 0,
        children,
    };
};

describe("StaffNotation", () => {
    describe("project", () => {
        it("builds a note node for the event of a measure", () => {
            const { nodes, beamSpans } = StaffNotation.project(measureWithNote(1), grid, 1, 100);

            expect(nodes).toHaveLength(1);
            expect(nodes[0].kind).toBe(StaffNodeKind.Note);
            expect(beamSpans.size).toBe(0);
        });

        it("builds no nodes for a simile measure", () => {
            const measure = measureWithNote(1);
            measure.simile = true;

            const { nodes } = StaffNotation.project(measure, grid, 1, 100);

            expect(nodes).toHaveLength(0);
        });
    });

    describe("collectNotes", () => {
        it("reaches the notes inside nested subdivisions, in measure order", () => {
            const tree: IStaffTreeNode[] = [
                noteNode(0),
                subdivisionNode([noteNode(1), subdivisionNode([noteNode(2)])]),
            ];

            const notes = StaffNotation.collectNotes(tree);

            expect(notes.map((note) => {
                return note.eventIndex;
            })).toEqual([0, 1, 2]);
        });
    });

    describe("headMarksOf", () => {
        it("carries no mark on a plain note", () => {
            expect(StaffNotation.headMarksOf(noteNode(0))).toEqual([]);
        });

        it("carries the accent on an accented note", () => {
            expect(StaffNotation.headMarksOf(noteNode(0, { accent: true }))).toEqual([HeadMark.Accent]);
        });

        it("carries the parentheses on a ghost note", () => {
            expect(StaffNotation.headMarksOf(noteNode(0, { ghost: true }))).toEqual([HeadMark.GhostParenthesis]);
        });

        it("carries the dot on a dotted note", () => {
            expect(StaffNotation.headMarksOf(noteNode(0, { dotted: true }))).toEqual([HeadMark.Dot]);
        });

        it("keeps the push order of accent, parentheses and dot", () => {
            const marks = StaffNotation.headMarksOf(noteNode(0, { accent: true, ghost: true, dotted: true }));

            expect(marks).toEqual([HeadMark.Accent, HeadMark.GhostParenthesis, HeadMark.Dot]);
        });
    });

    describe("rowInk", () => {
        it("reaches deeper below the staff line for an accented note than for the same note without accent", () => {
            const plain = StaffNotation.project(measureWithNote(1), grid, 1, 100);
            const accented = StaffNotation.project(measureWithNote(1, true), grid, 1, 100);

            const plainInk = StaffNotation.rowInk(plain.nodes, plain.beamSpans, 1);
            const accentedInk = StaffNotation.rowInk(accented.nodes, accented.beamSpans, 1);

            // The head takes half a staff space around its line; the accent hangs two and a half below it.
            expect(plainInk.bottomPx).toBeCloseTo(5);
            expect(accentedInk.bottomPx).toBeCloseTo(29);
        });
    });
});
