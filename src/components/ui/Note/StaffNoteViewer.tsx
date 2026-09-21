/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type CSSProperties, type VNode } from "preact";

import { articulationFromSampleProfile } from "../../../core/articulation.js";
import type { ISbDmTrackMeasure } from "../../../core/ScoreBookDataModel.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique,
    type INoteArticulation,
} from "../../../core/ScoreBookDataModel.js";
import {
    MeasureProjection, NoteGroupKind, ProjectedItemKind, pulseIndexOf, pulseLengthAt,
    type INotationGrid, type IProjectedEvent, type IProjectedItem,
} from "../../../core/MeasureProjection.js";
import type { IFraction, IAudioData, ISubdivision } from "../../../core/types/general.js";
import { beamCountOf, fallbackNoteValue, noteValueForEvent, type INoteValue }
    from "../../../core/rest-notation.js";
import type { IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { addFractions, compareFractions, divideFraction, subtractFractions }
    from "../../../core/serialisation/numeric-functions.js";
import { ScoreElementKind, type ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";
import { NoteImage, NoteKind, NoteLength } from "../framework/NoteImage.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IStaffNoteViewerProperties extends ICommonUIProperties {
    isLastBar: boolean;
    timeSignature: string;
    scoreMetrics: IScoreMetrics;
    baseSteps: number;

    measure: ISbDmTrackMeasure;
    barNumber: number;
    trackId: number;
    scoreElementRegistry?: ScoreElementRegistry;

    /** Maximum noteLine value across all variants of the instrument (default 1 = single line). */
    maxNoteLine?: number;
}

/** Discriminator for staff tree nodes. */
export enum StaffNodeKind {
    Note,
    Subdivision,
}

interface IStaffNoteNode {
    kind: StaffNodeKind.Note;

    /** Index of this note's event in `ISbDmTrackMeasure.events`, matching the resolved note events 1:1. */
    eventIndex: number;

    /** Absolute start within the measure, as a fraction of the whole bar. */
    start: IFraction;

    duration: IFraction;

    /** Tuplet nesting depth (0 at the top level). */
    depth: number;

    glyph: INoteValue;
    beamCount: number;
    displayType: NoteDisplayType;
    diamondOpen?: boolean;
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

interface IBeamInfo {
    segments: IBeamSegment[];
}

interface IBeamSegment {
    /** 1-based beam level: 1 = eighth, 2 = sixteenth, 3 = thirty-second. */
    level: number;

    kind: "shared-right" | "partial-left" | "partial-right";
}

interface ITupletLabel {
    /** The tuplet the label belongs to, which is what the label addresses in a hit test. */
    group: ISubdivision;

    leftPercent: number;
    widthPercent: number;
    text: string;
    bracket: boolean;
    placement: "above" | "below";
}

interface ITupletBounds {
    /** Drawn position of the first child, as a fraction of the whole bar. */
    firstAnchor?: IFraction;

    /** Drawn position of the last child, as a fraction of the whole bar. */
    lastAnchor?: IFraction;
}

/**
 * Width the flags occupy right of a notehead, in px. The sprite's flag paths reach x = 58.6 of its
 * 60 units, which the symbol renders 25 px wide, less the flag shift of 2.4 units.
 */
const noteFlagWidth = 11;

/**
 * Width the final barline occupies at the right edge of the last bar, in px. Mirrors the rule of
 * `.staff-note-viewer-final-barline` in component-styles.
 */
const finalBarlineWidth = 6;

export class StaffNoteViewer extends UIComponent<IStaffNoteViewerProperties> {
    public override render(): ComponentChild {
        const { isLastBar, scoreMetrics, measure, barNumber, trackId, maxNoteLine = 1,
            scoreElementRegistry } = this.props;
        const className = this.generateFinalClassName([
            "staff-note-viewer",
            this.classFromProperty(isLastBar, "last-bar"),
        ]);

        const items = MeasureProjection.project(measure);
        const nodes = this.mergeRestsWithinPulses(this.buildNodes(items, scoreMetrics), scoreMetrics);

        const beamSpans = this.computeBeamSpans(nodes, scoreMetrics);
        const tupletLabels = this.computeTupletLabels(nodes, scoreMetrics.stepsPerBar);

        const hasAnyNote = nodes.some((node) => {
            return this.nodeHasAnyNote(node);
        });

        const centerLine = (maxNoteLine + 1) / 2;

        // Whole and half rests sit on the centre line (odd count) or the line just below it (even count).
        const restNoteLine = Math.ceil(centerLine);
        const restLineOffset = (restNoteLine - centerLine) * 10;

        const runs =
            hasAnyNote
                ? this.renderItems(nodes, beamSpans, "", centerLine, restLineOffset)
                : [this.renderWholeBarRestSlot(restLineOffset, barNumber, trackId, scoreElementRegistry)];

        // Render staff lines. For a single line, render the centred middle line as before.
        // For multiple lines, render N lines symmetrically around the vertical centre.
        const staffLines: ComponentChild[] = [];
        for (let i = 1; i <= maxNoteLine; i++) {
            const offset = ((i - centerLine) * 10) + 31.5; // 10px = line spacing, +16px = prefix-row shift
            staffLines.push(
                <div
                    key={`staff-line-${i}`}
                    className="staff-note-viewer-line"
                    style={{ top: `calc(50% + ${offset}px)` }}
                />,
            );
        }

        return (
            <div
                className={className}
                ref={scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.TrackRow,
                    bar: barNumber,
                    trackId,
                })}
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
                {isLastBar ? <div className="staff-note-viewer-final-barline" /> : null}
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
        let diamondOpen: boolean | undefined;
        let noteLine: number | undefined;

        if (audioData) {
            displayType = this.resolveDisplayType(audioData);
            diamondOpen = this.resolveDiamondOpen(audioData);
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
            diamondOpen,
            noteLine,
            noteStyle: audioData,
            articulation: event.articulation ?? (audioData
                ? articulationFromSampleProfile(audioData.sampleProfile)
                : undefined),
        };
    }

    /**
     * Merges consecutive rests that share a pulse into a single rest when their combined duration
     * is a plain (non-dotted) note value. Two eighth rests in one pulse become a quarter rest, for
     * example. Rest groups never cross a pulse boundary or a subdivision boundary.
     *
     * @param nodes The staff tree to merge rests in.
     * @param grid The timing of the arrangement.
     *
     * @returns The staff tree with adjacent same-pulse rests merged.
     */
    private mergeRestsWithinPulses(nodes: IStaffTreeNode[], grid: INotationGrid): IStaffTreeNode[] {
        const result: IStaffTreeNode[] = [];
        let restGroup: IStaffNoteNode[] = [];

        const flush = (): void => {
            if (restGroup.length > 1 && this.isPlainRestGroup(restGroup, grid)) {
                let total: IFraction = { numerator: 0, denominator: 1 };

                for (const node of restGroup) {
                    total = addFractions(total, node.duration);
                }

                result.push({ ...restGroup[0], duration: total });
                restGroup = [];

                return;
            }

            result.push(...restGroup);
            restGroup = [];
        };

        for (const node of nodes) {
            if (node.kind === StaffNodeKind.Note && node.noteStyle === undefined) {
                const previousRest = restGroup.at(-1);

                if (previousRest !== undefined
                    && pulseIndexOf(previousRest.start, grid) !== pulseIndexOf(node.start, grid)) {
                    flush();
                }

                restGroup.push(node);

                continue;
            }

            flush();
            result.push(node);
        }

        flush();

        return result;
    }

    /**
     * Checks whether a group of rests sums to a plain (non-dotted) rest value.
     *
     * @param group The rest nodes to evaluate.
     * @param grid The timing of the arrangement.
     *
     * @returns True when the combined duration maps to a non-dotted rest glyph.
     */
    private isPlainRestGroup(group: IStaffNoteNode[], grid: INotationGrid): boolean {
        let total: IFraction = { numerator: 0, denominator: 1 };

        for (const node of group) {
            total = addFractions(total, node.duration);
        }

        const glyph = noteValueForEvent(total, 0, grid.stepsPerBar, pulseLengthAt(group[0].start, grid));

        return glyph !== undefined && !glyph.dotted;
    }

    /**
     * Assigns beam spans from the measure's beam groups. Which events share a beam is a composition
     * rule of the measure and not of the rendering, so the groups come from `MeasureProjection`;
     * this method only resolves the strokes to draw for the notes of each group.
     *
     * @param nodes The nodes holding the render data of the measure's events.
     * @param scoreMetrics Timing metrics for the grouping rules.
     *
     * @returns Map of note event indices to beam info.
     */
    private computeBeamSpans(nodes: IStaffTreeNode[], scoreMetrics: IScoreMetrics): Map<number, IBeamInfo> {
        const { measure } = this.props;
        const target = new Map<number, IBeamInfo>();
        const notesByEvent = new Map<number, IStaffNoteNode>();

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

            this.assignBeamSegments(run, target);
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

    private assignBeamSegments(run: IStaffNoteNode[], target: Map<number, IBeamInfo>): void {
        for (let i = 0; i < run.length; i++) {
            const note = run[i];
            const segments: IBeamSegment[] = [];

            for (let level = 1; level <= note.beamCount; level++) {
                const hasRight = i + 1 < run.length && run[i + 1].beamCount >= level;
                const hasLeft = i > 0 && run[i - 1].beamCount >= level;

                if (hasRight) {
                    segments.push({ level, kind: "shared-right" });
                } else if (hasLeft) {
                    segments.push({ level, kind: "partial-left" });
                } else if (i === 0) {
                    segments.push({ level, kind: "partial-right" });
                } else {
                    segments.push({ level, kind: "partial-left" });
                }
            }

            target.set(note.eventIndex, { segments });
        }
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
                        const bounds = this.tupletBounds(item, halfStep);
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

    /**
     * Finds the drawn positions of the first and last child within a subdivision's subtree, which is
     * where the bracket has to reach. A notehead is drawn half a grid step behind its onset, a rest
     * sits centred in its slot. Rests are children too: a group that starts or ends with one still
     * has to be bracketed over its full extent.
     *
     * @param node The subdivision to inspect.
     * @param halfStep Half a base-grid step, the offset a notehead is drawn at behind its onset.
     *
     * @returns The first and last child position, or undefined when the subtree has no child.
     */
    private tupletBounds(node: IStaffSubdivisionNode, halfStep: IFraction): ITupletBounds {
        let firstAnchor: IFraction | undefined;
        let lastAnchor: IFraction | undefined;

        const walk = (items: IStaffTreeNode[]): void => {
            for (const item of items) {
                if (item.kind === StaffNodeKind.Note) {
                    const anchor = item.noteStyle !== undefined
                        ? addFractions(item.start, halfStep)
                        : addFractions(item.start, divideFraction(item.duration, 2));

                    if (firstAnchor === undefined || compareFractions(anchor, firstAnchor) < 0) {
                        firstAnchor = anchor;
                    }

                    if (lastAnchor === undefined || compareFractions(anchor, lastAnchor) > 0) {
                        lastAnchor = anchor;
                    }
                } else {
                    walk(item.children);
                }
            }
        };

        walk(node.children);

        return { firstAnchor, lastAnchor };
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
    private renderItems(nodes: IStaffTreeNode[], beamSpans: Map<number, IBeamInfo>,
        keyPrefix: string, centerLine: number, restLineOffset: number, containerSpan = 1,
        atMeasureEnd = true): ComponentChild[] {
        const { scoreMetrics, measure, barNumber, trackId, isLastBar, scoreElementRegistry } = this.props;

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
            // instead, so its flags end where the slot ends and stay inside the bar. The last bar
            // additionally keeps clear of the final barline, which sits inside its right edge.
            const endsMeasureWithFlags = isMeasureEnd && !hasBeam && node.noteStyle !== undefined
                && anchorPercent >= 100;
            const anchor = endsMeasureWithFlags
                ? `calc(100% - ${noteFlagWidth + (isLastBar ? finalBarlineWidth : 0)}px)`
                : `${anchorPercent}%`;

            const slotStyle = {
                flex: `${grow} 1 0`,
                minWidth: 0,
                "--note-anchor": anchor,
            } as CSSProperties;
            const stepIndex = Math.floor(
                (node.start.numerator * scoreMetrics.stepsPerBar) / node.start.denominator,
            );

            if (node.noteStyle !== undefined) {
                // Compute vertical offset for this note's staff line.
                const effectiveNoteLine = node.noteLine ?? 1;
                const lineOffset = (effectiveNoteLine - centerLine) * 10; // 10px = line spacing
                const translateY = `translateY(calc(-18px + ${lineOffset}px))`;

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

                // Non-oval heads are drawn in CSS and hide the sprite's head, so they draw the
                // augmentation dot themselves as well.
                const dotElement = isNonOval && node.glyph.dotted
                    ? <span className="staff-note-head-dot" />
                    : null;

                const needsCssStem = !hasBeam && node.glyph.length !== NoteLength.Whole;

                // The head wrapper keeps its place in the run while the notehead is drawn at the note's
                // staff line. Everything drawn around the head reads that line from this variable.
                const headStyle = { "--note-line-offset": `${lineOffset}px` } as CSSProperties;

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
                            <NoteImage
                                className="staff-note-viewer-note-symbol"
                                kind={NoteKind.Note}
                                value={node.glyph.length}
                                style={{
                                    flexShrink: 0,
                                    transform: translateY,
                                }}
                                headType={headType}
                                dotted={!isNonOval && node.glyph.dotted}
                                diamondOpen={node.diamondOpen}
                                flagCount={hasBeam ? 0 : undefined}
                                hideStem={true}
                                alt=""
                            />
                            {dotElement}
                            {needsCssStem ? <span className="staff-note-head-stem" /> : null}
                            {this.renderNoteDecorations(node.noteStyle, node.articulation)}
                            {headType === NoteDisplayType.Cross ? this.renderCrossHead() : null}
                        </span>
                        {node.articulation?.accent ? (
                            <span className="staff-note-viewer-accent">&gt;</span>
                        ) : null}
                        {hasBeam ? this.renderBeamSegments(node.eventIndex, beamInfo) : null}
                        {hasBeam ? this.renderCustomStem(lineOffset, headType) : null}
                    </div>
                );
            }

            const restGlyph = noteValueForEvent(node.duration, node.depth, scoreMetrics.stepsPerBar,
                scoreMetrics.stepsPerPulse)
                ?? { length: NoteLength.Sixteenth, dotted: false };
            const isWholeOrHalf = restGlyph.length === NoteLength.Whole || restGlyph.length === NoteLength.Half;

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
                    <NoteImage
                        className="staff-note-viewer-rest-symbol"
                        kind={NoteKind.Rest}
                        value={restGlyph.length}
                        style={{
                            flexShrink: 0,
                            ...(isWholeOrHalf ? { transform: `translateY(${restLineOffset}px)` } : {}),
                        }}
                        dotted={restGlyph.dotted}
                        alt=""
                    />
                </div>
            );
        });
    }

    /**
     * Renders the beam strokes attached to a single note inside a beam group. All notes share the
     * same onset anchor (event start + half a step), so a shared stroke bridges the full slot width
     * to the next notehead and partial stubs occupy a fixed pixel width on the stem side.
     *
     * @param stepIndex The note event index to render beams for (used for keying).
     * @param info The beam info for this note, including the segments to render.
     *
     * @returns List of VNodes representing the beam segments attached to this note.
     */
    private renderBeamSegments(stepIndex: number, info: IBeamInfo): VNode[] {
        const beamGap = 6;
        const primaryTopOffset = 38;
        const partialPixels = 12;

        return info.segments.map((segment) => {
            const top = `calc(50% - ${primaryTopOffset - ((segment.level - 1) * beamGap)}px)`;
            const key = `beam-${stepIndex}-${segment.level}-${segment.kind}`;

            if (segment.kind === "shared-right") {
                return (
                    <span
                        key={key}
                        className="staff-note-viewer-beam"
                        style={{
                            top,
                            left: "var(--note-anchor)",
                            width: "100%",
                        }}
                    />
                );
            }

            if (segment.kind === "partial-right") {
                return (
                    <span
                        key={key}
                        className="staff-note-viewer-beam"
                        style={{
                            top,
                            left: "var(--note-anchor)",
                            width: `${partialPixels}px`,
                        }}
                    />
                );
            }

            // partial-left: stub pointing from the notehead towards the previous note.
            return (
                <span
                    key={key}
                    className="staff-note-viewer-beam"
                    style={{
                        top,
                        left: `calc(var(--note-anchor) - ${partialPixels}px)`,
                        width: `${partialPixels}px`,
                    }}
                />
            );
        });
    }

    /**
     * Renders a CSS stem overlay for beamed notes, replacing the hidden SVG stem.
     * Spans from the note-head connection point to just above the primary beam.
     *
     * @param lineOffset Vertical offset in px for this note's staff line relative to the centre line.
     * @param headType   The note head type, used for per-head-type stem positioning.
     *
     * @returns A VNode representing the custom stem.
     */
    private renderCustomStem(lineOffset: number, headType: NoteDisplayType): VNode {
        const headClass = headType !== NoteDisplayType.Oval
            ? `staff-note-viewer-custom-stem--${this.headTypeClassName(headType)}`
            : "";

        return (
            <span
                className={`staff-note-viewer-custom-stem ${headClass}`}
                style={{
                    height: `calc(35px + ${lineOffset}px)`,
                }}
            />
        );
    }

    /**
     * Renders the whole-measure rest shown when a measure contains no sounding notes.
     *
     * @param restLineOffset Vertical offset in px so the rest sits on the centre line.
     * @param barNumber The one-based measure number of this viewer.
     * @param trackId The track identity of this viewer.
     * @param scoreElementRegistry The registry to register the rest run in.
     *
     * @returns The whole-measure rest run.
     */
    private renderWholeBarRestSlot(restLineOffset: number, barNumber: number, trackId: number,
        scoreElementRegistry?: ScoreElementRegistry): VNode {
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
                })}
            >
                <NoteImage
                    className="staff-note-viewer-rest-symbol"
                    kind={NoteKind.Rest}
                    value={NoteLength.Whole}
                    style={{
                        flexShrink: 0,
                        transform: `translateY(${restLineOffset}px)`,
                    }}
                    alt=""
                />
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

    private resolveDiamondOpen(noteStyle: IAudioData): boolean | undefined {
        const characteristics = noteStyle.characteristics;
        if (!("mainDisplayType" in characteristics) || characteristics.mainDisplayType !== NoteDisplayType.Diamond) {
            return undefined;
        }

        return noteStyle.sampleProfile.builtInDamping === Damping.Open;
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

        // Ghost notes: rendered with parentheses, derived from the note's articulation.
        if (articulation?.ghost) {
            classes.push("ghost-note");
        }

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
                    NoteImage.registerSymbol("cross-head", "0 0 14 14",
                        `<line x1="2" y1="2" x2="12" y2="12" />` +
                        `<line x1="12" y1="2" x2="2" y2="12" />`,
                    );

                    nodes.push(
                        <svg key="slap-cross" className="staff-note-head-slap-svg"
                            width={10} height={10}
                            viewBox="0 0 14 14"
                            aria-hidden="true"
                            style={{
                                stroke: "var(--color-base-100)",
                                strokeWidth: 3,
                                strokeLinecap: "round",
                            }}>
                            <use href="#symbol-cross-head" />
                        </svg>,
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
            NoteImage.registerSymbol("press-roll", "0 0 14 35",
                `<line x1="11" y1="6" x2="3" y2="11" />` +
                `<line x1="11" y1="11" x2="3" y2="16" />` +
                `<line x1="11" y1="16" x2="3" y2="21" />`,
            );

            nodes.push(
                <svg key="press-roll" className="staff-note-head-press-roll-svg"
                    width={14} height={35}
                    aria-hidden="true"
                    style={{ stroke: "var(--color-base-content)", strokeWidth: 2.5, strokeLinecap: "round" }}>
                    <use href="#symbol-press-roll" />
                </svg>,
            );
        }

        if (characteristics.excitationMode === ExcitationMode.Struck && "stickTechnique" in characteristics
            && characteristics.stickTechnique === StickTechnique.RimShot) {
            NoteImage.registerSymbol("cross-head", "0 0 14 14",
                `<line x1="2" y1="2" x2="12" y2="12" />` +
                `<line x1="12" y1="2" x2="2" y2="12" />`,
            );

            nodes.push(
                <svg key="rimshot-cross" className="staff-note-head-rimshot-cross-svg"
                    width={8} height={8}
                    aria-hidden="true"
                    style={{ stroke: "var(--color-base-content)", strokeWidth: 2.5, strokeLinecap: "round" }}>
                    <use href="#symbol-cross-head" />
                </svg>,
            );
        }

        // Damped (muted) note: plus sign above the note head, derived from the note's articulation.
        if (articulation?.damping === Damping.Muted) {
            nodes.push(
                <span key="damped-plus" className="staff-note-head-damped-plus">+</span>,
            );
        }

        // Ghost note: closing parenthesis (opening is via CSS ::before on .ghost-note).
        if (articulation?.ghost) {
            nodes.push(
                <span key="ghost-paren" className="staff-note-head-ghost-paren">)</span>,
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

    /**
     * Renders the cross (×) note head as a cached SVG symbol with rounded line caps.
     *
     * @returns An SVG VNode referencing the cached cross symbol.
     */
    private renderCrossHead(): VNode {
        NoteImage.registerSymbol("cross-head", "0 0 14 14",
            `<line x1="2" y1="2" x2="12" y2="12" />` +
            `<line x1="12" y1="2" x2="2" y2="12" />`,
        );

        return (
            <svg className="staff-note-head-cross-svg"
                width={14} height={14}
                aria-hidden="true"
                style={{
                    stroke: "var(--color-base-content)",
                    strokeWidth: 2.8,
                    strokeLinecap: "round",
                    overflow: "visible"
                }}>
                <use href="#symbol-cross-head" />
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
