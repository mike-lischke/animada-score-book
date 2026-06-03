/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import type { Arrangement } from "../../../core/Arrangement.js";
import type { ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { GridMeasureViewer } from "../Bar/Grid/GridMeasureViewer.js";
import { StaffBarViewer } from "../Bar/Staff/StaffBarViewer.js";
import { StaffPrefixViewer } from "../Bar/Staff/StaffPrefixViewer.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

/** Bars-per-row may be auto-fit (`"auto"`) or a fixed positive integer. */
export type BarsPerLine = "auto" | 1 | 2 | 4 | 8;

/** Options the user can choose in the print preview dialog. */
export interface IPrintOptions {
    barsPerLine: BarsPerLine;

    /** IDs of tracks to include. If undefined, all tracks are included. */
    selectedTrackIds?: Set<number>;
    showLegend: boolean;
    viewMode: "grid" | "staff";
}

export interface IPrintViewProps extends ICommonUIProperties {
    arrangement: Arrangement;
    options: IPrintOptions;

    dataModel: ScoreBookDataModel;
    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

/**
 * Renders the printable representation of an arrangement.
 *
 * The component is rendered into the regular DOM but is hidden in screen mode (see
 * `print.scss`). Only when the body has the `printing` class does it become visible —
 * in particular, the `@media print` rules show only this subtree.
 */
export class PrintView extends UIComponent<IPrintViewProps> {
    public render(): ComponentChild {
        const { arrangement, options } = this.props;
        const className = this.generateFinalClassName(["print-root", `view-${options.viewMode}`]);
        const tempo = arrangement.timeParams.tempo;

        const tracks = this.getSelectedTracks();
        const blocks = this.buildBarBlocks();

        // Tell print.scss how many bars share a row, so it can scale --note-height
        // (and everything derived from it) down accordingly. This keeps note glyphs
        // proportionally sized when the user picks a higher bars-per-line.
        const barsPerLine = blocks.length > 0 ? blocks[0].length : 1;
        const printRootStyle = { "--print-bars-per-line": String(barsPerLine) } as Record<string, string>;

        return (
            <div className={className} role="document" style={printRootStyle}>
                <header className="print-header">
                    <h1 className="print-title">{arrangement.title}</h1>
                    <p className="print-tempo">
                        <span aria-hidden="true">♩</span>
                        {" = "}
                        {Math.round(tempo)}
                        {" bpm"}
                    </p>
                </header>

                <div className="print-bar-blocks">
                    {blocks.map((block, blockIndex) => {
                        return (
                            <div className="print-bar-block" key={`block-${blockIndex}`}>
                                <Container
                                    orientation={Orientation.LeftToRight}
                                    crossAlignment={ChildAlignment.Stretch}
                                    className="print-bar-row"
                                >
                                    {options.viewMode === "grid" && this.renderInstrumentColumn(tracks)}
                                    {options.viewMode === "staff" && (
                                        <>
                                            {this.renderInstrumentColumn(tracks)}
                                            <StaffPrefixViewer
                                                arrangement={arrangement}
                                                timeSignature={arrangement.timeParams.timeSignature}
                                                tracks={tracks}
                                            />
                                        </>
                                    )}
                                    {block.map((barNumber) => {
                                        return options.viewMode === "staff"
                                            ? this.renderStaffBar(barNumber, tracks)
                                            : this.renderGridBar(barNumber, tracks);
                                    })}
                                </Container>
                            </div>
                        );
                    })}
                </div>

                {options.showLegend && this.renderLegend(tracks)}
            </div>
        );
    }

    /**
     * Renders the optional legend at the bottom of the print output: one entry per
     * selected track showing the instrument icon next to the track / instrument name.
     *
     * @param tracks The selected tracks, in the same order as in the score.
     * @returns The legend element, or `null` if there are no tracks to show.
     */
    private renderLegend(tracks: ISbDmTrack[]): ComponentChild {
        if (tracks.length === 0) {
            return null;
        }

        return (
            <section className="print-legend" aria-label="Legend">
                <h2 className="print-legend-title">Legend</h2>
                <ul className="print-legend-list">
                    {tracks.map((track) => {
                        const label = track.name || track.instrument.displayName;

                        return (
                            <li key={`legend-${track.id}`} className="print-legend-item">
                                <Icon
                                    className="print-legend-icon"
                                    src={track.instrument.image.filePath}
                                    alt={track.instrument.displayName}
                                    color={track.instrument.color}
                                />
                                <span className="print-legend-label">{label}</span>
                            </li>
                        );
                    })}
                </ul>
            </section>
        );
    }

    private getSelectedTracks(): ISbDmTrack[] {
        const { arrangement, options } = this.props;
        const all = arrangement.tracks;
        if (!options.selectedTrackIds) {
            return all;
        }

        return all.filter((track) => {
            return options.selectedTrackIds!.has(track.id);
        });
    }

    /**
     * Splits the bars into rows according to the `barsPerLine` setting.
     *
     * @returns A list of rows, each containing the (1-based) bar numbers in that row.
     */
    private buildBarBlocks(): number[][] {
        const { arrangementPlayer, options } = this.props;
        const totalBars = arrangementPlayer.scoreMetrics.bars;

        const perLine = options.barsPerLine === "auto"
            ? 2
            : options.barsPerLine;

        const blocks: number[][] = [];
        for (let i = 1; i <= totalBars; i += perLine) {
            const block: number[] = [];
            for (let j = 0; j < perLine && (i + j) <= totalBars; j++) {
                block.push(i + j);
            }
            blocks.push(block);
        }

        return blocks;
    }

    private renderGridBar(barNumber: number, tracks: ISbDmTrack[]): ComponentChild {
        const { dataModel, arrangementPlayer } = this.props;

        return (
            <GridMeasureViewer
                key={`bar-${barNumber}`}
                measureNumber={barNumber}
                dataModel={dataModel}
                scoreMetrics={arrangementPlayer.scoreMetrics}
                tracks={tracks}
            />
        );
    }

    /**
     * Renders a vertical column with one instrument icon per track row, used as the leftmost
     * column of every bar row in grid mode. The icons line up with the rows produced by
     * `GridMeasureViewer`.
     *
     * @param tracks The tracks to render icons for, in the same order as the rows.
     * @returns A column container with the per-track icons.
     */
    private renderInstrumentColumn(tracks: ISbDmTrack[]): ComponentChild {
        return (
            <div className="print-instrument-column" aria-hidden="true">
                {/* Spacer matching the grid-measure-beam strip above the first row. */}
                <div className="print-instrument-beam-spacer" />
                {tracks.map((track) => {
                    return (
                        <div key={`icon-${track.id}`} className="print-instrument-cell">
                            <Icon
                                className="print-instrument-icon"
                                src={track.instrument.image.filePath}
                                alt={track.instrument.displayName}
                                color={track.instrument.color}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    private renderStaffBar(barNumber: number, tracks: ISbDmTrack[]): ComponentChild {
        const { arrangement, arrangementPlayer, dataModel, services, undoManager } = this.props;
        const ownLabel = arrangement.measureLabels[barNumber] as string | undefined;

        return (
            <StaffBarViewer
                key={`bar-${barNumber}`}
                barNumber={barNumber}
                arrangement={arrangement}
                arrangementPlayer={arrangementPlayer}
                touchEditingEnabled={false}
                services={services}
                undoManager={undoManager}
                dataModel={dataModel}
                ownLabel={ownLabel}
                tracks={tracks}
            />
        );
    }
}
