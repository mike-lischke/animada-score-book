/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import type { ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import {
    MeasureProjection, ProjectedItemKind, modelEventAt,
    type IProjectedEvent, type IProjectedItem, type IProjectedSubdivision,
} from "../../../../core/MeasureProjection.js";
import { reduceFraction } from "../../../../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction, IMeasureEvent } from "../../../../core/types/general.js";
import { requisitions } from "../../../../supplement/Requisitions.js";
import { ScoreElementKind, type ScoreElementRegistry } from "../../../../ui/ScoreElementRegistry.js";
import { NoteStyleSymbolViewer } from "../../Note/NoteStyleSymbolViewer.js";
import { Container } from "../../framework/Container.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";

export interface IGridMeasureRowProperties extends ICommonUIProperties {
    barNumber?: number;
    measure: ISbDmTrackMeasure;
    track: ISbDmTrack;
    dataModel: ScoreBookDataModel;
    scoreElementRegistry?: ScoreElementRegistry;
}

interface IGridMeasureRowState {
    readonly changeCount: number;
}

/** What one grid cell shows and the position it addresses. */
interface IGridCellContent {
    /** The grid step the cell belongs to. */
    step: number;

    /** The exact position the cell addresses. */
    start: IFraction;

    /** The event behind the cell, when the step sits in one. */
    event?: IMeasureEvent;

    /** The note the cell shows, or a synthetic id for the slot of a rest. */
    noteId?: number;

    /** The style of the note the cell shows. */
    noteStyle?: IAudioData;
}

export class GridMeasureRow extends UIComponent<IGridMeasureRowProperties, IGridMeasureRowState> {
    public constructor(props: IGridMeasureRowProperties) {
        super(props);

        this.state = { changeCount: 0 };
    }

    public override componentDidMount(): void {
        requisitions.register("trackChanged", this.handleTrackChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("trackChanged", this.handleTrackChanged);
    }

    public override render(): ComponentChild {
        const { measure, dataModel, track, barNumber, scoreElementRegistry } = this.props;

        if (!dataModel.arrangement) {
            return null;
        }

        const className = this.generateFinalClassName(["grid-measure-row"]);
        const items = MeasureProjection.project(measure);
        const baseSteps = measure.meter.stepResolution;

        // Beat tick markers: absolutely positioned at fractional positions derived
        // from the meter's beatGroups, which sum to stepResolution (= baseSteps).
        const beatMarkers: ComponentChild[] = [];
        let cumulative = 0;
        for (const groupSize of measure.meter.beatGroups) {
            if (cumulative < baseSteps) {
                beatMarkers.push(
                    <div
                        key={cumulative}
                        className="grid-beat-marker"
                        data-beat-start="true"
                        style={{ left: `${(cumulative / baseSteps) * 100}%` }}
                    />,
                );
            }

            cumulative += groupSize;
        }

        const rowStyle: CSSProperties = {
            minWidth: `calc(${baseSteps} * var(--note-height))`,
            display: "grid",
            gridTemplateColumns: `repeat(${baseSteps}, 1fr)`,
        };

        return (
            <Container className={className} style={rowStyle}
                innerRef={barNumber === undefined ? undefined : scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.TrackRow,
                    bar: barNumber,
                    trackId: track.id,
                    measure,
                })}>
                <div className="grid-beat-overlay" aria-hidden="true">
                    {beatMarkers}
                </div>
                {this.renderGridCells(items)}
            </Container>
        );
    }

    private handleTrackChanged = (trackId: number): Promise<boolean> => {
        const { track } = this.props;

        if (trackId !== track.id) {
            return Promise.resolve(false);
        }

        const { changeCount } = this.state;
        this.setState({ changeCount: changeCount + 1 });

        return Promise.resolve(true);
    };

    /**
     * Renders the row's content as one cell per grid step, so the columns stay aligned with the meter
     * whatever the measure holds. A step whose events start inside it — a pair of thirty-seconds, for
     * example — is drawn as a subdivision of that step, which gives each part its own cell. A
     * subdivision of the measure keeps its own container, which spans the steps it replaces.
     *
     * @param items The measure's projected top-level items.
     *
     * @returns The row's cells, in step order.
     */
    private renderGridCells(items: IProjectedItem[]): ComponentChild[] {
        const { measure } = this.props;
        const stepsPerBar = measure.meter.stepResolution;
        const itemsByStep = new Map<number, IProjectedEvent[]>();
        const subdivisionsByStep = new Map<number, IProjectedSubdivision>();
        const subdivisionSteps = new Set<number>();

        for (const item of items) {
            const step = this.stepOf(item.start);

            if (item.kind === ProjectedItemKind.Subdivision) {
                subdivisionsByStep.set(step, item);
                for (let index = step; index < step + item.normal; index++) {
                    subdivisionSteps.add(index);
                }

                continue;
            }

            const stepItems = itemsByStep.get(step);
            if (stepItems === undefined) {
                itemsByStep.set(step, [item]);
            } else {
                stepItems.push(item);
            }
        }

        const cells: ComponentChild[] = [];
        for (let step = 0; step < stepsPerBar; step++) {
            const subdivision = subdivisionsByStep.get(step);
            if (subdivision !== undefined) {
                cells.push(this.renderSubdivision(subdivision, 1));
                step += subdivision.normal - 1;

                continue;
            }

            if (!subdivisionSteps.has(step)) {
                cells.push(this.renderStep(step, itemsByStep.get(step) ?? []));
            }
        }

        return cells;
    }

    /**
     * Renders a single grid step: its own cell when one event starts there, and cell by cell when
     * several events share the step.
     *
     * @param step The grid step to render.
     * @param items The events that start inside the step.
     *
     * @returns The cell or cells of the step.
     */
    private renderStep(step: number, items: IProjectedEvent[]): ComponentChild {
        if (items.length > 1) {
            return this.renderSplitStep(step, items);
        }

        return this.renderCell(this.cellContentOf(step, items[0]));
    }

    /**
     * Renders a step that holds more than one event as a subdivision of itself: one column per event,
     * which reads like a 2:1 subdivision for the usual pair of thirty-seconds.
     *
     * @param step The grid step to render.
     * @param items The events that start inside the step, in display order.
     *
     * @returns The container holding the step's parts.
     */
    private renderSplitStep(step: number, items: IProjectedEvent[]): ComponentChild {
        const slots = items.map((item) => {
            return this.renderSlot(this.cellContentOf(step, item), -(item.eventIndex + 1));
        });

        const style = {
            minWidth: 0,
            gridColumn: "span 1",
            display: "grid",
            gridTemplateColumns: `repeat(${items.length}, 1fr)`,
            "--current-level": 1,
        } as CSSProperties;

        return (
            <Container key={`split-${step}`} className="subdivision grid-sub-step" style={style}>
                {slots}
            </Container>
        );
    }

    /**
     * Builds a subdivision container: the group's slots, which the row spans across the steps the
     * group replaces. Every slot is one column of the container and keeps its exact start as its
     * address.
     *
     * @param item The projected subdivision.
     * @param level The nesting depth, which sets the slot height.
     *
     * @returns The subdivision container.
     */
    private renderSubdivision(item: IProjectedSubdivision, level: number): ComponentChild {
        const step = this.stepOf(item.start);
        const style = {
            minWidth: 0,
            gridColumn: `span ${item.normal}`,
            display: "grid",
            gridTemplateColumns: `repeat(${item.actual}, 1fr)`,
            "--current-level": level,
        } as CSSProperties;
        const slots = item.items.map((child) => {
            return child.kind === ProjectedItemKind.Subdivision
                ? this.renderSubdivision(child, level + 1)
                : this.renderSlot(this.cellContentOf(step, child), -(child.eventIndex + 1));
        });

        return (
            <Container className="subdivision" style={style}
                key={`subdivision-${item.start.numerator}/${item.start.denominator}`}>
                {slots}
            </Container>
        );
    }

    /**
     * Builds the cell of a subdivision slot, which needs a unique id even when it shows a rest, so the
     * slots of a subdivision stay individually selectable. Negative ids cannot collide with real note
     * ids, which are always positive.
     *
     * @param content The content of the slot.
     * @param restId The synthetic id to use when the slot shows a rest.
     *
     * @returns The slot cell.
     */
    private renderSlot(content: IGridCellContent, restId: number): ComponentChild {
        return this.renderCell({ ...content, noteId: content.noteId ?? restId });
    }

    /**
     * Builds one grid cell: the note symbol and the background of the event it shows, and nothing but
     * an empty cell for the steps a longer event covers.
     *
     * @param content The content of the cell.
     *
     * @returns The cell.
     */
    private renderCell(content: IGridCellContent): ComponentChild {
        const { measure, track, barNumber, scoreElementRegistry } = this.props;
        const { step, start, event, noteId, noteStyle } = content;
        const isNoteCell = noteId !== undefined;
        const noteBackground = noteStyle?.symbol
            ? `color-mix(in srgb, ${track.instrument.color} 80%, var(--color-base-100))`
            : "transparent";

        const cellProps: Record<string, unknown> = {
            key: `${step}-${start.numerator}/${start.denominator}`,
            className: "note-viewer",
            ref: barNumber === undefined ? undefined : scoreElementRegistry?.createRef({
                kind: ScoreElementKind.GridCell,
                bar: barNumber,
                trackId: track.id,
                step,
                noteId,
                start,
                measure,
            }, event),
            style: { minWidth: 0, backgroundColor: isNoteCell ? noteBackground : "transparent" },
        };

        return (
            <div {...cellProps}>
                <div className="note-details-viewer">
                    {isNoteCell ? <NoteStyleSymbolViewer noteStyle={noteStyle} /> : null}
                </div>
            </div>
        );
    }

    /**
     * Describes the content of one grid step. The cell that starts a note carries its id and style;
     * the steps a longer event covers keep that event as their target, so every step of a long note
     * stays selectable, and a step without content addresses the rest it sits in.
     *
     * @param step The grid step to describe.
     * @param item The event that starts inside the step, if any.
     *
     * @returns The content of the step's cell.
     */
    private cellContentOf(step: number, item: IProjectedEvent | undefined): IGridCellContent {
        const { measure, track } = this.props;
        const stepStart = reduceFraction(step, measure.meter.stepResolution);

        if (item === undefined) {
            return { step, start: stepStart, event: modelEventAt(measure, stepStart) };
        }

        const noteStyle = item.event.noteStyleId === undefined
            ? undefined
            : track.instrument.noteStyles[item.event.noteStyleId];
        const noteId = item.event.noteStyleId === undefined ? undefined : measure.noteEvents[item.eventIndex]?.id;

        return { step, start: item.start, event: item.event, noteId, noteStyle };
    }

    /**
     * Resolves the grid step a position falls into.
     *
     * @param start The position as a fraction of the measure.
     *
     * @returns The zero-based grid step.
     */
    private stepOf(start: IFraction): number {
        return Math.floor(start.numerator * this.props.measure.meter.stepResolution / start.denominator);
    }
}
