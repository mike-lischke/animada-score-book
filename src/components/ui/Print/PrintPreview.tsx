/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild, type CSSProperties, type RefObject } from "preact";

import {
    PageOrientation, PrintLayout, PrintOverflowKind, type IPageMargins, type IPrintLayout, type IPrintOverflow,
} from "../../../core/PrintLayout.js";
import type { ISbDmArrangement, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { TrackViewMode } from "../../../core/types/general.js";
import { clampValue } from "../../../core/utils.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import {
    PrintSession, defaultPrintMargins, defaultPrintScale, maxPreviewZoom, minPreviewZoom,
} from "../../../ui/PrintSession.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { Button } from "../framework/Button.js";
import { Checkbox } from "../framework/Checkbox.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { Portal } from "../framework/Portal.js";
import { SegmentedSwitch, type ISegmentOption } from "../framework/SegmentedSwitch.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ValueDropdown } from "../framework/ValueDropdown.js";
import { PrintSheet } from "./PrintSheet.js";

/** Room the sheet stack keeps from the edges of the scrollable document area, in px. */
const documentPadding = 24;

/** Step the preview zoom changes by when the zoom buttons are used. */
const zoomStep = 0.1;

/** Margin values the preview offers, in millimeters: -5 mm to 50 mm in steps of 5. */
const marginValues = Array.from({ length: 12 }, (_, index) => {
    return -5 + (index * 5);
});

/** Print scale percentages the preview offers: 10 % to 200 % in steps of 5. */
const scaleValues = Array.from({ length: 39 }, (_, index) => {
    return 10 + (index * 5);
});

export interface IPrintPreviewProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    arrangementPlayer: ArrangementPlayer;
    selectionManager: SelectionManager;

    /** The session state the preview shows and retains when it is closed and opened again. */
    session: PrintSession;

    viewMode: TrackViewMode;

    onClose: () => void;

    /** Invoked by the Print/PDF action. The application owns the native print flow. */
    onPrint: () => void;
}

interface IPrintPreviewState {
    /** Bumped whenever a setting changed, which rebuilds the page layout. */
    revision: number;

    /** 1-based number of the page the document area shows. */
    currentPage: number;
}

interface IPrintPreviewData {
    revision: number;
    layout: IPrintLayout;
    tracks: ISbDmTrack[];
}

/**
 * Full-window print preview: a fixed toolbar, a scrollable stack of A4 sheets and the warnings the layout reports.
 *
 * The sheets are rendered from {@link PrintLayout}, so every page, system and measure sits where the printed output
 * places it. The toolbar changes the session's settings, and only the preview zoom, which the layout does not know,
 * leaves the pagination untouched.
 */
export class PrintPreview extends UIComponent<IPrintPreviewProperties, IPrintPreviewState> {
    private readonly portalRef = createRef<Portal | null>();
    private readonly scrollRef = createRef<HTMLDivElement | null>();
    private readonly sheetRefs: Array<RefObject<HTMLDivElement | null>> = [];

    private data?: IPrintPreviewData;

    public constructor(props: IPrintPreviewProperties) {
        super(props);

        this.state = { revision: 0, currentPage: 1 };
    }

    public override componentDidMount(): void {
        this.portalRef.current?.open({ backgroundOpacity: 1 });

        requisitions.register("arrangementMutated", this.handleArrangementChanged);
        requisitions.register("arrangementReverted", this.handleArrangementChanged);
        requisitions.register("timeParamsChanged", this.handleArrangementChanged);
        requisitions.register("scoreBookLoaded", this.handleArrangementChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("arrangementMutated", this.handleArrangementChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementChanged);
        requisitions.unregister("timeParamsChanged", this.handleArrangementChanged);
        requisitions.unregister("scoreBookLoaded", this.handleArrangementChanged);
    }

    public override render(): ComponentChild {
        const { dataModel } = this.props;
        const arrangement = dataModel.arrangement;
        if (!arrangement) {
            return null;
        }

        const { layout, tracks } = this.pageData(arrangement);
        const pageCount = layout.pages.length;
        const currentPage = clampValue(this.state.currentPage, 1, pageCount);

        const bars = this.renderBars(arrangement, layout, currentPage, pageCount);
        const sheets = this.renderSheets(layout, tracks);

        return (
            <Portal ref={this.portalRef} onClose={this.handlePortalClose}>
                <div className="print-preview" role="dialog" aria-label="Print preview">
                    <div className="print-preview-document" ref={this.scrollRef} onScroll={this.handleScroll}>
                        <div className="print-preview-sheets">
                            {sheets}
                        </div>
                    </div>
                    {bars}
                </div>
            </Portal>
        );
    }

    /**
     * @param value The print scale percentage.
     *
     * @returns The percentage as the scale control shows it.
     */
    private static formatPercent(value: number): string {
        return `${value}%`;
    }

    /**
     * @param arrangement The arrangement to lay out.
     *
     * @returns The layout and the printed tracks, which are reused until a setting invalidates them.
     */
    private pageData(arrangement: ISbDmArrangement): IPrintPreviewData {
        const { revision } = this.state;
        if (this.data?.revision === revision) {
            return this.data;
        }

        const { arrangementPlayer, session, viewMode } = this.props;
        const tracks = this.selectedTracks(arrangement);
        const layout = PrintLayout.layout({
            arrangement,
            barCount: arrangementPlayer.scoreMetrics.bars,
            grid: arrangementPlayer.scoreMetrics,
            setup: session.pageSetup,
            tracks,
            viewMode,
            widthOverrides: session.widthOverrides(arrangement),
        });
        this.data = { revision, layout, tracks };

        return this.data;
    }

    /**
     * @param arrangement The arrangement whose selection is read.
     *
     * @returns The tracks to print, in display order.
     */
    private selectedTracks(arrangement: ISbDmArrangement): ISbDmTrack[] {
        const selectedTrackIds = this.props.session.selectedTrackIds(arrangement);
        if (selectedTrackIds === undefined) {
            return [...arrangement.tracks];
        }

        return arrangement.tracks.filter((track) => {
            return selectedTrackIds.has(track.id);
        });
    }

    /**
     * @param arrangement The printed arrangement, which the track selection reads.
     * @param layout The page layout, whose overflows are reported.
     * @param currentPage The 1-based page the document area shows.
     * @param pageCount The number of pages the layout holds.
     *
     * @returns The floating bars that control the preview.
     */
    private renderBars(arrangement: ISbDmArrangement, layout: IPrintLayout, currentPage: number,
        pageCount: number): ComponentChild {

        return (
            <>
                <div className="print-preview-bar print-preview-bar-layout">
                    <span className="print-preview-heading">Layout</span>
                    <span className="print-preview-divider" />
                    {this.renderOrientationSwitch()}
                    <span className="print-preview-divider" />
                    <span className="print-preview-label">Borders</span>
                    {this.renderMarginInputs()}
                    {this.renderWidthReset(arrangement)}
                </div>
                <div className="print-preview-bar print-preview-bar-print">
                    <span className="print-preview-heading">Print Details</span>
                    <span className="print-preview-divider" />
                    <span className="print-preview-label">Scale</span>
                    {this.renderScaleInput()}
                    <span className="print-preview-divider" />
                    {this.renderTracksDropdown(arrangement)}
                </div>
                <div className="print-preview-bar print-preview-bar-display">
                    <span className="print-preview-heading">Display</span>
                    <span className="print-preview-divider" />
                    {this.renderZoomControls()}
                    <Button className="print-preview-tool-button" caption="Fit width" onClick={this.handleFitWidth} />
                    <Button className="print-preview-tool-button" caption="Fit page" onClick={this.handleFitPage} />
                    <span className="print-preview-divider" />
                    {this.renderPageNavigation(currentPage, pageCount)}
                    <span className="print-preview-divider" />
                    <Button className="print-preview-tool-button" title="Reset the print settings"
                        onClick={this.handleReset}>
                        <Icon src={UIIcon.Refresh} />
                        <span>Reset</span>
                    </Button>
                </div>
                <div className="print-preview-bar print-preview-bar-actions">
                    <Button
                        className="print-preview-tool-button" title="Close the preview (ESC)"
                        onClick={this.handleClose}
                    >
                        <Icon src={UIIcon.Close} />
                        <span>Close</span>
                    </Button>
                    <Button className="print-preview-tool-button print-preview-emphasis"
                        title="Print or save as PDF" onClick={this.handlePrint}>
                        <Icon src={UIIcon.Printer} />
                        <span>Print / PDF</span>
                    </Button>
                </div>
                {this.renderWarnings(layout.overflows)}
            </>
        );
    }

    private renderOrientationSwitch(): ComponentChild {
        const { session } = this.props;
        const options: Array<ISegmentOption<PageOrientation>> = [
            { value: PageOrientation.Portrait, label: "Portrait", title: "Print on A4 portrait paper" },
            { value: PageOrientation.Landscape, label: "Landscape", title: "Print on A4 landscape paper" },
        ];

        return (
            <SegmentedSwitch
                options={options}
                value={session.pageSetup.orientation}
                onChange={this.handleOrientationChange}
            />
        );
    }

    /**
     * @returns The four margin inputs in a row, each marked by the side of the paper it states.
     */
    private renderMarginInputs(): ComponentChild {
        const { margins } = this.props.session.pageSetup;

        return (
            <Container className="print-preview-margins" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                {this.renderMarginInput("top", margins.top)}
                {this.renderMarginInput("right", margins.right)}
                {this.renderMarginInput("bottom", margins.bottom)}
                {this.renderMarginInput("left", margins.left)}
                <span className="print-preview-margin-unit">mm</span>
            </Container>
        );
    }

    /**
     * @param side The margin the input changes.
     * @param value The margin in millimeters.
     *
     * @returns One margin input with the icon of its side.
     */
    private renderMarginInput(side: keyof IPageMargins, value: number): ComponentChild {
        const title = `${side.charAt(0).toUpperCase()}${side.slice(1)} margin in millimeters`;

        return (
            <span key={side} className="print-preview-margin-field" title={title}>
                {this.renderMarginIcon(side)}
                <ValueDropdown
                    id={`print-margin-${side}`}
                    value={value}
                    values={marginValues}
                    title={title}
                    onChange={(newValue) => {
                        this.handleMarginChange(side, newValue);
                    }}
                />
            </span>
        );
    }

    /**
     * @param side The side of the paper the icon marks.
     *
     * @returns A sheet with dotted edges and its stated side drawn through.
     */
    private renderMarginIcon(side: keyof IPageMargins): ComponentChild {
        const lines: Record<keyof IPageMargins, [number, number, number, number]> = {
            top: [3.5, 3.5, 12.5, 3.5],
            right: [12.5, 3.5, 12.5, 12.5],
            bottom: [3.5, 12.5, 12.5, 12.5],
            left: [3.5, 3.5, 3.5, 12.5],
        };
        const [x1, y1, x2, y2] = lines[side];

        return (
            <svg className="print-preview-margin-icon" viewBox="0 0 16 16" aria-hidden="true">
                <rect className="print-preview-margin-icon-frame" x="3.5" y="3.5" width="9" height="9" />
                <line className="print-preview-margin-icon-side" x1={x1} y1={y1} x2={x2} y2={y2} />
            </svg>
        );
    }

    /**
     * @param arrangement The arrangement whose print widths are reset.
     *
     * @returns The reset of the temporary measure widths, or nothing in grid mode, which has no widths to drag.
     */
    private renderWidthReset(arrangement: ISbDmArrangement): ComponentChild {
        if (this.props.viewMode !== TrackViewMode.Staff) {
            return undefined;
        }

        const hasOverrides = this.props.session.widthOverrides(arrangement).size > 0;

        return (
            <>
                <span className="print-preview-divider" />
                <Button
                    className="print-preview-tool-button"
                    caption="Reset widths"
                    title="Restore the measure widths of the score"
                    disabled={!hasOverrides}
                    onClick={this.handleResetWidths}
                />
            </>
        );
    }

    /**
     * @param arrangement The arrangement whose tracks are listed.
     *
     * @returns The track chooser, whose menu keeps open for repeated toggles.
     */
    private renderTracksDropdown(arrangement: ISbDmArrangement): ComponentChild {
        const { session } = this.props;
        const selectedCount = this.selectedTracks(arrangement).length;

        const items: IDropdownItem[] = arrangement.tracks.map((track): IDropdownItem => {
            const selected = session.isTrackSelected(arrangement, track.id);

            return {
                label: track.name || track.instrument.displayName,
                icon: <Checkbox checked={selected} />,
                onClick: () => {
                    this.handleTrackToggle(arrangement, track.id, !selected);
                },
            };
        });

        const selectAll = (
            <Button
                className="print-preview-tool-button print-preview-select-all"
                caption="Select All Tracks"
                onClick={() => {
                    this.handleSelectAll(arrangement);
                }}
            />
        );

        return (
            <Dropdown
                className="print-preview-tracks"
                caption={`Tracks ${selectedCount}/${arrangement.tracks.length}`}
                items={items}
                menuHeader={selectAll}
                title="Choose the tracks to print"
            />
        );
    }

    private renderScaleInput(): ComponentChild {
        const percent = Math.round(this.props.session.pageSetup.printScale * 100);

        return (
            <Container className="print-preview-scale" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <ValueDropdown
                    id="print-scale"
                    value={percent}
                    values={scaleValues}
                    formatValue={(value) => {
                        return PrintPreview.formatPercent(value);
                    }}
                    title="Size of the notation on paper"
                    onChange={this.handleScaleChange}
                />
            </Container>
        );
    }

    /**
     * @returns The zoom steps, with the value between them as in the footer.
     */
    private renderZoomControls(): ComponentChild {
        const zoom = this.props.session.previewZoom;
        const percent = Math.round(zoom * 100);

        return (
            <Container className="print-preview-zoom" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Button
                    className="print-preview-zoom-button"
                    title="Zoom out"
                    disabled={zoom <= minPreviewZoom}
                    onClick={this.handleZoomOut}
                >
                    <Icon src={UIIcon.HorizontalRule} />
                </Button>
                <Label className="print-preview-zoom-value" caption={`${percent}%`} />
                <Button
                    className="print-preview-zoom-button"
                    title="Zoom in"
                    disabled={zoom >= maxPreviewZoom}
                    onClick={this.handleZoomIn}
                >
                    <Icon src={UIIcon.Add} />
                </Button>
            </Container>
        );
    }

    private renderPageNavigation(currentPage: number, pageCount: number): ComponentChild {
        return (
            <Container className="print-preview-pager" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Button className="print-preview-pager-button" imageOnly title="Previous page"
                    disabled={currentPage <= 1} onClick={this.handlePreviousPage}>
                    <Icon src={UIIcon.ChevronLeft} />
                </Button>
                <span className="print-preview-pager-label">{`Page ${currentPage} / ${pageCount}`}</span>
                <Button className="print-preview-pager-button" imageOnly title="Next page"
                    disabled={currentPage >= pageCount} onClick={this.handleNextPage}>
                    <Icon src={UIIcon.ChevronRight} />
                </Button>
            </Container>
        );
    }

    private renderWarnings(overflows: readonly IPrintOverflow[]): ComponentChild {
        if (overflows.length === 0) {
            return undefined;
        }

        const messages = this.warningMessages(overflows).map((message, index) => {
            return <div key={index}>{message}</div>;
        });

        return (
            <div className="print-preview-warning" role="alert">
                <Icon src={UIIcon.Warning} />
                <div className="print-preview-warning-messages">{messages}</div>
            </div>
        );
    }

    /**
     * @param overflows The content the layout could not place.
     *
     * @returns One message per kind of overflow, so a score of wide measures does not repeat itself per measure.
     */
    private warningMessages(overflows: readonly IPrintOverflow[]): string[] {
        const messages: string[] = [];
        const tooWide = overflows.filter((overflow) => {
            return overflow.kind === PrintOverflowKind.MeasureTooWide;
        });
        const tooTall = overflows.filter((overflow) => {
            return overflow.kind === PrintOverflowKind.SystemTooTall;
        });

        if (tooWide.length === 1) {
            messages.push(this.overflowMessage(tooWide[0]));
        } else if (tooWide.length > 1) {
            const fitPercent = Math.min(...tooWide.map((overflow) => {
                return this.fitPercent(overflow);
            }));
            messages.push(`${tooWide.length} systems are wider than the page content. Reduce the print scale to`
                + ` ${fitPercent}% or narrow the measures.`);
        }

        if (tooTall.length === 1) {
            messages.push(this.overflowMessage(tooTall[0]));
        } else if (tooTall.length > 1) {
            messages.push(`${tooTall.length} systems are taller than the page content. Reduce the print scale or the`
                + " number of printed tracks.");
        }

        return messages;
    }

    /**
     * @param overflow One piece of content the layout could not place.
     *
     * @returns A message naming what to change.
     */
    private overflowMessage(overflow: IPrintOverflow): string {
        const bars = overflow.firstBar === overflow.lastBar
            ? `Measure ${overflow.firstBar}`
            : `Measures ${overflow.firstBar}–${overflow.lastBar}`;

        if (overflow.kind === PrintOverflowKind.MeasureTooWide) {
            return `${bars} is wider than the page content. Reduce the print scale to ${this.fitPercent(overflow)}% or`
                + " narrow the measure.";
        }

        return `${bars} is taller than the page content. Reduce the print scale or the number of printed tracks.`;
    }

    /**
     * @param overflow An overflow the user resolves by shrinking the print scale.
     *
     * @returns The largest whole print scale percentage at which the content would fit.
     */
    private fitPercent(overflow: IPrintOverflow): number {
        return Math.floor((100 * this.props.session.pageSetup.printScale * overflow.availablePx)
            / overflow.requiredPx);
    }

    private renderSheets(layout: IPrintLayout, tracks: readonly ISbDmTrack[]): ComponentChild[] {
        const { arrangement } = this.props.dataModel;
        if (!arrangement) {
            return [];
        }

        const { previewZoom } = this.props.session;
        const { widthPx, heightPx } = layout.geometry;

        return layout.pages.map((page, index) => {
            const frameStyle: CSSProperties = {
                width: `${widthPx * previewZoom}px`,
                height: `${heightPx * previewZoom}px`,
            };
            const ref = this.sheetRefs[index] ??= createRef<HTMLDivElement | null>();

            return (
                <div
                    key={page.number}
                    className="print-preview-sheet-frame"
                    style={frameStyle}
                    ref={ref}
                >
                    <PrintSheet
                        layout={layout}
                        page={page}
                        arrangement={arrangement}
                        viewMode={this.props.viewMode}
                        tracks={tracks}
                        printScale={this.props.session.pageSetup.printScale}
                        previewZoom={previewZoom}
                        dataModel={this.props.dataModel}
                        arrangementPlayer={this.props.arrangementPlayer}
                        selectionManager={this.props.selectionManager}
                        onMeasureResized={this.handleMeasureResized}
                        onMeasureReset={this.handleMeasureReset}
                    />
                </div>
            );
        });
    }

    /** Rebuilds the layout on the next render. */
    private invalidate(): void {
        this.data = undefined;
        this.refresh();
    }

    /** Re-renders without rebuilding the layout. */
    private refresh(): void {
        this.setState({ revision: this.state.revision + 1 });
    }

    /**
     * @param zoom The new preview magnification.
     */
    private applyZoom(zoom: number): void {
        this.props.session.setPreviewZoom(zoom);
        this.refresh();
    }

    private pageSize(): { widthPx: number; heightPx: number; } {
        const geometry = PrintLayout.pageGeometry(this.props.session.pageSetup);

        return { widthPx: geometry.widthPx, heightPx: geometry.heightPx };
    }

    private handleOrientationChange = (orientation: PageOrientation): void => {
        this.props.session.setOrientation(orientation);
        this.invalidate();
    };

    private handleMarginChange = (side: keyof IPageMargins, value: number): void => {
        const { session } = this.props;
        if (!Number.isFinite(value)) {
            return;
        }

        session.setMargins({ ...session.pageSetup.margins, [side]: value });
        this.invalidate();
    };

    private handleScaleChange = (percent: number): void => {
        if (!Number.isFinite(percent) || percent <= 0) {
            return;
        }

        this.props.session.setPrintScale(percent / 100);
        this.invalidate();
    };

    private handleTrackToggle = (arrangement: ISbDmArrangement, trackId: number, checked: boolean): void => {
        this.props.session.setTrackSelected(arrangement, trackId, checked);
        this.invalidate();
    };

    /**
     * Takes a dragged staff measure boundary. The width stays in the session, so it never reaches the arrangement,
     * its autosave or its undo history.
     *
     * @param bar The 1-based measure number.
     * @param widthPx The new print width, in layout px at 100% zoom.
     */
    private handleMeasureResized = (bar: number, widthPx: number): void => {
        const arrangement = this.props.dataModel.arrangement;
        if (!arrangement) {
            return;
        }

        this.props.session.setWidthOverride(arrangement, bar, widthPx);
        this.invalidate();
    };

    private handleMeasureReset = (bar: number): void => {
        const arrangement = this.props.dataModel.arrangement;
        if (!arrangement) {
            return;
        }

        this.props.session.resetWidthOverride(arrangement, bar);
        this.invalidate();
    };

    private handleResetWidths = (): void => {
        const arrangement = this.props.dataModel.arrangement;
        if (!arrangement) {
            return;
        }

        this.props.session.resetWidthOverrides(arrangement);
        this.invalidate();
    };

    private handleSelectAll = (arrangement: ISbDmArrangement): void => {
        this.props.session.selectAllTracks(arrangement);
        this.invalidate();
    };

    private handleZoomIn = (): void => {
        this.applyZoom(this.props.session.previewZoom + zoomStep);
    };

    private handleZoomOut = (): void => {
        this.applyZoom(this.props.session.previewZoom - zoomStep);
    };

    private handleFitWidth = (): void => {
        const container = this.scrollRef.current;
        if (!container) {
            return;
        }

        const { widthPx } = this.pageSize();
        this.applyZoom((container.clientWidth - (2 * documentPadding)) / widthPx);
    };

    private handleFitPage = (): void => {
        const container = this.scrollRef.current;
        if (!container) {
            return;
        }

        const { widthPx, heightPx } = this.pageSize();
        const widthZoom = (container.clientWidth - (2 * documentPadding)) / widthPx;
        const heightZoom = (container.clientHeight - (2 * documentPadding)) / heightPx;
        this.applyZoom(Math.min(widthZoom, heightZoom));
    };

    private handlePreviousPage = (): void => {
        this.goToPage(this.state.currentPage - 1);
    };

    private handleNextPage = (): void => {
        this.goToPage(this.state.currentPage + 1);
    };

    /**
     * @param page The 1-based page number to scroll to, clamped to the pages the layout has.
     */
    private goToPage(page: number): void {
        const pageCount = this.data?.layout.pages.length ?? 1;
        const target = clampValue(page, 1, pageCount);

        this.setState({ currentPage: target });
        this.sheetRefs[target - 1]?.current?.scrollIntoView({ block: "start" });
    }

    private handleScroll = (): void => {
        const container = this.scrollRef.current;
        if (!container) {
            return;
        }

        const middle = container.getBoundingClientRect().top + (container.clientHeight / 2);
        let nearest = 1;
        let nearestDistance = Number.POSITIVE_INFINITY;

        this.sheetRefs.forEach((ref, index) => {
            const sheet = ref.current;
            if (!sheet) {
                return;
            }

            const rect = sheet.getBoundingClientRect();
            const distance = Math.abs(rect.top + (rect.height / 2) - middle);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = index + 1;
            }
        });

        if (nearest !== this.state.currentPage) {
            this.setState({ currentPage: nearest });
        }
    };

    private handleReset = (): void => {
        const { dataModel, session } = this.props;
        const arrangement = dataModel.arrangement;
        if (arrangement) {
            session.resetArrangement(arrangement);
        }

        session.setOrientation(PageOrientation.Portrait);
        session.setMargins({ ...defaultPrintMargins });
        session.setPrintScale(defaultPrintScale);
        session.setPreviewZoom(1);
        this.setState({ currentPage: 1 });
        this.invalidate();
    };

    private handlePrint = (): void => {
        this.props.onPrint();
    };

    private handleClose = (): void => {
        this.props.onClose();
    };

    private handlePortalClose = (): void => {
        this.props.onClose();
    };

    private handleArrangementChanged = (): Promise<boolean> => {
        this.invalidate();

        return Promise.resolve(true);
    };
}
