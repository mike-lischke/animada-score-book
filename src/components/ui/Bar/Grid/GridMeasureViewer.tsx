/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import type { IScoreMetrics } from "../../../../player/TimeCoordinator.js";
import { Container } from "../../framework/Container.js";
import { ChildAlignment, Orientation } from "../../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { GridMeasureBeam } from "./GridMeasureBeam.js";
import { GridMeasureRow } from "./GridMeasureRow.js";

export interface IGridMeasureViewerProperties extends ICommonUIProperties {
    /** One-based index of the measure to display */
    measureNumber: number;

    dataModel: ScoreBookDataModel;
    scoreMetrics: IScoreMetrics;
}

interface IGridMeasureViewerState {
    /** Center-X of the first note of each beat, in px, relative to the viewer's left edge. */
    beatPositions: number[];
}

export class GridMeasureViewer extends UIComponent<IGridMeasureViewerProperties, IGridMeasureViewerState> {
    public override state: IGridMeasureViewerState = { beatPositions: [] };

    private resizeObserver?: ResizeObserver;

    public override componentDidMount(): void {
        const viewer = this.base as HTMLElement | null;
        if (!viewer) {
            return;
        }

        this.resizeObserver = new ResizeObserver(() => {
            this.updateBeatPositions();
        });
        this.resizeObserver.observe(viewer);
        this.updateBeatPositions();
    }

    public override componentDidUpdate(
        prevProps: Readonly<IGridMeasureViewerProperties>,
        prevState: Readonly<IGridMeasureViewerState>,
    ): void {
        super.componentDidUpdate(prevProps, prevState);
        this.updateBeatPositions();
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
    }

    public override render(): ComponentChild {
        const { measureNumber, dataModel, scoreMetrics } = this.props;
        const { beatPositions } = this.state;

        if (!dataModel.arrangement) {
            return null;
        }

        const rows: ComponentChild[] = [];
        let baseSteps = 0;
        for (const track of dataModel.arrangement.tracks) {
            const measure = track.measures[measureNumber - 1];
            if (baseSteps === 0) {
                baseSteps = measure.steps.length
                    - measure.subdivisions.reduce((sum, s) => {
                        return sum + s.actual - s.normal;
                    }, 0);
            }

            rows.push(<GridMeasureRow
                measure={measure}
                track={track}
                dataModel={dataModel}
                pulsesPerBar={scoreMetrics.pulsesPerBar}
            />);
        }

        const className = this.generateFinalClassName(["grid-measure-viewer"]);

        const viewerStyle = {
            flex: 1,
            minWidth: `calc(${baseSteps} * var(--note-height))`,
        };

        return (
            <Container
                className={className}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
                data-bar={measureNumber}
                style={viewerStyle}
            >
                <GridMeasureBeam
                    measureNumber={measureNumber}
                    beatPositions={beatPositions}
                    isFirstMeasure={measureNumber === 1}
                    isLastMeasure={measureNumber === scoreMetrics.bars}
                />
                {rows}
            </Container>
        );
    }

    private updateBeatPositions(): void {
        const viewer = this.base as HTMLElement | undefined;
        if (!viewer) {
            return;
        }

        const firstRow = viewer.querySelector<HTMLElement>(".grid-measure-row");
        if (!firstRow) {
            return;
        }

        const beatStartElements = Array.from(firstRow.querySelectorAll<HTMLElement>("[data-beat-start]"));
        if (beatStartElements.length === 0) {
            return;
        }

        const viewerRect = viewer.getBoundingClientRect();
        const positions = beatStartElements.map((el) => {
            const rect = el.getBoundingClientRect();

            return (rect.left - viewerRect.left) + (rect.width / 2);
        });

        const { beatPositions } = this.state;
        if (beatPositions.length === positions.length
            && positions.every((p, i) => {
                return Math.abs(p - beatPositions[i]) < 0.5;
            })) {
            return;
        }

        this.setState({ beatPositions: positions });
    }
}
