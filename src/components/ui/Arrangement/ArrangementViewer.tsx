/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type JSX } from "preact";

import { AppStorage, type IUISettings } from "../../../core/AppStorage.js";
import { Publisher } from "../../../core/Publisher.js";
import type { RealTime, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { clampValue } from "../../../core/utils.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { BarViewer } from "../Bar/BarViewer.js";
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

    onIntervalChange?: (startBar: number, endBar: number) => void;
}

interface IArrangementViewerState {
    /** Determined from DOM, includes border and margin (@100% zoom). */
    noteWidth: number;

    trackPlayerCount: number;
    autoFollowIsOn: boolean;
    viewerZoom: number;

    userMightBeTakingControl: boolean;
}

export class ArrangementViewer extends UIComponent<IArrangementViewerProps, IArrangementViewerState> {
    private viewerRef = createRef<HTMLDivElement>();
    private playBeamRef = createRef<HTMLDivElement>();
    private trackViewerContainerRef = createRef<HTMLDivElement>();
    private trackControlsRef = createRef<HTMLDivElement>();
    private viewerContentHostRef = createRef<HTMLDivElement>();
    private minimapRef = createRef<Minimap>();

    private contentWidthPublisher = new Publisher();

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
            userMightBeTakingControl: false
        };

        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.autoFollowTransitionDurationMs = 0;
    }

    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;
        const { autoFollowIsOn, viewerZoom } = this.state;

        requisitions.register("settingsChanged", this.handleSettingsChanged);

        setTimeout(this.handleResize, 0);
        this.resizeObserver.observe(this.viewerRef.current!);

        const arrangement = this.props.dataModel.arrangement!;
        this.addSubscription(arrangement.timeParams, this.timeParamsSubscription, true);

        // If desired, turn on auto-follow like so.
        if (autoFollowIsOn) {
            arrangementPlayer.animationEngine.connect(this.autoFollow);
        }

        // Otherwise, set up the subscription which will turn it on again.
        this.addSubscription(arrangementPlayer.animationEngine, this.animationEngineSubscription, true);

        this.autoFollowTransitionDurationMs = 50;
        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
        this.handleTrackViewerScroll();
    }

    public override componentDidUpdate(prevProps: IArrangementViewerProps, prevState: IArrangementViewerState): void {
        super.componentDidUpdate(prevProps, prevState);

        const { arrangementPlayer, dataModel } = this.props;
        const { autoFollowIsOn, viewerZoom } = this.state;

        if (prevProps.arrangementPlayer !== arrangementPlayer) {
            prevProps.arrangementPlayer.animationEngine.disconnect(this.autoFollow);

            const arrangement = dataModel.arrangement!;
            this.addSubscription(arrangement.timeParams, this.timeParamsSubscription);

            if (autoFollowIsOn) {
                arrangementPlayer.animationEngine.connect(this.autoFollow);
            }
            this.addSubscription(arrangementPlayer.animationEngine, this.animationEngineSubscription);

            this.autoFollow(0);
        }

        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
        this.handleTrackViewerScroll();
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();

        const { arrangementPlayer } = this.props;

        this.resizeObserver.disconnect();
        arrangementPlayer.animationEngine.disconnect(this.autoFollow);

        if (this.scrollAnimationFrameId !== 0) {
            cancelAnimationFrame(this.scrollAnimationFrameId);
            this.scrollAnimationFrameId = 0;
        }

        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
    }

    public override render(): JSX.Element {
        const { arrangementPlayer, dataModel, services, touchEditingEnabled, undoManager } = this.props;
        const { autoFollowIsOn, viewerZoom } = this.state;

        const arrangement = dataModel.arrangement!;

        const barCount = arrangement.timeParams.length;

        const contentHost = (
            <Container
                id="trackViewerContentHost"
                innerRef={this.viewerContentHostRef}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Start}
            >
                <Container
                    id="trackViewerDecorations"
                    crossAlignment={ChildAlignment.Stretch}
                >
                </Container>
                {Array.from({ length: barCount }, (_, i) => {
                    const barNumber = i + 1;

                    return (
                        <BarViewer
                            key={barNumber}
                            barNumber={barNumber}
                            arrangement={arrangement}
                            arrangementPlayer={arrangementPlayer}
                            touchEditingEnabled={touchEditingEnabled}
                            services={services}
                            undoManager={undoManager}
                            dataModel={dataModel}
                        />
                    );
                })}
                <Container id="trackViewerDecorationOverlay" >
                    <div id="playBeam" ref={this.playBeamRef} />
                </Container>
            </Container>
        );

        return (
            <Container
                className="arrangementViewer"
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
                    <TrackControls innerRef={this.trackControlsRef} tracks={arrangement.tracks} />
                    <Container
                        orientation={Orientation.TopDown}
                        style={{ overflow: "auto" }}
                    >
                        <Container
                            id="trackViewerHost"
                            innerRef={this.viewerRef}
                            orientation={Orientation.TopDown}
                            crossAlignment={ChildAlignment.Start}
                            onWheel={autoFollowIsOn ? this.handleWheel : undefined}
                            onScroll={this.handleTrackViewerScroll}
                        >
                            {contentHost}
                        </Container>
                    </Container>
                </Container>
                <Minimap
                    ref={this.minimapRef}
                    arrangement={arrangement}
                    scoreMetrics={arrangementPlayer.scoreMetrics}
                    onViewportMoved={this.handleViewportMoved}
                    onSelectionChanged={this.handleIntervalChange}
                />
            </Container >
        );
    }

    private handleResize = () => {
        this.handleTrackViewerScroll();
    };

    private timeParamsSubscription = () => {
        return setTimeout(() => {
            this.contentWidthPublisher.publish();
        }, 0);
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

            const viewer = this.viewerRef.current;
            const contentHost = this.viewerContentHostRef.current;

            const contentWidth = contentHost.scrollWidth;
            const clientWidth = viewer.clientWidth - this.trackControlsRef.current!.offsetWidth;
            const maxScroll = Math.max(0, contentWidth - clientWidth);

            // Update play beam continuously.
            const normalizedPosition = arrangementPlayer.convertToLoopProgress(realTime);
            const position = Math.floor(normalizedPosition * contentWidth);
            this.playBeamRef.current.style.left = `${position}px`;

            // If the play beam gets close to the end of the visible area, scroll so that the beam is at the left
            // edge of the viewer.
            if (position < viewer.scrollLeft || position > viewer.scrollLeft + clientWidth) {
                viewer.scrollLeft = clampValue(position, 0, maxScroll);
            }
        }
    };

    private animationEngineSubscription = () => {
        const { arrangementPlayer } = this.props;
        const { autoFollowIsOn } = this.state;

        if (arrangementPlayer.state === "playing" && !autoFollowIsOn) {
            this.setState({ autoFollowIsOn: true });
        }
    };

    private handleWheel = (event: WheelEvent) => {
        if (event.deltaX > 6) {
            this.setState({ autoFollowIsOn: false });
        }
    };

    private handleSettingsChanged = (settings: IUISettings): Promise<boolean> => {
        const { viewerZoom } = this.state;
        const newZoom = settings.viewSettings?.arrangementViewSettings?.zoomLevel ?? 100;
        if (newZoom !== viewerZoom) {
            this.setState({ viewerZoom: newZoom });
        }

        return Promise.resolve(true);
    };

    private handleViewportMoved = (newScrollLeft: number) => {
        if (this.viewerRef.current) {
            const scrollRange = this.viewerContentHostRef.current!.scrollWidth - this.viewerRef.current.clientWidth;
            this.viewerRef.current.scrollLeft = clampValue(newScrollLeft * scrollRange, 0, scrollRange);
        }
    };

    private handleIntervalChange = (selectionStartBar: number, selectionEndBar: number) => {
        const { onIntervalChange } = this.props;

        onIntervalChange?.(selectionStartBar, selectionEndBar);
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
        const zoom = scrollHost.currentCSSZoom || 1;
        const viewportLeft = hostRect.left + (leftPadding * zoom);
        const viewportRight = hostRect.right;

        const barElements = Array.from(scrollHost.querySelectorAll<HTMLElement>(".bar-viewer[data-bar]"));

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
