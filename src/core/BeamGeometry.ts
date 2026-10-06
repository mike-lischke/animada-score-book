/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { staffSpacePx } from "./MeasureLayout.js";
import { clampValue } from "./utils.js";

/** Stem length a beamed note keeps at least, in staff spaces: one octave, the engraving's normal length. */
export const normalStemLengthSpaces = 3.5;

/**
 * Largest rise a beam line may have per px of its run. A group of a larger interval is drawn on this
 * bounded slope, so it stays readable.
 */
export const maximumBeamSlope = 0.25;

/** Length a partial beam reaches beyond its note's stem, in staff spaces. */
export const partialBeamLengthSpaces = 1.2;

/** How one beam stroke attaches to the notes around it. */
export enum BeamSegmentKind {
    /** The stroke bridges the gap to the next note, which carries the same level. */
    SharedRight,

    /** The stroke is a stub reaching back towards the group from its right end. */
    PartialLeft,

    /** The stroke is a stub reaching into the group from its left end. */
    PartialRight,
}

/** One note of a beam group, as the beam geometry sees it. */
export interface IBeamNote {
    /** Bar fraction of the note's anchor: its onset plus half a grid step. */
    anchor: number;

    /** The note's staff line. */
    noteLine: number;

    /** Number of beam levels the note carries. */
    beamCount: number;
}

/** One beam stroke of a group. */
export interface IBeamStroke {
    /** 1-based beam level: 1 = eighth, 2 = sixteenth, 3 = thirty-second. */
    level: number;

    kind: BeamSegmentKind;

    /** Beam top edge at the stroke's left end, in px below the row's reference line (negative = above). */
    leftPx: number;

    /** Beam top edge at the stroke's right end, in px below the row's reference line (negative = above). */
    rightPx: number;
}

/** The engraving of one note of a beam group. */
export interface IBeamNotePlan {
    /** Distance from the note's own line up to the beam's top edge at its anchor, in px. */
    stemLengthPx: number;

    strokes: IBeamStroke[];
}

/** What the beam geometry needs to know about the row it draws in. */
export interface IBeamGeometryOptions {
    /** The line the row is drawn around, which note positions are measured from. */
    centerLine: number;

    /** The row's content width in px, which maps a bar fraction to a horizontal distance. */
    rowWidthPx: number;
}

/**
 * Resolves the one beam line a group of notes shares, and how its strokes and stem endpoints follow
 * from it. The line follows the contour of the group's first and last note, bounded by
 * {@link maximumBeamSlope}, and is translated so that the shortest stem keeps the normal length.
 */
export class BeamGeometry {
    /**
     * @param notes The notes of one beam group, in measure order.
     * @param options The row the group is drawn in.
     *
     * @returns The engraving of every note, in the order the notes were given.
     */
    public static plan(notes: readonly IBeamNote[], options: IBeamGeometryOptions): IBeamNotePlan[] {
        if (notes.length === 0) {
            return [];
        }

        const { centerLine, rowWidthPx } = options;
        const first = notes[0];
        const last = notes[notes.length - 1];

        const spanPx = (last.anchor - first.anchor) * rowWidthPx;
        const risePx = BeamGeometry.noteYPx(last.noteLine, centerLine)
            - BeamGeometry.noteYPx(first.noteLine, centerLine);
        const contour = spanPx === 0 ? 0 : risePx / spanPx;
        const slope = clampValue(contour, -maximumBeamSlope, maximumBeamSlope);

        const normalStemPx = normalStemLengthSpaces * staffSpacePx;

        // The line passes the normal stem length above the note that comes closest to it, and no
        // closer to any other note of the group, so no stem is shorter than the normal length.
        let basePx = Infinity;
        for (const note of notes) {
            const noteY = BeamGeometry.noteYPx(note.noteLine, centerLine);
            basePx = Math.min(basePx, noteY - normalStemPx - (slope * (note.anchor - first.anchor) * rowWidthPx));
        }

        const topAt = (anchor: number): number => {
            return basePx + (slope * (anchor - first.anchor) * rowWidthPx);
        };

        const partialSpan = (partialBeamLengthSpaces * staffSpacePx) / rowWidthPx;

        return notes.map((note, index) => {
            return {
                stemLengthPx: BeamGeometry.noteYPx(note.noteLine, centerLine) - topAt(note.anchor),
                strokes: BeamGeometry.strokesOf(notes, index, partialSpan, topAt),
            };
        });
    }

    /**
     * @param notes The notes of the group.
     * @param index The index of the note to resolve.
     * @param partialSpan Length of a partial beam, as a bar fraction.
     * @param topAt Resolves the beam's top edge at a bar fraction.
     *
     * @returns The strokes the note carries, one per beam level.
     */
    private static strokesOf(notes: readonly IBeamNote[], index: number, partialSpan: number,
        topAt: (anchor: number) => number): IBeamStroke[] {
        const note = notes[index];
        const strokes: IBeamStroke[] = [];

        for (let level = 1; level <= note.beamCount; level++) {
            const hasRight = index + 1 < notes.length && notes[index + 1].beamCount >= level;

            let kind: BeamSegmentKind;
            let left: number;
            let right: number;
            if (hasRight) {
                kind = BeamSegmentKind.SharedRight;
                left = note.anchor;
                right = notes[index + 1].anchor;
            } else if (index > 0) {
                kind = BeamSegmentKind.PartialLeft;
                left = note.anchor - partialSpan;
                right = note.anchor;
            } else {
                kind = BeamSegmentKind.PartialRight;
                left = note.anchor;
                right = note.anchor + partialSpan;
            }

            strokes.push({ level, kind, leftPx: topAt(left), rightPx: topAt(right) });
        }

        return strokes;
    }

    /**
     * @param noteLine The note's staff line.
     * @param centerLine The line the row is drawn around.
     *
     * @returns The note's distance from the reference line, in px, positive below it.
     */
    private static noteYPx(noteLine: number, centerLine: number): number {
        return (noteLine - centerLine) * staffSpacePx;
    }
}
