/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext, type ComponentChild } from "preact";

import type { IArrangementPlayer, ITrackPlayer } from "../../../player/types.js";
import { ArrangementPlayerContext } from "../Arrangement/ArrangementViewer.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Overlay } from "../Overlay.js";
import { NoteLine } from "./NoteLine.js";
import { TrackControls } from "./TrackControls.js";
import { TrackMeta } from "./TrackMeta.js";

export interface TrackViewerCallbacks {
    noteLineTouchStart?: (event: TouchEvent) => void;
    noteLineTouchMove?: (event: TouchEvent) => void;
    noteLineTouchEnd?: () => void;
};

export interface ITrackViewerProps extends ICommonUIProperties {
    trackPlayer: ITrackPlayer;
    callbacks: TrackViewerCallbacks;
}

interface ITrackviewerState {
    audible: boolean;
    loaded: boolean;
}

export const TrackPlayerContext = createContext<ITrackPlayer | null>(null);

export class TrackViewer extends UIComponent<ITrackViewerProps, ITrackviewerState> {
    private arrangementPlayerContext: IArrangementPlayer | null = null;

    public constructor(props: ITrackViewerProps) {
        super(props);

        const track = props.trackPlayer.track;
        this.state = {
            audible: false,
            loaded: track.instrument.loaded,
        };
    }

    public override componentDidMount(): void {
        const { trackPlayer } = this.props;
        const track = trackPlayer.track;

        track.instrument.subscribe(this.instrumentsChanged);
    }

    public override componentWillUnmount(): void {
        const { trackPlayer } = this.props;
        const track = trackPlayer.track;

        track.instrument.unsubscribe(this.instrumentsChanged);
        this.arrangementPlayerContext?.unsubscribe(this.audibleChanged);
    }

    public render(): ComponentChild {
        const { trackPlayer, callbacks } = this.props;
        const { loaded } = this.state;

        if (!loaded) {
            return (
                <div className="track-viewer pending-track">
                    <div className="track-meta">Loading...</div>
                    <div className="pending-note-line" />
                </div>
            );
        }

        const track = trackPlayer.track;
        const overlayName = `track_overlay_${track.id}`;

        return (
            <ArrangementPlayerContext.Consumer>
                {(arrangementPlayerContext) => {
                    const { audible } = this.state;
                    this.useContext(arrangementPlayerContext);

                    return (
                        <TrackPlayerContext.Provider value={trackPlayer} >
                            <div
                                className={`track-viewer ${audible ? "audible" : "inaudible"}`}
                                data-colour-group={track.instrument.colourGroup}
                            >
                                <div className="note-line-wrapper">
                                    <NoteLine track={track} callbacks={callbacks} />
                                    <Overlay name={overlayName}>
                                        <TrackControls track={track} overlayName={overlayName} />
                                    </Overlay>
                                </div>
                                <div className="scroll-shadow left-scroll-shadow" />
                                <div className="scroll-shadow right-scroll-shadow" />
                                <TrackMeta track={track} toggleControls={() => {
                                    Overlay.toggleOverlay(overlayName);
                                }} />
                            </div>
                        </TrackPlayerContext.Provider>
                    );
                }}
            </ArrangementPlayerContext.Consumer>
        );
    }

    private instrumentsChanged = () => {
        const { trackPlayer } = this.props;
        const track = trackPlayer.track;
        this.setState({ loaded: track.instrument.loaded });
    };

    private useContext = (arrangementPlayerContext: IArrangementPlayer | null) => {
        if (this.arrangementPlayerContext !== arrangementPlayerContext) {
            this.arrangementPlayerContext = arrangementPlayerContext;

            arrangementPlayerContext?.subscribe(this.audibleChanged);
            this.audibleChanged();
        }
    };

    private audibleChanged = () => {
        this.setState({
            audible: this.arrangementPlayerContext!.audibleTrackPlayers.has(this.props.trackPlayer.track),
        });
    };
}
