/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import type { ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import type { IMeasureStep, ISubdivision, IAudioData } from "../../../../core/types/general.js";
import { NoteStyleSymbolViewer } from "../../Note/NoteStyleSymbolViewer.js";
import { Container } from "../../framework/Container.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";

export interface IGridMeasureRowProperties extends ICommonUIProperties {
    measure: ISbDmTrackMeasure;
    track: ISbDmTrack;
    dataModel: ScoreBookDataModel;
}

interface IRenderStep {
    type: "step";
    step: IMeasureStep;
}

interface IRenderSubdivision {
    type: "subdivision";
    subdivision: ISubdivision;
    children: IRenderItem[];
}

type IRenderItem = IRenderStep | IRenderSubdivision;

interface IRenderGroup {
    items: IRenderItem[];

    /** In steps, including tuplet children */
    length: number;
}

export class GridMeasureRow extends UIComponent<IGridMeasureRowProperties> {
    public override render(): ComponentChild {
        const { measure, dataModel, track } = this.props;

        if (!dataModel.arrangement) {
            return null;
        }

        const className = this.generateFinalClassName(["grid-measure-row"]);
        const group = this.buildLevel(measure.steps, measure.subdivisions, undefined, 0, measure.steps.length);

        const baseSteps = measure.steps.length
            - measure.subdivisions.reduce((sum, s) => {
                return sum + s.actual - s.normal;
            }, 0);

        // Beat tick markers: absolutely positioned at fractional positions derived
        // from the meter's beatGroups, which sum to stepResolution (= baseSteps).
        // These are independent of grid items and subdivisions — they always align
        // to the outer grid's 1..baseSteps column boundaries.
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
                {this.renderItems(group.items)}
            </Container>
        );
    }

    private buildLevel(steps: IMeasureStep[], subdivisions: ISubdivision[],
        parentSubdivisionId: number | undefined,
        startIdx: number, endIdx: number): IRenderGroup {
        const childSubdivisions = subdivisions.filter((s) => {
            // Normalize null → undefined: JSON round-trips convert undefined array elements to null.
            return (s.parentSubdivisionId ?? undefined) === parentSubdivisionId;
        });

        const items: IRenderItem[] = [];
        let i = startIdx;

        while (i < endIdx) {
            // Find a tuplet that starts at the current base step index, if any. Tuplets are guaranteed not to overlap
            // at the same level, so there can be at most one.
            const start = i;
            const subdivision = childSubdivisions.find((s) => {
                return s.startStep === start;
            });

            if (subdivision) {
                // All subdivisions (tuplet or not) need visual grouping in the grid view
                // for correct flex layout. The isTuplet flag only affects staff notation.
                const group = this.buildLevel(steps, subdivisions, subdivision.id, subdivision.startStep,
                    subdivision.startStep + subdivision.actual);
                items.push({ type: "subdivision", subdivision, children: group.items });
                i += group.length;
            } else {
                if (i < steps.length) {
                    items.push({ type: "step", step: steps[i] });
                }

                i++;
            }
        }

        return { items, length: i - startIdx };
    }

    private renderItems(items: IRenderItem[], level = 1): ComponentChild[] {
        const { track, measure } = this.props;

        // Build step-index → event-id mapping for note identification.
        const stepToEventId = new Map<number, number>();
        let eventIndex = 0;
        for (const step of measure.steps) {
            if (step.noteStyleId !== undefined && eventIndex < measure.events.length) {
                stepToEventId.set(step.index, measure.events[eventIndex].id);
                eventIndex++;
            }
        }

        return items.map((item, index) => {
            if (item.type === "step") {
                const noteStyle: IAudioData | undefined = item.step.noteStyleId !== undefined
                    ? track.instrument.noteStyles[item.step.noteStyleId]
                    : undefined;

                const { color } = track.instrument;
                const backgroundColor = noteStyle?.symbol
                    ? `color-mix(in srgb, ${color} 80%, var(--color-base-100))`
                    : "transparent";

                const noteId = stepToEventId.get(item.step.index);

                const noteDivProps: Record<string, unknown> = {
                    key: index,
                    className: "note-viewer",
                    "data-step-index": item.step.index,
                    style: { minWidth: 0, backgroundColor },
                };

                if (noteId !== undefined) {
                    noteDivProps["data-note-id"] = noteId;
                }

                return (
                    <div {...noteDivProps}>
                        <div className="note-details-viewer">
                            <NoteStyleSymbolViewer noteStyle={noteStyle} />
                        </div>
                    </div>
                );
            }

            const { normal, actual } = item.subdivision;
            const tupletStyle = {
                minWidth: 0,
                gridColumn: `span ${normal}`,
                display: "grid",
                gridTemplateColumns: `repeat(${actual}, 1fr)`,
                "--current-level": level,
            } as CSSProperties;

            return (
                <Container key={index} className="subdivision" style={tupletStyle}>
                    {this.renderItems(item.children, level + 1)}
                </Container>
            );
        });
    }
}
