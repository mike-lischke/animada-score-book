/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmTrack, ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import type { IScoreMetrics } from "../../../../player/TimeCoordinator.js";
import type { SelectionManager } from "../../../../ui/SelectionManager.js";
import { ScoreElementKind, type ScoreElementRegistry } from "../../../../ui/ScoreElementRegistry.js";
import {
    SelectionGranularity, type ISelectionEntry, type ISelectionHitTester,
} from "../../../../ui/selection-types.js";
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
    selectionManager: SelectionManager;
    scoreElementRegistry?: ScoreElementRegistry;

    /**
     * If given, render only these tracks (in this order) instead of all tracks of the arrangement.
     * Used by the print feature to limit output to the user's selection.
     */
    tracks?: ISbDmTrack[];
}

interface IGridMeasureViewerState {
    /** Center-X of the first note of each beat, in px, relative to the viewer's left edge. */
    beatPositions: number[];
}

export class GridMeasureViewer extends UIComponent<IGridMeasureViewerProperties, IGridMeasureViewerState>
    implements ISelectionHitTester {
    public override state: IGridMeasureViewerState = { beatPositions: [] };

    private resizeObserver?: ResizeObserver;

    public override componentDidMount(): void {
        const { selectionManager } = this.props;
        selectionManager.registerHitTester(this);

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
        this.updateBeatPositions();
    }

    public override componentWillUnmount(): void {
        const { selectionManager } = this.props;
        selectionManager.unregisterHitTester(this);

        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
    }

    /**
     * Checks whether this measure's DOM element intersects the given rectangle.
     *
     * @param rect The selection rectangle in viewport coordinates.
     *
     * @returns A single-element array with this measure's entry if intersected, or an empty array.
     */
    public hitTest(rect: DOMRect): ISelectionEntry[] {
        const { measureNumber, dataModel, scoreElementRegistry, tracks: tracksOverride } = this.props;
        const element = this.base as HTMLElement | null;
        if (!element) {
            return [];
        }

        const elRect = element.getBoundingClientRect();
        if (rect.right < elRect.left || rect.left > elRect.right
            || rect.bottom < elRect.top || rect.top > elRect.bottom) {
            return [];
        }

        const rows = element.querySelectorAll<HTMLElement>(".grid-measure-row");
        const tracks = tracksOverride ?? dataModel.arrangement!.tracks;
        const noteEntries: ISelectionEntry[] = [];
        const trackPieceEntries: ISelectionEntry[] = [];

        for (let i = 0; i < rows.length; i++) {
            const rowRect = rows[i].getBoundingClientRect();
            if (rect.right < rowRect.left || rect.left > rowRect.right
                || rect.bottom < rowRect.top || rect.top > rowRect.bottom) {
                continue;
            }

            const track = tracks[i];

            // Check individual note/rest elements.
            const noteElements = scoreElementRegistry?.findElements(
                ScoreElementKind.GridCell, measureNumber, track.id,
            ) ?? [];

            let rowHasNotes = false;
            for (const noteElement of noteElements) {
                const location = scoreElementRegistry?.getLocation(noteElement);
                if (location?.step === undefined) {
                    continue;
                }

                const noteRect = noteElement.getBoundingClientRect();
                if (rect.right >= noteRect.left && rect.left <= noteRect.right
                    && rect.bottom >= noteRect.top && rect.top <= noteRect.bottom) {
                    noteEntries.push({
                        granularity: SelectionGranularity.Note,
                        bar: location.bar,
                        trackId: location.trackId,
                        startStep: location.step,
                        endStep: location.step,
                        noteId: location.noteId,
                        start: location.start,
                    });
                    rowHasNotes = true;
                }
            }

            if (!rowHasNotes) {
                trackPieceEntries.push({
                    granularity: SelectionGranularity.TrackPiece,
                    bar: measureNumber,
                    trackId: track.id,
                });
            }
        }

        // Notes dominate: when any note is hit, only return notes (no mixed granularities).
        if (noteEntries.length > 0) {
            return noteEntries;
        }

        if (trackPieceEntries.length > 0) {
            return trackPieceEntries;
        }

        return [{
            granularity: SelectionGranularity.Measure,
            bar: measureNumber,
            trackId: 0,
        }];
    }

    public override render(): ComponentChild {
        const { measureNumber, dataModel, scoreMetrics, scoreElementRegistry, tracks: tracksOverride } = this.props;
        const { beatPositions } = this.state;

        if (!dataModel.arrangement) {
            return null;
        }

        const tracks = tracksOverride ?? dataModel.arrangement.tracks;

        const rows: ComponentChild[] = [];
        let baseSteps = 0;
        for (const track of tracks) {
            const measure = track.measures[measureNumber - 1];
            if (baseSteps === 0) {
                baseSteps = measure.meter.stepResolution;
            }

            rows.push(<GridMeasureRow
                measure={measure}
                track={track}
                dataModel={dataModel}
                barNumber={measureNumber}
                scoreElementRegistry={scoreElementRegistry}
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
                innerRef={scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.BarContainer,
                    bar: measureNumber,
                    trackId: 0,
                })}
                style={viewerStyle}
            >
                <GridMeasureBeam
                    measureNumber={measureNumber}
                    beatPositions={beatPositions}
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

        // The viewer sits inside #trackViewerContainer which has CSS zoom applied.
        // getBoundingClientRect() returns viewport coordinates (already zoomed), but
        // GridMeasureBeam sets left: Xpx in CSS pixels which will be zoomed again.
        // Divide by the zoom factor to compensate.
        const zoomContainer = viewer.closest<HTMLElement>("#trackViewerContainer");
        const zoom = parseFloat(zoomContainer?.style.zoom ?? "100%") || 100;
        const zoomFactor = zoom / 100;

        const viewerRect = viewer.getBoundingClientRect();
        const positions = beatStartElements.map((el) => {
            const rect = el.getBoundingClientRect();

            // Beat markers are 1px-wide absolutely positioned elements whose left edge
            // is the beat boundary; no need to add half width.
            return (rect.left - viewerRect.left) / zoomFactor;
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
