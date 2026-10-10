/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import type { Arrangement } from "../../../core/Arrangement.js";
import { MeasureLayout } from "../../../core/MeasureLayout.js";
import type { ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { StaffRowGeometry, type IStaffRowGeometry } from "../../../core/StaffRowGeometry.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { GridMeasureViewer } from "../Bar/Grid/GridMeasureViewer.js";
import { StaffMeasureViewer } from "../Bar/Staff/StaffMeasureViewer.js";
import { StaffPrefixViewer } from "../Bar/Staff/StaffPrefixViewer.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

/** Bars-per-row may be auto-fit (`"auto"`) or a fixed positive integer. */
export type BarsPerLine = "auto" | 1 | 2 | 4 | 8;

/**
 * Factor the print stylesheet scales a measure's screen width down by. Mirrors `.staff-measure-viewer` in
 * print.scss.
 */
const printWidthScale = 2;

/**
 * Width of the printed page in default measures. Mirrors the `1.32` that `--print-zoom` used to be derived
 * from in print.scss.
 */
const pageWidthInMeasures = 1.32;

/** Measures a print row holds when every measure has the default width. */
const defaultMeasuresPerRow = 2;

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
    selectionManager: SelectionManager;
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

        // The printed staff lays its measures out half as wide, so the row geometry is measured for those widths
        // too, which keeps the rows of a printed page from colliding. The grid view keeps its cell heights.
        const rowGeometries = options.viewMode === "staff"
            ? new Map(tracks.map((track): [number, IStaffRowGeometry] => {
                return [track.id, StaffRowGeometry.ofTrack(track, arrangement,
                    this.props.arrangementPlayer.scoreMetrics, printWidthScale)];
            }))
            : undefined;

        // print.scss scales the whole document with one CSS zoom, so the zoom makes the widest row fill the
        // printable page. It follows the measures' widths, which is what keeps a row of narrow measures from
        // leaving most of the page empty.
        const printRootStyle = { "--print-zoom": String(this.printZoom(blocks)) } as Record<string, string>;

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
                                    {options.viewMode === "grid" && this.renderInstrumentColumn(tracks, rowGeometries)}
                                    {options.viewMode === "staff" && (
                                        <>
                                            {this.renderInstrumentColumn(tracks, rowGeometries)}
                                            <StaffPrefixViewer
                                                arrangement={arrangement}
                                                timeSignature={arrangement.timeParams.timeSignature}
                                                tracks={tracks}
                                                rowGeometries={rowGeometries}
                                            />
                                        </>
                                    )}
                                    {block.map((barNumber) => {
                                        return options.viewMode === "staff"
                                            ? this.renderStaffMeasure(barNumber, tracks, rowGeometries)
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
     * Splits the bars into rows according to the `barsPerLine` setting. `auto` aims for two default measures per
     * row — the capacity the layout has always had — and gives narrower measures the room they free up, so a row
     * holds more of them.
     *
     * @returns A list of rows, each containing the (1-based) bar numbers in that row.
     */
    private buildBarBlocks(): number[][] {
        const { arrangementPlayer, options } = this.props;
        const totalBars = arrangementPlayer.scoreMetrics.bars;

        if (options.barsPerLine !== "auto" || options.viewMode !== "staff") {
            // Only the staff view has measures of differing widths, so only it can pack by width.
            const perLine = options.barsPerLine === "auto" ? defaultMeasuresPerRow : options.barsPerLine;
            const fixedBlocks: number[][] = [];
            for (let i = 1; i <= totalBars; i += perLine) {
                const block: number[] = [];
                for (let j = 0; j < perLine && (i + j) <= totalBars; j++) {
                    block.push(i + j);
                }

                fixedBlocks.push(block);
            }

            return fixedBlocks;
        }

        const blocks: number[][] = [];
        let block: number[] = [];
        let width = 0;

        for (let bar = 1; bar <= totalBars; bar++) {
            const barWidth = this.measureUnits(bar);
            if (block.length > 0 && width + barWidth > defaultMeasuresPerRow) {
                blocks.push(block);
                block = [];
                width = 0;
            }

            block.push(bar);
            width += barWidth;
        }

        if (block.length > 0) {
            blocks.push(block);
        }

        return blocks;
    }

    /**
     * @param blocks The rows of bar numbers.
     *
     * @returns The zoom that makes the widest row fill the page. It is capped, because the note glyphs are drawn
     *          at fixed px that only the zoom scales: a row narrower than one default measure would otherwise be
     *          blown up far beyond the size the notation is designed for.
     */
    private printZoom(blocks: number[][]): number {
        const widest = Math.max(1, ...blocks.map((block) => {
            return this.rowWidth(block);
        }));

        return pageWidthInMeasures / widest;
    }

    /**
     * @param block The bars of one row.
     *
     * @returns The width of the row in default measures. The grid view lays its equal columns out at the default
     *          width, so there a bar counts as one.
     */
    private rowWidth(block: number[]): number {
        const { options } = this.props;
        if (options.viewMode !== "staff") {
            return block.length;
        }

        return block.reduce((sum, bar) => {
            return sum + this.measureUnits(bar);
        }, 0);
    }

    /**
     * @param barNumber The 1-based number of the measured bar.
     *
     * @returns The bar's width in default measures, so a row's capacity is comparable to the default width.
     */
    private measureUnits(barNumber: number): number {
        const { arrangement } = this.props;

        return MeasureLayout.widthOf(barNumber, arrangement.measureWidths) / MeasureLayout.defaultWidth();
    }

    private renderGridBar(barNumber: number, tracks: ISbDmTrack[]): ComponentChild {
        const { dataModel, arrangementPlayer, selectionManager } = this.props;

        return (
            <GridMeasureViewer
                key={`bar-${barNumber}`}
                measureNumber={barNumber}
                dataModel={dataModel}
                scoreMetrics={arrangementPlayer.scoreMetrics}
                selectionManager={selectionManager}
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
     * @param rowGeometries The staff row geometry per track, so the icons line up with the staff rows. Omitted
     *                      in grid mode, where the cells keep the grid cell height.
     *
     * @returns A column container with the per-track icons.
     */
    private renderInstrumentColumn(tracks: ISbDmTrack[],
        rowGeometries?: ReadonlyMap<number, IStaffRowGeometry>): ComponentChild {
        return (
            <div className="print-instrument-column" aria-hidden="true">
                {/* Spacer matching the grid-measure-beam strip above the first row. */}
                <div className="print-instrument-beam-spacer" />
                {tracks.map((track) => {
                    const geometry = rowGeometries?.get(track.id);
                    const cellStyle = geometry === undefined
                        ? undefined
                        : {
                            "--staff-row-height": StaffRowGeometry.formatPx(geometry.heightPx),
                            "--staff-centre": StaffRowGeometry.formatPx(geometry.centrePx),
                        };

                    return (
                        <div key={`icon-${track.id}`} className="print-instrument-cell" style={cellStyle}>
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

    private renderStaffMeasure(barNumber: number, tracks: ISbDmTrack[],
        rowGeometries: ReadonlyMap<number, IStaffRowGeometry> | undefined): ComponentChild {
        const { arrangement, arrangementPlayer, dataModel, selectionManager } = this.props;

        // The print stylesheet lays a measure out half as wide as on screen, so a stored width is halved with
        // the default and the measures keep their relative widths on paper.
        const width = MeasureLayout.widthOf(barNumber, arrangement.measureWidths) / printWidthScale;
        const measureStyle = { flex: `0 0 ${width}px`, minWidth: 0 };

        return (
            <StaffMeasureViewer
                key={`bar-${barNumber}`}
                barNumber={barNumber}
                arrangement={arrangement}
                arrangementPlayer={arrangementPlayer}
                inEditMode={false}
                selectionManager={selectionManager}
                dataModel={dataModel}
                tracks={tracks}
                measureWidth={width}
                rowGeometries={rowGeometries}
                showRangeArticulations
                style={measureStyle}
            />
        );
    }
}
