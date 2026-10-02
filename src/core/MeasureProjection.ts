/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { addFractions, compareFractions, reduceFraction, subtractFractions }
    from "./serialisation/numeric-functions.js";
import { beamCountForEvent } from "./rest-notation.js";
import type { IFraction, IMeasureEvent, ISubdivision } from "./types/general.js";

/** The minimal measure shape {@link MeasureProjection.project} needs to build the render tree. */
export interface IMeasureProjectionInput {
    events: IMeasureEvent[];
    subdivisions: ISubdivision[];
    meter: { stepResolution: number; };
}

/**
 * The measure shape the grouping rules need on top of the render tree: which of its events sound.
 * A rest ends a beam group, so the resolved note events decide the grouping.
 */
export interface IMeasureGroupingInput extends IMeasureProjectionInput {
    noteEvents: ReadonlyArray<{ audioData?: unknown; }>;
}

/**
 * The timing grid the notation rules work on. It is the arrangement's timing, so `IScoreMetrics`
 * satisfies it: the length of a bar in steps and the exact pulse boundaries. Those differ for an
 * irregular meter — 7/8 has [3, 2, 2] — so an averaged pulse length cannot stand in for them.
 */
export interface INotationGrid {
    /** How many base-grid steps one bar holds. */
    stepsPerBar: number;

    /** Pulse boundaries as step counts, summing to `stepsPerBar`. */
    beatGroups: number[];
}

/**
 * Returns the measure event whose span covers the given position. The measure's events tile it
 * without gaps, so a position inside a longer note belongs to that note.
 *
 * @param measure The measure to search.
 * @param start The position as a fraction of the measure.
 *
 * @returns The covering event, or undefined when no event covers the position.
 */
export const modelEventAt = (measure: IMeasureProjectionInput, start: IFraction): IMeasureEvent | undefined => {
    return measure.events.find((event) => {
        const end = addFractions(event.start, event.duration);

        return compareFractions(event.start, start) <= 0 && compareFractions(start, end) < 0;
    });
};

/**
 * Resolves the pulse a position falls into, walking the exact pulse boundaries of the grid. An
 * averaged pulse length cannot stand in for them: an irregular meter groups its pulses unevenly.
 *
 * @param start The position as a fraction of the measure.
 * @param grid The timing of the arrangement.
 *
 * @returns The zero-based index of the pulse the position lies in.
 */
export const pulseIndexOf = (start: IFraction, grid: INotationGrid): number => {
    if (grid.stepsPerBar <= 0) {
        return 0;
    }

    const step = (start.numerator * grid.stepsPerBar) / start.denominator;
    let boundary = 0;

    for (let index = 0; index < grid.beatGroups.length; index++) {
        boundary += grid.beatGroups[index];
        if (step < boundary) {
            return index;
        }
    }

    return Math.max(0, grid.beatGroups.length - 1);
};

/**
 * Resolves how many steps the pulse a position falls into covers. The notation rules need it to tell a
 * ternary pulse from a binary one, and in an irregular meter the pulses differ from one another.
 *
 * @param start The position as a fraction of the measure.
 * @param grid The timing of the arrangement.
 *
 * @returns The number of base-grid steps in that pulse.
 */
export const pulseLengthAt = (start: IFraction, grid: INotationGrid): number => {
    return grid.beatGroups[pulseIndexOf(start, grid)] ?? grid.stepsPerBar;
};

/** Discriminator for projected render items. */
export enum ProjectedItemKind {
    Event,
    Subdivision,
}

/** A single note or rest event projected onto the render timeline of a measure. */
export interface IProjectedEvent {
    kind: ProjectedItemKind.Event;
    event: IMeasureEvent;

    /** Index of this event in the measure's `events` list, matching the resolved note events 1:1. */
    eventIndex: number;

    /** Absolute start within the measure, as a fraction of the whole bar. */
    start: IFraction;

    /** Duration, as a fraction of the whole bar. */
    duration: IFraction;
}

/** A subdivision group projected onto the render timeline of a measure. */
export interface IProjectedSubdivision {
    kind: ProjectedItemKind.Subdivision;
    group: ISubdivision;

    /** Absolute start of the subdivision within the measure, as a fraction of the whole bar. */
    start: IFraction;

    /** Total time span of the subdivision, as a fraction of the whole bar. */
    span: IFraction;

    /** Number of leaf events in this subdivision's subtree. */
    leafCount: number;

    actual: number;
    normal: number;
    isTuplet: boolean;
    depth: number;

    /** Direct children in display order. */
    items: IProjectedItem[];
}

/** A projected render item: either a single event or a subdivision group. */
export type IProjectedItem = IProjectedEvent | IProjectedSubdivision;

/** How the notation ties a run of measure events together. */
export enum NoteGroupKind {
    Beam,
    Tuplet,
}

/**
 * A run of events the notation draws as one unit. A tuplet is a model object, a beam group is not,
 * so this composition lives outside the model: the renderer draws the groups it returns and a hit
 * test resolves the group a click addresses through them.
 */
export interface INoteGroup {
    kind: NoteGroupKind;

    /** The tuplet the group stands for; undefined for a beam group, which the model does not hold. */
    subdivision?: ISubdivision;

    /** Start of the group's first event. */
    start: IFraction;

    /** Exclusive end of the group's last event. */
    end: IFraction;

    /** Indexes of the group's events in the measure's `events` list, in measure order. */
    eventIndexes: number[];

    /** Number of tuplets enclosing the group; 0 at the top level. */
    depth: number;
}

/** A measure event as the grouping rules see it: where it sits in the tree and which tuplet holds it. */
interface IProjectedLeaf {
    event: IProjectedEvent;
    subdivisionDepth: number;
    tupletDepth: number;
    tuplet?: ISubdivision;
}

/**
 * Orders note groups from the innermost outwards, so a consumer that walks the list front to back
 * resolves the group a position addresses first. Groups that are not nested keep their order in the
 * measure, and groups of equal depth and start are ordered by span, narrowest first.
 *
 * @param first The first group to compare.
 * @param second The second group to compare.
 *
 * @returns A negative value when the first group is the inner one.
 */
const innermostFirst = (first: INoteGroup, second: INoteGroup): number => {
    if (first.depth !== second.depth) {
        return second.depth - first.depth;
    }

    const byStart = compareFractions(first.start, second.start);
    if (byStart !== 0) {
        return byStart;
    }

    return compareFractions(subtractFractions(first.end, first.start),
        subtractFractions(second.end, second.start));
};

interface ISubdivisionTreeNode {
    group: ISubdivision;
    start: IFraction;
    span: IFraction;
    noteDuration: IFraction;
    depth: number;
    children: ISubdivisionTreeNode[];
}

export class MeasureProjection {
    /**
     * Projects a measure's flat events and subdivision records into a nested render tree.
     *
     * Subdivision records are stored flat and in expansion order, so their nesting is reconstructed
     * from their time spans. Each event is then assigned to the innermost subdivision whose time
     * range contains the event's start time.
     *
     * @param measure The measure to project.
     * @returns The top-level projected items in display order.
     */
    public static project(measure: IMeasureProjectionInput): IProjectedItem[] {
        const tree = MeasureProjection.buildSubdivisionTree(
            measure.subdivisions, measure.events, measure.meter.stepResolution,
        );

        return MeasureProjection.buildItems(measure.events, 0, measure.events.length, tree);
    }

    /**
     * Resolves the nesting depth of the subdivision an event belongs to, counted like the render
     * tree: a slot of a top-level subdivision has depth 1.
     *
     * @param measure The measure the event belongs to.
     * @param eventIndex The event's index in the measure's `events` list.
     *
     * @returns The depth of the innermost subdivision covering the event, or 0 outside any subdivision.
     */
    public static subdivisionDepthOf(measure: IMeasureProjectionInput, eventIndex: number): number {
        return MeasureProjection.depthIn(MeasureProjection.project(measure), eventIndex) ?? 0;
    }

    /**
     * Resolves how many tuplets enclose an event. Only real tuplets count, so a plain subdivision of a
     * note value does not raise the level.
     *
     * @param measure The measure the event belongs to.
     * @param eventIndex The event's index in the measure's `events` list.
     *
     * @returns The number of enclosing tuplets.
     */
    public static tupletDepthOf(measure: IMeasureProjectionInput, eventIndex: number): number {
        return MeasureProjection.tupletDepthIn(MeasureProjection.project(measure), eventIndex) ?? 0;
    }

    /**
     * Resolves the runs of events a measure is drawn in: its tuplets and its beam groups. The
     * result is ordered from the innermost group outwards, so a consumer that walks it front to
     * back resolves the group a position addresses first.
     *
     * @param measure The measure to compose.
     * @param grid The timing of the arrangement, which supplies the bar's step count and its pulse
     *             boundaries.
     *
     * @returns The measure's note groups, innermost first.
     */
    public static noteGroups(measure: IMeasureGroupingInput, grid: INotationGrid): INoteGroup[] {
        const items = MeasureProjection.project(measure);
        const groups: INoteGroup[] = [];

        MeasureProjection.collectTupletGroups(items, 0, groups);
        groups.push(...MeasureProjection.collectBeamGroups(items, measure, grid));
        groups.sort(innermostFirst);

        return groups;
    }

    private static collectTupletGroups(items: IProjectedItem[], depth: number, groups: INoteGroup[]): void {
        for (const item of items) {
            if (item.kind !== ProjectedItemKind.Subdivision) {
                continue;
            }

            const leaves = MeasureProjection.flattenLeaves(item.items);
            if (item.isTuplet && leaves.length > 0) {
                const last = leaves[leaves.length - 1];

                groups.push({
                    kind: NoteGroupKind.Tuplet,
                    subdivision: item.group,
                    start: leaves[0].event.start,
                    end: addFractions(last.event.start, last.event.duration),
                    eventIndexes: leaves.map((leaf) => {
                        return leaf.event.eventIndex;
                    }),
                    depth,
                });
            }

            MeasureProjection.collectTupletGroups(item.items, depth + (item.isTuplet ? 1 : 0), groups);
        }
    }

    /**
     * Collects the beam groups of a measure. A beam group ends at a rest or at a note drawn with a
     * flag, at a pulse boundary between top-level notes, and where one tuplet ends and the next
     * begins. Inside a subdivision the notation may beam across pulses, which keeps the inner
     * beams of a nested split connected.
     *
     * @param items The projected items to walk.
     * @param measure The measure the items belong to, for resolving which events sound.
     * @param grid The timing of the arrangement.
     *
     * @returns The measure's beam groups in measure order.
     */
    private static collectBeamGroups(items: IProjectedItem[], measure: IMeasureGroupingInput,
        grid: INotationGrid): INoteGroup[] {
        const groups: INoteGroup[] = [];
        let run: IProjectedLeaf[] = [];

        const flush = (): void => {
            if (run.length >= 2) {
                const last = run[run.length - 1];

                groups.push({
                    kind: NoteGroupKind.Beam,
                    start: run[0].event.start,
                    end: addFractions(last.event.start, last.event.duration),
                    eventIndexes: run.map((leaf) => {
                        return leaf.event.eventIndex;
                    }),
                    depth: run[0].tupletDepth,
                });
            }

            run = [];
        };

        for (const leaf of MeasureProjection.flattenLeaves(items)) {
            const beams = measure.noteEvents[leaf.event.eventIndex]?.audioData !== undefined
                ? beamCountForEvent(leaf.event.duration, leaf.subdivisionDepth, grid.stepsPerBar,
                    pulseLengthAt(leaf.event.start, grid))
                : 0;

            if (beams === 0) {
                flush();

                continue;
            }

            const previous = run.at(-1);
            if (previous !== undefined
                && (leaf.tuplet !== previous.tuplet
                    || MeasureProjection.crossesPulse(previous, leaf, grid))) {
                flush();
            }

            run.push(leaf);
        }

        flush();

        return groups;
    }

    /**
     * Checks whether a pulse boundary lies between two notes at the top level of the measure.
     *
     * @param first The earlier note.
     * @param second The later note.
     * @param grid The timing of the arrangement.
     *
     * @returns True when the two notes fall into different pulses.
     */
    private static crossesPulse(first: IProjectedLeaf, second: IProjectedLeaf, grid: INotationGrid): boolean {
        if (first.subdivisionDepth > 0 || second.subdivisionDepth > 0) {
            return false;
        }

        return pulseIndexOf(first.event.start, grid) !== pulseIndexOf(second.event.start, grid);
    }

    private static flattenLeaves(items: IProjectedItem[], subdivisionDepth = 0, tupletDepth = 0,
        tuplet?: ISubdivision): IProjectedLeaf[] {
        const leaves: IProjectedLeaf[] = [];

        for (const item of items) {
            if (item.kind === ProjectedItemKind.Event) {
                leaves.push({ event: item, subdivisionDepth, tupletDepth, tuplet });

                continue;
            }

            leaves.push(...MeasureProjection.flattenLeaves(item.items,
                subdivisionDepth + 1,
                tupletDepth + (item.isTuplet ? 1 : 0),
                item.isTuplet ? item.group : tuplet));
        }

        return leaves;
    }

    private static depthIn(items: IProjectedItem[], eventIndex: number): number | undefined {
        for (const item of items) {
            if (item.kind === ProjectedItemKind.Subdivision) {
                const depth = MeasureProjection.depthIn(item.items, eventIndex);
                if (depth !== undefined) {
                    return depth + 1;
                }
            } else if (item.eventIndex === eventIndex) {
                return 0;
            }
        }

        return undefined;
    }

    private static tupletDepthIn(items: IProjectedItem[], eventIndex: number): number | undefined {
        for (const item of items) {
            if (item.kind === ProjectedItemKind.Subdivision) {
                const depth = MeasureProjection.tupletDepthIn(item.items, eventIndex);
                if (depth !== undefined) {
                    return depth + (item.isTuplet ? 1 : 0);
                }
            } else if (item.eventIndex === eventIndex) {
                return 0;
            }
        }

        return undefined;
    }

    private static buildSubdivisionTree(subdivisions: ISubdivision[], events: IMeasureEvent[],
        stepsPerBar: number): ISubdivisionTreeNode[] {
        const sorted = [...subdivisions].sort((left, right) => {
            return left.startIndex - right.startIndex;
        });

        const roots: ISubdivisionTreeNode[] = [];
        const stack: ISubdivisionTreeNode[] = [];

        for (const group of sorted) {
            const start = events[group.startIndex].start;

            while (stack.length > 0) {
                const top = stack[stack.length - 1];
                const end = addFractions(top.start, top.span);

                if (compareFractions(end, start) <= 0) {
                    stack.pop();
                } else {
                    break;
                }
            }

            const parent = stack.at(-1);
            const noteDuration = parent
                ? parent.noteDuration
                : { numerator: 1, denominator: stepsPerBar };
            const span = reduceFraction(group.normal * noteDuration.numerator, noteDuration.denominator);
            const node: ISubdivisionTreeNode = {
                group,
                start,
                span,
                noteDuration: reduceFraction(span.numerator, span.denominator * group.actual),
                depth: parent ? parent.depth + 1 : 0,
                children: [],
            };

            if (parent) {
                parent.children.push(node);
            } else {
                roots.push(node);
            }

            stack.push(node);
        }

        return roots;
    }

    private static buildItems(events: IMeasureEvent[], fromIndex: number, toIndex: number,
        subdivisions: ISubdivisionTreeNode[]): IProjectedItem[] {
        const items: IProjectedItem[] = [];
        let eventIndex = fromIndex;

        for (const subdivision of subdivisions) {
            const subdivisionStart = subdivision.start;
            const subdivisionEnd = addFractions(subdivision.start, subdivision.span);

            while (eventIndex < toIndex && compareFractions(events[eventIndex].start, subdivisionStart) < 0) {
                items.push(MeasureProjection.toProjectedEvent(events[eventIndex], eventIndex));
                eventIndex++;
            }

            const innerStart = eventIndex;

            while (eventIndex < toIndex && compareFractions(events[eventIndex].start, subdivisionEnd) < 0) {
                eventIndex++;
            }

            const children = MeasureProjection.buildItems(events, innerStart, eventIndex, subdivision.children);

            items.push({
                kind: ProjectedItemKind.Subdivision,
                group: subdivision.group,
                start: { ...subdivisionStart },
                span: { ...subdivision.span },
                leafCount: MeasureProjection.countLeaves(children),
                actual: subdivision.group.actual,
                normal: subdivision.group.normal,
                isTuplet: subdivision.group.isTuplet,
                depth: subdivision.depth,
                items: children,
            });
        }

        while (eventIndex < toIndex) {
            items.push(MeasureProjection.toProjectedEvent(events[eventIndex], eventIndex));
            eventIndex++;
        }

        return items;
    }

    private static toProjectedEvent(event: IMeasureEvent, eventIndex: number): IProjectedEvent {
        return {
            kind: ProjectedItemKind.Event,
            event,
            eventIndex,
            start: { ...event.start },
            duration: { ...event.duration },
        };
    }

    private static countLeaves(items: IProjectedItem[]): number {
        let count = 0;

        for (const item of items) {
            count += item.kind === ProjectedItemKind.Event ? 1 : item.leafCount;
        }

        return count;
    }
}
