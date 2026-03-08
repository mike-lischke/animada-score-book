/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type JSX } from "preact";

import { Publisher } from "../../../core/Publisher.js";
import type { RealTime } from "../../../core/ScoreBookDataModel.js";
import type { ITimeParams } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { GuideRail } from "../GuideRail/GuideRail.js";
import { Overlay } from "../Overlay.js";
import { Share } from "../Share.js";
import { TrackViewer, type ITrackViewerCallbacks } from "../Track/TrackViewer.js";
import { ArrangementEditControls } from "./ArrangementEditControls.js";
import { TrackControls } from "./TrackControls.js";

const baseNoteWidth = 55.5; // 54pt flex-basis + 1.5pt for border

export interface IArrangementViewerProps extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

interface IArrangementViewerState {
    noteWidth: number;
    trackPlayerCount: number;
    noteLineMinWidth: number;
    autoFollowIsOn: boolean;

    userMightBeTakingControl: boolean;
}

export class ArrangementViewer extends UIComponent<IArrangementViewerProps, IArrangementViewerState> {
    private viewerRef = createRef<HTMLDivElement>();
    private shadowRef = createRef<HTMLDivElement>();
    private playBeamRef = createRef<HTMLDivElement>();
    private playRangeRef = createRef<HTMLDivElement>();

    private contentWidthPublisher = new Publisher();

    //private animationEngine?: AnimationEngine;
    private resizeObserver: ResizeObserver;

    private lastY = 0;
    private lastX = 0;
    private stopAutoFollowTimeoutId = 0;
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

        this.state = {
            noteWidth: 0,
            trackPlayerCount: props.arrangementPlayer.trackPlayers.size,
            noteLineMinWidth: this.getNoteLineMinWidth(props.arrangementPlayer.arrangementView.timeParams),
            autoFollowIsOn: true,
            userMightBeTakingControl: false
        };

        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.autoFollowTransitionDurationMs = 0;
    }

    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;
        const { autoFollowIsOn } = this.state;

        setTimeout(this.handleResize, 0);
        this.resizeObserver.observe(this.viewerRef.current!);

        const arrangement = arrangementPlayer.arrangementView;
        this.addSubscription(arrangement.timeParams, this.timeParamsSubscription, true);

        // If desired, turn on auto-follow like so.
        if (autoFollowIsOn) {
            arrangementPlayer.animationEngine.connect(this.autoFollow);
        }

        // Otherwise, set up the subscription which will turn it on again.
        this.addSubscription(arrangementPlayer.animationEngine, this.animationEngineSubscription, true);

        this.updateScrollShadows();

        this.autoFollowTransitionDurationMs = this.getPlayRangeTransitionDurationMs();
    }

    public override componentDidUpdate(prevProps: IArrangementViewerProps, prevState: IArrangementViewerState): void {
        super.componentDidUpdate(prevProps, prevState);

        const { arrangementPlayer } = this.props;
        const { autoFollowIsOn } = this.state;

        if (prevProps.arrangementPlayer !== arrangementPlayer) {
            prevProps.arrangementPlayer.animationEngine.disconnect(this.autoFollow);

            const arrangement = arrangementPlayer.arrangementView;
            this.addSubscription(arrangement.timeParams, this.timeParamsSubscription);

            if (autoFollowIsOn) {
                arrangementPlayer.animationEngine.connect(this.autoFollow);
            }
            this.addSubscription(arrangementPlayer.animationEngine, this.animationEngineSubscription);
        }

        this.updateScrollShadows();
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
    }

    public override render(): JSX.Element {
        const { arrangementPlayer, services, undoManager } = this.props;
        const { noteLineMinWidth, autoFollowIsOn } = this.state;

        const arrangement = arrangementPlayer.arrangementView;

        return (
            <Container
                className="arrangementViewer"
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
            >
                <ArrangementEditControls
                    arrangementPlayer={arrangementPlayer}
                    services={services}
                    undoManager={undoManager}
                />
                <Container
                    id="trackViewerContainer"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    <TrackControls tracks={arrangement.tracks} />
                    <Container
                        id="trackViewerHostShadow"
                        innerRef={this.shadowRef}
                    >
                        <Container
                            className={`trackViewerHost`}
                            innerRef={this.viewerRef}
                            orientation={Orientation.TopDown}
                            crossAlignment={ChildAlignment.Start}
                            onScroll={this.updateScrollShadows}
                            onWheel={autoFollowIsOn ? this.handleWheel : undefined}
                        >
                            <Container
                                id="trackViewerContentHost"
                                orientation={Orientation.TopDown}
                                crossAlignment={ChildAlignment.Start}
                            >
                                <Container
                                    id="trackViewerDecorations"
                                    crossAlignment={ChildAlignment.Stretch}
                                >
                                    <div id="playRange" ref={this.playRangeRef} />
                                    <div id="playBeam" ref={this.playBeamRef} />
                                </Container>
                                <GuideRail arrangementView={arrangement} />
                                {
                                    arrangement.tracks.map((track) => {
                                        return arrangementPlayer.trackPlayers.get(track)!;
                                    }).map((trackPlayer) => {
                                        return (
                                            <TrackViewer
                                                trackPlayer={trackPlayer}
                                                callbacks={this.useTrackViewerTouchInterpretation()}
                                                key={trackPlayer.track.id}
                                                arrangementPlayer={arrangementPlayer}
                                                services={services}
                                                undoManager={undoManager}
                                                noteLineMinWidth={noteLineMinWidth}
                                            />
                                        );
                                    })
                                }
                                <Container
                                    id="trackViewerSelectionOverlay"
                                >
                                </Container>
                            </Container>
                        </Container>
                    </Container>
                </Container>
                <Overlay name="share">
                    <Share
                        arrangementPlayer={arrangementPlayer}
                        undoManager={undoManager}
                    />
                </Overlay>
            </Container>
        );
    }

    /**
     * @param timeParams The time params of the arrangement.
     * @returns The width of the entire note line  in pt.
     */
    private getNoteLineMinWidth = (timeParams: Readonly<ITimeParams>): number => {
        const widthFromNotes = baseNoteWidth * timeParams.timings.length;
        const extraWidthBetweenBars = (timeParams.length - 1) * 4;

        return widthFromNotes + extraWidthBetweenBars;
    };

    private handleResize = () => {
        this.updateScrollShadows();
        this.updateNoteWidth();
    };

    private updateScrollShadows = () => {
        if (!this.viewerRef.current || !this.shadowRef.current) {
            return;
        }

        const scrollLeft = this.viewerRef.current.scrollLeft;
        const scrollWidth = this.viewerRef.current.scrollWidth;
        const clientWidth = this.viewerRef.current.clientWidth;

        this.shadowRef.current.classList.toggle("overflowingLeft", scrollLeft > 2);
        this.shadowRef.current.classList.toggle("overflowingRight", scrollLeft + clientWidth < scrollWidth - 2);
    };

    private updateNoteWidth = () => {
        this.setState({ noteWidth: this.getNoteWidth(this.viewerRef.current) });
    };

    private timeParamsSubscription = () => {
        return setTimeout(() => {
            this.updateScrollShadows();
            this.contentWidthPublisher.publish();
            this.updateNoteWidth();
        }, 0);
    };

    private getNoteWidth(trackViewersWrapper: HTMLElement | null): number {
        const noteViewer = trackViewersWrapper?.querySelector(".notes-wrapper .note-viewer");
        if (!noteViewer) {
            return 0;
        } // In case there are no tracks

        return noteViewer.clientWidth;
    }

    private autoFollow = (realTime: RealTime) => {
        if (this.viewerRef.current && this.playBeamRef.current && this.playRangeRef.current) {
            const { arrangementPlayer } = this.props;
            const { noteWidth } = this.state;

            // 1. Update play beam continuously.
            const normalizedPosition = arrangementPlayer.convertToLoopProgress(realTime);
            const scrollWidth = this.viewerRef.current.scrollWidth;
            const position = Math.floor(normalizedPosition * scrollWidth);

            this.playBeamRef.current.style.left = `${position}px`;

            // 2. Calculate current pulse.
            const scoreMetrics = arrangementPlayer.scoreMetrics;
            const currentPulse = Math.floor(realTime /
                (scoreMetrics.secondsPerBar / scoreMetrics.stepsPerBar * scoreMetrics.stepsPerPulse));

            // 3. Update viewer scroll and play range only every 2 pulses.
            // Check if we've moved at least 2 pulses ahead or looped back.
            const hasLoopedBack = currentPulse < this.lastPulse;
            const hasMoved2Pulses = currentPulse >= this.targetPulse + 2;

            if (hasLoopedBack || hasMoved2Pulses) {
                this.targetPulse = currentPulse;

                const clientWidth = this.viewerRef.current.clientWidth;

                // Calculate play range dimensions (2 pulses wide).
                const playRangeWidth = 2 * noteWidth * (scoreMetrics.stepsPerBar / scoreMetrics.stepsPerPulse);

                // Scroll to center the play range in the viewer.
                const desiredScroll = (position + (playRangeWidth / 2)) - (clientWidth / 2);
                const maxScroll = scrollWidth - clientWidth;
                const clampedScroll = Math.max(0, Math.min(desiredScroll, maxScroll));

                // Keep the range visually fixed in the center while there is enough scroll room.
                // At the song boundaries it follows the content, because centering is not possible.
                const canKeepCentered = clampedScroll === desiredScroll;
                const playRangeLeft = canKeepCentered
                    ? clampedScroll + ((clientWidth - playRangeWidth) / 2)
                    : Math.max(0, Math.min(position, scrollWidth - playRangeWidth));

                this.playRangeRef.current.style.left = `${playRangeLeft}px`;
                this.playRangeRef.current.style.width = `${playRangeWidth}px`;

                this.animateViewerScroll(clampedScroll, this.autoFollowTransitionDurationMs);
            }

            // Update lastPulse to track where we are.
            this.lastPulse = currentPulse;
        }
    };

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

    private animateViewerScroll(targetLeft: number, durationMs: number): void {
        const viewer = this.viewerRef.current;
        if (!viewer) {
            return;
        }

        if (this.scrollAnimationFrameId !== 0) {
            cancelAnimationFrame(this.scrollAnimationFrameId);
            this.scrollAnimationFrameId = 0;
        }

        const startLeft = viewer.scrollLeft;
        if (durationMs <= 0 || Math.abs(targetLeft - startLeft) < 0.5) {
            viewer.scrollLeft = targetLeft;
            this.updateScrollShadows();

            return;
        }

        const startTime = performance.now();

        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const easedProgress = this.easeInOut(progress);

            viewer.scrollLeft = startLeft + ((targetLeft - startLeft) * easedProgress);
            this.updateScrollShadows();

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
}
