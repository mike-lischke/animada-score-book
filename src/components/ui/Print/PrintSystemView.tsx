/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import { MeasureLayout, staffSpacePx } from "../../../core/MeasureLayout.js";
import {
    printGridHeadRoom, printInstrumentColumnWidth, printInstrumentGap, printRowGap, printStaffHeadRoom,
    printSystemNumberGap, printSystemNumberStaffSpace, type IPrintMeasureColumn, type IPrintSystem,
} from "../../../core/PrintLayout.js";
import type { ISbDmArrangement, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { ScoreSymbol, ScoreSymbols } from "../../../core/ScoreSymbols.js";
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

    /** Magnification the system is drawn at on screen: the preview zoom times the print scale. */
    contentZoom?: number;

    /** Width the page's content area offers a system, in layout px at 100% zoom. */
    availableWidthPx?: number;

    /** Invoked when a staff measure boundary was dragged to a new print width, in layout px at 100% zoom. */
    onMeasureResized?: (bar: number, widthPx: number) => void;

    /** Invoked when the print width of one measure returns to the width the score states. */
    onMeasureReset?: (bar: number) => void;
}

interface IPrintSystemViewState {
    /** The measure whose boundary is being dragged, while the gesture runs. */
    dragBar?: number;

    /** Width the dragged measure takes while the gesture runs, in layout px at 100% zoom. */
    dragWidthPx?: number;
}

/** Vertical span of a system's staves, in layout px at 100% zoom. */
interface IStavesSpan {
    readonly topPx: number;
    readonly bottomPx: number;
}

/** Room the bracket's band keeps beyond the outer staves, in layout px at 100% zoom. */
const bracketOverhangPx = 20;

/** Step the width of a dragged measure snaps to, in layout px at 100% zoom. */
const widthStepPx = 5;

/**
 * One printed system: the instrument names, the staff prefix and the measure columns, laid out at the offsets the
 * print layout states. Every length is a layout px at 100% zoom; the page that holds the system states the print
 * scale.
 */
export class PrintSystemView extends UIComponent<IPrintSystemViewProperties, IPrintSystemViewState> {
    public constructor(props: IPrintSystemViewProperties) {
        super(props);

        this.state = {};
    }

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
        const number = this.renderMeasureNumber(staves);
        const nameColumn = this.renderNameColumn();
        const prefixColumn = this.renderPrefixColumn(staves);
        const measures = system.measures.map((column) => {
            return this.renderMeasure(column);
        });
        const barlines = this.renderBoundaryBarlines(staves);
        const handles = this.renderResizeHandles(staves);

        return (
            <Container
                className={className}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Start}
                style={style}
            >
                {bracket}
                {number}
                {nameColumn}
                {prefixColumn}
                {measures}
                {barlines}
                {handles}
            </Container>
        );
    }

    /**
     * @param widthPx The width the pointer asks for.
     *
     * @returns The width rounded to the step a dragged measure width moves in.
     */
    private static snapWidth(widthPx: number): number {
        return Math.round(widthPx / widthStepPx) * widthStepPx;
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
     * @returns The style that spans a barline over the staves of the system, or undefined where there are none to
     *          span.
     */
    private barlineSpanStyle(staves: IStavesSpan | undefined): CSSProperties | undefined {
        const { tracks } = this.props;
        if (staves === undefined) {
            return undefined;
        }

        // The line ends where the clef does: the stylesheet lets it reach as far beyond the outer staff lines as
        // the clef's ink does, which needs the line count of the staffs it spans.
        const firstLines = StaffRowGeometry.maxNoteLineOf(tracks[0]);
        const lastLines = StaffRowGeometry.maxNoteLineOf(tracks[tracks.length - 1]);

        return {
            "--barline-top": `${staves.topPx}px`,
            "--barline-height": `${staves.bottomPx - staves.topPx}px`,
            "--barline-half-lines-top": `${(firstLines - 1) / 2}`,
            "--barline-half-lines-bottom": `${(lastLines - 1) / 2}`,
        };
    }

    /**
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The barlines that close the measures across all staves of the system, so the measures read as one
     *          system and each of them ends on a line that can be dragged.
     */
    private renderBoundaryBarlines(staves: IStavesSpan | undefined): ComponentChild[] {
        const spanStyle = this.barlineSpanStyle(staves);
        if (spanStyle === undefined) {
            return [];
        }

        const { arrangement, arrangementPlayer, system } = this.props;
        const barCount = arrangementPlayer.scoreMetrics.bars;
        const barlines: ComponentChild[] = [];

        system.measures.forEach((column, index) => {
            const closing = ScoreSymbols.closingBarlineAt(arrangement.repeatBars, column.bar, column.bar === barCount);
            if (closing !== undefined) {
                const rightEdgePx = this.measureOffsetPx(column) + this.measureWidthPx(column);
                barlines.push(this.renderBoundaryBarline(`close-${column.bar}`, spanStyle, rightEdgePx,
                    closing !== ScoreSymbol.BarlineSingle, true));
            }

            // A bar that opens a repeat draws its thick stroke on its own left edge, which closes the bar before it.
            if (index > 0 && arrangement.repeatBars?.get(column.bar)?.start === true) {
                const leftEdgePx = this.measureOffsetPx(column);
                barlines.push(this.renderBoundaryBarline(`open-${column.bar}`, spanStyle, leftEdgePx, true, false));
            }
        });

        return barlines;
    }

    /**
     * @param key The key of the rendered line.
     * @param spanStyle The style that spans the line over the staves.
     * @param leftPx Offset of the line's stated edge from the system's left edge, in layout px at 100% zoom.
     * @param thick Whether the line continues a thick stroke instead of a thin one.
     * @param rightAligned Whether the stated edge is the line's right edge.
     *
     * @returns One barline across the staves of the system.
     */
    private renderBoundaryBarline(key: string, spanStyle: CSSProperties, leftPx: number, thick: boolean,
        rightAligned: boolean): ComponentChild {
        const style: CSSProperties = {
            ...spanStyle,
            left: `${leftPx}px`,
            width: thick ? "var(--barline-thick-thickness, 5px)" : "var(--barline-thin-thickness, 2px)",
            transform: rightAligned ? "translateX(-100%)" : undefined,
        };

        return <div key={key} className="print-system-barline" style={style} aria-hidden="true" />;
    }

    /**
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The barline that opens the measures and ties the staves of the system together, or undefined where
     *          there are no staves to tie together.
     */
    private renderLeadingBarline(staves: IStavesSpan | undefined): ComponentChild {
        const spanStyle = this.barlineSpanStyle(staves);
        if (spanStyle === undefined) {
            return undefined;
        }

        return <div className="print-system-barline" style={spanStyle} aria-hidden="true" />;
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
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The measure the system starts with, stated above the left barline, or undefined for an empty
     *          system.
     */
    private renderMeasureNumber(staves: IStavesSpan | undefined): ComponentChild {
        const { system } = this.props;
        if (system.measures.length === 0) {
            return undefined;
        }

        const digits = this.renderNumberDigits(system.measures[0].bar);

        // The number stands clear of whatever opens the system: the bracket's upper end, or the first staff. Grid
        // rows start below the head room, which is the band the number takes where there is no stave to hang on.
        const anchorTopPx = this.numberAnchorTopPx(staves);
        const style: CSSProperties = {
            left: `${printInstrumentColumnWidth + 7}px`,
            bottom: `${system.heightPx - anchorTopPx + printSystemNumberGap}px`,
        };

        return <span className="print-system-measure-number" style={style}>{digits}</span>;
    }

    /**
     * @param value The measure number to state.
     *
     * @returns The digits of the number, drawn with the score's music font.
     */
    private renderNumberDigits(value: number): ComponentChild[] {
        // The music font has one set of digits, which time signatures and printed numbers share.
        return [...String(value)].map((digit, index) => {
            const symbol = ScoreSymbols.timeSignatureDigit(digit);
            if (symbol === undefined) {
                return null;
            }

            return (
                <ScoreSymbolView
                    key={`${digit}-${index}`}
                    symbol={symbol}
                    staffSpace={printSystemNumberStaffSpace}
                />
            );
        });
    }

    /**
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The top edge the measure number hangs above, in layout px at 100% zoom.
     */
    private numberAnchorTopPx(staves: IStavesSpan | undefined): number {
        const { tracks } = this.props;
        if (staves === undefined) {
            return printGridHeadRoom;
        }

        return tracks.length < 2 ? staves.topPx : staves.topPx - bracketOverhangPx;
    }

    /**
     * @param staves The vertical span of the system's staves, or undefined where the view has none.
     *
     * @returns The drag handles of the staff measure boundaries, which live only in the staff view and only where
     *          the host takes a new width.
     */
    private renderResizeHandles(staves: IStavesSpan | undefined): ComponentChild[] {
        const { viewMode, system, onMeasureResized } = this.props;
        if (viewMode !== TrackViewMode.Staff || onMeasureResized === undefined) {
            return [];
        }

        // The handle reaches no further than the line it sits on, so it takes no room from the page around it.
        const spanStyle = this.barlineSpanStyle(staves);

        return system.measures.map((column) => {
            // The handle sits on the barline that closes the measure, the line the printed measures share.
            const boundaryPx = this.measureOffsetPx(column) + this.measureWidthPx(column);
            const dragging = this.state.dragBar === column.bar;
            const style: CSSProperties = {
                ...spanStyle,
                left: `${boundaryPx}px`,
            };
            const flag = dragging ? this.renderDragFlag(column) : undefined;

            return (
                <div
                    key={`resize-${column.bar}`}
                    className="print-system-resize-handle"
                    style={style}
                    title="Drag to change the printed width. Double-click to restore the score width."
                    data-bar={column.bar}
                    onPointerDown={this.handleResizePointerDown}
                    onDblClick={this.handleResizeDoubleClick}
                >
                    {flag}
                </div>
            );
        });
    }

    /**
     * @param column The measure column the boundary closes.
     *
     * @returns The flag that states the width of the measure being dragged.
     */
    private renderDragFlag(column: IPrintMeasureColumn): ComponentChild {
        return (
            <span className="print-system-resize-flag" aria-hidden="true">
                {`${Math.round(this.measureWidthPx(column))} px`}
            </span>
        );
    }

    /**
     * @param column The measure column to measure.
     *
     * @returns The width the column is drawn at, which during a gesture is the width being dragged to.
     */
    private measureWidthPx(column: IPrintMeasureColumn): number {
        const { dragBar, dragWidthPx } = this.state;

        return dragBar === column.bar && dragWidthPx !== undefined ? dragWidthPx : column.widthPx;
    }

    /**
     * @param column The measure column to place.
     *
     * @returns The offset of the column's left edge from the system's left edge. The columns follow the dragged
     *          measure while the gesture runs, moving in layout px at 100% zoom like the columns themselves.
     */
    private measureOffsetPx(column: IPrintMeasureColumn): number {
        const { dragBar, dragWidthPx } = this.state;
        const { system } = this.props;
        if (dragBar === undefined || dragWidthPx === undefined) {
            return column.offsetPx;
        }

        for (const measure of system.measures) {
            if (measure.bar === dragBar) {
                return measure.offsetPx < column.offsetPx
                    ? column.offsetPx + dragWidthPx - measure.widthPx
                    : column.offsetPx;
            }
        }

        return column.offsetPx;
    }

    /**
     * Renders one measure column at its width in the system.
     *
     * @param column The measure column to render.
     *
     * @returns The measure column.
     */
    private renderMeasure(column: IPrintMeasureColumn): ComponentChild {
        const { viewMode, tracks, rowGeometries, arrangement, arrangementPlayer, dataModel,
            selectionManager } = this.props;
        const { bar } = column;
        const widthPx = this.measureWidthPx(column);
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
                nominalWidth={MeasureLayout.defaultWidth()}
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

    /**
     * @param column The dragged measure column.
     *
     * @returns The widest the column may become, so its closing boundary stays inside the page content, in layout
     *          px at 100% zoom.
     */
    private maximumWidthPx(column: IPrintMeasureColumn): number {
        const { availableWidthPx } = this.props;
        if (availableWidthPx === undefined) {
            return Number.POSITIVE_INFINITY;
        }

        const roomPx = availableWidthPx - column.offsetPx;

        return Math.floor(roomPx / widthStepPx) * widthStepPx;
    }

    /**
     * Starts dragging a measure's closing boundary. The gesture follows the pointer on the window, so it survives
     * the re-render of the column under it, and it only changes the width of the dragged column: systems and pages
     * keep their places until the host reflows them when the gesture ends. The width moves in fixed steps and stops
     * at the right edge of the page content.
     *
     * @param event The pointer event on the boundary.
     */
    private handleResizePointerDown = (event: PointerEvent): void => {
        const { arrangement, contentZoom, onMeasureResized, system } = this.props;
        if (onMeasureResized === undefined || event.button !== 0) {
            return;
        }

        const bar = Number((event.currentTarget as HTMLElement).dataset.bar);
        const column = system.measures.find((measure) => {
            return measure.bar === bar;
        });
        if (column === undefined) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // The pointer moves in screen px, while the column is stated in layout px: the sheet's zoom and the print
        // scale are the only conversion between them.
        const zoom = contentZoom ?? 1;
        const startClientX = event.clientX;
        const startWidthPx = this.measureWidthPx(column);
        const minimumPx = MeasureLayout.contentMinimumWidthOfMeasure(arrangement, bar);
        const maximumPx = Math.max(minimumPx, this.maximumWidthPx(column));
        let widthPx = startWidthPx;

        const handlePointerMove = (moveEvent: PointerEvent): void => {
            const requestedPx = startWidthPx + ((moveEvent.clientX - startClientX) / zoom);
            widthPx = Math.min(maximumPx, Math.max(minimumPx, PrintSystemView.snapWidth(requestedPx)));
            this.setState({ dragBar: bar, dragWidthPx: widthPx });
        };

        const handlePointerUp = (): void => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);

            this.setState({ dragBar: undefined, dragWidthPx: undefined });
            if (widthPx !== startWidthPx) {
                onMeasureResized(bar, widthPx);
            }
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
    };

    /**
     * Restores the score width of one measure with a double click on its boundary.
     *
     * @param event The double click on the boundary.
     */
    private handleResizeDoubleClick = (event: MouseEvent): void => {
        const { onMeasureReset } = this.props;
        if (onMeasureReset === undefined) {
            return;
        }

        onMeasureReset(Number((event.currentTarget as HTMLElement).dataset.bar));
    };
}
