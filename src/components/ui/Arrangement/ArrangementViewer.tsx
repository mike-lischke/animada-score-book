/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type JSX } from "preact";

import { AppStorage, type IUISettings } from "../../../core/AppStorage.js";
import type { RealTime, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { clampValue } from "../../../core/utils.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { PlayerPlayState } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { GridMeasureViewer } from "../Bar/Grid/GridMeasureViewer.js";
import { StaffBarViewer } from "../Bar/Staff/StaffBarViewer.js";
import { StaffPrefixViewer } from "../Bar/Staff/StaffPrefixViewer.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Minimap, type IVisibleBarRange } from "../Minimap/Minimap.js";
import { TrackControls } from "./TrackControls.js";

export interface IArrangementViewerProps extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
    dataModel: ScoreBookDataModel;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    touchEditingEnabled: boolean;
}

interface IArrangementViewerState {
    /** Determined from DOM, includes border and margin (@100% zoom). */
    noteWidth: number;

    trackPlayerCount: number;
    autoFollowIsOn: boolean;
    viewerZoom: number;
    trackViewMode: "grid" | "staff";

    userMightBeTakingControl: boolean;
}

export class ArrangementViewer extends UIComponent<IArrangementViewerProps, IArrangementViewerState> {
    private arrangementViewerRef = createRef<HTMLDivElement>();
    private viewerRef = createRef<HTMLDivElement>();
    private playBeamRef = createRef<HTMLDivElement>();
    private trackViewerContainerRef = createRef<HTMLDivElement>();
    private trackControlsRef = createRef<HTMLDivElement>();
    private viewerContentHostRef = createRef<HTMLDivElement>();
    private minimapRef = createRef<Minimap>();

    //private animationEngine?: AnimationEngine;
    private resizeObserver: ResizeObserver;

    private lastY = 0;
    private lastX = 0;
    private stopAutoFollowTimeoutId?: ReturnType<typeof setTimeout>;
    private scrollAnimationFrameId = 0;

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
            userMightBeTakingControl: false
        };

        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.autoFollowTransitionDurationMs = 0;
    }

    public override componentDidMount(): void {
        const { arrangementPlayer, services } = this.props;
        const { autoFollowIsOn, viewerZoom } = this.state;

        services.selectionManager.setEventContainer(this.arrangementViewerRef.current!);

        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("trackViewModeToggled", this.handleTrackViewModeToggled);
        requisitions.register("timeParamsChanged", this.handleTimeParamsChange);
        requisitions.register("animationStateChanged", this.handleAnimationStateChanged);

        setTimeout(this.handleResize, 0);
        this.resizeObserver.observe(this.viewerRef.current!);

        // If desired, turn on auto-follow like so.
        if (autoFollowIsOn) {
            arrangementPlayer.animationEngine.connect(this.autoFollow);
        }

        this.autoFollowTransitionDurationMs = 50;
        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
        this.handleTrackViewerScroll();
    }

    public override componentDidUpdate(prevProps: IArrangementViewerProps, prevState: IArrangementViewerState): void {
        const { arrangementPlayer, services } = this.props;
        const { autoFollowIsOn, viewerZoom, trackViewMode } = this.state;

        if (prevProps.arrangementPlayer !== arrangementPlayer) {
            prevProps.arrangementPlayer.animationEngine.disconnect(this.autoFollow);

            if (autoFollowIsOn) {
                arrangementPlayer.animationEngine.connect(this.autoFollow);
            }

            this.autoFollow(0);
        }

        if (prevState.trackViewMode !== trackViewMode) {
            // View mode switched — newly mounted components need the current selection state.
            services.selectionManager.republishSelection();
        }

        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
        this.handleTrackViewerScroll();
    }

    public override componentWillUnmount(): void {
        const { arrangementPlayer } = this.props;

        this.resizeObserver.disconnect();
        arrangementPlayer.animationEngine.disconnect(this.autoFollow);

        if (this.scrollAnimationFrameId !== 0) {
            cancelAnimationFrame(this.scrollAnimationFrameId);
            this.scrollAnimationFrameId = 0;
        }

        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("trackViewModeToggled", this.handleTrackViewModeToggled);
        requisitions.unregister("timeParamsChanged", this.handleTimeParamsChange);
        requisitions.unregister("animationStateChanged", this.handleAnimationStateChanged);
    }

    public override render(): JSX.Element {
        const { arrangementPlayer, dataModel, services, touchEditingEnabled, undoManager } = this.props;
        const { autoFollowIsOn, trackViewMode, viewerZoom } = this.state;

        const arrangement = dataModel.arrangement!;
        const metrics = arrangementPlayer.scoreMetrics;
        const barCount = metrics.bars;

        const renderBars = (mode: "grid" | "staff") => {
            let lastLabel: string | undefined;

            return (
                <>
                    {mode === "staff"
                        ? (
                            <StaffPrefixViewer
                                arrangement={arrangement}
                                timeSignature={arrangement.timeParams.timeSignature}
                            />
                        )
                        : null}
                    {Array.from({ length: barCount }, (_, i) => {
                        const barNumber = i + 1;
                        const barViewerProps = {
                            barNumber,
                            arrangement,
                            arrangementPlayer,
                            touchEditingEnabled,
                            services,
                            undoManager,
                            dataModel,
                        };

                        if (mode === "staff") {
                            const ownLabel = arrangement.measureLabels[barNumber] as string | undefined;
                            const inheritedLabel = ownLabel === undefined ? lastLabel : undefined;
                            if (ownLabel !== undefined) {
                                lastLabel = ownLabel;
                            }

                            return (
                                <StaffBarViewer
                                    key={barNumber}
                                    {...barViewerProps}
                                    ownLabel={ownLabel}
                                    inheritedLabel={inheritedLabel}
                                />
                            );
                        }

                        return (
                            <GridMeasureViewer
                                key={barNumber}
                                measureNumber={barNumber}
                                scoreMetrics={metrics}
                                {...barViewerProps}
                            />
                        );
                    })}
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
                {renderBars(trackViewMode)}
                <Container id="trackViewerDecorationOverlay" >
                    <div id="playBeam" ref={this.playBeamRef} />
                </Container>
            </>
        );

        return (
            <Container
                className="arrangementViewer"
                innerRef={this.arrangementViewerRef}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
            >
                <Container
                    id="trackViewerContainer"
                    innerRef={this.trackViewerContainerRef}
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Stretch}
                    style={{ zoom: `${viewerZoom}%` }}
                >
                    <TrackControls innerRef={this.trackControlsRef} tracks={arrangement.tracks}
                        services={services} />
                    <Container
                        id="trackViewerHost"
                        innerRef={this.viewerRef}
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Start}
                        onWheel={autoFollowIsOn ? this.handleWheel : undefined}
                        onScroll={this.handleTrackViewerScroll}
                    >
                        <Container
                            id="trackViewerContentHost"
                            innerRef={this.viewerContentHostRef}
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Start}
                        >
                            {contentHostContent}
                        </Container>
                    </Container>
                </Container>
                <Minimap
                    ref={this.minimapRef}
                    arrangement={arrangement}
                    scoreMetrics={arrangementPlayer.scoreMetrics}
                    services={services}
                    onViewportMoved={this.handleViewportMoved}
                />
            </Container >
        );
    }

    private handleResize = () => {
        this.handleTrackViewerScroll();
    };

    private handleTimeParamsChange = (): Promise<boolean> => {
        // Time params changed — internal layout may need recalculation.

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
            const { trackViewMode } = this.state;

            const viewer = this.viewerRef.current;
            const contentHost = this.viewerContentHostRef.current;

            const contentWidth = contentHost.scrollWidth;
            const clientWidth = viewer.clientWidth;
            const maxScroll = Math.max(0, contentWidth - clientWidth);

            const metrics = arrangementPlayer.scoreMetrics;
            const prefixWidthPixels = trackViewMode === "staff" ? this.measureStaffPrefixWidthPx() : 0;
            const musicalContentWidth = Math.max(0, contentWidth - prefixWidthPixels);
            const barWidthPixels = metrics.bars > 0 ? musicalContentWidth / metrics.bars : 0;
            const stepWidthPixels = barWidthPixels / metrics.stepsPerBar;
            const pulseWidthPixels = stepWidthPixels * metrics.stepsPerPulse;

            // Update play beam continuously.
            const normalizedPosition = arrangementPlayer.convertToLoopProgress(realTime);
            const totalProgress = normalizedPosition * metrics.bars;
            const position = Math.floor(prefixWidthPixels + (totalProgress * barWidthPixels));
            this.playBeamRef.current.style.left = `${position}px`;

            // Half-bar splits use beat-level granularity so odd time signatures snap musically.
            // Even meters split symmetrically (2+2, 3+3 for 6/8), odd meters asymmetrically
            // using ceil+floor: 3+2 for 5/4, 4+3 for 7/8, 2+1 for 3/4.
            const beatWidthPixels = barWidthPixels / metrics.beatsPerBar;
            const firstHalfWidth = Math.ceil(metrics.beatsPerBar / 2) * beatWidthPixels;
            const secondHalfWidth = Math.floor(metrics.beatsPerBar / 2) * beatWidthPixels;

            const rightPartialBarStart = this.getRightPartialBarStart(viewer.scrollLeft, clientWidth, barWidthPixels);
            const reachedRightPartialBar = position >= rightPartialBarStart;

            if (position < viewer.scrollLeft || position > viewer.scrollLeft + clientWidth || reachedRightPartialBar) {
                let snappedScroll: number;

                if (barWidthPixels <= clientWidth) {
                    // Full bar visible: snap to bar boundaries.
                    snappedScroll = Math.floor(position / barWidthPixels) * barWidthPixels;
                } else if (secondHalfWidth <= clientWidth) {
                    // At least the smaller half fits: snap within each bar to the two half-sections.
                    const barIndex = Math.floor(position / barWidthPixels);
                    const posInBar = position - (barIndex * barWidthPixels);
                    const barStart = barIndex * barWidthPixels;

                    snappedScroll = posInBar < firstHalfWidth ? barStart : barStart + firstHalfWidth;
                } else {
                    // Not enough space for a half-bar: snap to pulse boundaries.
                    snappedScroll = Math.floor(position / pulseWidthPixels) * pulseWidthPixels;
                }

                viewer.scrollLeft = clampValue(snappedScroll, 0, maxScroll);
            }
        }
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

    /**
     * Returns the width of the dedicated staff prefix column in pixels at 100% zoom.
     *
     * @returns Prefix column width in px.
     */
    private measureStaffPrefixWidthPx(): number {
        const host = this.viewerContentHostRef.current;
        if (!host) {
            return 0;
        }

        const prefix = host.querySelector<HTMLElement>(".staff-prefix-viewer");

        return prefix?.offsetWidth ?? 0;
    }

    private handleAnimationStateChanged = (state: PlayerPlayState): Promise<boolean> => {
        const { autoFollowIsOn } = this.state;

        if (state === "playing" && !autoFollowIsOn) {
            this.setState({ autoFollowIsOn: true });
        }

        return Promise.resolve(true);
    };

    private handleWheel = (event: WheelEvent) => {
        if (event.deltaX > 6) {
            this.setState({ autoFollowIsOn: false });
        }
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
        const hostRect = scrollHost.getBoundingClientRect();
        const zoom = scrollHost.currentCSSZoom;
        const viewportLeft = hostRect.left + (leftPadding * zoom);
        const viewportRight = hostRect.right;

        const selector = ".bar-viewer[data-bar], .grid-measure-viewer[data-bar]";
        const barElements = Array.from(scrollHost.querySelectorAll<HTMLElement>(selector));

        const visibleBars = barElements.filter((barEl) => {
            const rect = barEl.getBoundingClientRect();

            // Horizontal overlap with the visible area of the scroll host means this bar is visible.
            return rect.right > viewportLeft && rect.left < viewportRight;
        });

        if (visibleBars.length === 0) {
            return null;
        }

        const startBar = Number(visibleBars[0].dataset.bar);
        const endBar = Number(visibleBars[visibleBars.length - 1].dataset.bar);

        return {
            startBar,
            endBar,
        };
    }

}
