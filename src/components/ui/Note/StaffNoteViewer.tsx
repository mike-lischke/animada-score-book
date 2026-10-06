/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type CSSProperties, type VNode } from "preact";

import { articulationFromSampleProfile } from "../../../core/articulation.js";
import { BeamGeometry, BeamSegmentKind, normalStemLengthSpaces, partialBeamLengthSpaces, type IBeamNotePlan }
    from "../../../core/BeamGeometry.js";
import { StaffInk, type IStaffInk, type IStaffInkNote } from "../../../core/StaffInk.js";
import type { ISbDmTrackPiece } from "../../../core/ScoreBookDataModel.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique,
    type INoteArticulation,
} from "../../../core/ScoreBookDataModel.js";
import { ScoreSymbols, ScoreSymbol, ScoreSymbolSource } from "../../../core/ScoreSymbols.js";
import { RangeArticulations } from "../../../core/RangeArticulations.js";
import {
    MeasureProjection, NoteGroupKind, ProjectedItemKind, pulseLengthAt,
    type INotationGrid, type IProjectedEvent, type IProjectedItem,
} from "../../../core/MeasureProjection.js";
import { MeasureLayout, staffMeasureInsets, staffSpacePx } from "../../../core/MeasureLayout.js";
import { stemEndVariablePrefix } from "../../../core/smufl/SmuflFontLoader.js";
import type { IFraction, IAudioData, IArticulationPortion, IHairpin, IRangeArticulation, IRepeatBar, ISubdivision }
    from "../../../core/types/general.js";
import { RangeArticulationKind } from "../../../core/types/general.js";
import { beamCountOf, fallbackNoteValue, noteValueForEvent, NoteLength, type INoteValue }
    from "../../../core/rest-notation.js";
import type { IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { addFractions, compareFractions, divideFraction, subtractFractions }
    from "../../../core/serialisation/numeric-functions.js";
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
     * The hairpins and `f` markings to draw for this bar and track, which the print view supplies. Omitted for the
     * screen view, whose markings are drawn into the decoration layer of the arrangement viewer.
     */
    articulations?: readonly IRangeArticulation[];
}

/** Discriminator for staff tree nodes. */
export enum StaffNodeKind {
    Note,
    Subdivision,
}

interface IStaffNoteNode {
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

interface IStaffSubdivisionNode {
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

type IStaffTreeNode = IStaffNoteNode | IStaffSubdivisionNode;

interface ITupletLabel {
    /** The tuplet the label belongs to, which is what the label addresses in a hit test. */
    group: ISubdivision;

    leftPercent: number;
    widthPercent: number;
    text: string;
    bracket: boolean;
    placement: "above" | "below";
}

interface IDrawnAnchors {
    /** Drawn position of the first anchor, as a fraction of the whole bar. */
    firstAnchor?: IFraction;

    /** Whether the first anchor belongs to a notehead, which reaches left of its anchor. */
    firstIsNote: boolean;

    /** Drawn position of the last anchor, as a fraction of the whole bar. */
    lastAnchor?: IFraction;

    /** Whether the last anchor belongs to a notehead, which ends on its anchor. */
    lastIsNote: boolean;
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

export class StaffNoteViewer extends UIComponent<IStaffNoteViewerProperties> {
    public override render(): ComponentChild {
        const { isLastBar, scoreMetrics, measure, barNumber, trackId, maxNoteLine = 1,
            scoreElementRegistry, repeatBars, articulations,
            measureWidth = MeasureLayout.defaultWidth() } = this.props;

        // A barline sits between two bars, so the marks on both sides of it decide which one it is. A repeat that
        // only opens is the opening barline of the bar it opens, so the bar before it draws none at all.
        const closesRepeat = repeatBars?.get(barNumber)?.end === true;
        const opensRepeat = repeatBars?.get(barNumber + 1)?.start === true;
        const boundaryBarline = ScoreSymbols.barlineAt({ closesRepeat, opensRepeat, endsScore: isLastBar });
        const closingBarline = boundaryBarline === ScoreSymbol.RepeatStart ? undefined : boundaryBarline;
        const opensWithRepeat = repeatBars?.get(barNumber)?.start === true
            && repeatBars.get(barNumber - 1)?.end !== true;
        const openingBarline = opensWithRepeat ? ScoreSymbol.RepeatStart : undefined;
        const className = this.generateFinalClassName([
            "staff-note-viewer",
            this.classFromProperty(isLastBar, "last-bar"),
        ]);

        // A simile holds no content of its own; its mark replaces the notes the measure would draw.
        const usesSimile = measure.simile === true;

        const items = usesSimile ? [] : MeasureProjection.project(measure);
        const nodes = this.buildNodes(items, scoreMetrics);

        const centerLine = (maxNoteLine + 1) / 2;

        // The row spans the measure column's content box. A beam's slope is a rise over this width, so
        // the view states it as data instead of measuring the rendered row.
        const rowWidthPx = Math.max(1, measureWidth - staffMeasureInsets);

        const beamSpans = this.computeBeamSpans(nodes, scoreMetrics, centerLine, rowWidthPx);
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

        let runs: ComponentChild[];
        if (usesSimile) {
            runs = [this.renderSimileSlot(barNumber, trackId, measure, scoreElementRegistry)];
        } else if (usesWholeBarRest) {
            runs = [this.renderWholeBarRestSlot(restLineOffset, barNumber, trackId, measure, scoreElementRegistry)];
        } else {
            runs = this.renderItems(nodes, beamSpans, "", centerLine, restLineOffset);
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

        // Every track piece closes with a real barline; the repeat marks at its boundary decide which one, and a
        // bar that opens a repeated section draws that barline itself.
        const closingInkWidth = closingBarline === undefined ? "0px" : ScoreSymbols.inkBox(closingBarline).width;

        // A repeat barline reaches into the bar with its dots, so the notes keep clear of that ink and of the gap
        // the stylesheet states, which is what the dots would otherwise stand right against.
        let clearance = "0px";
        if (closingBarline === ScoreSymbol.RepeatEnd || closingBarline === ScoreSymbol.RepeatBoth) {
            clearance = `calc(${closingInkWidth} + var(--staff-repeat-dot-gap))`;
        } else if (isLastBar) {
            clearance = finalBarlineWidth;
        }

        // The barline a bar opens with stands inside the bar it opens; so does the half of the barline a repeat
        // draws centred on the boundary when it ends the bar before this one and opens this one at once.
        const opensAfterRepeatEnd = repeatBars?.get(barNumber)?.start === true
            && repeatBars.get(barNumber - 1)?.end === true;
        const openingReach = openingBarline !== undefined
            ? ScoreSymbols.inkBox(openingBarline).width
            : (opensAfterRepeatEnd ? StaffNoteViewer.centredReach(ScoreSymbol.RepeatBoth) : undefined);

        // A repeat that closes the bar reaches into it the same way, so the bar keeps that room free of notes too.
        const closingReach = closingBarline === undefined
            ? undefined
            : StaffNoteViewer.repeatReach(closingBarline);

        // A rest stands centred in its slot, and so does the mark of a simile: both keep the room a barline takes
        // by themselves, so a bar reserves room only where a notehead stands next to the barline.
        const anchors = StaffNoteViewer.drawnAnchors(nodes, {
            numerator: 1,
            denominator: 2 * scoreMetrics.stepsPerBar,
        });
        const closingRoom = closingReach === undefined || !anchors.lastIsNote
            ? "0px"
            : `calc(${closingReach} + var(--staff-repeat-dot-gap))`;
        const firstHeadWidth = anchors.firstIsNote
            ? StaffNoteViewer.firstNoteHeadWidth(nodes)
            : undefined;

        const openingRoom = this.openingBarlineRoom(openingReach, closingRoom, anchors, firstHeadWidth,
            scoreMetrics.stepsPerBar);

        const closingBarlineElement = closingBarline === undefined
            ? null
            : this.renderBarline(closingBarline, staffSpacePx);
        const openingBarlineElement = openingBarline === undefined
            ? null
            : this.renderBarline(openingBarline, staffSpacePx);

        const articulationLayer = this.renderArticulations(articulations ?? [], barNumber, maxNoteLine, centerLine);

        // The stylesheet places the tuplet markers and the room below the row by the notation's own
        // bounds, so a marker follows the notes instead of a fixed height.
        const ink = this.rowInk(nodes, beamSpans, centerLine);
        const belowReservePx = StaffInk.belowReservePx(measure.track);

        return (
            <div
                className={className}
                ref={scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.TrackRow,
                    bar: barNumber,
                    trackId,
                })}
                style={{
                    "--staff-line-count": `${maxNoteLine}`,
                    "--staff-barline-height": `${barlineHeight}px`,
                    "--staff-barline-width": closingInkWidth,
                    "--staff-opening-barline-room": openingRoom,
                    "--staff-closing-barline-room": closingRoom,
                    "--staff-note-clearance": clearance,
                    "--staff-ink-top": StaffNoteViewer.formatPx(ink.topPx),
                    "--staff-ink-bottom": StaffNoteViewer.formatPx(ink.bottomPx),
                    "--staff-below-reserve": StaffNoteViewer.formatPx(belowReservePx),
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
                                const style = label.bracket
                                    ? { left: `${label.leftPercent}%`, width: `${label.widthPercent}%` }
                                    : { left: `${label.leftPercent + (label.widthPercent / 2)}%` };

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
     * @param symbol The barline the bar closes with.
     *
     * @returns How far that barline reaches into the bar, in CSS length syntax: a repeat that closes the bar draws
     * its ink on the bar's edge, a repeat that ends and opens at once draws it centred on that edge.
     */
    private static repeatReach(symbol: ScoreSymbol): string | undefined {
        if (symbol === ScoreSymbol.RepeatEnd) {
            return ScoreSymbols.inkBox(symbol).width;
        }

        if (symbol === ScoreSymbol.RepeatBoth) {
            return StaffNoteViewer.centredReach(symbol);
        }

        return undefined;
    }

    /**
     * @param symbol The barline a caller draws centred on a bar's edge.
     *
     * @returns How far that barline reaches into the bar beyond the edge, in CSS length syntax.
     */
    private static centredReach(symbol: ScoreSymbol): string {
        const ink = ScoreSymbols.inkBox(symbol).width;

        return `calc(${ink} - round(nearest, ${ink} / 2, 1px))`;
    }

    /**
     * Finds the drawn positions of the first and last anchor of a list of nodes, as fractions of the bar the nodes
     * belong to. A notehead is drawn half a grid step behind its onset, a rest sits centred in its slot. Rests count
     * as children: a group that starts or ends with one still has to be covered over its full extent.
     *
     * @param nodes The nodes to inspect.
     * @param halfStep Half a grid step, the offset a notehead is drawn at behind its onset.
     *
     * @returns The first and last anchor and whether they belong to a notehead, or undefined anchors when the
     * nodes hold no child.
     */
    private static drawnAnchors(nodes: IStaffTreeNode[], halfStep: IFraction): IDrawnAnchors {
        let firstAnchor: IFraction | undefined;
        let firstIsNote = false;
        let lastAnchor: IFraction | undefined;
        let lastIsNote = false;

        const walk = (items: IStaffTreeNode[]): void => {
            for (const item of items) {
                if (item.kind === StaffNodeKind.Note) {
                    const isNote = item.noteStyle !== undefined;
                    const anchor = isNote
                        ? addFractions(item.start, halfStep)
                        : addFractions(item.start, divideFraction(item.duration, 2));

                    if (firstAnchor === undefined || compareFractions(anchor, firstAnchor) < 0) {
                        firstAnchor = anchor;
                        firstIsNote = isNote;
                    }

                    if (lastAnchor === undefined || compareFractions(anchor, lastAnchor) > 0) {
                        lastAnchor = anchor;
                        lastIsNote = isNote;
                    }
                } else {
                    walk(item.children);
                }
            }
        };

        walk(nodes);

        return { firstAnchor, firstIsNote, lastAnchor, lastIsNote };
    }

    /**
     * @param nodes The nodes to search.
     *
     * @returns The width of the ink of the first notehead, in CSS length syntax, or undefined when the nodes hold
     * no note.
     */
    private static firstNoteHeadWidth(nodes: IStaffTreeNode[]): string | undefined {
        for (const node of nodes) {
            if (node.kind === StaffNodeKind.Subdivision) {
                const nested = StaffNoteViewer.firstNoteHeadWidth(node.children);
                if (nested !== undefined) {
                    return nested;
                }

                continue;
            }

            if (node.noteStyle !== undefined) {
                return ScoreSymbols.inkBox(ScoreSymbols.notehead(node.displayType, node.glyph.length)).width;
            }
        }

        return undefined;
    }

    /**
     * @param fraction The fraction to read.
     *
     * @returns The fraction as a number.
     */
    private static fractionValue(fraction: IFraction): number {
        return fraction.numerator / fraction.denominator;
    }

    /**
     * @param value The length in px to format.
     *
     * @returns The length as CSS, rounded to two decimals so the emitted style stays compact.
     */
    private static formatPx(value: number): string {
        return `${Math.round(value * 100) / 100}px`;
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
     * The room the notes of a bar keep before the barline it opens with. A barline a bar opens with reaches into
     * the bar with its dots, so the notes start right of that ink. How far right is the room the bar's last note
     * leaves before the barline it closes with, on top of the room the bar keeps free for that barline, which is
     * what makes both sides of a repeated section look alike. The barline's own ink and the gap the stylesheet
     * states are the smallest room, and a notehead reaches left of its anchor, so the room the first head already
     * takes is added back.
     *
     * @param reach How far the barline reaches into the bar, or undefined when no barline reaches into it.
     * @param closingRoom The room the bar keeps free before the barline it closes with.
     * @param anchors The drawn anchors of the bar's first and last ink.
     * @param firstHeadWidth The width of the first notehead's ink, or undefined when the bar opens without a note.
     * @param stepsPerBar The number of base-grid steps in a bar.
     *
     * @returns The room, in CSS length syntax.
     */
    private openingBarlineRoom(reach: string | undefined, closingRoom: string, anchors: IDrawnAnchors,
        firstHeadWidth: string | undefined, stepsPerBar: number): string {
        if (reach === undefined || firstHeadWidth === undefined || anchors.firstAnchor === undefined
            || !anchors.firstIsNote) {
            return "0px";
        }

        const ink = `calc(${reach} + var(--staff-repeat-dot-gap))`;

        // The room the last anchor leaves before the barline the bar closes with, or the barline's own ink when the
        // bar holds no child at all. A rest leaves room the same way a note does — it sits centred in its slot —
        // so only the barline's own ink is what a bar without a last anchor falls back on.
        const { lastAnchor } = anchors;
        const room = lastAnchor === undefined
            ? ink
            : `max(${ink}, calc(${100 - StaffNoteViewer.percentOf(lastAnchor)}% + ${closingRoom}))`;

        // A notehead is drawn half a grid step behind the anchor of its slot, so what the first head already takes
        // of the room is subtracted. Never more than half the bar is reserved, so the notes keep a place to stand.
        const headOverhang = `calc(${100 / (2 * stepsPerBar)}% - ${firstHeadWidth})`;

        return `max(0px, min(50%, calc(${room} - ${headOverhang})))`;
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
     * @param maxNoteLine The number of staff lines the row draws.
     * @param centerLine The line number the notes sit on.
     *
     * @returns The marking layer, or null when the bar holds none.
     */
    private renderArticulations(articulations: readonly IRangeArticulation[], barNumber: number, maxNoteLine: number,
        centerLine: number): ComponentChild {
        const marks: ComponentChild[] = [];
        const bandOffset = ((maxNoteLine - centerLine) * staffSpacePx) + (staffSpacePx * 2);

        for (const articulation of articulations) {
            const portion = RangeArticulations.portionInBar(articulation, barNumber);
            if (portion === undefined) {
                continue;
            }

            marks.push(RangeArticulations.isHairpin(articulation)
                ? this.renderPrintedHairpin(articulation, portion, barNumber, bandOffset)
                : this.renderPrintedForte(articulation, portion, bandOffset));
        }

        return marks.length > 0 ? <div className="staff-note-viewer-articulations">{marks}</div> : null;
    }

    /**
     * @param hairpin The hairpin to draw.
     * @param portion The part of the hairpin that lies in this bar.
     * @param barNumber The one-based measure the row draws.
     * @param bandOffset The top of the marking band, in px below the notes' line.
     *
     * @returns The hairpin portion as scalable line geometry.
     */
    private renderPrintedHairpin(hairpin: IHairpin, portion: IArticulationPortion, barNumber: number,
        bandOffset: number): ComponentChild {
        const startPercent = StaffNoteViewer.percentOf(portion.start);
        const endPercent = StaffNoteViewer.percentOf(portion.end);
        const widthPercent = Math.max(endPercent - startPercent, minimumPrintedHairpinPercent);
        const opening = staffSpacePx * printedHairpinOpeningSpaces;
        const topOffset = bandOffset - (opening / 2);

        // The wedge is one line from its tip to its opening. A hairpin over a barline is drawn per bar, so each bar
        // keeps the opening the wedge has at its own edges, which lets the parts meet at the barlines.
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
            left: `${startPercent}%`,
            width: `${widthPercent}%`,
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
     * @param portion The position of the marking in this bar.
     * @param bandOffset The top of the marking band, in px below the notes' line.
     *
     * @returns The `f` glyph, centred on its event.
     */
    private renderPrintedForte(mark: IRangeArticulation, portion: IArticulationPortion,
        bandOffset: number): ComponentChild {
        const style: CSSProperties = {
            left: `${StaffNoteViewer.percentOf(portion.start)}%`,
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
     * Converts projected render items into the staff tree, enriching note events with glyph,
     * beam and style data resolved from the measure's note events.
     *
     * @param items The projected items to convert.
     * @param grid The timing of the arrangement.
     * @param depth The subdivision nesting depth (0 at the top level).
     *
     * @returns The staff tree nodes.
     */
    private buildNodes(items: IProjectedItem[], grid: INotationGrid, depth = 0): IStaffTreeNode[] {
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
                    children: this.buildNodes(item.items, grid, depth + 1),
                };
            }

            return this.buildNoteNode(item, grid, depth);
        });
    }

    private buildNoteNode(item: IProjectedEvent, grid: INotationGrid, depth: number): IStaffNoteNode {
        const { measure } = this.props;

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
            displayType = this.resolveDisplayType(audioData);
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
     * @param nodes The nodes the row draws.
     * @param beamSpans The beam engraving of the row's beamed notes.
     * @param centerLine The line the row is drawn around.
     *
     * @returns The room the row's notation takes around its reference line.
     */
    private rowInk(nodes: IStaffTreeNode[], beamSpans: Map<number, IBeamNotePlan>, centerLine: number): IStaffInk {
        const notes = this.collectNotes(nodes).map((note): IStaffInkNote => {
            const plan = beamSpans.get(note.eventIndex);
            const hasStem = plan !== undefined
                || (note.noteStyle !== undefined && note.glyph.length !== NoteLength.Whole);

            return {
                noteLine: note.noteStyle === undefined ? undefined : (note.noteLine ?? 1),
                stemLengthSpaces: plan !== undefined
                    ? plan.stemLengthPx / staffSpacePx
                    : (hasStem ? normalStemLengthSpaces : undefined),
                beamCount: plan?.strokes.length ?? 0,
            };
        });

        return StaffInk.ofRow(notes, centerLine);
    }

    /**
     * Resolves the beam engraving of every note from the measure's beam groups. Which events share a
     * beam is a composition rule of the measure and not of the rendering, so the groups come from
     * `MeasureProjection`; `BeamGeometry` then derives the one line a group shares and the strokes and
     * stem endpoints that follow from it.
     *
     * @param nodes The nodes holding the render data of the measure's events.
     * @param scoreMetrics Timing metrics for the grouping rules.
     * @param centerLine The line the row is drawn around.
     * @param rowWidthPx The row's content width in px, which a beam's slope is derived from.
     *
     * @returns Map of note event indices to their beam engraving.
     */
    private computeBeamSpans(nodes: IStaffTreeNode[], scoreMetrics: IScoreMetrics,
        centerLine: number, rowWidthPx: number): Map<number, IBeamNotePlan> {
        const { measure } = this.props;
        const target = new Map<number, IBeamNotePlan>();
        const notesByEvent = new Map<number, IStaffNoteNode>();
        const halfStep = 1 / (2 * scoreMetrics.stepsPerBar);

        for (const note of this.collectNotes(nodes)) {
            notesByEvent.set(note.eventIndex, note);
        }

        for (const group of MeasureProjection.noteGroups(measure, scoreMetrics)) {
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
                    anchor: StaffNoteViewer.fractionValue(note.start) + halfStep,
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

    private collectNotes(nodes: IStaffTreeNode[]): IStaffNoteNode[] {
        const notes: IStaffNoteNode[] = [];

        for (const node of nodes) {
            if (node.kind === StaffNodeKind.Note) {
                notes.push(node);
            } else {
                notes.push(...this.collectNotes(node.children));
            }
        }

        return notes;
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
     * Renders the hierarchical flex tree. Each note/rest cell grows proportionally to its duration
     * relative to the current container's span, and each tuplet container grows proportionally to
     * its span. Relative values keep every flex level's grow factors summing to 1, so all children
     * fill their container.
     *
     * @param nodes The tree nodes to render at this level.
     * @param beamSpans Map of note event indices to beam info (these render with attached beam segments).
     * @param keyPrefix A prefix for React keys to ensure uniqueness across recursive calls.
     * @param centerLine The centre line index ((maxNoteLine + 1) / 2), used to compute per-note vertical offsets.
     * @param restLineOffset Vertical offset in px for whole/half rests so they sit on the centre line.
     * @param containerSpan The total span of the current flex container as a fraction of the whole bar.
     * @param atMeasureEnd Whether the current container ends with the measure.
     *
     * @returns List of VNodes representing the rendered items at this level.
     */
    private renderItems(nodes: IStaffTreeNode[], beamSpans: Map<number, IBeamNotePlan>,
        keyPrefix: string, centerLine: number, restLineOffset: number, containerSpan = 1,
        atMeasureEnd = true): ComponentChild[] {
        const { scoreMetrics, measure, barNumber, trackId, scoreElementRegistry } = this.props;

        return nodes.map((node, index) => {
            const isMeasureEnd = atMeasureEnd && index === nodes.length - 1;

            if (node.kind === StaffNodeKind.Subdivision) {
                const spanFraction = node.span.numerator / node.span.denominator;

                return (
                    <div
                        key={`${keyPrefix}tuplet-${index}`}
                        style={{
                            flex: `${spanFraction / containerSpan} 1 0`,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            height: "100%",
                            position: "relative",
                        }}
                    >
                        {this.renderItems(node.children, beamSpans, `${keyPrefix}${index}-`, centerLine,
                            restLineOffset, spanFraction, isMeasureEnd)}
                    </div>
                );
            }

            const grow = node.duration.denominator > 0
                ? (node.duration.numerator / node.duration.denominator) / containerSpan
                : 1;

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
                flex: `${grow} 1 0`,
                minWidth: 0,
                "--note-anchor": anchor,
                ...(beamInfo === undefined ? {} : {
                    // The stem ends on the group's beam line at this note's own horizontal position.
                    "--stem-tip": StaffNoteViewer.formatPx(beamInfo.stemLengthPx),
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

                if (node.glyph.dotted) {
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
                const dotElement = node.glyph.dotted
                    ? <ScoreSymbolView
                        className="staff-note-head-dot"
                        symbol={ScoreSymbol.AugmentationDot}
                        staffSpace={staffSpacePx}
                    />
                    : null;
                const accentElement = node.articulation?.accent
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
                            {this.renderGhostParentheses(node.articulation)}
                            {this.renderNoteDecorations(node.noteStyle, node.articulation)}
                            {accentElement}
                        </span>
                        {hasBeam ? this.renderBeamSegments(node.eventIndex, beamInfo) : null}
                    </div>
                );
            }

            const restGlyph = noteValueForEvent(node.duration, node.depth, scoreMetrics.stepsPerBar,
                scoreMetrics.stepsPerPulse)
                ?? { length: NoteLength.Sixteenth, dotted: false };
            const isWholeOrHalf = restGlyph.length === NoteLength.Whole || restGlyph.length === NoteLength.Half;
            const restSymbol = ScoreSymbols.rest(restGlyph.length);
            const restBox = ScoreSymbols.inkBox(restSymbol);

            // A whole or half rest sits on the line below the one the notes are drawn on, which is the line
            // they hang from or sit on.
            const restStyle = {
                "--rest-ink-width": restBox.width,
                "--rest-line-offset": `${isWholeOrHalf ? restLineOffset : 0}px`,
            } as CSSProperties;

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
                    <span className="staff-note-viewer-rest-symbol" style={restStyle}>
                        <ScoreSymbolView symbol={restSymbol} staffSpace={staffSpacePx} />
                        {restGlyph.dotted
                            ? <ScoreSymbolView
                                className="staff-note-viewer-rest-dot"
                                symbol={ScoreSymbol.AugmentationDot}
                                staffSpace={staffSpacePx}
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
     * @param stepIndex The note event index to render beams for (used for keying).
     * @param plan The beam engraving of this note.
     *
     * @returns List of VNodes representing the beam strokes attached to this note.
     */
    private renderBeamSegments(stepIndex: number, plan: IBeamNotePlan): VNode[] {
        // Further beam levels hang below the primary one in the font's own rhythm: one beam thickness
        // plus one beam space per level. The stroke box spans the beam line's own rise, so the
        // parallelogram is one line and its vertical thickness hangs from that line.
        const beamAdvance = "(var(--beam-thickness, 4px) + var(--beam-spacing, 2px))";
        const beamThickness = "var(--beam-thickness, 4px)";
        const halfStem = "var(--stem-half-width, 1px)";
        const stubWidth = `calc(var(--staff-space) * ${partialBeamLengthSpaces} + var(--stem-right-edge, 0px))`;

        return plan.strokes.map((stroke) => {
            const boxTopPx = Math.min(stroke.leftPx, stroke.rightPx);
            const leftLocal = StaffNoteViewer.formatPx(stroke.leftPx - boxTopPx);
            const rightLocal = StaffNoteViewer.formatPx(stroke.rightPx - boxTopPx);
            const clipPath = `polygon(0 ${leftLocal}, 100% ${rightLocal},`
                + ` 100% calc(${rightLocal} + ${beamThickness}), 0 calc(${leftLocal} + ${beamThickness}))`;
            const top = `calc(50% + ${StaffNoteViewer.formatPx(boxTopPx)} + ${stroke.level - 1} * ${beamAdvance})`;
            const height = `calc(${StaffNoteViewer.formatPx(Math.abs(stroke.rightPx - stroke.leftPx))}`
                + ` + ${beamThickness})`;
            const key = `beam-${stepIndex}-${stroke.level}-${stroke.kind}`;

            let left: string;
            let width: string;
            if (stroke.kind === BeamSegmentKind.SharedRight) {
                left = `calc(var(--note-anchor) - ${halfStem})`;
                width = "100%";
            } else if (stroke.kind === BeamSegmentKind.PartialRight) {
                left = `calc(var(--note-anchor) - ${halfStem})`;
                width = stubWidth;
            } else {
                left = `calc(var(--note-anchor) - var(--staff-space) * ${partialBeamLengthSpaces})`;
                width = stubWidth;
            }

            return (
                <span
                    key={key}
                    className="staff-note-viewer-beam"
                    style={{
                        top,
                        left,
                        width,
                        height,
                        clipPath,
                    }}
                />
            );
        });
    }

    /**
     * Renders the parentheses a ghost note is wrapped in. They hang on the head's ink box, so they fit any
     * head shape without an offset tuned to one of them.
     *
     * @param articulation The note's articulation.
     *
     * @returns The two parentheses, or null for a note that is not a ghost note.
     */
    private renderGhostParentheses(articulation?: INoteArticulation): ComponentChild {
        if (articulation?.ghost !== true) {
            return null;
        }

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
                    <ScoreSymbolView symbol={ScoreSymbol.RestWhole} staffSpace={staffSpacePx} />
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

    private resolveDisplayType(noteStyle: IAudioData): NoteDisplayType {
        if ("mainDisplayType" in noteStyle.characteristics) {
            return noteStyle.characteristics.mainDisplayType!;
        }

        return NoteDisplayType.Oval;
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
