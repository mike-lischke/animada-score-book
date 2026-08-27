/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { addFractions, compareFractions, reduceFraction } from "./serialisation/numeric-functions.js";
import type { IFraction, IMeasureEvent, ISubdivision } from "./types/general.js";

/** The minimal measure shape {@link MeasureProjection.project} needs to build the render tree. */
export interface IMeasureProjectionInput {
    events: IMeasureEvent[];
    subdivisions: ISubdivision[];
    meter: { stepResolution: number; };
}

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
