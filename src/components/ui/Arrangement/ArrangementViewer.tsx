/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type JSX } from "preact";

import { AppStorage, type IUISettings } from "../../../core/AppStorage.js";
import { Publisher } from "../../../core/Publisher.js";
import type { RealTime, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { BarViewer } from "../Bar/BarViewer.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { type ITrackViewerCallbacks } from "../Track/TrackViewer.js";
import { TrackControls } from "./TrackControls.js";
import { clampValue } from "../../../core/utils.js";

export interface IArrangementViewerProps extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
    dataModel: ScoreBookDataModel;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

interface IArrangementViewerState {
    /** Determined from DOM, includes border and margin (@100% zoom). */
    noteWidth: number;

    /** Determined from DOM, includes border and margin (@100% zoom). */
    barWidth: number;

    trackPlayerCount: number;
    autoFollowIsOn: boolean;
    viewerZoom: number;

    userMightBeTakingControl: boolean;
}

export class ArrangementViewer extends UIComponent<IArrangementViewerProps, IArrangementViewerState> {
    private viewerRef = createRef<HTMLDivElement>();
    private playBeamRef = createRef<HTMLDivElement>();
    private playRangeRef = createRef<HTMLDivElement>();
    private trackViewerContainerRef = createRef<HTMLDivElement>();
    private trackControlsRef = createRef<HTMLDivElement>();
    private viewerContentHostRef = createRef<HTMLDivElement>();

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
            barWidth: 0,
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

        this.autoFollowTransitionDurationMs = this.getPlayRangeTransitionDurationMs();
        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
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
        }

        this.trackViewerContainerRef.current!.style.zoom = `${viewerZoom}%`;
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
        const { arrangementPlayer, dataModel, services, undoManager } = this.props;
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
                    <div id="playRange" ref={this.playRangeRef} />
                </Container>
                {Array.from({ length: barCount }, (_, i) => {
                    const barNumber = i + 1;

                    return (
                        <BarViewer
                            key={barNumber}
                            barNumber={barNumber}
                            arrangement={arrangement}
                            arrangementPlayer={arrangementPlayer}
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
                        className={`trackViewerHost`}
                        innerRef={this.viewerRef}
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Start}
                        onWheel={autoFollowIsOn ? this.handleWheel : undefined}
                    >
                        {contentHost}
                    </Container>
                </Container>
            </Container >
        );
    }

    private handleResize = () => {
        this.updateNoteAndBarWidths();
    };

    private updateNoteAndBarWidths = () => {
        const contentHost = this.viewerContentHostRef.current;
        const zoom = contentHost?.currentCSSZoom ?? 1;

        this.setState({
            noteWidth: this.getNoteWidth(this.viewerContentHostRef.current, zoom),
            barWidth: this.getBarWidth(this.viewerContentHostRef.current, zoom)
        });
    };

    private timeParamsSubscription = () => {
        return setTimeout(() => {
            this.contentWidthPublisher.publish();
            this.updateNoteAndBarWidths();
        }, 0);
    };

    private getNoteWidth(parent: HTMLElement | null, zoom: number): number {
        const noteViewers = parent?.querySelectorAll<HTMLElement>(".notes-wrapper .note-viewer");
        if (!noteViewers || noteViewers.length === 0) {
            return 0;
        }

        if (noteViewers.length >= 2) {
            const firstRect = noteViewers[0].getBoundingClientRect();
            const secondRect = noteViewers[1].getBoundingClientRect();

            return (secondRect.left - firstRect.left) / zoom;
        }

        const rect = noteViewers[0].getBoundingClientRect();

        return rect.width / zoom;
    }

    private getBarWidth(parent: HTMLElement | null, zoom: number): number {
        const barViewers = parent?.querySelectorAll<HTMLElement>(".bar-viewer");
        if (!barViewers || barViewers.length === 0) {
            return 0;
        }

        if (barViewers.length >= 2) {
            const firstRect = barViewers[0].getBoundingClientRect();
            const secondRect = barViewers[1].getBoundingClientRect();

            return (secondRect.left - firstRect.left) / zoom;
        }

        const rect = barViewers[0].getBoundingClientRect();

        return rect.width / zoom;
    }

    /**
     * Sets the play beam position and, if auto-follow is on, scrolls the viewer to follow the play head.
     * All computation is done at 100% zoom.
     *
     * @param realTime The current real time within the arrangement, provided by the animation engine.
     */
    private autoFollow = (realTime: RealTime) => {
        if (this.viewerRef.current && this.playBeamRef.current && this.playRangeRef.current &&
            this.viewerContentHostRef.current) {
            const { arrangementPlayer } = this.props;
            const { barWidth } = this.state;

            const scoreMetrics = arrangementPlayer.scoreMetrics;

            const viewer = this.viewerRef.current;
            const contentHost = this.viewerContentHostRef.current;

            const contentWidth = contentHost.scrollWidth;
            const clientWidth = viewer.clientWidth - this.trackControlsRef.current!.offsetWidth;
            const maxScroll = Math.max(0, contentWidth - clientWidth);

            const secondsPerPulse =
                (scoreMetrics.secondsPerBar / scoreMetrics.stepsPerBar) *
                scoreMetrics.stepsPerPulse;

            const pulseWidth = barWidth / scoreMetrics.pulsesPerBar;

            // 1. Update play beam continuously.
            const normalizedPosition = arrangementPlayer.convertToLoopProgress(realTime);
            const position = normalizedPosition * contentWidth;
            this.playBeamRef.current.style.left = `${position}px`;

            // 2. Calculate current pulse.
            const currentPulse = Math.floor(realTime / secondsPerPulse);

            // 3. Update viewer scroll and play range only every 2 pulses.
            const hasLoopedBack = currentPulse < this.lastPulse;
            const hasMoved2Pulses = currentPulse >= this.targetPulse + 2;

            if (hasLoopedBack || hasMoved2Pulses) {
                this.targetPulse = currentPulse;
                let clampedScroll = clampValue(position, 0, maxScroll);
                const currentBar = Math.floor(currentPulse / scoreMetrics.pulsesPerBar);
                const pulseIndexInBar = currentPulse % scoreMetrics.pulsesPerBar;

                let playRangeLeft = (currentBar * barWidth) + (pulseIndexInBar * pulseWidth);
                let playRangeWidth = pulseWidth * 2;

                // Depending on the position in a bar, we want to shift the play range a bit so that it
                // aligns more nicely with the notes. Without these adjustments, the play range would start
                // and end right on note borders (which doesn't look good).
                if (pulseIndexInBar > 1) {
                    playRangeLeft -= 8;
                    clampedScroll -= 8;
                } else {
                    playRangeLeft += 4;
                    playRangeWidth -= 6;
                    clampedScroll += 4;
                }
                this.playRangeRef.current.style.left = `${playRangeLeft}px`;
                this.playRangeRef.current.style.width = `${playRangeWidth}px`;

                this.animateViewerScroll(clampedScroll);
            }

            this.lastPulse = currentPulse;
        }
    };

    /**
     * Helper to determine the duration of the CSS transition for the play range, so that we can use the same duration
     * for our JS scroll animation.
     *
     * @returns The duration of the CSS transition in milliseconds.
     */
    private getPlayRangeTransitionDurationMs(): number {
        if (!this.playRangeRef.current) {
            return 0;
        }

        const style = getComputedStyle(this.playRangeRef.current);
        const durations = style.transitionDuration.split(",").map((value) => {
            return value.trim();
        });
        let maxDuration = 0;

        for (const duration of durations) {
            const parsed = Number.parseFloat(duration);
            if (Number.isNaN(parsed)) {
                continue;
            }

            const durationInMs = duration.endsWith("ms") ? parsed : parsed * 1000;
            maxDuration = Math.max(maxDuration, durationInMs);
        }

        return maxDuration;
    }

    private animateViewerScroll(targetLeft: number): void {
        const viewer = this.viewerRef.current;
        if (!viewer) {
            return;
        }

        const durationMs = this.autoFollowTransitionDurationMs;
        if (this.scrollAnimationFrameId !== 0) {
            cancelAnimationFrame(this.scrollAnimationFrameId);
            this.scrollAnimationFrameId = 0;
        }

        const startLeft = viewer.scrollLeft;
        if (durationMs <= 0 || Math.abs(targetLeft - startLeft) < 0.5) {
            viewer.scrollLeft = targetLeft;

            return;
        }

        const startTime = performance.now();

        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const easedProgress = this.easeInOut(progress);

            viewer.scrollLeft = startLeft + ((targetLeft - startLeft) * easedProgress);

            if (progress < 1) {
                this.scrollAnimationFrameId = requestAnimationFrame(step);
            } else {
                this.scrollAnimationFrameId = 0;
            }
        };

        this.scrollAnimationFrameId = requestAnimationFrame(step);
    }

    private easeInOut(progress: number): number {
        // Linear easing to match CSS transition timing function.
        return progress;
    }

    private animationEngineSubscription = () => {
        const { arrangementPlayer } = this.props;

        if (arrangementPlayer.state === "playing") {
            this.setState({ autoFollowIsOn: true });
        }
    };

    private handleWheel = (event: WheelEvent) => {
        if (event.deltaX > 6) {
            this.setState({ autoFollowIsOn: false });
        }
    };

    private useTrackViewerTouchInterpretation(): ITrackViewerCallbacks {
        // Touchscreens:
        // If user touches the tracks while we're auto-following
        // If they are scrolling up or down, we do nothing
        // If they are scrolling left or right, we stop auto-following
        // If they hold for a whole second, we stop auto-following

        const { userMightBeTakingControl, autoFollowIsOn } = this.state;

        if (!autoFollowIsOn) {
            return {
                noteLineTouchStart: undefined,
                noteLineTouchMove: undefined,
                noteLineTouchEnd: undefined
            };
        }

        if (userMightBeTakingControl) {
            return {
                noteLineTouchStart: undefined,
                noteLineTouchMove: (event: TouchEvent) => {
                    if (Math.abs(this.lastX - event.touches[0].pageX) > 10) {
                        this.setState({ autoFollowIsOn: false });
                        clearTimeout(this.stopAutoFollowTimeoutId);
                        this.setState({ userMightBeTakingControl: false });

                        return;
                    }

                    if (Math.abs(this.lastY - event.touches[0].pageY) > 10) {
                        clearTimeout(this.stopAutoFollowTimeoutId);
                        this.setState({ userMightBeTakingControl: false });
                    }
                },
                noteLineTouchEnd: () => {
                    this.setState({ userMightBeTakingControl: false });
                }
            };
        } else {
            return {
                noteLineTouchStart: (event: TouchEvent) => {
                    if (event.touches.length != 1) {
                        return;
                    }

                    this.lastY = event.touches[0].pageY;
                    this.lastX = event.touches[0].pageX;
                    this.stopAutoFollowTimeoutId = setTimeout(() => {
                        this.setState({ autoFollowIsOn: false });
                    }, 1000);

                    this.setState({ userMightBeTakingControl: true });
                },
                noteLineTouchMove: undefined,
                noteLineTouchEnd: undefined
            };
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
}
