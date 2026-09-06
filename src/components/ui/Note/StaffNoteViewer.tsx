/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type CSSProperties, type VNode } from "preact";

import type { ISbDmTrackMeasure } from "../../../core/ScoreBookDataModel.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique,
    type INoteArticulation,
} from "../../../core/ScoreBookDataModel.js";
import {
    MeasureProjection, ProjectedItemKind, type IProjectedEvent, type IProjectedItem,
} from "../../../core/MeasureProjection.js";
import type { IFraction, IAudioData } from "../../../core/types/general.js";
import type { IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { addFractions, compareFractions, subtractFractions } from "../../../core/serialisation/numeric-functions.js";
import { ScoreElementKind, type ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";
import { NoteImage, NoteImageHeadType, NoteKind, NoteLength } from "../framework/NoteImage.js";
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

    /** Identity of the innermost enclosing tuplet, or undefined for notes outside any tuplet. */
    tupletId?: number;

    glyph: INoteGlyph;
    beamCount: number;
    displayType: NoteDisplayType;
    diamondOpen?: boolean;
    noteLine?: number;
    noteStyle?: IAudioData;
    articulation?: INoteArticulation;
}

interface IStaffSubdivisionNode {
    kind: StaffNodeKind.Subdivision;
    start: IFraction;
    span: IFraction;
    actual: number;
    normal: number;
    isTuplet: boolean;
    depth: number;
    children: IStaffTreeNode[];
}

type IStaffTreeNode = IStaffNoteNode | IStaffSubdivisionNode;

interface INoteGlyph {
    icon: NoteLength;
    dotted: boolean;
}

interface IBeamInfo {
    segments: IBeamSegment[];
}

interface IBeamSegment {
    /** 1-based beam level: 1 = eighth, 2 = sixteenth, 3 = thirty-second. */
    level: number;

    kind: "shared-right" | "partial-left" | "partial-right";
}

interface ITupletLabel {
    leftPercent: number;
    widthPercent: number;
    text: string;
    bracket: boolean;
    placement: "above" | "below";
}

interface ITupletNoteBounds {
    firstStart?: IFraction;
    lastStart?: IFraction;
}

export class StaffNoteViewer extends UIComponent<IStaffNoteViewerProperties> {
    private tupletIdSequence = 0;

    public override render(): ComponentChild {
        const { isLastBar, scoreMetrics, measure, barNumber, trackId, maxNoteLine = 1,
            scoreElementRegistry } = this.props;
        const className = this.generateFinalClassName([
            "staff-note-viewer",
            this.classFromProperty(isLastBar, "last-bar"),
        ]);

        const { stepsPerBar, stepsPerPulse } = scoreMetrics;

        const items = MeasureProjection.project(measure);
        this.tupletIdSequence = 0;
        const nodes = this.mergeRestsWithinPulses(
            this.buildNodes(items, stepsPerBar, stepsPerPulse),
            stepsPerBar,
            stepsPerPulse,
        );

        const beamSpans = this.computeBeamSpans(nodes, scoreMetrics);
        const tupletLabels = this.computeTupletLabels(nodes, stepsPerBar);

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
     * @param stepsPerBar The number of base-grid steps in a bar.
     * @param stepsPerPulse The number of base-grid steps in a pulse.
     * @param depth The tuplet nesting depth (0 at the top level).
     * @param tupletId The identity of the innermost enclosing tuplet, or undefined.
     *
     * @returns The staff tree nodes.
     */
    private buildNodes(items: IProjectedItem[], stepsPerBar: number, stepsPerPulse: number,
        depth = 0, tupletId?: number): IStaffTreeNode[] {
        return items.map((item) => {
            if (item.kind === ProjectedItemKind.Subdivision) {
                const childTupletId = item.isTuplet ? this.tupletIdSequence++ : tupletId;

                return {
                    kind: StaffNodeKind.Subdivision,
                    start: { ...item.start },
                    span: { ...item.span },
                    actual: item.actual,
                    normal: item.normal,
                    isTuplet: item.isTuplet,
                    depth,
                    children: this.buildNodes(item.items, stepsPerBar, stepsPerPulse, depth + 1,
                        childTupletId),
                };
            }

            return this.buildNoteNode(item, stepsPerBar, stepsPerPulse, depth, tupletId);
        });
    }

    private buildNoteNode(item: IProjectedEvent, stepsPerBar: number, stepsPerPulse: number,
        depth: number, tupletId?: number): IStaffNoteNode {
        const { measure } = this.props;

        const event = item.event;
        const audioData = event.noteStyleId !== undefined
            ? measure.noteEvents[item.eventIndex]?.audioData
            : undefined;

        let glyph: INoteGlyph = { icon: NoteLength.Sixteenth, dotted: false };
        let beamCount = 0;

        if (audioData) {
            if (depth > 0) {
                glyph = this.subdivisionGlyph(depth);
            } else {
                const lengthSteps = event.duration.denominator > 0
                    ? (event.duration.numerator * stepsPerBar) / event.duration.denominator
                    : 0;

                glyph = this.getStandaloneNoteGlyph(lengthSteps, stepsPerBar, stepsPerPulse, event.duration)
                    ?? { icon: NoteLength.Sixteenth, dotted: false };
            }

            beamCount = this.glyphBeamCount(glyph.icon);
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
            tupletId,
            glyph,
            beamCount,
            displayType,
            diamondOpen,
            noteLine,
            noteStyle: audioData,
            articulation: event.articulation ? { ...event.articulation } : undefined,
        };
    }

    /**
     * Merges consecutive rests that share a pulse into a single rest when their combined duration
     * is a plain (non-dotted) note value. Two eighth rests in one pulse become a quarter rest, for
     * example. Rest groups never cross a pulse boundary or a subdivision boundary.
     *
     * @param nodes The staff tree to merge rests in.
     * @param stepsPerBar The number of base-grid steps in a bar.
     * @param stepsPerPulse The number of base-grid steps in a pulse.
     *
     * @returns The staff tree with adjacent same-pulse rests merged.
     */
    private mergeRestsWithinPulses(nodes: IStaffTreeNode[], stepsPerBar: number,
        stepsPerPulse: number): IStaffTreeNode[] {
        const result: IStaffTreeNode[] = [];
        let restGroup: IStaffNoteNode[] = [];

        const flush = (): void => {
            if (restGroup.length > 1 && this.isPlainRestGroup(restGroup, stepsPerBar, stepsPerPulse)) {
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
                    && this.pulseIndex(previousRest, stepsPerBar, stepsPerPulse)
                    !== this.pulseIndex(node, stepsPerBar, stepsPerPulse)) {
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
     * @param stepsPerBar The number of base-grid steps in a bar.
     * @param stepsPerPulse The number of base-grid steps in a pulse.
     *
     * @returns True when the combined duration maps to a non-dotted rest glyph.
     */
    private isPlainRestGroup(group: IStaffNoteNode[], stepsPerBar: number, stepsPerPulse: number): boolean {
        let total: IFraction = { numerator: 0, denominator: 1 };

        for (const node of group) {
            total = addFractions(total, node.duration);
        }

        const lengthSteps = total.denominator > 0
            ? (total.numerator * stepsPerBar) / total.denominator
            : 0;
        const glyph = this.getStandaloneNoteGlyph(lengthSteps, stepsPerBar, stepsPerPulse, total);

        return glyph !== undefined && !glyph.dotted;
    }

    /**
     * Assigns beam spans. Beam runs are broken at unbeamed notes (rests and notes of a quarter or
     * longer), at top-level pulse boundaries, and when leaving one tuplet for another. Inside a
     * tuplet the entire tuplet is treated as one beam group (no internal pulse breaks), and plain
     * (non-tuplet) subdivisions stay connected so their outer beams span nested splits.
     *
     * @param nodes The nodes to process.
     * @param scoreMetrics Timing metrics for pulse-boundary detection.
     *
     * @returns Map of note event indices to beam info.
     */
    private computeBeamSpans(nodes: IStaffTreeNode[], scoreMetrics: IScoreMetrics): Map<number, IBeamInfo> {
        const target = new Map<number, IBeamInfo>();
        const flat: IStaffNoteNode[] = [];
        this.collectNotes(nodes, flat);

        const { stepsPerBar, stepsPerPulse } = scoreMetrics;
        let run: IStaffNoteNode[] = [];

        const flush = (): void => {
            if (run.length >= 2) {
                this.assignBeamSegments(run, target);
            }

            run = [];
        };

        for (const note of flat) {
            if (note.beamCount === 0) {
                flush();
                continue;
            }

            if (run.length > 0) {
                const previous = run[run.length - 1];
                const crossedPulse = note.depth === 0 && previous.depth === 0
                    && this.pulseIndex(note, stepsPerBar, stepsPerPulse)
                    !== this.pulseIndex(previous, stepsPerBar, stepsPerPulse);
                const leftTuplet = note.tupletId !== previous.tupletId;

                if (crossedPulse || leftTuplet) {
                    flush();
                }
            }

            run.push(note);
        }

        flush();

        return target;
    }

    private collectNotes(nodes: IStaffTreeNode[], output: IStaffNoteNode[]): void {
        for (const node of nodes) {
            if (node.kind === StaffNodeKind.Note) {
                output.push(node);
            } else {
                this.collectNotes(node.children, output);
            }
        }
    }

    private pulseIndex(note: IStaffNoteNode, stepsPerBar: number, stepsPerPulse: number): number {
        if (stepsPerPulse <= 0) {
            return 0;
        }

        const startInSteps = (note.start.numerator * stepsPerBar) / note.start.denominator;

        return Math.floor(startInSteps / stepsPerPulse);
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
     * Computes bracket/number labels for tuplet groups. Markers span from the first to the last
     * sounding notehead, so they sit exactly over the notes they group.
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
                        const bounds = this.tupletNoteBounds(item);
                        if (bounds.firstStart !== undefined && bounds.lastStart !== undefined) {
                            const left = addFractions(bounds.firstStart, halfStep);
                            const width = subtractFractions(bounds.lastStart, bounds.firstStart);

                            labels.push({
                                leftPercent: (left.numerator / left.denominator) * 100,
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
     * Finds the first and last sounding note starts within a subdivision's subtree.
     *
     * @param node The subdivision to inspect.
     *
     * @returns The first and last note start fractions, or undefined when the subtree has no notes.
     */
    private tupletNoteBounds(node: IStaffSubdivisionNode): ITupletNoteBounds {
        let firstStart: IFraction | undefined;
        let lastStart: IFraction | undefined;

        const walk = (items: IStaffTreeNode[]): void => {
            for (const item of items) {
                if (item.kind === StaffNodeKind.Note) {
                    if (item.noteStyle === undefined) {
                        continue;
                    }

                    if (firstStart === undefined || compareFractions(item.start, firstStart) < 0) {
                        firstStart = item.start;
                    }

                    if (lastStart === undefined || compareFractions(item.start, lastStart) > 0) {
                        lastStart = item.start;
                    }
                } else {
                    walk(item.children);
                }
            }
        };

        walk(node.children);

        return { firstStart, lastStart };
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
     *
     * @returns List of VNodes representing the rendered items at this level.
     */
    private renderItems(nodes: IStaffTreeNode[], beamSpans: Map<number, IBeamInfo>,
        keyPrefix: string, centerLine: number, restLineOffset: number, containerSpan = 1): ComponentChild[] {
        const { scoreMetrics, measure, barNumber, trackId, scoreElementRegistry } = this.props;

        return nodes.map((node, index) => {
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
                            restLineOffset, spanFraction)}
                    </div>
                );
            }

            const grow = node.duration.denominator > 0
                ? (node.duration.numerator / node.duration.denominator) / containerSpan
                : 1;

            // Noteheads are anchored at the note's onset plus half a grid step. As a fraction of
            // this run's width that is 1 / (2 * durationInSteps), so a top-level step note sits at
            // 50 % and a subdivision slot sits where the replaced note's notehead was.
            const anchorPercent = node.duration.denominator > 0 && node.duration.numerator > 0
                ? (node.duration.denominator / (2 * node.duration.numerator * scoreMetrics.stepsPerBar)) * 100
                : 50;

            const slotStyle = {
                flex: `${grow} 1 0`,
                minWidth: 0,
                "--note-anchor": `${anchorPercent}%`,
            } as CSSProperties;
            const stepIndex = Math.floor(
                (node.start.numerator * scoreMetrics.stepsPerBar) / node.start.denominator,
            );

            if (node.noteStyle !== undefined) {
                const beamInfo = beamSpans.get(node.eventIndex);

                // Compute vertical offset for this note's staff line.
                const effectiveNoteLine = node.noteLine ?? 1;
                const lineOffset = (effectiveNoteLine - centerLine) * 10; // 10px = line spacing
                const translateY = `translateY(calc(-18px + ${lineOffset}px))`;

                const hasBeam = beamInfo !== undefined;
                const headType = this.resolveHeadType(node.displayType);
                const isNonOval = headType !== NoteImageHeadType.Oval;

                const headWrapperClasses = ["staff-note-head"];
                if (isNonOval) {
                    headWrapperClasses.push(this.headTypeClassName(headType));
                }

                const decoClasses = this.resolveDecorationClasses(node.noteStyle, node.articulation);
                headWrapperClasses.push(...decoClasses);

                const needsCssStem = !hasBeam;

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
                    }),
                };

                return (
                    <div {...runDivProps}>
                        <span className={headWrapperClasses.join(" ")}>
                            <NoteImage
                                className="staff-note-viewer-note-symbol"
                                kind={NoteKind.Note}
                                value={node.glyph.icon}
                                style={{
                                    flexShrink: 0,
                                    transform: translateY,
                                }}
                                headType={headType}
                                dotted={node.glyph.dotted}
                                diamondOpen={node.diamondOpen}
                                flagCount={hasBeam ? 0 : undefined}
                                hideStem={true}
                                alt=""
                            />
                            {needsCssStem ? (
                                <span
                                    className="staff-note-head-stem"
                                    style={{ height: `calc(33px + ${lineOffset}px)` }}
                                />
                            ) : null}
                            {this.renderNoteDecorations(node.noteStyle, node.articulation)}
                            {headType === NoteImageHeadType.Cross ? this.renderCrossHead() : null}
                        </span>
                        {node.articulation?.accent ? (
                            <span className="staff-note-viewer-accent">&gt;</span>
                        ) : null}
                        {hasBeam ? this.renderBeamSegments(node.eventIndex, beamInfo) : null}
                        {hasBeam ? this.renderCustomStem(lineOffset, headType) : null}
                    </div>
                );
            }

            const lengthSteps = node.duration.denominator > 0
                ? (node.duration.numerator * scoreMetrics.stepsPerBar) / node.duration.denominator
                : 1;
            const restGlyph = this.getStandaloneNoteGlyph(lengthSteps, scoreMetrics.stepsPerBar,
                scoreMetrics.stepsPerPulse, node.duration)
                ?? { icon: NoteLength.Sixteenth, dotted: false };
            const isWholeOrHalf = restGlyph.icon === NoteLength.Whole || restGlyph.icon === NoteLength.Half;

            return (
                <div key={`${keyPrefix}rest-${index}`} className="staff-note-viewer-run" style={slotStyle}
                    ref={scoreElementRegistry?.createRef({
                        kind: ScoreElementKind.StaffRun,
                        bar: barNumber,
                        trackId,
                        step: stepIndex,
                        start: node.start,
                    })}>
                    <NoteImage
                        className="staff-note-viewer-rest-symbol"
                        kind={NoteKind.Rest}
                        value={restGlyph.icon}
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
    private renderCustomStem(lineOffset: number, headType: NoteImageHeadType): VNode {
        const headClass = headType !== NoteImageHeadType.Oval
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

    /**
     * Returns the number of beam strokes implied by a note glyph icon.
     *
     * @param icon The note glyph icon to evaluate.
     *
     * @returns The number of beam strokes (0 for non-beamable notes).
     */
    private glyphBeamCount(icon: NoteLength): number {
        if (icon === NoteLength.Eighth) {
            return 1;
        }

        if (icon === NoteLength.Sixteenth) {
            return 2;
        }

        if (icon === NoteLength.ThirtySecond) {
            return 3;
        }

        return 0;
    }

    /**
     * Resolves the glyph for a note inside a subdivision. Without real note lengths the first
     * nesting level uses an eighth note, and each further level halves the value (sixteenth,
     * thirty-second), so subdivision notes are always beamed.
     *
     * @param depth The subdivision nesting depth (1 for notes in a top-level subdivision).
     *
     * @returns The glyph for the note.
     */
    private subdivisionGlyph(depth: number): INoteGlyph {
        if (depth <= 1) {
            return { icon: NoteLength.Eighth, dotted: false };
        }

        if (depth === 2) {
            return { icon: NoteLength.Sixteenth, dotted: false };
        }

        return { icon: NoteLength.ThirtySecond, dotted: false };
    }

    private getStandaloneNoteGlyph(lengthSteps: number, stepsPerBar: number, stepsPerPulse: number,
        duration: IFraction): INoteGlyph | undefined {
        if (stepsPerBar <= 0) {
            return undefined;
        }

        if (stepsPerPulse > 0 && stepsPerPulse % 3 === 0 && lengthSteps * 3 === stepsPerPulse
            && duration.numerator * stepsPerBar === duration.denominator) {
            return { icon: NoteLength.Eighth, dotted: false };
        }

        if (duration.denominator > 0 && duration.numerator * 12 === duration.denominator) {
            return { icon: NoteLength.Eighth, dotted: false };
        }

        // Compute note value from the actual duration fraction, not from the
        // rounded lengthSteps (which loses sub-step precision for subdivision notes).
        const units = duration.denominator > 0
            ? (duration.numerator * 32) / duration.denominator
            : (lengthSteps * 32) / stepsPerBar;
        switch (units) {
            case 32: return { icon: NoteLength.Whole, dotted: false };
            case 24: return { icon: NoteLength.Half, dotted: true };
            case 16: return { icon: NoteLength.Half, dotted: false };
            case 12: return { icon: NoteLength.Quarter, dotted: true };
            case 8: return { icon: NoteLength.Quarter, dotted: false };
            case 6: return { icon: NoteLength.Eighth, dotted: true };
            case 4: return { icon: NoteLength.Eighth, dotted: false };
            case 3: return { icon: NoteLength.Sixteenth, dotted: true };
            case 2: return { icon: NoteLength.Sixteenth, dotted: false };
            case 1: return { icon: NoteLength.ThirtySecond, dotted: false };
            default: return undefined;
        }
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

    private resolveHeadType(displayType: NoteDisplayType): NoteImageHeadType {
        switch (displayType) {
            case NoteDisplayType.Cross: {
                return NoteImageHeadType.Cross;
            }

            case NoteDisplayType.Diamond: {
                return NoteImageHeadType.Diamond;
            }

            case NoteDisplayType.Square: {
                return NoteImageHeadType.Square;
            }

            case NoteDisplayType.Triangle: {
                return NoteImageHeadType.Triangle;
            }

            case NoteDisplayType.Oval: {
                return NoteImageHeadType.Oval;
            }
        }
    }

    private resolveDiamondOpen(noteStyle: IAudioData): boolean | undefined {
        const characteristics = noteStyle.characteristics;
        if (!("mainDisplayType" in characteristics) || characteristics.mainDisplayType !== NoteDisplayType.Diamond) {
            return undefined;
        }

        return noteStyle.sampleProfile.builtInDamping === Damping.Open;
    }

    /**
     * Maps a NoteImageHeadType to a CSS class name suffix.
     *
     * @param headType The head type to map.
     *
     * @returns The CSS class name suffix (e.g. "square", "cross").
     */
    private headTypeClassName(headType: NoteImageHeadType): string {
        switch (headType) {
            case NoteImageHeadType.Square: {
                return "square";
            }

            case NoteImageHeadType.Triangle: {
                return "triangle";
            }

            case NoteImageHeadType.Cross: {
                return "cross";
            }

            case NoteImageHeadType.Diamond: {
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
                        <span key="thumb-circle" className="staff-note-head-thumb-circle" />,
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
                `<line x1="12" y1="3" x2="2" y2="8" />` +
                `<line x1="12" y1="9" x2="2" y2="14" />` +
                `<line x1="12" y1="15" x2="2" y2="20" />`,
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
