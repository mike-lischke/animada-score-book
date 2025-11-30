/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext, createRef, type JSX } from "preact";
import type { MutableRefObject } from "preact/compat";

import { Publisher } from "../../../core/Publisher.js";
import type { ITimeParamsView, RealTime, Subscription } from "../../../core/types/general.js";
import type { IArrangementPlayer } from "../../../player/types.js";
import type { AnimationEngine } from "../../../ui/AnimationEngine.js";
import { ComponentBase, type IComponentProperties, type IComponentState } from "../ComponentBase/ComponentBase.js";
import { GuideRail } from "../GuideRail/GuideRail.js";
import { InstrumentBrowser } from "../InstrumentBrowser.js";
import { Overlay } from "../Overlay.js";
import { ServicesContext } from "../ScoreBookViewer.js";
import { Scrollbar } from "../Scrollbar.js";
import { Share } from "../Share.js";
import { TrackViewer } from "../Track1/TrackViewer.js";
import { ArrangementControlsBottom } from "./ArrangementControlsBottom.js";
import { ArrangementControlsTop } from "./ArrangementControlsTop.js";

const baseNoteWidth = 55.5; // 54pt flex-basis + 1.5pt for border

export const ArrangementPlayerContext = createContext<IArrangementPlayer | null>(null);
export const NoteWidthContext = createContext<number | null>(null);
export const NoteLineMinWidth = createContext<number | null>(null);

export interface IArrangementViewerProps extends IComponentProperties {
    arrangementPlayer: IArrangementPlayer;
}

interface IArrangementViewerState extends IComponentState {
    noteWidth: number;
    trackPlayerCount: number;
    noteLineMinWidth: number;
    scrollShadowClasses: string;
    autoFollowIsOn: boolean;
    userMightBeTakingControl: boolean;
}

export class ArrangementViewer extends ComponentBase<IArrangementViewerProps, IArrangementViewerState> {
    private viewerRef = createRef<HTMLDivElement>();
    private contentWidthPublisher = new Publisher();

    private animationEngine?: AnimationEngine;
    private resizeObserver: ResizeObserver;

    private lastY = 0;
    private lastX = 0;
    private stopAutoFollowTimeoutId = 0;

    public constructor(props: IArrangementViewerProps) {
        super(props);

        this.state = {
            noteWidth: 0,
            trackPlayerCount: props.arrangementPlayer.trackPlayers.size,
            noteLineMinWidth: this.getNoteLineMinWidth(props.arrangementPlayer.arrangement.timeParams),
            scrollShadowClasses: "",
            autoFollowIsOn: true,
            userMightBeTakingControl: false
        };

        this.resizeObserver = new ResizeObserver(this.handleResize);
    }

    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;

        setTimeout(this.handleResize, 0);
        this.resizeObserver.observe(this.viewerRef.current!);

        const arrangement = arrangementPlayer.arrangement;
        arrangement.subscribe(this.timeParamsSubscription as Subscription);
    }

    public override componentWillUnmount(): void {
        const { arrangementPlayer } = this.props;
        this.resizeObserver.disconnect();

        const arrangement = arrangementPlayer.arrangement;
        arrangement.unsubscribe(this.timeParamsSubscription as Subscription);

        // Actually only one of these is active at a time.
        this.animationEngine?.disconnect(this.autoFollowAnimation);
        this.animationEngine?.unsubscribe(this.animationEngineSubscription);
    }

    public override render(): JSX.Element {
        const { arrangementPlayer } = this.props;
        const { noteWidth, noteLineMinWidth, scrollShadowClasses } = this.state;

        const arrangement = arrangementPlayer.arrangement;

        return (
            <ServicesContext.Consumer>
                {(servicesContext) => {
                    this.useAutoFollow(servicesContext!.animationEngine, this.viewerRef);
                    const { trackViewerCallbacks, handleWheel, onScrollbarGrab } =
                        this.useAutoFollow(servicesContext!.animationEngine, this.viewerRef) ?? {};

                    return (
                        <ArrangementPlayerContext.Provider value={arrangementPlayer}>
                            <NoteWidthContext.Provider value={noteWidth}>
                                <NoteLineMinWidth.Provider value={noteLineMinWidth}>
                                    <div className="arrangement-viewer">
                                        <div className="arrangement-viewer-head">
                                            <ArrangementControlsTop />
                                        </div>
                                        <div className="arrangement-viewer-body">
                                            <div>
                                                <div
                                                    className={`track-viewers-wrapper ${scrollShadowClasses}`}
                                                    ref={this.viewerRef}
                                                    onScroll={this.updateScrollShadows}
                                                    onWheel={handleWheel}
                                                >
                                                    <GuideRail arrangement={arrangement} />
                                                    {
                                                        arrangement.tracks.map((track) => {
                                                            return arrangementPlayer.trackPlayers.get(track)!;
                                                        }).map((trackPlayer) => {
                                                            return (
                                                                <TrackViewer
                                                                    trackPlayer={trackPlayer}
                                                                    callbacks={trackViewerCallbacks ?? {}}
                                                                    key={trackPlayer.track.id}
                                                                />
                                                            );
                                                        })
                                                    }
                                                    <Scrollbar
                                                        wrapperRef={this.viewerRef}
                                                        contentWidthPublisher={this.contentWidthPublisher}
                                                        onGrab={onScrollbarGrab}
                                                    />
                                                </div>
                                                <Overlay name="instrument_browser">
                                                    <InstrumentBrowser close={() => {
                                                        Overlay.toggleOverlay("instrument_browser", "hide");
                                                    }} />
                                                </Overlay>
                                            </div>
                                        </div>
                                        <ArrangementControlsBottom />
                                        <Overlay name="share">
                                            <Share />
                                        </Overlay>
                                    </div>
                                </NoteLineMinWidth.Provider>
                            </NoteWidthContext.Provider>
                        </ArrangementPlayerContext.Provider>
                    );
                }}
            </ServicesContext.Consumer>
        );
    }

    // Returns width in pt
    private getNoteLineMinWidth = (timeParams: ITimeParamsView): number => {
        const widthFromNotes = baseNoteWidth * timeParams.timings.length;
        const extraWidthBetweenBars = (timeParams.length - 1) * 4;

        return widthFromNotes + extraWidthBetweenBars;
    };

    private handleResize = () => {
        this.updateScrollShadows();

        this.updateNoteWidth();
    };

    // We need scroll shadows if the note-lines are out of site to either the left or the right
    private getScrollShadowClasses(trackViewersWrapper: HTMLElement | null): string {
        const notesWrapper = trackViewersWrapper?.querySelector(".notes-wrapper");
        if (!notesWrapper) {
            return "";
        } // In case there are no tracks

        const { left: notesWrapperLeft } = notesWrapper.getBoundingClientRect();
        const notesWrapperRight = notesWrapperLeft + notesWrapper.scrollWidth;

        // On the left side, the boundary is the right side of the track-metas
        const { right: metaRight } = trackViewersWrapper!.querySelector(".track-meta")!.getBoundingClientRect();

        // On the right side, the boundary is right edge of the track-viewers-wrapper
        const { right: wrapperRight } = trackViewersWrapper!.getBoundingClientRect();

        // This works much better with a little bit of tolerance, so we do a little subtraction
        if (notesWrapperRight - wrapperRight > 2) {
            if (metaRight - notesWrapperLeft > 2) {
                return "overflowing-left overflowing-right";
            }

            return "overflowing-right";
        }
        if (metaRight - notesWrapperLeft > 2) {
            return "overflowing-left";
        }

        return "";
    }

    private updateScrollShadows = () => {
        this.setState({ scrollShadowClasses: this.getScrollShadowClasses(this.viewerRef.current) });
    };

    private updateNoteWidth = () => {
        this.setState({ noteWidth: this.getNoteWidth(this.viewerRef.current) });
    };

    private timeParamsSubscription = (timeParams: ITimeParamsView) => {
        return setTimeout(() => {
            this.updateScrollShadows();
            this.contentWidthPublisher.publish();
            this.updateNoteWidth();
        }, 0);
    };

    private getNoteWidth(trackViewersWrapper: HTMLElement | null): number {
        const noteViewer = trackViewersWrapper?.querySelector(".note-line-wrapper .notes-wrapper .note-viewer");
        if (!noteViewer) {
            return 0;
        } // In case there are no tracks

        return noteViewer.clientWidth;
    }

    private autoFollow(wrapper: HTMLDivElement | null, realTime: RealTime) {
        if (wrapper) {
            const { arrangementPlayer } = this.props;

            const distanceMultiplier = arrangementPlayer.convertToLoopProgress(realTime);
            wrapper.scrollLeft = (distanceMultiplier * wrapper.scrollWidth) - (wrapper.offsetWidth / 2);
        }
    }

    private autoFollowAnimation = (realTime: RealTime) => {
        this.autoFollow(this.viewerRef.current, realTime);
    };

    private animationEngineSubscription = () => {
        if (this.animationEngine?.state === "playing") {
            this.setState({ autoFollowIsOn: true });
        }
    };

    private useAutoFollow(animationEngine: AnimationEngine, wrapperRef: MutableRefObject<HTMLDivElement | null>) {
        if (this.animationEngine === animationEngine) {
            return;
        }

        const { autoFollowIsOn } = this.state;

        this.animationEngine = animationEngine;

        // If desired, turn on auto-follow like so
        if (autoFollowIsOn) {
            animationEngine.connect(this.autoFollowAnimation);
        } else {
            // Otherwise, set up the subscription which will turn it on again
            animationEngine.subscribe(this.animationEngineSubscription);

        }

        return {
            handleWheel: autoFollowIsOn ? (event: WheelEvent) => {
                if (event.deltaX > 6) {
                    this.setState({ autoFollowIsOn: false });
                }
            } : undefined,
            onScrollbarGrab: autoFollowIsOn ? () => {
                this.setState({ autoFollowIsOn: false });
            } : undefined,
            trackViewerCallbacks: this.useTrackViewerTouchInterpretation()
        };
    }

    private useTrackViewerTouchInterpretation() {
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
    }
}
