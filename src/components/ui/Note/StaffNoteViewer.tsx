/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type CSSProperties, type VNode } from "preact";

import { BeamGeometry, type IBeamNotePlan } from "../../../core/BeamGeometry.js";
import {
    MeasureLayout, minEventWidth, minRestWidth, restDotWidth, staffMeasureInsets, staffSpacePx, type IRowItem,
} from "../../../core/MeasureLayout.js";
import { RangeArticulations } from "../../../core/RangeArticulations.js";
import { NoteLength } from "../../../core/rest-notation.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique,
    type INoteArticulation, type ISbDmTrackPiece,
} from "../../../core/ScoreBookDataModel.js";
import { ScoreSymbol, ScoreSymbols, ScoreSymbolSource } from "../../../core/ScoreSymbols.js";
import {
    addFractions, compareFractions, divideFraction, subtractFractions
} from "../../../core/serialisation/numeric-functions.js";
import { stemEndVariablePrefix } from "../../../core/smufl/SmuflFontLoader.js";
import { HeadMark } from "../../../core/StaffInk.js";
import {
    StaffNodeKind,
    StaffNotation,
    type IStaffNoteNode, type IStaffSubdivisionNode, type IStaffTreeNode,
} from "../../../core/StaffNotation.js";
import { StaffRowGeometry, type IStaffRowGeometry } from "../../../core/StaffRowGeometry.js";
import type {
    IArticulationPortion, IAudioData, IForteMark, IFraction, IHairpin, IRangeArticulation, IRepeatBar, ISubdivision,
} from "../../../core/types/general.js";
import { RangeArticulationKind } from "../../../core/types/general.js";
import type { IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { ScoreElementKind, type ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";
import { BarlineView } from "../framework/BarlineView.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IStaffNoteViewerProperties extends ICommonUIProperties {
    isLastBar: boolean;
    timeSignature: string;
    scoreMetrics: IScoreMetrics;
    baseSteps: number;

    measure: ISbDmTrackPiece;
    barNumber: number;
    trackId: number;

    /**
     * The repeat marks of the arrangement, keyed by 1-based bar number. Omitted means no barline carries a mark.
     */
    repeatBars?: Map<number, IRepeatBar>;

    scoreElementRegistry?: ScoreElementRegistry;

    /** Maximum noteLine value across all variants of the instrument (default 1 = single line). */
    maxNoteLine?: number;

    /**
     * The measure column's layout width in px at 100 % zoom, which a beam's slope is derived from.
     * Omitted falls back to the default measure width, which a test that does not render a full
     * column uses.
     */
    measureWidth?: number;

    /**
     * The column width the bar's notation is opened up from, in px at the same scale as `measureWidth`: the width
     * the column has at the default layout. The first event then keeps the place it holds there, and the room before
     * the closing barline closes no further than that same room. Omitted falls back to `measureWidth`.
     */
    nominalWidth?: number;

    /**
     * The hairpins and `f` markings to draw for this bar and track, which the print view supplies. Omitted for the
     * screen view, whose markings are drawn into the decoration layer of the arrangement viewer.
     */
    articulations?: readonly IRangeArticulation[];

    /**
     * The row's vertical geometry, which decides its height and where its staff line sits. Omitted by a row
     * that is rendered on its own; the read view states the track's shared geometry, so a row does not resize
     * as the score scrolls.
     */
    rowGeometry?: IStaffRowGeometry;
}

interface ITupletLabel {
    /** The tuplet the label belongs to, which is what the label addresses in a hit test. */
    group: ISubdivision;

    leftPercent: number;
    widthPercent: number;
    text: string;
    bracket: boolean;
    placement: "above" | "below";

    /** How far the first child's ink reaches left of the span's start, as a CSS length. */
    firstReach?: string;

    /** How far the last child's ink reaches right of the span's end, as a CSS length. */
    lastReach?: string;
}

interface IDrawnAnchors {
    /** Drawn position of the first anchor, as a fraction of the whole bar. */
    firstAnchor?: IFraction;

    /** How far the first node's ink reaches left of its anchor, as a CSS length. */
    firstReach?: string;

    /** Drawn position of the last anchor, as a fraction of the whole bar. */
    lastAnchor?: IFraction;

    /** How far the last node's ink reaches right of its anchor, as a CSS length. */
    lastReach?: string;
}

/** Room a note grid keeps from the edges of its measure column, in px at 100 % zoom. */
interface INoteGridInsets {
    readonly leftPx: number;
    readonly rightPx: number;
}

/**
 * Width the final barline occupies at the right edge of the last bar, which is what the notes of that bar keep
 * clear of.
 */
const finalBarlineWidth = ScoreSymbols.inkBox(ScoreSymbol.BarlineFinal).width;

/** Width the flags occupy right of a notehead, which the stylesheet owns for the same reason. */
const noteFlagWidth = "var(--note-flag-width)";

/** Height a printed hairpin opens to, in staff spaces; matches the marking band the screen view draws. */
const printedHairpinOpeningSpaces = 1.2;

/** Smallest width a printed hairpin keeps, as a percentage of the bar, so a nearly closed one stays visible. */
const minimumPrintedHairpinPercent = 0.5;

/**
 * Air a tuplet bracket keeps beyond the noteheads it spans, in staff spaces, so its hooks do not sit on their ink.
 * The bracket encloses the group, so the margin is the same on both of its ends.
 */
const tupletBracketMarginSpaces = 0.5;

export class StaffNoteViewer extends UIComponent<IStaffNoteViewerProperties> {
    public override render(): ComponentChild {
        const { isLastBar, scoreMetrics, measure, barNumber, trackId, maxNoteLine = 1,
            scoreElementRegistry, repeatBars, articulations, rowGeometry,
            measureWidth = MeasureLayout.defaultWidth(), nominalWidth = measureWidth } = this.props;

        // A repeat mark stands on the bar it belongs to: one that closes a section ends its bar, one that opens a
        // section starts its bar, so two marks meeting at one boundary stay two bar lines. A bar that carries no
        // mark of its own draws no barline where the bar after it opens a section.
        const opensWithRepeat = repeatBars?.get(barNumber)?.start === true;
        const closingBarline = ScoreSymbols.closingBarlineAt(repeatBars, barNumber, isLastBar);
        const openingBarline = opensWithRepeat ? ScoreSymbol.RepeatStart : undefined;
        const className = this.generateFinalClassName([
            "staff-note-viewer",
            this.classFromProperty(isLastBar, "last-bar"),
        ]);

        const centerLine = (maxNoteLine + 1) / 2;

        // The row spans the measure column's content box. A beam's slope is a rise over this width, so
        // the view states it as data instead of measuring the rendered row.
        const rowWidthPx = Math.max(1, measureWidth - staffMeasureInsets);

        const nodes = StaffNotation.nodesOf(measure, scoreMetrics);
        const tupletLabels = this.computeTupletLabels(nodes, scoreMetrics.stepsPerBar);

        const hasAnyNote = nodes.some((node) => {
            return this.nodeHasAnyNote(node);
        });

        // A subdivision is a structure of its own, so its slots stay visible even when they hold rests
        // only, and so are rests the user split. Only a measure holding nothing but one rest covering
        // the bar becomes a single whole-measure rest.
        const hasAnySubdivision = nodes.some((node) => {
            return node.kind === StaffNodeKind.Subdivision;
        });
        const usesWholeBarRest = !hasAnyNote && !hasAnySubdivision && measure.events.length <= 1;

        // Whole and half rests sit on the centre line (odd count) or the line just below it (even count).
        const restNoteLine = Math.ceil(centerLine);
        const restLineOffset = (restNoteLine - centerLine) * staffSpacePx;

        // A simile holds no content of its own; its mark replaces the notes the measure would draw.
        const usesSimile = measure.simile === true;

        // A measure is resized around its notation: the grid keeps the room the first event holds at the default
        // width, and the room before the closing barline closes down to that same room.
        const gridInsets = StaffNoteViewer.gridInsetsOf(nodes, measureWidth, nominalWidth,
            scoreMetrics.stepsPerBar);
        const gridWidthPx = Math.max(1, rowWidthPx - gridInsets.leftPx - gridInsets.rightPx);
        const noteAnchors = StaffNoteViewer.noteAnchorsOf(nodes, scoreMetrics.stepsPerBar, gridWidthPx);
        const articulationHeadWidths = StaffNoteViewer.articulationHeadWidthsOf(nodes);
        const beamSpans = StaffNotation.beamSpansOf(nodes, measure, scoreMetrics, centerLine, gridWidthPx,
            noteAnchors);

        let runs: ComponentChild[];
        if (usesSimile) {
            runs = [this.renderSimileSlot(barNumber, trackId, measure, scoreElementRegistry)];
        } else if (usesWholeBarRest) {
            runs = [this.renderWholeBarRestSlot(restLineOffset, barNumber, trackId, measure, scoreElementRegistry)];
        } else {
            // The room the notes share is what the column offers after its insets, so the events can fall back on
            // the room their symbols take where a measure is narrowed.
            runs = this.renderItems(nodes, beamSpans, "", centerLine, restLineOffset, 1, true, gridWidthPx);
        }

        // Render the staff lines around the line the notes sit on. The stylesheet states where that line is in
        // the row, so only the line's place in the staff is computed here.
        const staffLines: ComponentChild[] = [];
        for (let i = 1; i <= maxNoteLine; i++) {
            const offset = (i - centerLine) * staffSpacePx;
            staffLines.push(
                <div
                    key={`staff-line-${i}`}
                    className="staff-note-viewer-line"
                    style={{ "--staff-line-offset": `${offset}px` }}
                />,
            );
        }

        // The barline spans the staff lines and reaches one staff space past them; a staff of a single line has no
        // height of its own, so its barline stays at two staff spaces — the band `barlineShort` covers.
        const barlineHeight = Math.max((maxNoteLine - 1) * staffSpacePx, staffSpacePx * 2);

        // Every track piece closes with a real barline; the repeat marks at its boundary decide which one.
        const closingInkWidth = closingBarline === undefined ? "0px" : ScoreSymbols.inkBox(closingBarline).width;

        // A repeat barline reaches into the bar with its dots, so the notes keep clear of that ink and of the gap
        // the stylesheet states, which is what the dots would otherwise stand right against.
        let clearance = "0px";
        if (closingBarline === ScoreSymbol.RepeatEnd) {
            clearance = `calc(${closingInkWidth} + var(--staff-repeat-dot-gap))`;
        } else if (isLastBar) {
            clearance = finalBarlineWidth;
        }

        // The barline a bar opens with stands inside the bar it opens, so the notes start right of its ink.
        const openingReach = openingBarline === undefined
            ? undefined
            : ScoreSymbols.inkBox(openingBarline).width;

        // A repeat that closes the bar reaches into it the same way, so the bar keeps that room free of notes too.
        const closingReach = closingBarline === ScoreSymbol.RepeatEnd
            ? ScoreSymbols.inkBox(closingBarline).width
            : undefined;

        // Both rooms are the barline's own ink plus the gap the stylesheet states for the dots it reaches into the
        // bar with: the room a repeat takes is stated by the barline alone, so it takes the same room away in every
        // bar and in every track of a measure, and no track's content moves.
        const closingRoom = closingReach === undefined
            ? "0px"
            : `calc(${closingReach} + var(--staff-repeat-dot-gap))`;
        const openingRoom = openingReach === undefined
            ? "0px"
            : `calc(${openingReach} + var(--staff-repeat-dot-gap))`;

        const closingBarlineElement = closingBarline === undefined
            ? null
            : this.renderBarline(closingBarline, staffSpacePx);
        const openingBarlineElement = openingBarline === undefined
            ? null
            : this.renderBarline(openingBarline, staffSpacePx);

        // The band the row's range markings stand in, measured from the notes' line: the row geometry places it
        // below the notation's ink, so a hairpin clears the accents that hang below the noteheads. A row rendered
        // without a geometry keeps the band the notation views have always used.
        const bandOffset = rowGeometry?.bandCentrePx === undefined
            ? ((maxNoteLine - centerLine) * staffSpacePx) + (staffSpacePx * 2)
            : rowGeometry.bandCentrePx - rowGeometry.centrePx;

        const articulationLayer = this.renderArticulations(articulations ?? [], barNumber, bandOffset,
            measure, noteAnchors, articulationHeadWidths, gridWidthPx);

        // The stylesheet places the tuplet markers by the row's own ink, so it states the bounds the notation takes
        // around the staff line. The row's height and the line's place in it come from the row geometry, which
        // measures the whole track so a row does not resize as the score scrolls.
        const ink = StaffNotation.rowInk(nodes, beamSpans, centerLine);

        // The row geometry states the row's height, the place of its staff line and the band its range markings
        // stand in; a row rendered on its own states none of them, and the stylesheet falls back to its own values.
        const geometryStyle = rowGeometry === undefined ? {} : {
            "--staff-centre": StaffRowGeometry.formatPx(rowGeometry.centrePx),
            "--staff-row-height": StaffRowGeometry.formatPx(rowGeometry.heightPx),
            "--staff-band-centre": rowGeometry.bandCentrePx === undefined
                ? undefined
                : StaffRowGeometry.formatPx(rowGeometry.bandCentrePx),
        };

        return (
            <div
                className={className}
                ref={scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.TrackRow,
                    bar: barNumber,
                    trackId,
                })}
                style={{
                    ...geometryStyle,
                    "--staff-line-count": `${maxNoteLine}`,
                    "--staff-barline-height": `${barlineHeight}px`,
                    "--staff-barline-width": closingInkWidth,
                    "--staff-opening-barline-room": openingRoom,
                    "--staff-closing-barline-room": closingRoom,
                    "--staff-note-clearance": clearance,
                    "--staff-ink-top": StaffRowGeometry.formatPx(ink.topPx),
                    "--staff-ink-bottom": StaffRowGeometry.formatPx(ink.bottomPx),
                    "--staff-grid-inset-left": StaffRowGeometry.formatPx(gridInsets.leftPx),
                    "--staff-grid-inset-right": StaffRowGeometry.formatPx(gridInsets.rightPx),
                }}
                aria-hidden
                {...this.dataAttributes}
            >
                {staffLines}
                <div className="staff-note-viewer-runs">
                    {runs}
                </div>
                {tupletLabels.length > 0
                    ? (
                        <div className="staff-note-viewer-tuplets">
                            {tupletLabels.map((label) => {
                                const baseCls = label.bracket
                                    ? "staff-note-viewer-tuplet-bracket"
                                    : "staff-note-viewer-tuplet-number";
                                const placementCls = label.placement === "below"
                                    ? "staff-note-viewer-tuplet-below"
                                    : "staff-note-viewer-tuplet-above";
                                const style = this.tupletLabelStyle(label);

                                return (
                                    <span
                                        key={`${label.leftPercent}-${label.text}-${label.placement}`}
                                        className={`${baseCls} ${placementCls}`}
                                        style={style}
                                        ref={scoreElementRegistry?.createRef({
                                            kind: ScoreElementKind.StaffTupletLabel,
                                            bar: barNumber,
                                            trackId,
                                            measure,
                                        }, label.group)}
                                    >
                                        <span className="staff-note-viewer-tuplet-text">{label.text}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )
                    : null}
                {articulationLayer}
                {closingBarlineElement}
                {openingBarlineElement}
            </div>
        );
    }

    /**
     * @param nodes The top-level nodes of the bar.
     * @param widthPx The width the column is drawn at, in px at 100 % zoom.
     * @param nominalWidthPx The width the column holds the bar's notation at, in px at 100 % zoom.
     * @param stepsPerBar The number of base-grid steps in a bar, which states the anchor of an event.
     *
     * @returns The room the note grid keeps from the column's edges: the first event holds the room it has at the
     *          nominal width, and the room before the closing barline closes no further than that same room.
     */
    private static gridInsetsOf(nodes: IStaffTreeNode[], widthPx: number, nominalWidthPx: number,
        stepsPerBar: number): INoteGridInsets {
        if (widthPx === nominalWidthPx) {
            return { leftPx: 0, rightPx: 0 };
        }

        const halfStep = { numerator: 1, denominator: 2 * stepsPerBar };
        const { firstAnchor, lastAnchor } = StaffNoteViewer.drawnAnchors(nodes, halfStep);
        if (firstAnchor === undefined || lastAnchor === undefined) {
            return { leftPx: 0, rightPx: 0 };
        }

        const firstFraction = StaffNoteViewer.fractionValue(firstAnchor);
        const lastFraction = StaffNoteViewer.fractionValue(lastAnchor);
        const spanFraction = lastFraction - firstFraction;
        if (firstFraction >= 1) {
            return { leftPx: 0, rightPx: 0 };
        }

        // A bar of a single event has no outer events to keep in place: its slot is the whole bar, so the event
        // follows the column. A whole note keeps its onset's share, and a whole-bar rest stays in the middle of
        // the bar at whatever width the column is drawn at.
        if (spanFraction === 0) {
            return { leftPx: 0, rightPx: 0 };
        }

        // Without a room before the closing barline, the grid narrows only by what the first event's room gains.
        const roomPx = firstFraction * nominalWidthPx;
        const freeSpanPx = (widthPx - roomPx) / (1 - firstFraction);

        if ((1 - lastFraction) * freeSpanPx < roomPx) {
            // The closing barline keeps the room of the first event as well, so the grid spans no more than both
            // rooms leave: span * (last − first) = width − 2 * room, and the insets take the rest of the column.
            const spanPx = (widthPx - (2 * roomPx)) / spanFraction;
            if (spanPx > 0) {
                const leftPx = firstFraction * (nominalWidthPx - spanPx);

                return { leftPx, rightPx: widthPx - leftPx - spanPx };
            }
        }

        // The grid narrows only by what the first event's room gains, and stays proportional where that no longer
        // fits into the column.
        const leftPx = firstFraction * (nominalWidthPx - freeSpanPx);
        if (widthPx - leftPx <= 0) {
            return { leftPx: 0, rightPx: 0 };
        }

        return { leftPx, rightPx: 0 };
    }

    /**
     * @param nodes The nodes of one container of the row.
     * @param containerSpan The span of the container as a fraction of the whole bar.
     * @param containerWidthPx The room the container takes, in px at 100 % zoom.
     *
     * @returns The width of every node, in px at 100 % zoom, so a narrowed measure leaves each event the room its
     *          symbol takes.
     */
    private static spacedWidthsOf(nodes: IStaffTreeNode[], containerSpan: number, containerWidthPx: number): number[] {
        const items: IRowItem[] = nodes.map((node) => {
            return {
                fraction: StaffNoteViewer.nodeFraction(node) / containerSpan,
                minimumPx: StaffNoteViewer.nodeMinimumRoomOf(node),
            };
        });

        return MeasureLayout.spacedWidths(items, containerWidthPx);
    }

    /**
     * Resolves the point every event is anchored at, in layout px: the notehead of a note and the centre of the
     * slot of a rest, which is where the renderer draws them.
     *
     * @param nodes The nodes of one container of the row.
     * @param stepsPerBar The number of steps a bar holds.
     * @param containerWidthPx The room the container takes, in px at 100 % zoom.
     * @param containerSpan The span of the container as a fraction of the whole bar.
     * @param offsetPx The left edge of the container, in layout px.
     * @param target The anchors collected so far, which the recursion extends.
     *
     * @returns Every event's anchor, keyed by event index.
     */
    private static noteAnchorsOf(nodes: IStaffTreeNode[], stepsPerBar: number, containerWidthPx: number,
        containerSpan = 1, offsetPx = 0, target = new Map<number, number>()): Map<number, number> {
        const widths = StaffNoteViewer.spacedWidthsOf(nodes, containerSpan, containerWidthPx);
        let leftPx = offsetPx;

        nodes.forEach((node, index) => {
            const widthPx = Math.max(0, widths[index]);
            if (node.kind === StaffNodeKind.Subdivision) {
                const span = StaffNoteViewer.nodeFraction(node);
                StaffNoteViewer.noteAnchorsOf(node.children, stepsPerBar, widthPx, span, leftPx, target);
            } else {
                const duration = StaffNoteViewer.nodeFraction(node);
                const anchor = node.noteStyle === undefined || duration <= 0
                    ? 0.5
                    : 1 / (2 * duration * stepsPerBar);
                target.set(node.eventIndex, leftPx + (widthPx * anchor));
            }

            leftPx += widthPx;
        });

        return target;
    }

    private static articulationHeadWidthsOf(nodes: IStaffTreeNode[],
        target = new Map<number, string>()): Map<number, string> {
        const collect = (items: IStaffTreeNode[]): void => {
            for (const node of items) {
                if (node.kind === StaffNodeKind.Subdivision) {
                    collect(node.children);
                    continue;
                }

                if (node.noteStyle !== undefined) {
                    const head = ScoreSymbols.notehead(node.displayType, node.glyph.length);
                    target.set(node.eventIndex, ScoreSymbols.inkBox(head).width);
                }
            }
        };

        collect(nodes);

        return target;
    }

    /**
     * @param node The node to measure.
     *
     * @returns The part of the bar the node spans, as a fraction of the whole bar.
     */
    private static nodeFraction(node: IStaffTreeNode): number {
        const span = node.kind === StaffNodeKind.Subdivision ? node.span : node.duration;

        return span.denominator > 0 ? span.numerator / span.denominator : 0;
    }

    /**
     * @param node The node to measure.
     *
     * @returns The least room the node's symbols take, in px at 100 % zoom: a subdivision sums up its children.
     */
    private static nodeMinimumRoomOf(node: IStaffTreeNode): number {
        if (node.kind === StaffNodeKind.Subdivision) {
            return node.children.reduce((sum, child) => {
                return sum + StaffNoteViewer.nodeMinimumRoomOf(child);
            }, 0);
        }

        if (node.noteStyle !== undefined) {
            return minEventWidth;
        }

        return minRestWidth + (node.glyph.dotted ? restDotWidth : 0);
    }

    /**
     * Finds the drawn positions of the first and last anchor of a list of nodes, as fractions of the bar the nodes
     * belong to. A notehead is drawn half a grid step behind its onset, a rest sits centred in its slot. Rests count
     * as children: a group that starts or ends with one still has to be covered over its full extent.
     *
     * @param nodes The nodes to inspect.
     * @param halfStep Half a grid step, the offset a notehead is drawn at behind its onset.
     *
     * @returns The first and last anchor with the ink they reach beyond it, or undefined anchors when the nodes
     * hold no child.
     */
    private static drawnAnchors(nodes: IStaffTreeNode[], halfStep: IFraction): IDrawnAnchors {
        let firstNode: IStaffNoteNode | undefined;
        let firstAnchor: IFraction | undefined;
        let lastNode: IStaffNoteNode | undefined;
        let lastAnchor: IFraction | undefined;

        const walk = (items: IStaffTreeNode[]): void => {
            for (const item of items) {
                if (item.kind === StaffNodeKind.Note) {
                    const isNote = item.noteStyle !== undefined;
                    const anchor = isNote
                        ? addFractions(item.start, halfStep)
                        : addFractions(item.start, divideFraction(item.duration, 2));

                    if (firstAnchor === undefined || compareFractions(anchor, firstAnchor) < 0) {
                        firstAnchor = anchor;
                        firstNode = item;
                    }

                    if (lastAnchor === undefined || compareFractions(anchor, lastAnchor) > 0) {
                        lastAnchor = anchor;
                        lastNode = item;
                    }
                } else {
                    walk(item.children);
                }
            }
        };

        walk(nodes);

        return {
            firstAnchor,
            firstReach: StaffNoteViewer.firstReachOf(firstNode),
            lastAnchor,
            lastReach: StaffNoteViewer.lastReachOf(lastNode),
        };
    }

    /**
     * @param node The node a group starts with.
     *
     * @returns How far that node's ink reaches left of its anchor, as a CSS length: a notehead spans its whole ink
     *          width behind its anchor, a rest is centred on it.
     */
    private static firstReachOf(node: IStaffNoteNode | undefined): string | undefined {
        if (node === undefined) {
            return undefined;
        }

        if (node.noteStyle !== undefined) {
            return ScoreSymbols.inkBox(ScoreSymbols.notehead(node.displayType, node.glyph.length)).width;
        }

        return `calc(${ScoreSymbols.inkBox(ScoreSymbols.rest(node.glyph.length)).width} / 2)`;
    }

    /**
     * @param node The node a group ends with.
     *
     * @returns How far that node's ink reaches right of its anchor, as a CSS length: a notehead ends on its anchor,
     *          a rest is centred on it.
     */
    private static lastReachOf(node: IStaffNoteNode | undefined): string | undefined {
        if (node === undefined || node.noteStyle !== undefined) {
            return undefined;
        }

        return `calc(${ScoreSymbols.inkBox(ScoreSymbols.rest(node.glyph.length)).width} / 2)`;
    }

    /**
     * @param fraction The fraction to read.
     *
     * @returns The fraction as a number.
     */
    private static fractionValue(fraction: IFraction): number {
        return fraction.numerator / fraction.denominator;
    }

    private static anchorPositionOf(measure: ISbDmTrackPiece, fraction: IFraction,
        noteAnchors: Map<number, number>, headWidths: Map<number, string>, gridWidthPx: number): string {
        const eventIndex = StaffNoteViewer.eventIndexOf(measure, fraction);
        const anchorPx = noteAnchors.get(eventIndex);
        const anchorPercent = anchorPx === undefined
            ? StaffNoteViewer.percentOf(fraction)
            : (anchorPx / gridWidthPx) * 100;
        const headWidth = headWidths.get(eventIndex);

        return headWidth === undefined
            ? `${anchorPercent}%`
            : `calc(${anchorPercent}% - (${headWidth} / 2))`;
    }

    private static eventIndexOf(measure: ISbDmTrackPiece, fraction: IFraction): number {
        return measure.events.findIndex((event) => {
            return compareFractions(event.start, fraction) === 0;
        });
    }

    /**
     * @param fraction The fraction to read.
     *
     * @returns The fraction as a percentage of the whole.
     */
    private static percentOf(fraction: IFraction): number {
        return StaffNoteViewer.fractionValue(fraction) * 100;
    }

    /**
     * @param bar The one-based bar the fraction lies in.
     * @param fraction The fraction within that bar.
     *
     * @returns The position as a number of bars, so positions in different bars can be compared and interpolated.
     */
    private static parameterOf(bar: number, fraction: IFraction): number {
        return (bar - 1) + (fraction.numerator / fraction.denominator);
    }

    /**
     * @param symbol The barline to draw.
     * @param staffSpace The size of one staff space, in px.
     *
     * @returns The barline, placed on the edge of the bar the symbol states.
     */
    private renderBarline(symbol: ScoreSymbol, staffSpace: number): ComponentChild {
        const placement = ScoreSymbols.barlineEdge(symbol);

        // The class is built here and not merged with the viewer's own class name, which belongs to the row the
        // viewer draws: a barline is placed by the bar it stands on.
        return (
            <span className={`staff-note-viewer-barline staff-note-viewer-barline-${placement}`}>
                <BarlineView symbol={symbol} staffSpace={staffSpace} />
            </span>
        );
    }

    /**
     * Draws the markings of this bar and track, clipped to the bar, into a pointer-transparent layer. Only the
     * portion of a hairpin that lies in this bar is drawn, so a hairpin over a barline reads as one line across the
     * two bars whose parts meet at the barline.
     *
     * @param articulations The markings to draw in the bar.
     * @param barNumber The one-based measure the row draws.
     * @param bandOffset The middle of the marking band, in px below the notes' line.
     * @param measure The events in the bar.
     * @param noteAnchors The rendered horizontal anchors of the events.
     * @param headWidths The notehead ink widths, keyed by event index.
     * @param gridWidthPx The width of the rendered note grid.
     *
     * @returns The marking layer, or null when the bar holds none.
     */
    private renderArticulations(articulations: readonly IRangeArticulation[], barNumber: number,
        bandOffset: number, measure: ISbDmTrackPiece, noteAnchors: Map<number, number>,
        headWidths: Map<number, string>,
        gridWidthPx: number): ComponentChild {
        const marks: ComponentChild[] = [];

        for (const articulation of articulations) {
            const portion = RangeArticulations.portionInBar(articulation, barNumber);
            if (portion === undefined) {
                continue;
            }

            marks.push(RangeArticulations.isHairpin(articulation)
                ? this.renderPrintedHairpin(articulation, portion, barNumber, bandOffset,
                    measure, noteAnchors, headWidths, gridWidthPx)
                : this.renderPrintedForte(articulation, bandOffset, measure, noteAnchors, headWidths, gridWidthPx));
        }

        return marks.length > 0 ? <div className="staff-note-viewer-articulations">{marks}</div> : null;
    }

    /**
     * @param hairpin The hairpin to draw.
     * @param portion The part of the hairpin that lies in this bar.
     * @param barNumber The one-based measure the row draws.
     * @param bandOffset The top of the marking band, in px below the notes' line.
     * @param measure The events in the bar.
     * @param noteAnchors The rendered horizontal anchors of the events.
     * @param headWidths The notehead ink widths, keyed by event index.
     * @param gridWidthPx The width of the rendered note grid.
     *
     * @returns The hairpin portion as scalable line geometry.
     */
    private renderPrintedHairpin(hairpin: IHairpin, portion: IArticulationPortion,
        barNumber: number, bandOffset: number, measure: ISbDmTrackPiece,
        noteAnchors: Map<number, number>, headWidths: Map<number, string>, gridWidthPx: number): ComponentChild {
        const startPosition = hairpin.from.bar === barNumber
            ? StaffNoteViewer.anchorPositionOf(measure, hairpin.from.start, noteAnchors, headWidths, gridWidthPx)
            : "0%";
        const endPosition = hairpin.to.bar === barNumber
            ? StaffNoteViewer.anchorPositionOf(measure, hairpin.to.start, noteAnchors, headWidths, gridWidthPx)
            : "100%";
        const width = `max(${minimumPrintedHairpinPercent}%, calc(${endPosition} - ${startPosition}))`;
        const opening = staffSpacePx * printedHairpinOpeningSpaces;
        const topOffset = bandOffset - (opening / 2);

        // The wedge is one line from its tip to its opening. A hairpin over a barline is drawn per bar, so each bar
        // keeps the opening the wedge has at its own edges, which lets the parts meet at the bar lines.
        const tip = hairpin.kind === RangeArticulationKind.Crescendo ? hairpin.from : hairpin.to;
        const open = hairpin.kind === RangeArticulationKind.Crescendo ? hairpin.to : hairpin.from;
        const tipParameter = StaffNoteViewer.parameterOf(tip.bar, tip.start);
        const openParameter = StaffNoteViewer.parameterOf(open.bar, open.start);
        const openingAt = (fraction: IFraction): number => {
            const parameter = StaffNoteViewer.parameterOf(barNumber, fraction);
            const ratio = (parameter - tipParameter) / (openParameter - tipParameter);

            return Math.min(Math.max(ratio, 0), 1);
        };

        const leftHalf = openingAt(portion.start) * 50;
        const rightHalf = openingAt(portion.end) * 50;
        const path = `M 0 ${50 - leftHalf} L 100 ${50 - rightHalf} M 0 ${50 + leftHalf} L 100 ${50 + rightHalf}`;
        const style: CSSProperties = {
            left: startPosition,
            width,
            top: `calc(50% + var(--staff-centre, 32px) + ${topOffset}px)`,
            height: `${opening}px`,
        };

        return (
            <div
                key={`hairpin-${hairpin.id}`}
                className="staff-note-viewer-articulation staff-note-viewer-articulation-hairpin"
                style={style}
            >
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d={path} fill="none" stroke="currentColor" vector-effect="non-scaling-stroke" />
                </svg>
            </div>
        );
    }

    /**
     * @param mark The `f` marking to draw.
     * @param bandOffset The top of the marking band, in px below the notes' line.
     * @param measure The events in the bar.
     * @param noteAnchors The rendered horizontal anchors of the events.
     * @param headWidths The notehead ink widths, keyed by event index.
     * @param gridWidthPx The width of the rendered note grid.
     *
     * @returns The `f` glyph, centred on its event.
     */
    private renderPrintedForte(mark: IForteMark, bandOffset: number, measure: ISbDmTrackPiece,
        noteAnchors: Map<number, number>, headWidths: Map<number, string>, gridWidthPx: number): ComponentChild {
        const style: CSSProperties = {
            left: StaffNoteViewer.anchorPositionOf(measure, mark.at.start, noteAnchors, headWidths, gridWidthPx),
            top: `calc(50% + var(--staff-centre, 32px) + ${bandOffset}px)`,
        };

        return (
            <div
                key={`forte-${mark.id}`}
                className="staff-note-viewer-articulation staff-note-viewer-articulation-forte"
                style={style}
            >
                <ScoreSymbolView symbol={ScoreSymbol.Forte} staffSpace={staffSpacePx} inkBox />
            </div>
        );
    }

    /**
     * Computes bracket/number labels for tuplet groups. A marker spans from the first to the last
     * child of the group, its rests included, so it covers the whole group and not only its
     * sounding notes.
     *
     * @param nodes The nodes to process.
     * @param stepsPerBar The number of base-grid steps in a bar (for the half-step notehead offset).
     *
     * @returns List of tuplet labels with position and text info.
     */
    private computeTupletLabels(nodes: IStaffTreeNode[], stepsPerBar: number): ITupletLabel[] {
        const labels: ITupletLabel[] = [];
        const halfStep = { numerator: 1, denominator: 2 * stepsPerBar };

        const walk = (items: IStaffTreeNode[], depth: number): void => {
            for (const item of items) {
                if (item.kind === StaffNodeKind.Subdivision) {
                    if (item.isTuplet) {
                        const bounds = StaffNoteViewer.drawnAnchors(item.children, halfStep);
                        if (bounds.firstAnchor !== undefined && bounds.lastAnchor !== undefined) {
                            const width = subtractFractions(bounds.lastAnchor, bounds.firstAnchor);

                            labels.push({
                                group: item.group,
                                leftPercent: (bounds.firstAnchor.numerator / bounds.firstAnchor.denominator) * 100,
                                widthPercent: (width.numerator / width.denominator) * 100,
                                text: item.actual.toString(),
                                bracket: this.tupletNeedsBracket(item, items),
                                placement: depth % 2 === 0 ? "above" : "below",
                                firstReach: bounds.firstReach,
                                lastReach: bounds.lastReach,
                            });
                        }

                        walk(item.children, depth + 1);
                    } else {
                        walk(item.children, depth);
                    }
                }
            }
        };

        walk(nodes, 0);

        return labels;
    }

    /**
     * @param label The label to place.
     *
     * @returns The style that places the label. A bracket spans from the first child's ink to the last child's, and a
     *          number states the middle of that span.
     */
    private tupletLabelStyle(label: ITupletLabel): CSSProperties {
        const firstReach = label.firstReach ?? "0px";
        const lastReach = label.lastReach ?? "0px";
        const margin = `calc(var(--staff-space) * ${tupletBracketMarginSpaces})`;

        if (!label.bracket) {
            return {
                left: `calc(${label.leftPercent + (label.widthPercent / 2)}% - ${firstReach} / 2 + ${lastReach} / 2)`,
            };
        }

        // The bracket encloses the group: its left hook clears the first child's ink, its right hook the last
        // child's, and both keep the margin.
        return {
            left: `calc(${label.leftPercent}% - ${firstReach} - ${margin})`,
            width: `calc(${label.widthPercent}% + ${firstReach} + ${lastReach} + (${margin} * 2))`,
        };
    }

    private tupletNeedsBracket(node: IStaffSubdivisionNode, siblings: IStaffTreeNode[]): boolean {
        if (siblings.length > 1) {
            return true;
        }

        return this.tupletHasRestOrUnbeamed(node);
    }

    private tupletHasRestOrUnbeamed(node: IStaffSubdivisionNode): boolean {
        for (const child of node.children) {
            if (child.kind === StaffNodeKind.Subdivision) {
                if (this.tupletHasRestOrUnbeamed(child)) {
                    return true;
                }

                continue;
            }

            if (child.noteStyle === undefined || child.beamCount === 0) {
                return true;
            }
        }

        return false;
    }

    private nodeHasAnyNote(node: IStaffTreeNode): boolean {
        if (node.kind === StaffNodeKind.Note) {
            return node.noteStyle !== undefined;
        }

        return node.children.some((child) => {
            return this.nodeHasAnyNote(child);
        });
    }

    /**
     * Renders the hierarchical row tree. The room of every container is distributed over its children by duration,
     * and where a measure is narrowed, each event falls back on the room its own symbol takes
     * ({@link MeasureLayout.spacedWidths}). A subdivision distributes its own room over its children the same way.
     *
     * @param nodes The tree nodes to render at this level.
     * @param beamSpans Map of note event indices to beam info (these render with attached beam segments).
     * @param keyPrefix A prefix for React keys to ensure uniqueness across recursive calls.
     * @param centerLine The centre line index ((maxNoteLine + 1) / 2), used to compute per-note vertical offsets.
     * @param restLineOffset Vertical offset in px for whole/half rests so they sit on the centre line.
     * @param containerSpan The total span of the current container as a fraction of the whole bar.
     * @param atMeasureEnd Whether the current container ends with the measure.
     * @param containerWidthPx The room the current container takes, in px at 100 % zoom.
     *
     * @returns List of VNodes representing the rendered items at this level.
     */
    private renderItems(nodes: IStaffTreeNode[], beamSpans: Map<number, IBeamNotePlan>,
        keyPrefix: string, centerLine: number, restLineOffset: number, containerSpan = 1,
        atMeasureEnd = true, containerWidthPx = 0): ComponentChild[] {
        const { scoreMetrics, measure, barNumber, trackId, scoreElementRegistry } = this.props;
        const widths = StaffNoteViewer.spacedWidthsOf(nodes, containerSpan, containerWidthPx);

        return nodes.map((node, index) => {
            const isMeasureEnd = atMeasureEnd && index === nodes.length - 1;
            const widthPx = Math.max(0, widths[index]);

            if (node.kind === StaffNodeKind.Subdivision) {
                const spanFraction = node.span.numerator / node.span.denominator;

                return (
                    <div
                        key={`${keyPrefix}tuplet-${index}`}
                        style={{
                            flex: `0 1 ${widthPx}px`,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            height: "100%",
                            position: "relative",
                        }}
                    >
                        {this.renderItems(node.children, beamSpans, `${keyPrefix}${index}-`, centerLine,
                            restLineOffset, spanFraction, isMeasureEnd, widthPx)}
                    </div>
                );
            }

            // Noteheads are anchored at the note's onset plus half a grid step. As a fraction of
            // this run's width that is 1 / (2 * durationInSteps), so a top-level step note sits at
            // 50 % and a subdivision slot sits where the replaced note's notehead was. The offset is
            // the same for every note, which is what makes a beam reach the next note's anchor.
            const anchorPercent = node.duration.denominator > 0 && node.duration.numerator > 0
                ? (node.duration.denominator / (2 * node.duration.numerator * scoreMetrics.stepsPerBar)) * 100
                : 50;

            const beamInfo = beamSpans.get(node.eventIndex);
            const hasBeam = beamInfo !== undefined;

            // A standalone flagged note ending the measure has its onset before the barline but its
            // flags behind it, because such a note is shorter than half a grid step and its anchor
            // therefore sits at the end of its slot (100 %). It is drawn right-aligned to that slot
            // instead, so its flags end where the slot ends and stay inside the bar. What the barline draws
            // into the bar then decides how far the flags stay clear of it, which the viewer states.
            const endsMeasureWithFlags = isMeasureEnd && !hasBeam && node.noteStyle !== undefined
                && anchorPercent >= 100;
            const anchor = endsMeasureWithFlags
                ? `calc(100% - ${noteFlagWidth} - var(--staff-note-clearance, 0px))`
                : `${anchorPercent}%`;

            const slotStyle = {
                flex: `0 1 ${widthPx}px`,
                minWidth: 0,
                "--note-anchor": anchor,
                ...(beamInfo === undefined ? {} : {
                    // The stem ends on the group's beam line at this note's own horizontal position. The stack's
                    // depth is where a decoration drawn on the stem has to start.
                    "--stem-tip": StaffRowGeometry.formatPx(beamInfo.stemLengthPx),
                    "--beam-stack-depth": StaffRowGeometry.formatPx(
                        BeamGeometry.stackDepthSpaces(beamInfo.strokes.length) * staffSpacePx),
                }),
            } as CSSProperties;
            const stepIndex = Math.floor(
                (node.start.numerator * scoreMetrics.stepsPerBar) / node.start.denominator,
            );

            if (node.noteStyle !== undefined) {
                // Compute vertical offset for this note's staff line.
                const effectiveNoteLine = node.noteLine ?? 1;
                const lineOffset = (effectiveNoteLine - centerLine) * staffSpacePx;

                const headType = node.displayType;
                const isNonOval = headType !== NoteDisplayType.Oval;

                const headWrapperClasses = ["staff-note-head"];
                if (isNonOval) {
                    headWrapperClasses.push(this.headTypeClassName(headType));
                }

                // The marks of the note are what the renderer draws and what the ink bounds reserve room for.
                const marks = StaffNotation.headMarksOf(node);
                if (marks.includes(HeadMark.Dot)) {
                    headWrapperClasses.push("staff-note-head-dotted");
                }

                const decoClasses = this.resolveDecorationClasses(node.noteStyle, node.articulation);
                headWrapperClasses.push(...decoClasses);

                const headSymbol = ScoreSymbols.notehead(headType, node.glyph.length);
                const headBox = ScoreSymbols.inkBox(headSymbol);
                const flagSymbol = hasBeam ? undefined : ScoreSymbols.flag(node.glyph.length);

                const flagElement = flagSymbol === undefined
                    ? null
                    : <ScoreSymbolView
                        className="staff-note-head-flag"
                        symbol={flagSymbol}
                        staffSpace={staffSpacePx}
                    />;
                const dotElement = marks.includes(HeadMark.Dot)
                    ? <ScoreSymbolView
                        className="staff-note-head-dot"
                        symbol={ScoreSymbol.AugmentationDot}
                        staffSpace={staffSpacePx}
                    />
                    : null;
                const accentElement = marks.includes(HeadMark.Accent)
                    ? <ScoreSymbolView
                        className="staff-note-head-accent"
                        symbol={ScoreSymbol.Accent}
                        staffSpace={staffSpacePx}
                    />
                    : null;

                const needsCssStem = !hasBeam && node.glyph.length !== NoteLength.Whole;

                // The head wrapper is the head's ink box: its right edge sits on the note's anchor and its
                // centre on the note's staff line, so every decoration below is placed by the box the font
                // draws the head in instead of an offset tuned to one head shape.
                const headStyle = {
                    "--head-ink-width": headBox.width,
                    "--head-ink-height": headBox.height,
                    "--note-line-offset": `${lineOffset}px`,
                    ...(flagSymbol === undefined ? {} : this.flagStemVariables(flagSymbol)),
                } as CSSProperties;

                const runDivProps: Record<string, unknown> = {
                    key: `${keyPrefix}note-${index}`,
                    className: "staff-note-viewer-run staff-note-viewer-note-run",
                    style: slotStyle,
                    ref: scoreElementRegistry?.createRef({
                        kind: ScoreElementKind.StaffRun,
                        bar: barNumber,
                        trackId,
                        step: stepIndex,
                        noteId: measure.noteEvents.at(node.eventIndex)?.id,
                        start: node.start,
                        measure,
                    }, measure.events[node.eventIndex]),
                };

                return (
                    <div {...runDivProps}>
                        <span className={headWrapperClasses.join(" ")} style={headStyle}>
                            <ScoreSymbolView
                                className="staff-note-head-symbol"
                                symbol={headSymbol}
                                staffSpace={staffSpacePx}
                            />
                            {needsCssStem ? <span className="staff-note-head-stem" /> : null}
                            {hasBeam ? <span className="staff-note-viewer-custom-stem" /> : null}
                            {flagElement}
                            {dotElement}
                            {marks.includes(HeadMark.GhostParenthesis) ? this.renderGhostParentheses() : null}
                            {this.renderNoteDecorations(node.noteStyle, node.articulation)}
                            {accentElement}
                        </span>
                        {hasBeam ? this.renderBeamSegments(node.eventIndex, beamInfo) : null}
                    </div>
                );
            }

            const restGlyph = node.glyph;
            const isWholeOrHalf = restGlyph.length === NoteLength.Whole || restGlyph.length === NoteLength.Half;
            const restSymbol = ScoreSymbols.rest(restGlyph.length);
            const restBox = ScoreSymbols.inkBox(restSymbol);

            // A whole or half rest sits on the line below the one the notes are drawn on, which is the line
            // they hang from or sit on.
            const restStyle = {
                "--rest-ink-width": restBox.width,
                "--rest-line-offset": `${isWholeOrHalf ? restLineOffset : 0}px`,
            } as CSSProperties;

            // A dotted rest draws its dot beside the glyph, so the symbol is shifted by half of the dot's room to
            // stay centred in its slot, which is the room the layout keeps free for it.
            const restSymbolClass = restGlyph.dotted
                ? "staff-note-viewer-rest-symbol staff-note-viewer-rest-symbol-dotted"
                : "staff-note-viewer-rest-symbol";

            return (
                <div key={`${keyPrefix}rest-${index}`} className="staff-note-viewer-run" style={slotStyle}
                    ref={scoreElementRegistry?.createRef({
                        kind: ScoreElementKind.StaffRun,
                        bar: barNumber,
                        trackId,
                        step: stepIndex,
                        start: node.start,
                        measure,
                    }, measure.events[node.eventIndex])}>
                    <span className={restSymbolClass} style={restStyle}>
                        <ScoreSymbolView symbol={restSymbol} staffSpace={staffSpacePx} inkBox />
                        {restGlyph.dotted
                            ? <ScoreSymbolView
                                className="staff-note-viewer-rest-dot"
                                symbol={ScoreSymbol.AugmentationDot}
                                staffSpace={staffSpacePx}
                                inkBox
                            />
                            : null}
                    </span>
                </div>
            );
        });
    }

    /**
     * Renders the beam strokes attached to a single note inside a beam group. Every stroke is a
     * parallelogram on the group's shared beam line: a shared stroke bridges the full slot width to
     * the next notehead, and a partial stub reaches a staff-space based length from the stem. Each end
     * carries the line's height at its own horizontal position, so all strokes of a group stay
     * collinear, without a kink or a seam.
     *
     * The top beam's top edge sits on the line the stems end on; every further level hangs one beam
     * advance below it, which is a thickness plus the beam spacing.
     *
     * @param stepIndex The note event index to render beams for (used for keying).
     * @param plan The beam engraving of this note.
     *
     * @returns List of VNodes representing the beam strokes attached to this note.
     */
    private renderBeamSegments(stepIndex: number, plan: IBeamNotePlan): VNode[] {
        const { groupStrokes, slope } = plan;
        if (groupStrokes === undefined || groupStrokes.length === 0) {
            return [];
        }

        const beamAdvance = "(var(--beam-thickness, 4px) + var(--beam-spacing, 2px))";
        const beamThickness = "var(--beam-thickness, 4px)";
        const halfStem = "var(--stem-half-width, 1px)";
        const widthPx = Math.max(...groupStrokes.map((stroke) => {
            return stroke.endPx;
        }));
        const levels = Math.max(...groupStrokes.map((stroke) => {
            return stroke.level;
        }));

        // The box's top edge is the beam's top edge at the first note's anchor; the strokes are stated from
        // there, and the group is sheared by the slope. The box states where the beam starts, not how far it
        // reaches: it paints outside it where the line rises or the strokes run on.
        const style: CSSProperties = {
            top: `calc(50% + ${StaffRowGeometry.formatPx(plan.strokes[0].leftPx)})`,
            left: `calc(var(--note-anchor) - ${halfStem})`,
            width: `calc(${StaffRowGeometry.formatPx(widthPx)} + var(--stem-thickness, 2px))`,
            height: `calc(${beamThickness} + ${levels - 1} * ${beamAdvance})`,

            // The strokes are stated from the anchor, which sits half a stem right of the box's edge.
            transform: `translateY(calc(-1 * ${slope} * ${halfStem}))`,
        };
        const strokes = groupStrokes.map((stroke, index) => {
            const strokeStyle: CSSProperties = {
                width: `calc(${StaffRowGeometry.formatPx(stroke.endPx - stroke.startPx)}`
                    + " + var(--stem-thickness, 2px))",
                height: beamThickness,
                fill: "currentColor",
                transform: `translateY(calc(${stroke.level - 1} * ${beamAdvance}))`,
            };

            return <rect key={index} x={stroke.startPx} y={0} style={strokeStyle} />;
        });

        return [
            <svg key={`beam-group-${stepIndex}`} className="staff-note-viewer-beam" style={style} aria-hidden="true">
                <g transform={`matrix(1 ${slope} 0 1 0 0)`}>
                    {strokes}
                </g>
            </svg>,
        ];
    }

    /**
     * Renders the parentheses a ghost note is wrapped in. They hang on the head's ink box, so they fit any
     * head shape without an offset tuned to one of them.
     *
     * @returns The two parentheses.
     */
    private renderGhostParentheses(): ComponentChild {
        return (
            <>
                <ScoreSymbolView
                    className="staff-note-head-paren-left"
                    symbol={ScoreSymbol.GhostParenthesisLeft}
                    staffSpace={staffSpacePx}
                />
                <ScoreSymbolView
                    className="staff-note-head-paren-right"
                    symbol={ScoreSymbol.GhostParenthesisRight}
                    staffSpace={staffSpacePx}
                />
            </>
        );
    }

    /**
     * @param flag The flag symbol to place.
     *
     * @returns Where the flag hangs on its stem, as the CSS variables the stylesheet places it by: the
     * font states where the end of the stem sits inside the flag's ink.
     */
    private flagStemVariables(flag: ScoreSymbol): CSSProperties {
        const definition = ScoreSymbols.definition(flag);
        if (definition.source !== ScoreSymbolSource.MusicFontGlyph) {
            return {};
        }

        const glyphName = definition.glyph.toLowerCase();

        return {
            "--flag-stem-x": `var(${stemEndVariablePrefix}x-${glyphName}, 0px)`,
            "--flag-stem-y": `var(${stemEndVariablePrefix}y-${glyphName}, 0px)`,
        };
    }

    /**
     * Renders the whole-measure rest of a measure that holds rests only. The run carries the measure's
     * first event, so the rest is selectable and addressable like any other run.
     *
     * @param restLineOffset Vertical offset in px so the rest sits on the centre line.
     * @param barNumber The one-based measure number of this viewer.
     * @param trackId The track identity of this viewer.
     * @param measure The measure the rest stands for.
     * @param scoreElementRegistry The registry to register the rest run in.
     *
     * @returns The whole-measure rest run.
     */
    private renderWholeBarRestSlot(restLineOffset: number, barNumber: number, trackId: number,
        measure: ISbDmTrackPiece, scoreElementRegistry?: ScoreElementRegistry): VNode {
        const restStyle = {
            "--rest-ink-width": ScoreSymbols.inkBox(ScoreSymbol.RestWhole).width,
            "--rest-line-offset": `${restLineOffset}px`,
        } as CSSProperties;

        return (
            <div
                key="rest-whole-bar"
                className="staff-note-viewer-run"
                style={{ width: "100%" }}
                ref={scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.StaffRun,
                    bar: barNumber,
                    trackId,
                    step: 0,
                    start: { numerator: 0, denominator: 1 },
                    measure,
                }, measure.events[0])}
            >
                <span className="staff-note-viewer-rest-symbol" style={restStyle}>
                    <ScoreSymbolView symbol={ScoreSymbol.RestWhole} staffSpace={staffSpacePx} inkBox />
                </span>
            </div>
        );
    }

    /**
     * Renders the one-bar repeat (simile) mark in place of the measure's notes.
     *
     * @param barNumber The one-based measure number of this viewer.
     * @param trackId The track identity of this viewer.
     * @param measure The measure the mark stands for.
     * @param scoreElementRegistry The registry to register the mark in.
     *
     * @returns The simile run.
     */
    private renderSimileSlot(barNumber: number, trackId: number, measure: ISbDmTrackPiece,
        scoreElementRegistry?: ScoreElementRegistry): VNode {
        return (
            <div
                key="simile"
                className="staff-note-viewer-run staff-note-viewer-simile"
                style={{ width: "100%" }}
                ref={scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.StaffRun,
                    bar: barNumber,
                    trackId,
                    step: 0,
                    start: { numerator: 0, denominator: 1 },
                    measure,
                }, measure)}
            >
                <ScoreSymbolView symbol={ScoreSymbol.MeasureRepeat} staffSpace={staffSpacePx} />
            </div>
        );
    }

    private getTupletRestIcon(effectiveStepsPerPulse: number): NoteLength {
        if (effectiveStepsPerPulse <= 2) {
            return NoteLength.Eighth;
        }

        if (effectiveStepsPerPulse <= 4) {
            return NoteLength.Sixteenth;
        }

        return NoteLength.ThirtySecond;
    }

    /**
     * Maps a note display type to a CSS class name suffix.
     *
     * @param headType The head type to map.
     *
     * @returns The CSS class name suffix (e.g. "square", "cross").
     */
    private headTypeClassName(headType: NoteDisplayType): string {
        switch (headType) {
            case NoteDisplayType.Square: {
                return "square";
            }

            case NoteDisplayType.Triangle: {
                return "triangle";
            }

            case NoteDisplayType.Cross: {
                return "cross";
            }

            case NoteDisplayType.Diamond: {
                return "diamond";
            }

            default: {
                return "";
            }
        }
    }

    /**
     * Resolves CSS class names for note decorations based on the play characteristics.
     *
     * @param noteStyle The note style whose characteristics determine the decorations.
     * @param articulation The per-note articulation (damping, accent, ghost).
     *
     * @returns An array of CSS class name suffixes (without the `staff-note-head--` prefix).
     */
    private resolveDecorationClasses(noteStyle: IAudioData, articulation?: INoteArticulation): string[] {
        const { characteristics: c } = noteStyle;
        const classes: string[] = [];

        if (c.excitationMode === ExcitationMode.Struck) {
            if ("stickTechnique" in c && c.stickTechnique !== undefined) {
                switch (c.stickTechnique) {
                    case StickTechnique.PressRoll: {
                        classes.push("press-roll");
                        break;
                    }

                    case StickTechnique.Rim: {
                        classes.push("rim");
                        break;
                    }

                    case StickTechnique.RimShot: {
                        classes.push("rimshot");
                        break;
                    }

                    case StickTechnique.Body: {
                        classes.push("body-stick");
                        break;
                    }

                    case StickTechnique.CrossClick: {
                        classes.push("cross-click");
                        break;
                    }

                    default: {
                        break;
                    }
                }
            } else {
                switch (c.handTechnique) {
                    case HandTechnique.Thumb: {
                        classes.push("thumb");
                        break;
                    }

                    case HandTechnique.Slap: {
                        classes.push("slap");
                        break;
                    }

                    case HandTechnique.Tap: {
                        classes.push("tap");
                        break;
                    }

                    case HandTechnique.TapWithPalm: {
                        classes.push("tap-palm");
                        break;
                    }

                    default: {
                        break;
                    }
                }

                // Hand + Cross display → hollow square around cross (body).
                if (c.mainDisplayType === NoteDisplayType.Cross) {
                    classes.push("body-hand");
                }
            }
        } else if (c.excitationMode === ExcitationMode.Scraped) {
            classes.push("scraped");
        } else if (c.excitationMode === ExcitationMode.Blown) {
            classes.push("blown");
        }

        // Ghost notes are drawn with parentheses, derived from the note's articulation.
        return classes;
    }

    /**
     * Renders additional note decoration elements (e.g. thumb circle, tap triangle inside square).
     * These are absolutely-positioned spans layered over the note head.
     *
     * @param noteStyle The note style whose characteristics determine the decorations.
     * @param articulation The per-note articulation (damping, accent, ghost).
     *
     * @returns An array of VNodes or null if no decorations are needed.
     */
    private renderNoteDecorations(noteStyle: IAudioData | undefined,
        articulation?: INoteArticulation): VNode[] | null {
        if (!noteStyle) {
            return null;
        }

        const { characteristics } = noteStyle;
        const nodes: VNode[] = [];

        if (characteristics.excitationMode === ExcitationMode.Struck && "handTechnique" in characteristics
            && characteristics.handTechnique !== undefined) {
            switch (characteristics.handTechnique) {
                case HandTechnique.Thumb: {
                    nodes.push(
                        this.renderHandTechniqueIcon("thumb", "staff-note-head-thumb-svg", 14, 14,
                            <line x1="3" y1="3" x2="13" y2="13" />),
                    );
                    break;
                }

                case HandTechnique.Fingers: {
                    nodes.push(
                        this.renderHandTechniqueIcon("fingers", "staff-note-head-fingers-svg", 16, 16,
                            <>
                                <line x1="6" y1="14" x2="2" y2="5" />
                                <line x1="7.5" y1="14" x2="6" y2="3" />
                                <line x1="9" y1="14" x2="10" y2="3" />
                                <line x1="10.5" y1="14" x2="14" y2="5" />
                            </>),
                    );
                    break;
                }

                case HandTechnique.Heel: {
                    nodes.push(<span key="heel-circle" className="staff-note-head-heel-circle" />);
                    break;
                }

                case HandTechnique.Open: {
                    nodes.push(<span key="open-circle" className="staff-note-head-open-circle" />);
                    break;
                }

                case HandTechnique.Friction: {
                    nodes.push(
                        this.renderHandTechniqueIcon("friction", "staff-note-head-friction-svg", 8, 16,
                            <path d="M4 1 C0.5 3 7.5 5 4 7 C0.5 9 7.5 11 4 15" />),
                    );
                    break;
                }

                case HandTechnique.Tap:
                case HandTechnique.TapWithPalm: {
                    nodes.push(
                        <span key="tap-triangle" className="staff-note-head-tap-triangle" />,
                    );
                    break;
                }

                case HandTechnique.Slap: {
                    nodes.push(
                        <ScoreSymbolView key="slap-cross" className="staff-note-head-slap-svg"
                            symbol={ScoreSymbol.TechniqueCross} staffSpace={staffSpacePx} />,
                    );
                    break;
                }

                default: {
                    break;
                }
            }
        }

        if (characteristics.excitationMode === ExcitationMode.Struck && "stickTechnique" in characteristics
            && characteristics.stickTechnique === StickTechnique.PressRoll) {
            nodes.push(
                <ScoreSymbolView key="press-roll" className="staff-note-head-press-roll-svg"
                    symbol={ScoreSymbol.PressRollStrokes} staffSpace={staffSpacePx} />,
            );
        }

        if (characteristics.excitationMode === ExcitationMode.Struck && "stickTechnique" in characteristics
            && characteristics.stickTechnique === StickTechnique.RimShot) {
            nodes.push(
                <ScoreSymbolView key="rimshot-cross" className="staff-note-head-rimshot-cross-svg"
                    symbol={ScoreSymbol.RimShotCross} staffSpace={staffSpacePx} />,
            );
        }

        // Damped (muted) note: plus sign above the note head, derived from the note's articulation.
        if (articulation?.damping === Damping.Muted) {
            nodes.push(
                <span key="damped-plus" className="staff-note-head-damped-plus">+</span>,
            );
        }

        return nodes.length > 0 ? nodes : null;
    }

    private renderHandTechniqueIcon(key: string, className: string, width: number, height: number,
        content: ComponentChild): VNode {
        return (
            <svg key={key} className={className} width={width} height={height}
                viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
                {content}
            </svg>
        );
    }

    private isPowerOfTwo(value: number): boolean {
        if (value <= 0 || !Number.isInteger(value)) {
            return false;
        }

        return (value & (value - 1)) === 0;
    }

    private floorPowerOfTwo(value: number): number {
        if (value < 1) {
            return 1;
        }

        let result = 1;
        while (result * 2 <= value) {
            result *= 2;
        }

        return result;
    }
}
