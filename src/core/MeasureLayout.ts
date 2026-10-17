/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmArrangement } from "./ScoreBookDataModel.js";
import { subtractFractions } from "./serialisation/numeric-functions.js";
import type { IFraction } from "./types/general.js";
import { clampValue } from "./utils.js";

/**
 * Horizontal layout of the measure columns of the score viewer.
 *
 * The staff view no longer renders every measure of a score: it mounts a window of measures at their exact
 * horizontal offsets. Those offsets must therefore be known before anything is rendered, which makes the
 * measure widths data instead of a result of CSS. A measure without a width of its own uses the default
 * width of the staff view, so an arrangement that stores no widths reproduces the historic geometry.
 *
 * All values are in layout px at 100% zoom. A view that scales its content (the CSS `zoom` of the viewer,
 * the print scaling) converts at its own boundary.
 */

/** Note height in px at 100% zoom: the grid cell size. Mirrors `--note-height` in App.scss, which a test asserts. */
export const noteHeightPx = 80;

/** Height of one staff space in px at 100% zoom. Four of them make a SMuFL em. */
export const staffSpacePx = 10;

/**
 * Width of one base-grid step in px at 100% zoom, which a measure's default column width derives from.
 * Mirrors `--measure-step-width` in App.scss. It is deliberately its own value and not the grid cell size:
 * the horizontal step width and the grid height are independent again, which the staff row geometry relies on.
 */
export const measureStepWidthPx = 80;

/** Steps a measure is laid out for when it carries no width of its own. Mirrors `--steps-per-bar` in CSS. */
const defaultStepsPerMeasure = 16;

/** Width of the staff prefix column (clef and time signature) in px at 100% zoom. Mirrors `.staff-prefix-viewer`. */
export const staffPrefixWidth = 48;

/** Width an event keeps at least, in px at 100% zoom: a notehead plus the room for its stem and flags. */
export const minEventWidth = 25;

/** Distance two adjacent event anchors keep at least, in px at 100% zoom, so noteheads do not collide. */
export const minEventGap = 12;

/** Air a rest keeps on either side of its symbol, in px at 100% zoom. */
export const minRestAir = 4;

/**
 * Width of the widest rest glyph of the standard values, in px at 100% zoom. Mirrors the SMuFL rest boxes:
 * the thirty-second rest is the widest of them.
 */
export const restGlyphWidth = 15;

/**
 * Room the augmentation dot of a dotted rest takes beside its glyph, in px at 100% zoom: the gap the dot keeps
 * from the glyph plus the dot's own ink.
 */
export const restDotWidth = 8;

/** Width a rest keeps at least, in px at 100% zoom: the widest rest glyph and the air on both of its sides. */
export const minRestWidth = restGlyphWidth + (2 * minRestAir);

/** Width the one-bar repeat (simile) mark keeps at least, in px at 100% zoom: the glyph plus its air. */
export const minMeasureRepeatWidth = 3 * staffSpacePx;

/** Horizontal insets of a staff measure column — its padding plus the closing barline — in px at 100% zoom. */
export const staffMeasureInsets = 24;

/**
 * Width of the bar action strip — seven 34 px buttons, with 4 px between the per-bar actions and 16 px to the
 * insert actions that frame them — in px at 100% zoom. Mirrors `.bar-action-button` and `.bar-action-group` in
 * component-styles: the strip is centred on the measure, so the measure has to be at least this wide for the
 * strip to fit.
 */
export const barActionStripWidth = (7 * 34) + (4 * 4) + (2 * 16);

/** A half-open range of 1-based measure numbers. */
export interface IMeasureRange {
    first: number;
    last: number;
}

export class MeasureLayout {
    /** @returns The default column width of a measure, in px at 100% zoom. */
    public static defaultWidth(): number {
        return defaultStepsPerMeasure * measureStepWidthPx;
    }

    /**
     * @param barCount The number of measures in the arrangement.
     * @param widths Column widths set for individual measures, keyed by 1-based measure number.
     *
     * @returns The column width of every measure, in measure order.
     */
    public static columns(barCount: number, widths?: ReadonlyMap<number, number>): number[] {
        const result: number[] = [];
        for (let bar = 1; bar <= barCount; bar++) {
            result.push(MeasureLayout.widthOf(bar, widths));
        }

        return result;
    }

    /**
     * @param bar The 1-based measure number.
     * @param widths Column widths set for individual measures, keyed by 1-based measure number.
     *
     * @returns The column width of the given measure, or its default width when none is set.
     */
    public static widthOf(bar: number, widths?: ReadonlyMap<number, number>): number {
        const width = widths?.get(bar);

        return width !== undefined && width > 0 ? width : MeasureLayout.defaultWidth();
    }

    /**
     * @param columns The column widths in measure order.
     * @param leadingWidth Width of the content that precedes the first measure, e.g. the staff prefix.
     *
     * @returns The start offset of every measure, followed by the end of the last one. Hence a result of
     *          `columns.length + 1` entries, where entry `i` is the left edge of measure `i + 1`.
     */
    public static offsets(columns: number[], leadingWidth = 0): number[] {
        const result: number[] = [leadingWidth];
        let offset = leadingWidth;

        for (const column of columns) {
            offset += column;
            result.push(offset);
        }

        return result;
    }

    /**
     * @param offsets The measure offsets as returned by {@link offsets}.
     *
     * @returns The total width of all measures, including the leading content.
     */
    public static totalWidth(offsets: number[]): number {
        return offsets.length > 0 ? offsets[offsets.length - 1] : 0;
    }

    /**
     * Resolves the measure column a horizontal position falls into.
     *
     * @param offsets The measure offsets as returned by {@link offsets}.
     * @param x The position in px at 100% zoom.
     *
     * @returns The 0-based column index, clamped to the available columns.
     */
    public static columnIndexAt(offsets: number[], x: number): number {
        const columns = offsets.length - 1;
        if (columns <= 0) {
            return 0;
        }

        if (x < offsets[0]) {
            return 0;
        }

        // Largest index whose offset is still at or before x.
        let low = 0;
        let high = columns - 1;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (offsets[middle] <= x) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return low;
    }

    /**
     * Resolves the measures whose columns touch a horizontal interval. The interval edges are resolved to the
     * columns containing them, so a partially visible edge measure counts as visible.
     *
     * @param offsets The measure offsets as returned by {@link offsets}.
     * @param fromX Left edge of the interval, in px at 100% zoom.
     * @param toX Right edge of the interval, in px at 100% zoom.
     * @param overscan Measures to add on either side, to keep rendering ahead of the scrolling.
     *
     * @returns The 1-based range of measures to render, or an empty range when the score has no measures.
     */
    public static rangeFor(offsets: number[], fromX: number, toX: number, overscan = 0): IMeasureRange {
        const bars = offsets.length - 1;
        if (bars <= 0) {
            return { first: 1, last: 0 };
        }

        const first = Math.max(1, MeasureLayout.columnIndexAt(offsets, fromX) + 1 - overscan);
        const last = Math.min(bars, MeasureLayout.columnIndexAt(offsets, toX) + 1 + overscan);

        return { first, last };
    }

    /**
     * Resolves the scroll position that brings a measure, and a position inside it, into view.
     *
     * The measure is the anchor, not the position inside it: a position that is the measure's first note would
     * otherwise be placed at the right edge of the viewport, leaving the previous measure filling the view — which
     * is what a cursor stepping over a measure boundary produces. So the measure's left edge goes to the left edge
     * of the viewport, leaving out the margin a note head needs. Only when the position lies beyond the viewport
     * even then — inside a measure that is wider than the viewport — the position itself is followed.
     *
     * @param offsets The measure offsets as returned by {@link offsets}.
     * @param bar The 1-based number of the measure that has to become visible.
     * @param point The position inside the measure that has to become visible, in px at 100% zoom.
     * @param scrollLeft The current scroll position of the viewport.
     * @param clientWidth The width of the viewport.
     * @param margin The distance a position keeps from the viewport edge, so a note head is not cut off.
     *
     * @returns The scroll position to use, clamped to the scrollable range. It equals the current scroll position
     *          when the measure and the position are visible already.
     */
    public static scrollToShow(offsets: number[], bar: number, point: number, scrollLeft: number, clientWidth: number,
        margin: number): number {

        if (point >= scrollLeft + margin && point <= scrollLeft + clientWidth - margin) {
            return scrollLeft;
        }

        // Measure 1 is preceded by the staff prefix, which stays visible with it, so the content start anchors it.
        const anchor = bar === 1 ? 0 : offsets[bar - 1] - margin;
        const followPoint = point - clientWidth + margin;
        const maxScroll = Math.max(0, MeasureLayout.totalWidth(offsets) - clientWidth);

        return clampValue(Math.floor(Math.max(anchor, followPoint)), 0, maxScroll);
    }

    /**
     * Resolves the smallest column width a measure of an arrangement still draws in.
     *
     * The staff lays its events out proportionally, so a requirement stated as a length scales with the column:
     * an event's slot is its duration fraction of the column and the distance between two anchors is the fraction
     * between their starts. A note needs the room its symbol takes ({@link minEventWidth}), and where a note stands
     * at one of two neighbouring anchors, their air ({@link minEventGap}). A rest needs the width of its symbol,
     * the widest rest glyph and the room of a dot ({@link restDotWidth}), with its own air on both sides
     * ({@link minRestAir}): rests are the elastic slack of a measure (ADR-0003), so a measure holding rests alone
     * keeps the room its controls need.
     *
     * The measure also carries the bar action strip, which is centred on it and therefore has to fit inside it
     * ({@link barActionStripWidth}).
     *
     * @param arrangement The arrangement the measure belongs to.
     * @param bar The 1-based measure number.
     *
     * @returns The smallest column width in px at 100% zoom, the column insets included.
     */
    public static minimumWidthOfMeasure(arrangement: Readonly<ISbDmArrangement>, bar: number): number {
        let noteSlotWidth = 0;
        let noteGapWidth = 0;
        let restSlotWidth = 0;
        let hasSimile = false;

        for (const track of arrangement.tracks) {
            const measure = track.measures[bar - 1];
            if (measure.simile === true) {
                hasSimile = true;
            }

            for (let index = 0; index < measure.events.length; index++) {
                const event = measure.events[index];
                const previous = index === 0 ? undefined : measure.events[index - 1];
                const isNote = event.noteStyleId !== undefined;
                const isPreviousNote = previous?.noteStyleId !== undefined;

                if (isNote) {
                    noteSlotWidth = Math.max(noteSlotWidth, MeasureLayout.columnWidthFor(minEventWidth,
                        event.duration));
                } else {
                    restSlotWidth = Math.max(restSlotWidth, MeasureLayout.columnWidthFor(
                        MeasureLayout.restSymbolWidth(event.duration), event.duration));
                }

                if (previous !== undefined && (isNote || isPreviousNote)) {
                    const gap = subtractFractions(event.start, previous.start);
                    noteGapWidth = Math.max(noteGapWidth,
                        MeasureLayout.columnWidthFor(minEventWidth + minEventGap, gap));
                }
            }
        }

        const contentWidth = Math.max(
            hasSimile ? minMeasureRepeatWidth : 0,
            noteSlotWidth,
            noteGapWidth,
            restSlotWidth,
        );

        return Math.max(Math.ceil(contentWidth) + staffMeasureInsets, barActionStripWidth);
    }

    /**
     * States how wide a column has to be for a span of it to hold a length.
     *
     * @param length The room an event's symbol or the air between two anchors needs, in px at 100% zoom.
     * @param span The part of the column the length has to fit into, as a bar fraction.
     *
     * @returns The column width in px at 100% zoom, or 0 when the span holds nothing.
     */
    private static columnWidthFor(length: number, span: IFraction): number {
        const ratio = span.numerator > 0 && span.denominator > 0 ? span.numerator / span.denominator : 0;

        return ratio > 0 ? length / ratio : 0;
    }

    /**
     * Resolves the room a rest's symbol takes, its air included.
     *
     * @param duration The rest's duration as a bar fraction.
     *
     * @returns The width the rest needs, in px at 100% zoom.
     */
    private static restSymbolWidth(duration: IFraction): number {
        const isDotted = duration.numerator === 3
            && duration.denominator > 0
            && (duration.denominator & (duration.denominator - 1)) === 0;

        return minRestWidth + (isDotted ? restDotWidth : 0);
    }
}
