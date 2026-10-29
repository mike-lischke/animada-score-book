/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmTrack } from "./ScoreBookDataModel.js";
import { BeamGeometry, normalStemLengthSpaces } from "./BeamGeometry.js";
import { staffSpacePx } from "./MeasureLayout.js";

/** Room a notehead's ink takes around its staff line, in staff spaces. */
const headInkHalfSpaces = 0.5;

/** A mark a notehead can carry. */
export enum HeadMark {
    /** The augmentation dot, drawn in the space right of the head. */
    Dot,

    /** The parentheses a ghost note is wrapped in. */
    GhostParenthesis,

    /** The accent, drawn under the head. */
    Accent,
}

/**
 * Room each mark a head can carry takes below the head's own ink, in staff spaces. How deep a mark reaches follows
 * from the rule that places it: the stylesheet stands an accent's box 0.4 spaces under the head and that box is 2
 * spaces tall, while the dot and the parentheses are drawn around the head's centre and reach a quarter space under
 * the head's ink. Every mark a row may hold states its room here, which is what lets a row reserve the room without
 * a change to the geometry.
 */
const headMarkRoomSpaces: Record<HeadMark, number> = {
    [HeadMark.Dot]: 0.25,
    [HeadMark.GhostParenthesis]: 0.25,
    [HeadMark.Accent]: 2.4,
};

/** Gap a tuplet marker keeps from the notation, in px. Mirrors `--tuplet-marker-gap` in the stylesheet. */
const tupletGapPx = 6;

/** Distance a tuplet number sits beyond its bracket, or beyond the notation when it has none, in px. */
const tupletNumberOffsetPx = 14;

/** Height a tuplet number's line box takes, in px. */
const tupletNumberHeightPx = 16;

/** How far a marker drawn above the notation reaches beyond the bracket line, in px. Mirrors its `top` offset. */
const tupletAboveOverhangPx = 10;

/** One note of a row, as the ink bounds see it. */
export interface IStaffInkNote {
    /** The note's staff line; undefined for a rest, which sits in the middle of the staff. */
    noteLine?: number;

    /** Distance from the note's line up to its stem tip or beam line, in staff spaces; undefined without a stem. */
    stemLengthSpaces?: number;

    /** Number of beam levels the note carries. */
    beamCount: number;

    /** The marks the note carries, every one of which hangs below its head. */
    marks?: readonly HeadMark[];
}

/** The room a row's notation takes above and below its reference line. */
export interface IStaffInk {
    /** Distance the ink reaches above the reference line, in px. */
    topPx: number;

    /** Distance the ink reaches below the reference line, in px. */
    bottomPx: number;
}

/**
 * Resolves the room the notation of a row takes, from its noteheads, its stems and its beam stacks, and
 * the room a row keeps below itself for a tuplet marker that is drawn below the notation.
 *
 * The stylesheet places tuplet markers by these bounds, so a marker follows the notation instead of a
 * fixed height, and a row reserves the room a below marker needs when a measure labels one below.
 */
export class StaffInk {
    /**
     * @param notes The notes of one row, in measure order.
     * @param centerLine The line the row is drawn around.
     *
     * @returns The room the row's notation takes around its reference line.
     */
    public static ofRow(notes: readonly IStaffInkNote[], centerLine: number): IStaffInk {
        let topSpaces = -headInkHalfSpaces;
        let bottomSpaces = headInkHalfSpaces;

        for (const note of notes) {
            const lineSpaces = (note.noteLine ?? centerLine) - centerLine;
            const headTop = lineSpaces - headInkHalfSpaces;
            const headBottom = lineSpaces + headInkHalfSpaces;

            // A stem is one normal length where nothing beams the note; a beamed note states its own
            // length up to the beam line. A beam stack hangs from that line, level by level.
            const stemLength = note.stemLengthSpaces ?? (note.beamCount > 0 ? normalStemLengthSpaces : undefined);
            const stemTop = stemLength === undefined ? headTop : lineSpaces - stemLength;
            const stackBottom = stemLength === undefined
                ? headBottom
                : stemTop + BeamGeometry.stackDepthSpaces(note.beamCount);

            // The marks of the note state how deep it reaches below its head.
            const belowSpaces = Math.max(headBottom, stackBottom) + StaffInk.markRoomSpaces(note.marks);

            topSpaces = Math.min(topSpaces, stemTop);
            bottomSpaces = Math.max(bottomSpaces, belowSpaces);
        }

        return {
            topPx: -topSpaces * staffSpacePx,
            bottomPx: bottomSpaces * staffSpacePx,
        };
    }

    /**
     * @param track The track whose rows are measured.
     *
     * @returns The room the track's notation keeps above its own ink for a tuplet marker drawn above,
     *          or 0 when no measure of the track labels one.
     */
    public static aboveMarkerRoomPx(track: ISbDmTrack): number {
        return StaffInk.labelsAbove(track) ? tupletGapPx + tupletAboveOverhangPx : 0;
    }

    /**
     * @param track The track whose rows are measured.
     *
     * @returns The room the track's notation keeps below its own ink for a tuplet marker drawn below,
     *          or 0 when no measure of the track labels one.
     */
    public static belowMarkerRoomPx(track: ISbDmTrack): number {
        return StaffInk.labelsBelow(track) ? tupletGapPx + tupletNumberOffsetPx + tupletNumberHeightPx : 0;
    }

    /**
     * @param marks The marks a note carries.
     *
     * @returns The room the deepest of those marks takes below the head's ink, in staff spaces.
     */
    private static markRoomSpaces(marks: readonly HeadMark[] | undefined): number {
        let room = 0;
        for (const mark of marks ?? []) {
            room = Math.max(room, headMarkRoomSpaces[mark]);
        }

        return room;
    }

    /**
     * @param track The track to inspect.
     *
     * @returns Whether the track labels a tuplet above the notation, which the outermost tuplet of a measure is.
     */
    private static labelsAbove(track: ISbDmTrack): boolean {
        return track.measures.some((measure) => {
            return measure.subdivisions.some((subdivision) => {
                return subdivision.isTuplet;
            });
        });
    }

    /**
     * @param track The track to inspect.
     *
     * @returns Whether the track labels a tuplet below the notation. A tuplet is labelled below when
     *          another tuplet encloses it, which needs two tuplet records in the same measure.
     */
    private static labelsBelow(track: ISbDmTrack): boolean {
        return track.measures.some((measure) => {
            return measure.subdivisions.filter((subdivision) => {
                return subdivision.isTuplet;
            }).length >= 2;
        });
    }
}
