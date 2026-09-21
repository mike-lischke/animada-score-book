/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild, type JSX } from "preact";

import { AppStorage, type IUISettings } from "../../../core/AppStorage.js";
import { MeasureLayout, staffPrefixWidth, type IMeasureRange } from "../../../core/MeasureLayout.js";
import type { RealTime, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { clampValue } from "../../../core/utils.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { PlayerPlayState } from "../../../player/ArrangementPlayer.js";
import { requisitions, type IMeasureVisibilityRequest } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { GridMeasureEditor } from "../../../ui/GridMeasureEditor.js";
import { StaffMeasureEditor } from "../../../ui/StaffMeasureEditor.js";
import { ScoreElementKind, ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";
import { TrackViewerInputController } from "../../../ui/TrackViewerInputController.js";
import { GridMeasureViewer } from "../Bar/Grid/GridMeasureViewer.js";
import { StaffMeasureViewer } from "../Bar/Staff/StaffMeasureViewer.js";
import { StaffPrefixViewer } from "../Bar/Staff/StaffPrefixViewer.js";
import { Container } from "../framework/Container.js";
import { DialogResponseClosure } from "../framework/Dialog.js";
import { RadialMenu } from "../framework/RadialMenu.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Minimap, type IVisibleBarRange } from "../Minimap/Minimap.js";
import { InsertBarsDialog } from "../composites/InsertBarsDialog.js";
import { BarActionKind, BarActionStrip } from "./BarActionStrip.js";
import { TrackControls } from "./TrackControls.js";
import { TrackEditSidebar } from "./TrackEditSidebar.js";

/** Tolerance in px when telling a scroll the auto-follow wrote from a scroll the user caused. */
const autoScrollTolerance = 1;

/** Measures rendered on either side of the viewport in staff mode, so rendering stays ahead of the scrolling. */
const staffWindowOverscan = 1;

/** Distance in px a requested position keeps from the viewport edge, so a note head is not cut off. */
const staffVisibilityMargin = 24;

/** The measure column the play head is in, in layout px at 100% zoom. */
interface IPlayheadColumn {
    /** Left edge of the column. */
    start: number;

    /** Width of the column. */
    width: number;

    /** Fraction of the column the play head has reached. */
    progress: number;

    /** Total width of the rendered content. */
    contentWidth: number;
}

export interface IArrangementViewerProps extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
    inEditMode: boolean;
}

interface IArrangementViewerState {
    /** Determined from DOM, includes border and margin (@100% zoom). */
    noteWidth: number;

    trackPlayerCount: number;
    autoFollowIsOn: boolean;
    viewerZoom: number;
    trackViewMode: "grid" | "staff";

    /** Measures rendered in staff mode. The grid view renders every measure of the arrangement. */
    staffWindow: IMeasureRange;
}

export class ArrangementViewer extends UIComponent<IArrangementViewerProps, IArrangementViewerState> {
    private arrangementViewerRef = createRef<HTMLDivElement>();
    private viewerRef = createRef<HTMLDivElement>();
    private playBeamRef = createRef<HTMLDivElement>();
    private trackViewerContainerRef = createRef<HTMLDivElement>();
    private trackControlsRef = createRef<HTMLDivElement>();
    private viewerContentHostRef = createRef<HTMLDivElement>();
    private minimapRef = createRef<Minimap>();
    private insertBarsDialogRef = createRef<InsertBarsDialog>();
    private barActionStripRef = createRef<BarActionStrip>();
    private gridRadialMenuRef = createRef<RadialMenu>();
    private trackViewerInputController?: TrackViewerInputController;
    private readonly scoreElementRegistry = new ScoreElementRegistry();

    //private animationEngine?: AnimationEngine;
    private resizeObserver: ResizeObserver;

    private lastY = 0;
    private lastX = 0;
    private stopAutoFollowTimeoutId?: ReturnType<typeof setTimeout>;
    private scrollAnimationFrameId = 0;

    /** Offset the auto-follow scrolled to last, to tell its own scrolling from the user's. */
    private autoScrollLeft = -1;

    /** Column widths and offsets of the measures in layout px at 100% zoom, as used by the staff window. */
    private staffColumns: number[] = [];
    private staffOffsets: number[] = [];
    private staffGeometryDirty = true;

    // Used in auto follow mode to indicate the last pulse we were on, so that we can determine when to scroll.
    private lastPulse = 0;

    // This is the scroll target pulse. If the current pulse is more than 2 pulses ahead of this, or lower which
    // indicates we looped back, we scroll to catch up.
    // Initialize to -2 so that the first update happens at pulse 0.
    private targetPulse = -2;

    // The value set for the left-transition in CSS. We want to use the same value in JS to determine how long the
    // auto-follow transition should be.
    private autoFollowTransitionDurationMs: number;

    public constructor(props: IArrangementViewerProps) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const viewerZoom = settings.viewSettings?.arrangementViewSettings?.zoomLevel ?? 100;
        this.state = {
            viewerZoom,
            noteWidth: 0,
            trackPlayerCount: props.arrangementPlayer.trackPlayers.size,
            autoFollowIsOn: true,
            trackViewMode: settings.viewSettings?.arrangementViewSettings?.displayMode ?? "grid",
            staffWindow: { first: 1, last: 0 },
        };

        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.autoFollowTransitionDurationMs = 0;
    }

    public override componentDidMount(): void {
        const { arrangementPlayer, selectionManager } = this.props;
        const { viewerZoom, trackViewMode } = this.state;

        selectionManager.setEventContainer(this.arrangementViewerRef.current!, this.scoreElementRegistry);

        const verticalHost = this.arrangementViewerRef.current?.parentElement;
        if (verticalHost) {
            selectionManager.setScrollHosts(this.viewerRef.current!, verticalHost);
        }

        const contentHost = this.viewerContentHostRef.current!;
        contentHost.tabIndex = -1;
        contentHost.style.outline = "none";
        const gridEditor = new GridMeasureEditor(this.props.dataModel);
        const staffEditor = new StaffMeasureEditor(this.props.dataModel);
        this.trackViewerInputController = new TrackViewerInputController(
            contentHost, this.gridRadialMenuRef.current!, selectionManager, this.scoreElementRegistry,
        );
        this.trackViewerInputController.setEditors(gridEditor, staffEditor);
        this.trackViewerInputController.editMode = this.props.inEditMode;
        this.trackViewerInputController.viewMode = trackViewMode;
        this.trackViewerInputController.attach();

        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("trackViewModeToggled", this.handleTrackViewModeToggled);
        requisitions.register("timeParamsChanged", this.handleTimeParamsChange);
        requisitions.register("animationStateChanged", this.handleAnimationStateChanged);
        requisitions.register("arrangementChanged", this.handleArrangementChanged);
        requisitions.register("measureVisibilityRequested", this.handleMeasureVisibilityRequested);

        setTimeout(this.handleResize, 0);
        this.resizeObserver.observe(this.viewerRef.current!);

        // The animation always runs while playing: it moves the play beam. Scrolling to keep the beam
        // in view is what auto-follow adds, and what a manual scroll of the viewer turns off.
        arrangementPlayer.animationEngine.connect(this.autoFollow);

        this.autoFollowTransitionDurationMs = 50;
        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
        this.updateStaffWindow();
        this.handleTrackViewerScroll();
    }

    public override componentDidUpdate(prevProps: IArrangementViewerProps, prevState: IArrangementViewerState): void {
        const { arrangementPlayer, selectionManager } = this.props;
        const { viewerZoom, trackViewMode } = this.state;

        if (prevProps.arrangementPlayer !== arrangementPlayer) {
            prevProps.arrangementPlayer.animationEngine.disconnect(this.autoFollow);
            arrangementPlayer.animationEngine.connect(this.autoFollow);
            this.autoFollow(0);
        }

        if (prevState.trackViewMode !== trackViewMode) {
            // View mode switched — newly mounted components need the current selection state.
            this.trackViewerInputController!.viewMode = trackViewMode;
            selectionManager.republishSelection();
        }

        if (prevProps.inEditMode !== this.props.inEditMode) {
            this.trackViewerInputController!.editMode = this.props.inEditMode;
        }

        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
        this.updateStaffWindow();
        this.handleTrackViewerScroll();

        // The window's measures are mounted by now. Every listener that decorates rendered measures — the
        // selection overlay in particular — has to know that measures it may address have arrived, because a
        // measure that is not rendered has no element to decorate and would otherwise stay undecorated.
        const { staffWindow } = this.state;
        if (prevState.staffWindow.first !== staffWindow.first || prevState.staffWindow.last !== staffWindow.last) {
            void requisitions.execute("staffWindowChanged", undefined);
        }
    }

    public override componentWillUnmount(): void {
        const { arrangementPlayer } = this.props;

        this.resizeObserver.disconnect();
        arrangementPlayer.animationEngine.disconnect(this.autoFollow);
        this.trackViewerInputController?.dispose();
        this.trackViewerInputController = undefined;

        if (this.scrollAnimationFrameId !== 0) {
            cancelAnimationFrame(this.scrollAnimationFrameId);
            this.scrollAnimationFrameId = 0;
        }

        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("trackViewModeToggled", this.handleTrackViewModeToggled);
        requisitions.unregister("timeParamsChanged", this.handleTimeParamsChange);
        requisitions.unregister("animationStateChanged", this.handleAnimationStateChanged);
        requisitions.unregister("arrangementChanged", this.handleArrangementChanged);
        requisitions.unregister("measureVisibilityRequested", this.handleMeasureVisibilityRequested);
    }

    public override render(): JSX.Element {
        const { arrangementPlayer, dataModel, selectionManager, inEditMode } = this.props;
        const { trackViewMode, viewerZoom } = this.state;

        const arrangement = dataModel.arrangement!;
        const metrics = arrangementPlayer.scoreMetrics;
        const barCount = metrics.bars;

        const barViewerProps = {
            arrangement,
            arrangementPlayer,
            inEditMode,
            selectionManager,
            dataModel,
        };

        // The grid view renders every measure of the arrangement. It is not windowed: it lays out equal columns
        // and its own scroll geometry depends on the complete content.
        const renderGridBars = (): ComponentChild => {
            return (
                <>
                    {Array.from({ length: barCount }, (_, i) => {
                        return (
                            <GridMeasureViewer
                                key={i + 1}
                                measureNumber={i + 1}
                                scoreMetrics={metrics}
                                {...barViewerProps}
                                scoreElementRegistry={this.scoreElementRegistry}
                            />
                        );
                    })}
                </>
            );
        };

        // The staff view renders only the measures its window covers, at their exact offsets. Two spacers keep
        // the scrollable width of the content stable, so the scroll position means the same with and without a
        // rendered measure.
        const renderStaffBars = (): ComponentChild => {
            const { staffWindow } = this.state;
            const offsets = this.staffOffsets;
            const leadingWidth = offsets[staffWindow.first - 1] ?? 0;
            const trailingWidth = Math.max(0, MeasureLayout.totalWidth(offsets) - (offsets[staffWindow.last] ?? 0));

            const measures: ComponentChild[] = [];
            let lastLabel = this.labelBefore(staffWindow.first);
            for (let bar = staffWindow.first; bar <= staffWindow.last; bar++) {
                const ownLabel = arrangement.measureLabels[bar] as string | undefined;
                measures.push(
                    <StaffMeasureViewer
                        key={bar}
                        barNumber={bar}
                        {...barViewerProps}
                        scoreElementRegistry={this.scoreElementRegistry}
                        ownLabel={ownLabel}
                        inheritedLabel={ownLabel === undefined ? lastLabel : undefined}
                        style={{
                            flex: `0 0 ${MeasureLayout.widthOf(bar, arrangement.measureWidths)}px`,
                            minWidth: 0,
                        }}
                    />,
                );

                if (ownLabel !== undefined) {
                    lastLabel = ownLabel;
                }
            }

            // The prefix belongs to the leading spacer, which is exactly as wide as the prefix column.
            const prefix = staffWindow.first === 1
                ? <StaffPrefixViewer arrangement={arrangement} timeSignature={arrangement.timeParams.timeSignature} />
                : null;

            return (
                <>
                    <div className="staff-measure-spacer" style={{ width: `${leadingWidth}px` }}>{prefix}</div>
                    {measures}
                    <div className="staff-measure-spacer" style={{ width: `${trailingWidth}px` }} />
                </>
            );
        };

        const contentHostContent = (
            <>
                <Container
                    id="trackViewerDecorations"
                    crossAlignment={ChildAlignment.Stretch}
                >
                </Container>
                {trackViewMode === "staff" ? renderStaffBars() : renderGridBars()}
                <Container id="trackViewerDecorationOverlay" >
                    <div id="playBeam" ref={this.playBeamRef} />
                </Container>
            </>
        );

        const editSidebar = inEditMode ? (
            <TrackEditSidebar tracks={arrangement.tracks} dataModel={dataModel} />
        ) : undefined;

        const barActionStrip = inEditMode ? (
            <BarActionStrip
                ref={this.barActionStripRef}
                barCount={barCount}
                canDelete={barCount > 1}
                scrollHostRef={this.viewerRef}
                barCenters={this.measureCenters}
                onBarAction={this.handleBarAction}
            />
        ) : undefined;

        return (
            <>
                <Container
                    className="arrangementViewer"
                    innerRef={this.arrangementViewerRef}
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    <Container
                        id="trackViewerContainer"
                        className={inEditMode ? "edit-mode" : undefined}
                        innerRef={this.trackViewerContainerRef}
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Stretch}
                        style={{ zoom: `${viewerZoom}%` }}
                    >
                        <TrackControls innerRef={this.trackControlsRef} tracks={arrangement.tracks}
                            selectionManager={selectionManager} />
                        <Container
                            id="trackViewerHost"
                            innerRef={this.viewerRef}
                            orientation={Orientation.TopDown}
                            crossAlignment={ChildAlignment.Start}
                            onScroll={this.handleViewerScrolled}
                        >
                            {barActionStrip}
                            <Container
                                id="trackViewerContentHost"
                                innerRef={this.viewerContentHostRef}
                                orientation={Orientation.LeftToRight}
                                crossAlignment={ChildAlignment.Start}
                            >
                                {contentHostContent}
                            </Container>
                        </Container>
                        {editSidebar}
                    </Container>
                    <Minimap
                        ref={this.minimapRef}
                        arrangement={arrangement}
                        scoreMetrics={arrangementPlayer.scoreMetrics}
                        selectionManager={selectionManager}
                        onViewportMoved={this.handleViewportMoved}
                    />
                    <InsertBarsDialog ref={this.insertBarsDialogRef} />
                </Container>
                <RadialMenu ref={this.gridRadialMenuRef} />
            </>
        );
    }

    private handleBarAction = (barNumber: number, action: BarActionKind): void => {
        const { dataModel } = this.props;

        switch (action) {
            case BarActionKind.InsertLeft: {
                void this.handleInsertBars(barNumber, true);
                break;
            }

            case BarActionKind.Clear: {
                dataModel.clearBar(barNumber);
                break;
            }

            case BarActionKind.Delete: {
                dataModel.deleteBar(barNumber);
                break;
            }

            case BarActionKind.Duplicate: {
                dataModel.duplicateBar(barNumber);
                break;
            }

            case BarActionKind.InsertRight: {
                void this.handleInsertBars(barNumber, false);
                break;
            }
        }
    };

    private handleInsertBars = async (barNumber: number, before: boolean): Promise<void> => {
        const { dataModel } = this.props;
        const result = await this.insertBarsDialogRef.current?.show();
        if (result?.closure !== DialogResponseClosure.Accept) {
            return;
        }

        dataModel.insertBars(barNumber, result.count, before, result.copyContent);
    };

    private handleResize = () => {
        this.updateStaffWindow();
        this.handleTrackViewerScroll();
    };

    /**
     * Scrolls the given measure into the viewport. The staff view renders only a window of measures, so the measure
     * that has to become visible — the one the keyboard cursor moves into, for instance — may not be rendered at
     * all. Scrolling to its offset mounts it, and the window is updated right away, so the measure exists in the
     * same task in which a caller looked it up. The scroll is attributed to the app, not to the user, so it does not
     * switch auto-follow off. A measure that is visible already is left alone: measures are wider than the viewport,
     * so scrolling to make one fit would move the view under the user on every key press.
     *
     * @param request The measure to show and the position inside it that has to be visible.
     *
     * @returns A promise that resolves when the measure is inside the viewport.
     */
    private handleMeasureVisibilityRequested = (request: IMeasureVisibilityRequest): Promise<boolean> => {
        const { bar, position } = request;
        const host = this.viewerRef.current;
        if (this.state.trackViewMode !== "staff" || !host) {
            return Promise.resolve(false);
        }

        this.updateStaffGeometry(this.props.arrangementPlayer.scoreMetrics.bars);
        if (bar < 1 || bar > this.staffColumns.length) {
            return Promise.resolve(false);
        }

        const column = this.staffColumns[bar - 1];
        const fraction = position === undefined ? 0 : position.numerator / position.denominator;
        const point = this.staffOffsets[bar - 1] + (fraction * column);
        const scrollLeft = host.scrollLeft;
        const target = MeasureLayout.scrollToShow(this.staffOffsets, bar, point, scrollLeft, host.clientWidth,
            staffVisibilityMargin);
        if (target !== scrollLeft) {
            this.autoScrollLeft = target;
            host.scrollLeft = target;
            this.updateStaffWindow();
        }

        return Promise.resolve(true);
    };

    private handleTimeParamsChange = (): Promise<boolean> => {
        // Time params changed — internal layout may need recalculation. The staff measures may now be a
        // different number, so their offsets have to be rebuilt.
        this.staffGeometryDirty = true;

        return Promise.resolve(true);
    };

    private handleArrangementChanged = (arrangementId: number): Promise<boolean> => {
        const { dataModel } = this.props;

        if (arrangementId !== dataModel.arrangement?.id) {
            return Promise.resolve(false);
        }

        this.staffGeometryDirty = true;
        this.forceUpdate();

        return Promise.resolve(true);
    };

    /**
     * Sets the play beam position and, if auto-follow is on, scrolls the viewer to follow the play head.
     * All computation is done at 100% zoom.
     *
     * @param realTime The current real time within the arrangement, provided by the animation engine.
     */
    private autoFollow = (realTime: RealTime) => {
        if (this.viewerRef.current && this.playBeamRef.current && this.viewerContentHostRef.current) {
            const { arrangementPlayer } = this.props;
            const { autoFollowIsOn, trackViewMode } = this.state;

            const viewer = this.viewerRef.current;

            // Both views place the beam in layout px at 100% zoom. The grid view lays its measures out in equal
            // columns and derives the column width from the rendered content. The staff view knows the width of
            // every measure — a measure can carry a width of its own — so it addresses a position by the measure
            // the play head falls into plus the fraction inside that measure.
            const metrics = arrangementPlayer.scoreMetrics;
            const totalProgress = arrangementPlayer.convertToLoopProgress(realTime) * metrics.bars;
            const column = this.playheadColumn(totalProgress);
            const positionInColumn = column.progress * column.width;
            const position = Math.floor(column.start + positionInColumn);

            // Update play beam continuously. The beam is moved with a transform, never with `left`:
            // `left` is a layout property and made the browser lay out the scroller on every frame
            // (measured ≈120 layouts/s on a 79-bar score), the transform leaves layout untouched.
            this.playBeamRef.current.style.transform = `translate3d(${position}px, 0, 0)`;

            // Auto-follow keeps the beam inside the viewport. Once the user scrolls the viewer himself,
            // the viewer stays where he put it and only the beam keeps moving.
            if (!autoFollowIsOn) {
                return;
            }

            const clientWidth = viewer.clientWidth;
            const maxScroll = Math.max(0, column.contentWidth - clientWidth);
            const pulseWidthPixels = (column.width / metrics.stepsPerBar) * metrics.stepsPerPulse;

            // Half-bar splits use beat-level granularity so odd time signatures snap musically.
            // Even meters split symmetrically (2+2, 3+3 for 6/8), odd meters asymmetrically
            // using ceil+floor: 3+2 for 5/4, 4+3 for 7/8, 2+1 for 3/4.
            const beatWidthPixels = column.width / metrics.beatsPerBar;
            const firstHalfWidth = Math.ceil(metrics.beatsPerBar / 2) * beatWidthPixels;
            const secondHalfWidth = Math.floor(metrics.beatsPerBar / 2) * beatWidthPixels;

            const rightPartialBarStart = trackViewMode === "staff"
                ? this.getRightPartialMeasureStart(viewer.scrollLeft, clientWidth)
                : this.getRightPartialBarStart(viewer.scrollLeft, clientWidth, column.width);
            const reachedRightPartialBar = position >= rightPartialBarStart;

            if (position < viewer.scrollLeft || position > viewer.scrollLeft + clientWidth || reachedRightPartialBar) {
                let snappedScroll: number;

                if (column.width <= clientWidth) {
                    // The whole measure fits: snap to the start of its column.
                    snappedScroll = column.start;
                } else if (secondHalfWidth <= clientWidth) {
                    // At least the smaller half fits: snap within each measure to the two half-sections.
                    snappedScroll = positionInColumn < firstHalfWidth ? column.start : column.start + firstHalfWidth;
                } else {
                    // Not enough space for a half-measure: snap to pulse boundaries.
                    const pulses = Math.floor(positionInColumn / pulseWidthPixels);
                    snappedScroll = column.start + (pulses * pulseWidthPixels);
                }

                const target = clampValue(Math.floor(snappedScroll), 0, maxScroll);
                this.autoScrollLeft = target;
                viewer.scrollLeft = target;
            }
        }
    };

    /**
     * Resolves the measure column the play head is in.
     *
     * @param totalProgress The play head position in measures, as a fraction of the whole arrangement.
     *
     * @returns The start of the column, its width, the fraction of the play head inside it, and the total
     *          width of the rendered content. The grid view uses the same width for every measure.
     */
    private playheadColumn(totalProgress: number): IPlayheadColumn {
        const bars = this.props.arrangementPlayer.scoreMetrics.bars;
        if (bars <= 0) {
            return { start: 0, width: 0, progress: 0, contentWidth: 0 };
        }

        const index = Math.min(bars - 1, Math.max(0, Math.floor(totalProgress)));
        const progress = totalProgress - index;

        if (this.state.trackViewMode === "staff") {
            return {
                start: this.staffOffsets[index],
                width: this.staffColumns[index],
                progress,
                contentWidth: MeasureLayout.totalWidth(this.staffOffsets),
            };
        }

        const contentWidth = this.viewerContentHostRef.current!.scrollWidth;
        const width = contentWidth / bars;

        return { start: index * width, width, progress, contentWidth };
    };

    /**
     * @param scrollLeft The scrollLeft of the viewer, at 100% zoom.
     * @param clientWidth The clientWidth of the viewer, at 100% zoom.
     * @param barWidthPixels The width of a bar in pixels, at 100% zoom.
     *
     * @returns the start x-position (at 100% zoom) of the rightmost partially visible bar, if any.
     */
    private getRightPartialBarStart(scrollLeft: number, clientWidth: number, barWidthPixels: number): number {
        if (barWidthPixels <= 0 || clientWidth <= barWidthPixels) {
            return Number.MAX_SAFE_INTEGER;
        }

        const viewportRight = scrollLeft + clientWidth;
        const epsilon = 0.5;
        const remainder = viewportRight % barWidthPixels;

        // If viewportRight lands exactly on a bar boundary, there is no partial rightmost bar.
        if (remainder <= epsilon || barWidthPixels - remainder <= epsilon) {
            return Number.MAX_SAFE_INTEGER;
        }

        const rightPartialBarStart = viewportRight - remainder;

        return rightPartialBarStart > scrollLeft + epsilon ? rightPartialBarStart : Number.MAX_SAFE_INTEGER;
    }

    private handleAnimationStateChanged = (state: PlayerPlayState): Promise<boolean> => {
        const { autoFollowIsOn } = this.state;

        if (state === "playing" && !autoFollowIsOn) {
            this.setState({ autoFollowIsOn: true });
        }

        return Promise.resolve(true);
    };

    private handleSettingsChanged = (settings: IUISettings): Promise<boolean> => {
        const { viewerZoom, trackViewMode } = this.state;

        const viewSettings = settings.viewSettings?.arrangementViewSettings;
        const newZoom = viewSettings?.zoomLevel ?? 100;
        const newTrackViewMode = viewSettings?.displayMode ?? "grid";

        if (newZoom !== viewerZoom || newTrackViewMode !== trackViewMode) {
            this.setState({
                viewerZoom: newZoom,
                trackViewMode: newTrackViewMode,
            });
        }

        return Promise.resolve(true);
    };

    private handleViewportMoved = (newScrollLeft: number) => {
        if (this.viewerRef.current) {
            const scrollRange = this.viewerRef.current.scrollWidth - this.viewerRef.current.clientWidth;
            this.viewerRef.current.scrollLeft = clampValue(newScrollLeft * scrollRange, 0, scrollRange);
        }
    };

    private handleTrackViewModeToggled = (newTrackViewMode: "grid" | "staff") => {
        const { trackViewMode: currentMode } = this.state;

        if (currentMode === newTrackViewMode) {
            return Promise.resolve(true);
        }

        this.setState({ trackViewMode: newTrackViewMode });

        return Promise.resolve(true);
    };

    private handleViewerScrolled = () => {
        this.stopAutoFollowOnUserScroll();
        this.updateStaffWindow();
        this.handleTrackViewerScroll();
    };

    /**
     * Stops auto-follow when the viewer was scrolled by the user. The auto-follow's own scrolling lands on the
     * offset it just wrote, so any other offset means the user took over — by wheel, trackpad or finger swipe
     * (touch devices report a plain scroll event, no wheel event).
     */
    private stopAutoFollowOnUserScroll = () => {
        const { autoFollowIsOn } = this.state;
        if (!autoFollowIsOn) {
            return;
        }

        const host = this.viewerRef.current;
        if (!host) {
            return;
        }

        if (Math.abs(host.scrollLeft - this.autoScrollLeft) > autoScrollTolerance) {
            this.setState({ autoFollowIsOn: false });
        }
    };

    /**
     * Rebuilds the column widths and offsets of the staff measures, in layout px at 100% zoom. Only the staff
     * view needs them, because only it renders a window of measures instead of all of them.
     *
     * @param barCount The number of measures in the arrangement.
     */
    private updateStaffGeometry(barCount: number): void {
        if (!this.staffGeometryDirty && this.staffColumns.length === barCount) {
            return;
        }

        const { dataModel } = this.props;
        this.staffColumns = MeasureLayout.columns(barCount, dataModel.arrangement?.measureWidths);
        this.staffOffsets = MeasureLayout.offsets(this.staffColumns, staffPrefixWidth);
        this.staffGeometryDirty = false;
    }

    /**
     * Keeps the rendered staff measures in sync with the viewport: the measures the viewport touches plus an
     * overscan, so rendering stays ahead of the scrolling. The grid view renders every measure, so this does
     * nothing there.
     */
    private updateStaffWindow(): void {
        const { trackViewMode } = this.state;
        const host = this.viewerRef.current;
        if (trackViewMode !== "staff" || !host) {
            return;
        }

        const barCount = this.props.arrangementPlayer.scoreMetrics.bars;
        this.updateStaffGeometry(barCount);

        const visible = MeasureLayout.rangeFor(this.staffOffsets, host.scrollLeft,
            host.scrollLeft + host.clientWidth, staffWindowOverscan);
        const current = this.state.staffWindow;
        if (visible.first !== current.first || visible.last !== current.last) {
            this.setState({ staffWindow: visible });
        }
    }

    /**
     * @returns The horizontal center of every measure column, in layout px at 100% zoom. The staff view knows its
     *          columns from the measure layout, the grid view reads them from its rendered measures.
     */
    private measureCenters = (): Map<number, number> => {
        const centers = new Map<number, number>();

        if (this.state.trackViewMode === "staff") {
            for (let bar = 1; bar <= this.staffColumns.length; bar++) {
                centers.set(bar, this.staffOffsets[bar - 1] + (this.staffColumns[bar - 1] / 2));
            }

            return centers;
        }

        for (const element of this.scoreElementRegistry.findElements(ScoreElementKind.BarContainer)) {
            const location = this.scoreElementRegistry.getLocation(element);
            if (location !== undefined) {
                centers.set(location.bar, element.offsetLeft + (element.offsetWidth / 2));
            }
        }

        return centers;
    };

    /**
     * @param bar A 1-based measure number.
     *
     * @returns The most recent section label set before the given measure, if any.
     */
    private labelBefore(bar: number): string | undefined {
        const labels = this.props.dataModel.arrangement?.measureLabels;
        let result: string | undefined;
        let latest = 0;

        for (const [key, label] of Object.entries(labels ?? {})) {
            const number = Number(key);
            if (number < bar && number > latest) {
                latest = number;
                result = label;
            }
        }

        return result;
    }

    /**
     * @param scrollLeft The scrollLeft of the viewer, at 100% zoom.
     * @param clientWidth The clientWidth of the viewer, at 100% zoom.
     *
     * @returns the start x-position of the rightmost partially visible staff measure, if any.
     */
    private getRightPartialMeasureStart(scrollLeft: number, clientWidth: number): number {
        if (this.staffOffsets.length === 0) {
            return Number.MAX_SAFE_INTEGER;
        }

        const viewportRight = scrollLeft + clientWidth;
        const index = MeasureLayout.columnIndexAt(this.staffOffsets, viewportRight);
        const start = this.staffOffsets[index];

        return start > scrollLeft + 0.5 ? start : Number.MAX_SAFE_INTEGER;
    }

    private handleTrackViewerScroll = () => {
        const host = this.viewerRef.current;
        if (!host) {
            return;
        }

        const style = window.getComputedStyle(host);
        const hostLeftPadding = parseFloat(style.paddingLeft) || 0;
        const bars = this.getVisibleBarRange(host, hostLeftPadding) ?? { startBar: 1, endBar: 1 };

        const visibleContentWidth = host.clientWidth - hostLeftPadding;
        const totalContentWidth = host.scrollWidth - hostLeftPadding;
        const maxScrollLeft = host.scrollWidth - host.clientWidth;

        const viewportWidth = totalContentWidth > 0 ? visibleContentWidth / totalContentWidth : 1;

        const viewportPosition = maxScrollLeft > 0 ? host.scrollLeft / maxScrollLeft : 0;
        this.minimapRef.current?.handleTrackViewerScrolled(viewportWidth, viewportPosition, bars);
    };

    private getVisibleBarRange(scrollHost: HTMLElement, leftPadding: number): IVisibleBarRange | null {
        if (this.state.trackViewMode === "staff") {
            // Only a window of measures is rendered, so the visible range comes from the measure offsets
            // instead of from the registered elements.
            const range = MeasureLayout.rangeFor(this.staffOffsets, scrollHost.scrollLeft,
                scrollHost.scrollLeft + scrollHost.clientWidth);

            return range.last < range.first ? null : { startBar: range.first, endBar: range.last };
        }

        const hostRect = scrollHost.getBoundingClientRect();
        const zoom = scrollHost.currentCSSZoom;
        const viewportLeft = hostRect.left + (leftPadding * zoom);
        const viewportRight = hostRect.right;

        const barElements = this.scoreElementRegistry.findElements(ScoreElementKind.BarContainer).sort(
            (first, second) => {
                const firstBar = this.scoreElementRegistry.getLocation(first)?.bar ?? 0;
                const secondBar = this.scoreElementRegistry.getLocation(second)?.bar ?? 0;

                return firstBar - secondBar;
            },
        );

        const visibleBars = barElements.filter((barEl) => {
            const rect = barEl.getBoundingClientRect();

            // Horizontal overlap with the visible area of the scroll host means this bar is visible.
            return rect.right > viewportLeft && rect.left < viewportRight;
        });

        if (visibleBars.length === 0) {
            return null;
        }

        const startBar = this.scoreElementRegistry.getLocation(visibleBars[0])?.bar;
        const endBar = this.scoreElementRegistry.getLocation(visibleBars[visibleBars.length - 1])?.bar;
        if (startBar === undefined || endBar === undefined) {
            return null;
        }

        return {
            startBar,
            endBar,
        };
    }

}
