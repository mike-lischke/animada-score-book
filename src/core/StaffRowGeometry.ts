/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { MeasureLayout, staffMeasureInsets, staffSpacePx } from "./MeasureLayout.js";
import type { INotationGrid } from "./MeasureProjection.js";
import { RangeArticulations } from "./RangeArticulations.js";
import type { ISbDmArrangement, ISbDmTrack } from "./ScoreBookDataModel.js";
import { StaffInk } from "./StaffInk.js";
import { StaffNotation } from "./StaffNotation.js";
import type { IRangeArticulation } from "./types/general.js";

/** Air a row keeps above its highest ink or tuplet marker, in px at 100% zoom. Mirrors its own `margin-top`. */
const rowAirTopPx = 8;

/** Height a hairpin opens to, in px. Mirrors the opening the hairpin views draw with. */
const hairpinOpeningPx = 1.2 * staffSpacePx;

/** Height the dynamic `f` takes, in px; the font's `dynamicForte` ink is 2.4 staff spaces tall. */
const forteHeightPx = 2.4 * staffSpacePx;

/** Air the marking band keeps from the notation's own ink, in px, so a hairpin clears the accents below the heads. */
const markingBandGapPx = 5;

/**
 * Least height a row keeps, in px at 100% zoom, which is the room a staff row had before it became content-driven.
 * A measure of a single rest would need much less, but the row is also what holds the notation of a multi-line
 * staff and what a track's side controls (the mixer's 70 px instrument icon) are drawn in, so a sparse track does
 * not collapse and nothing gets less room than it had. The surplus is split around the staff line, which keeps the
 * notation in the middle of the row.
 */
const minimumRowHeightPx = 80;

/** Vertical geometry of one staff row, in px at 100% zoom. */
export interface IStaffRowGeometry {
    /** Distance from the row's top edge to the staff's middle line, which is where the notation anchors. */
    readonly staffLineOffsetPx: number;

    /** Total height of the row, from its top edge to its bottom edge. */
    readonly heightPx: number;

    /** Distance from the row's vertical middle to the staff's middle line; the line sits that far below it. */
    readonly centrePx: number;

    /**
     * Distance from the row's vertical middle to the middle of the band the row's range markings stand in, or
     * undefined when the track carries none. Every marking of the row is centred on that band.
     */
    readonly bandCentrePx?: number;
}

/**
 * Resolves the vertical geometry of the staff rows from the notation they hold. The staff view draws each track on
 * a row of its own height, so the geometry is a property of the track and not of the measures a view happens to
 * render: a height is the same for every measure of a track, which keeps it stable while the score scrolls.
 *
 * A row is sized around the notation's own ink — noteheads, stems, beams — plus the room a tuplet marker needs
 * above and below it, which {@link StaffInk} states. The staff's middle line sits `staffLineOffsetPx` below the
 * row's top, so a track with taller notation gets a taller row without moving the staff lines of the others.
 */
export class StaffRowGeometry {
    /**
     * @param arrangement The arrangement whose tracks are measured.
     * @param grid The arrangement's timing grid, which the notation rules work on.
     * @param widthScale Factor the measure widths are divided by, which the print view states for its halved
     *                   layout.
     *
     * @returns The row geometry of every track, keyed by track id.
     */
    public static ofArrangement(arrangement: ISbDmArrangement, grid: INotationGrid,
        widthScale = 1): Map<number, IStaffRowGeometry> {
        const result = new Map<number, IStaffRowGeometry>();

        for (const track of arrangement.tracks) {
            result.set(track.id, StaffRowGeometry.ofTrack(track, arrangement, grid, widthScale));
        }

        return result;
    }

    /**
     * @param track The track to measure.
     * @param arrangement The arrangement the track belongs to, whose measure widths decide the beam slopes.
     * @param grid The arrangement's timing grid, which the notation rules work on.
     * @param widthScale Factor the measure widths are divided by, which the print view states for its halved
     *                   layout.
     * @param measureWidths Optional display widths for the measure columns.
     *
     * @returns The row geometry of the track, derived from the notation of every measure it holds.
     */
    public static ofTrack(track: ISbDmTrack, arrangement: ISbDmArrangement, grid: INotationGrid,
        widthScale = 1, measureWidths?: ReadonlyMap<number, number>): IStaffRowGeometry {
        const centerLine = (StaffRowGeometry.maxNoteLineOf(track) + 1) / 2;
        const baseline = StaffInk.ofRow([], centerLine);

        let inkTopPx = baseline.topPx;
        let inkBottomPx = baseline.bottomPx;

        for (let bar = 1; bar <= track.measures.length; bar++) {
            const width = MeasureLayout.widthOf(bar, measureWidths ?? arrangement.measureWidths) / widthScale;
            const rowWidthPx = Math.max(1, width - staffMeasureInsets);
            const { nodes, beamSpans } = StaffNotation.project(track.measures[bar - 1], grid, centerLine, rowWidthPx);
            const ink = StaffNotation.rowInk(nodes, beamSpans, centerLine);

            inkTopPx = Math.max(inkTopPx, ink.topPx);
            inkBottomPx = Math.max(inkBottomPx, ink.bottomPx);
        }

        const staffLineOffsetPx = inkTopPx + StaffInk.aboveMarkerRoomPx(track) + rowAirTopPx;

        // A track that carries range markings reserves the band they stand in, which sits below the deepest ink of
        // the notation (the accents below the noteheads) and is the same for every measure of the track.
        const markings = arrangement.rangeArticulations?.forTrack(track.id) ?? [];
        const bandHalfPx = StaffRowGeometry.markingBandHalfPx(markings);
        const bandMiddlePx = bandHalfPx === 0 ? undefined : inkBottomPx + markingBandGapPx + bandHalfPx;
        const belowPx = Math.max(inkBottomPx + StaffInk.belowMarkerRoomPx(track),
            bandMiddlePx === undefined ? 0 : bandMiddlePx + bandHalfPx);
        const contentHeightPx = staffLineOffsetPx + belowPx;

        // A row of sparse notation is grown to the least height, the surplus split around the staff line.
        const surplusPx = Math.max(0, minimumRowHeightPx - contentHeightPx) / 2;
        const heightPx = contentHeightPx + (surplusPx * 2);
        const lineOffsetPx = staffLineOffsetPx + surplusPx;

        return {
            staffLineOffsetPx: lineOffsetPx,
            heightPx,
            centrePx: lineOffsetPx - (heightPx / 2),
            bandCentrePx: bandMiddlePx === undefined
                ? undefined
                : lineOffsetPx + bandMiddlePx - (heightPx / 2),
        };
    }

    /**
     * @param track The track to inspect.
     *
     * @returns The highest staff line the track's instrument uses, at least 1.
     */
    public static maxNoteLineOf(track: ISbDmTrack): number {
        return Math.max(1, ...Object.values(track.instrument.noteStyles).map((noteStyle) => {
            return noteStyle.noteLine ?? 1;
        }));
    }

    /**
     * @param value The length in px to format.
     *
     * @returns The length as a CSS px length, rounded to two decimals so an emitted style stays compact.
     */
    public static formatPx(value: number): string {
        return `${Math.round(value * 100) / 100}px`;
    }

    /**
     * @param markings The range markings the track carries.
     *
     * @returns Half the height of the band those markings stand in — the tallest of them decides, and every one is
     *          centred on the band — or 0 when the track carries none.
     */
    private static markingBandHalfPx(markings: readonly IRangeArticulation[]): number {
        let tallest = 0;
        for (const marking of markings) {
            tallest = Math.max(tallest, RangeArticulations.isHairpin(marking) ? hairpinOpeningPx : forteHeightPx);
        }

        return tallest / 2;
    }
}
