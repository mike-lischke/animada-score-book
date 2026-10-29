/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmTrack, ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import { ScoreSymbol, ScoreSymbols } from "../../../../core/ScoreSymbols.js";
import type { ArrangementPlayer } from "../../../../player/ArrangementPlayer.js";
import type { IScoreMetrics } from "../../../../player/TimeCoordinator.js";
import { ScoreElementKind, type ScoreElementRegistry } from "../../../../ui/ScoreElementRegistry.js";
import type { SelectionManager } from "../../../../ui/SelectionManager.js";
import {
    SelectionGranularity, SelectionSerializer, type ISelectionHitEntry, type ISelectionHitTester,
} from "../../../../ui/SelectionSerializer.js";
import { Container } from "../../framework/Container.js";
import { ChildAlignment, Orientation } from "../../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { GridMeasureBeam } from "./GridMeasureBeam.js";
import { GridMeasureRow } from "./GridMeasureRow.js";

export interface IGridMeasureViewerProperties extends ICommonUIProperties {
    /** One-based index of the measure to display */
    measureNumber: number;

    /** The focus switch the measure draws in its head room. */
    focusButton?: ComponentChild;

    dataModel: ScoreBookDataModel;
    scoreMetrics: IScoreMetrics;
    arrangementPlayer?: ArrangementPlayer;
    selectionManager: SelectionManager;
    scoreElementRegistry?: ScoreElementRegistry;

    /**
     * If given, render only these tracks (in this order) instead of all tracks of the arrangement.
     * Used by the print feature to limit output to the user's selection.
     */
    tracks?: ISbDmTrack[];

    /**
     * The column's layout width in px at 100% zoom. The print layout states it, so a printed column keeps the
     * measure's width instead of sharing the width of the viewer.
     */
    measureWidth?: number;
}

interface IGridMeasureViewerState {
    /** Center-X of the first note of each beat, in px, relative to the viewer's left edge. */
    beatPositions: number[];
}

export class GridMeasureViewer extends UIComponent<IGridMeasureViewerProperties, IGridMeasureViewerState>
    implements ISelectionHitTester {
    public override state: IGridMeasureViewerState = { beatPositions: [] };

    private viewerElement?: HTMLDivElement;
    private resizeObserver?: ResizeObserver;

    public override componentDidMount(): void {
        const { selectionManager } = this.props;
        selectionManager.registerHitTester(this);

        const viewer = this.viewerElement;
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
    public hitTest(rect: DOMRect): ISelectionHitEntry[] {
        const { measureNumber, dataModel, scoreElementRegistry, tracks: tracksOverride } = this.props;
        const element = this.viewerElement;
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
        const noteEntries: ISelectionHitEntry[] = [];
        const trackPieceEntries: ISelectionHitEntry[] = [];

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

            const measure = track.measures[measureNumber - 1];

            for (const noteElement of noteElements) {
                const location = scoreElementRegistry?.getLocation(noteElement);
                if (location?.step === undefined) {
                    continue;
                }

                const noteRect = noteElement.getBoundingClientRect();
                if (rect.right >= noteRect.left && rect.left <= noteRect.right
                    && rect.bottom >= noteRect.top && rect.top <= noteRect.bottom) {
                    const target = scoreElementRegistry?.getTarget(noteElement);
                    if (target !== undefined && "duration" in target && location.start !== undefined) {
                        // A grid cell covers one cell, or the whole slot when it addresses a
                        // subdivision slot. The event behind the cell keeps its own duration.
                        noteEntries.push({
                            granularity: SelectionGranularity.Note,
                            target: {
                                granularity: SelectionGranularity.Note,
                                measure,
                                event: target,
                                start: location.start,
                                end: SelectionSerializer.spanEnd(target, location.start, measure),
                            },
                            rect: noteRect,
                        });
                    }
                }
            }

            trackPieceEntries.push({
                granularity: SelectionGranularity.TrackPiece,
                target: { granularity: SelectionGranularity.TrackPiece, track, measure },
                rect: rowRect,
            });
        }

        const measure = SelectionSerializer.measureOfBar(dataModel.arrangement!, measureNumber);
        const measureEntries: ISelectionHitEntry[] = measure === undefined ? [] : [{
            granularity: SelectionGranularity.Measure,
            target: { granularity: SelectionGranularity.Measure, measure },
            rect: elRect,
        }];

        return [...noteEntries, ...trackPieceEntries, ...measureEntries];
    }

    public override render(): ComponentChild {
        const { measureNumber, dataModel, scoreMetrics, scoreElementRegistry, tracks: tracksOverride,
            focusButton, arrangementPlayer, measureWidth } = this.props;
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
                arrangementPlayer={arrangementPlayer}
                barNumber={measureNumber}
                scoreElementRegistry={scoreElementRegistry}
            />);
        }

        const repeatBars = dataModel.arrangement.repeatBars;
        const opensRepeat = repeatBars?.get(measureNumber)?.start === true;
        const closesRepeat = repeatBars?.get(measureNumber)?.end === true;
        const nextOpensRepeat = repeatBars?.get(measureNumber + 1)?.start === true;
        const openingRoom = opensRepeat ? ScoreSymbols.inkBox(ScoreSymbol.RepeatStart).width : "0px";
        const closingRoom = closesRepeat ? ScoreSymbols.inkBox(ScoreSymbol.RepeatEnd).width : "0px";
        const className = this.generateFinalClassName([
            "grid-measure-viewer",
            closesRepeat || nextOpensRepeat ? "grid-measure-repeat-boundary" : undefined,
        ]);

        const viewerStyle = measureWidth === undefined
            ? {
                flex: 1,
                minWidth: `max(calc(${baseSteps} * var(--note-height) + ${openingRoom} + ${closingRoom}), `
                    + "var(--bar-action-min-width, 0px))",
                "--grid-repeat-opening-room": openingRoom,
                "--grid-repeat-closing-room": closingRoom,
            }
            : {
                flex: `0 0 ${measureWidth}px`,
                minWidth: 0,
                "--grid-repeat-opening-room": openingRoom,
                "--grid-repeat-closing-room": closingRoom,
            };
        const registryRef = scoreElementRegistry?.createRef({
            kind: ScoreElementKind.BarContainer,
            bar: measureNumber,
            trackId: 0,
        });
        const setViewerRef = (element: HTMLDivElement | null): void => {
            this.viewerElement = element ?? undefined;
            registryRef?.(element);
        };

        return (
            <Container
                className={className}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
                innerRef={setViewerRef}
                style={viewerStyle}
            >
                {focusButton}
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
        const viewer = this.viewerElement;
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
