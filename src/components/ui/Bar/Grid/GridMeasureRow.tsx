/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import type { ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import {
    MeasureProjection, ProjectedItemKind, type IProjectedEvent, type IProjectedItem,
} from "../../../../core/MeasureProjection.js";
import { formatFraction } from "../../../../core/serialisation/numeric-functions.js";
import type { IAudioData } from "../../../../core/types/general.js";
import { requisitions } from "../../../../supplement/Requisitions.js";
import { NoteStyleSymbolViewer } from "../../Note/NoteStyleSymbolViewer.js";
import { Container } from "../../framework/Container.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";

export interface IGridMeasureRowProperties extends ICommonUIProperties {
    measure: ISbDmTrackMeasure;
    track: ISbDmTrack;
    dataModel: ScoreBookDataModel;
}

interface IGridMeasureRowState {
    readonly changeCount: number;
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
        const { measure, dataModel, track } = this.props;

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
                data-track={track.id} {...this.dataAttributes}>
                <div className="grid-beat-overlay" aria-hidden="true">
                    {beatMarkers}
                </div>
                {this.renderItems(items)}
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

    private renderItems(items: IProjectedItem[], level = 1, subdivisionStartStep = 0): ComponentChild[] {
        return items.map((item, index) => {
            if (item.kind === ProjectedItemKind.Subdivision) {
                const { measure } = this.props;
                const subStartStep = Math.floor(
                    item.start.numerator * measure.meter.stepResolution / item.start.denominator,
                );

                const subdivisionStyle = {
                    minWidth: 0,
                    gridColumn: `span ${item.normal}`,
                    display: "grid",
                    gridTemplateColumns: `repeat(${item.actual}, 1fr)`,
                    "--current-level": level,
                } as CSSProperties;

                return (
                    <Container key={index} className="subdivision" style={subdivisionStyle}>
                        {this.renderItems(item.items, level + 1, subStartStep)}
                    </Container>
                );
            }

            return this.renderEventCells(item, index, level, subdivisionStartStep);
        });
    }

    private renderEventCells(item: IProjectedEvent, keyPrefix: number, level = 1,
        subdivisionStartStep = 0): ComponentChild[] {
        const { measure, track } = this.props;

        const stepsPerBar = measure.meter.stepResolution;
        const noteStyle: IAudioData | undefined = item.event.noteStyleId !== undefined
            ? track.instrument.noteStyles[item.event.noteStyleId]
            : undefined;
        const noteId = item.event.noteStyleId !== undefined
            ? measure.noteEvents[item.eventIndex]?.id
            : undefined;

        // Subdivision rest slots share the subdivision's grid step index, so they need a unique
        // synthetic id to stay individually selectable. Negative values cannot collide with real
        // note ids, which are always positive.
        const restSlotId = level > 1 && noteId === undefined ? -(item.eventIndex + 1) : undefined;
        const cellId = noteId ?? restSlotId;

        const { color } = track.instrument;
        const noteBackground = noteStyle?.symbol
            ? `color-mix(in srgb, ${color} 80%, var(--color-base-100))`
            : "transparent";

        const absoluteStartCol = Math.round(item.start.numerator * stepsPerBar / item.start.denominator);
        const rawSpanCols = Math.max(1, Math.round(item.duration.numerator * stepsPerBar / item.duration.denominator));

        // Inside a subdivision container each event fills exactly one slot of the
        // subdivision's own column grid. Its step index must stay within the subdivision's
        // grid range, so slots never collide with the grid cells around the subdivision.
        const startCol = level > 1 ? subdivisionStartStep : absoluteStartCol;
        const spanCols = level > 1 ? 1 : rawSpanCols;

        const cells: ComponentChild[] = [];
        for (let col = startCol; col < startCol + spanCols; col++) {
            // Only the note's start cell carries the note id and background. The remaining cells of
            // the event span are absorbed grid rests and render as empty, individually selectable cells.
            const isNoteCell = col === startCol && noteId !== undefined;
            const noteDivProps: Record<string, unknown> = {
                key: `${keyPrefix}-${col}`,
                className: "note-viewer",
                "data-step-index": col,
                style: { minWidth: 0, backgroundColor: isNoteCell ? noteBackground : "transparent" },
            };

            if (col === startCol && cellId !== undefined) {
                noteDivProps["data-note-id"] = cellId;
            }

            if (level > 1) {
                noteDivProps["data-event-start"] = formatFraction(item.start);
            }

            cells.push(
                <div {...noteDivProps}>
                    <div className="note-details-viewer">
                        {isNoteCell ? <NoteStyleSymbolViewer noteStyle={noteStyle} /> : null}
                    </div>
                </div>,
            );
        }

        return cells;
    }
}
