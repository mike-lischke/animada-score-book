/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmTrack } from "./ScoreBookDataModel.js";
import { BeamGeometry, normalStemLengthSpaces } from "./BeamGeometry.js";
import { noteHeightPx, staffRowGapPx, staffSpacePx } from "./MeasureLayout.js";

/** Room a notehead's ink takes around its staff line, in staff spaces. */
const headInkHalfSpaces = 0.5;

/** Room the marks below a head — its dot, its accent — hang into, in staff spaces. */
const noteMarkSpaces = 1.5;

/** Gap a tuplet marker keeps from the notation, in px. Mirrors `--tuplet-bracket-gap` in the stylesheet. */
const tupletGapPx = 6;

/** Distance a tuplet number sits beyond its bracket, or beyond the notation when it has none, in px. */
const tupletNumberOffsetPx = 14;

/** Height a tuplet number's line box takes, in px. */
const tupletNumberHeightPx = 16;

/** One note of a row, as the ink bounds see it. */
export interface IStaffInkNote {
    /** The note's staff line; undefined for a rest, which sits in the middle of the staff. */
    noteLine?: number;

    /** Distance from the note's line up to its stem tip or beam line, in staff spaces; undefined without a stem. */
    stemLengthSpaces?: number;

    /** Number of beam levels the note carries. */
    beamCount: number;
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

            topSpaces = Math.min(topSpaces, stemTop);
            bottomSpaces = Math.max(bottomSpaces, headBottom, stackBottom);
        }

        return {
            topPx: -topSpaces * staffSpacePx,
            bottomPx: (bottomSpaces + noteMarkSpaces) * staffSpacePx,
        };
    }

    /**
     * @param track The track whose rows are measured.
     *
     * @returns The extra room the track's rows keep below them, so a tuplet marker drawn below the
     *          notation clears the notation and stays clear of the row that follows.
     */
    public static belowReservePx(track: ISbDmTrack): number {
        if (!StaffInk.labelsBelow(track)) {
            return 0;
        }

        const lines = Object.values(track.instrument.noteStyles).map((noteStyle) => {
            return noteStyle.noteLine ?? 1;
        });
        const maxLine = Math.max(1, ...lines);
        const centerLine = (maxLine + 1) / 2;

        // The room a row keeps below its reference line, plus the room the row after it leaves above its
        // own reference line. A marker beyond that reaches the notation of the next row.
        const ink = StaffInk.ofRow([
            { noteLine: 1, stemLengthSpaces: normalStemLengthSpaces, beamCount: 1 },
            { noteLine: maxLine, stemLengthSpaces: normalStemLengthSpaces, beamCount: 1 },
        ], centerLine);
        const availablePx = noteHeightPx - ink.topPx + staffRowGapPx;
        const neededPx = ink.bottomPx + tupletGapPx + tupletNumberOffsetPx + tupletNumberHeightPx;

        return Math.max(0, neededPx - availablePx);
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
