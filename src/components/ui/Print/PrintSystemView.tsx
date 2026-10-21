/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import {
    printGridHeadRoom, printInstrumentColumnWidth, printInstrumentGap, printRowGap, printStaffHeadRoom,
    type IPrintSystem,
} from "../../../core/PrintLayout.js";
import type { ISbDmArrangement, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import { StaffRowGeometry, type IStaffRowGeometry } from "../../../core/StaffRowGeometry.js";
import { TrackViewMode } from "../../../core/types/general.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { GridMeasureViewer } from "../Bar/Grid/GridMeasureViewer.js";
import { StaffMeasureViewer } from "../Bar/Staff/StaffMeasureViewer.js";
import { StaffPrefixViewer } from "../Bar/Staff/StaffPrefixViewer.js";
import { Container } from "../framework/Container.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IPrintSystemViewProperties extends ICommonUIProperties {
    /** The system to render, placed at its layout offset inside the page's content area. */
    system: IPrintSystem;

    viewMode: TrackViewMode;

    /** Tracks to print, in display order. */
    tracks: readonly ISbDmTrack[];

    /** The staff geometry the page layout measured, keyed by track id. */
    rowGeometries: ReadonlyMap<number, IStaffRowGeometry>;

    arrangement: ISbDmArrangement;
    arrangementPlayer: ArrangementPlayer;
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
}

/** Vertical span of a system's staves, in layout px at 100% zoom. */
interface IStavesSpan {
    readonly topPx: number;
    readonly bottomPx: number;
}

/** Room the bracket's band keeps beyond the outer staves, in layout px at 100% zoom. */
const bracketOverhangPx = 20;

/**
 * One printed system: the instrument names, the staff prefix and the measure columns, laid out at the offsets the
 * print layout states. Every length is a layout px at 100% zoom; the page that holds the system states the print
 * scale.
 */
export class PrintSystemView extends UIComponent<IPrintSystemViewProperties> {
    public override render(): ComponentChild {
        const { system, viewMode } = this.props;
        const className = this.generateFinalClassName(["print-system", `view-${viewMode}`]);
        const style: CSSProperties = {
            position: "absolute",
            left: 0,
            top: `${system.topPx}px`,
            width: `${system.widthPx}px`,
            height: `${system.heightPx}px`,
            paddingTop: viewMode === TrackViewMode.Grid ? `${printGridHeadRoom}px` : undefined,
        };

        const staves = this.stavesSpan();
        const bracket = this.renderBracket(staves);
        const nameColumn = this.renderNameColumn();
        const prefixColumn = this.renderPrefixColumn(staves);
        const measures = system.measures.map((column) => {
            return this.renderMeasure(column.bar, column.widthPx);
        });

        return (
            <Container
                className={className}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Start}
                style={style}
            >
                {bracket}
                {nameColumn}
                {prefixColumn}
                {measures}
            </Container>
        );
    }

    /**
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The bracket that groups the staves of the system, or undefined for a system of one track.
     */
    private renderBracket(staves: IStavesSpan | undefined): ComponentChild {
        const { viewMode, tracks, system } = this.props;
        if (tracks.length < 2) {
            return undefined;
        }

        // The bracket spans the staves of the system, reaching a little beyond them; its ends hang on that band's
        // edges, the line runs between them.
        const headRoom = viewMode === TrackViewMode.Staff ? printStaffHeadRoom : printGridHeadRoom;
        const topPx = staves === undefined ? headRoom : staves.topPx - bracketOverhangPx;
        const bottomPx = staves === undefined ? system.heightPx : staves.bottomPx + bracketOverhangPx;
        const style: CSSProperties = {
            left: `${printInstrumentColumnWidth + 7}px`,
            top: `${topPx}px`,
            height: `${bottomPx - topPx}px`,
        };

        return (
            <div className="print-system-bracket" style={style} aria-hidden="true">
                <ScoreSymbolView className="print-system-bracket-end print-system-bracket-top"
                    symbol={ScoreSymbol.BracketTop} staffSpace={staffSpacePx} inkBox />
                <div className="print-system-bracket-line" />
                <ScoreSymbolView className="print-system-bracket-end print-system-bracket-bottom"
                    symbol={ScoreSymbol.BracketBottom} staffSpace={staffSpacePx} inkBox />
            </div>
        );
    }

    /**
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The barline that opens the measures and ties the staves of the system together, or undefined where
     *          there are no staves to tie together.
     */
    private renderLeadingBarline(staves: IStavesSpan | undefined): ComponentChild {
        const { tracks } = this.props;
        if (staves === undefined) {
            return undefined;
        }

        // The line ends where the clef does: the stylesheet lets it reach as far beyond the outer staff lines as
        // the clef's ink does, which needs the line count of the staffs it spans.
        const firstLines = StaffRowGeometry.maxNoteLineOf(tracks[0]);
        const lastLines = StaffRowGeometry.maxNoteLineOf(tracks[tracks.length - 1]);
        const style: CSSProperties = {
            "--barline-top": `${staves.topPx}px`,
            "--barline-height": `${staves.bottomPx - staves.topPx}px`,
            "--barline-half-lines-top": `${(firstLines - 1) / 2}`,
            "--barline-half-lines-bottom": `${(lastLines - 1) / 2}`,
        };

        return <div className="print-system-barline" style={style} aria-hidden="true" />;
    }

    /**
     * @returns The vertical span of the system's staves, from the topmost staff line of the first row to the
     *          bottommost of the last row, or undefined in grid mode and when no row states its geometry.
     */
    private stavesSpan(): IStavesSpan | undefined {
        const { viewMode, system, tracks, rowGeometries } = this.props;
        if (viewMode !== TrackViewMode.Staff) {
            return undefined;
        }

        let rowTopPx = printStaffHeadRoom;
        let topPx: number | undefined;
        let bottomPx: number | undefined;

        tracks.forEach((track, index) => {
            const geometry = rowGeometries.get(track.id);
            if (geometry !== undefined) {
                const halfSpanPx = ((StaffRowGeometry.maxNoteLineOf(track) - 1) * staffSpacePx) / 2;
                topPx ??= rowTopPx + geometry.staffLineOffsetPx - halfSpanPx;
                bottomPx = rowTopPx + geometry.staffLineOffsetPx + halfSpanPx;
            }

            rowTopPx += system.rowHeightsPx[index] + printRowGap;
        });

        if (topPx === undefined || bottomPx === undefined) {
            return undefined;
        }

        return { topPx, bottomPx };
    }

    /**
     * Renders one measure column at its width in the system.
     *
     * @param bar The 1-based measure number.
     * @param widthPx The column's width, in layout px at 100% zoom.
     *
     * @returns The measure column.
     */
    private renderMeasure(bar: number, widthPx: number): ComponentChild {
        const { viewMode, tracks, rowGeometries, arrangement, arrangementPlayer, dataModel,
            selectionManager } = this.props;
        const style: CSSProperties = {
            flex: `0 0 ${widthPx}px`,
            minWidth: 0,
        };

        if (viewMode === TrackViewMode.Grid) {
            return (
                <GridMeasureViewer
                    key={`bar-${bar}`}
                    measureNumber={bar}
                    dataModel={dataModel}
                    scoreMetrics={arrangementPlayer.scoreMetrics}
                    selectionManager={selectionManager}
                    tracks={[...tracks]}
                    measureWidth={widthPx}
                    style={style}
                />
            );
        }

        return (
            <StaffMeasureViewer
                key={`bar-${bar}`}
                barNumber={bar}
                arrangement={arrangement}
                arrangementPlayer={arrangementPlayer}
                inEditMode={false}
                selectionManager={selectionManager}
                dataModel={dataModel}
                tracks={[...tracks]}
                measureWidth={widthPx}
                rowGeometries={rowGeometries}
                showRangeArticulations
                style={style}
            />
        );
    }

    /**
     * @returns The instrument-name column, one cell per track row.
     */
    private renderNameColumn(): ComponentChild {
        const { system, tracks, viewMode, rowGeometries } = this.props;

        const cells = tracks.map((track, index) => {
            const geometry = rowGeometries.get(track.id);
            const isLast = index === tracks.length - 1;
            const cellStyle: CSSProperties = {
                height: `${system.rowHeightsPx[index]}px`,
                marginBottom: viewMode === TrackViewMode.Staff && !isLast ? `${printRowGap}px` : undefined,
                "--staff-centre": geometry === undefined ? undefined : StaffRowGeometry.formatPx(geometry.centrePx),
            };

            return (
                <Container
                    key={track.id}
                    className="print-system-name-cell"
                    crossAlignment={ChildAlignment.Center}
                    mainAlignment={ChildAlignment.End}
                    style={cellStyle}
                >
                    <span className="print-system-name">{track.instrument.displayName}</span>
                </Container>
            );
        });

        const style: CSSProperties = {
            width: `${printInstrumentColumnWidth}px`,
            marginRight: `${printInstrumentGap}px`,
            paddingTop: viewMode === TrackViewMode.Staff ? `${printStaffHeadRoom}px` : undefined,
        };

        return (
            <Container
                className="print-system-names"
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
                style={style}
            >
                {cells}
            </Container>
        );
    }

    /**
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The clef and time signature column, whose left edge is where the staves open, or undefined in grid
     *          mode, which has no staff prefix.
     */
    private renderPrefixColumn(staves: IStavesSpan | undefined): ComponentChild {
        const { viewMode, arrangement, tracks, rowGeometries } = this.props;
        if (viewMode !== TrackViewMode.Staff) {
            return undefined;
        }

        return (
            <Container className="print-system-prefix" crossAlignment={ChildAlignment.Stretch}>
                <StaffPrefixViewer
                    arrangement={arrangement}
                    timeSignature={arrangement.timeParams.timeSignature}
                    tracks={[...tracks]}
                    rowGeometries={rowGeometries}
                />
                {this.renderLeadingBarline(staves)}
            </Container>
        );
    }
}
