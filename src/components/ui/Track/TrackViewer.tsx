/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Overlay } from "../Overlay.js";
import { NoteLine } from "./NoteLine.js";
import { TrackActions } from "./TrackActions.js";

export interface ITrackViewerCallbacks {
    noteLineTouchStart?: (event: TouchEvent) => void;
    noteLineTouchMove?: (event: TouchEvent) => void;
    noteLineTouchEnd?: () => void;
};

export interface ITrackViewerProperties extends ICommonUIProperties {
    trackPlayer: TrackPlayer;
    callbacks: ITrackViewerCallbacks;

    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

interface ITrackViewerState {
    audible: boolean;
    loaded: boolean;
}

export class TrackViewer extends UIComponent<ITrackViewerProperties, ITrackViewerState> {
    public constructor(props: ITrackViewerProperties) {
        super(props);

        const track = props.trackPlayer.track;
        this.state = {
            audible: false,
            loaded: track.instrument.state.initialized,
        };
    }

    public override componentDidMount(): void {
        const { trackPlayer, arrangementPlayer } = this.props;
        const track = trackPlayer.track;

        this.addSubscription(track.instrument, this.instrumentsChanged);
        this.addSubscription(arrangementPlayer, this.audibleChanged);
        this.audibleChanged();
    }

    public render(): ComponentChild {
        const {
            trackPlayer, arrangementPlayer, callbacks, services, undoManager, dataModel
        } = this.props;
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

        const { audible } = this.state;

        return (
            <Container
                className={`track-viewer ${audible ? "audible" : "inaudible"}`}
                crossAlignment={ChildAlignment.Center}
            >
                <NoteLine
                    track={track}
                    callbacks={callbacks}
                    trackPlayer={trackPlayer}
                    arrangementPlayer={arrangementPlayer}
                    dataModel={dataModel}
                    services={services}
                    undoManager={undoManager}
                />
                <Overlay name={overlayName}>
                    <TrackActions
                        track={track}
                        overlayName={overlayName}
                        undoManager={undoManager}
                    />
                </Overlay>
            </Container>
        );
    }

    private instrumentsChanged = () => {
        const { trackPlayer } = this.props;
        const track = trackPlayer.track;
        this.setState({ loaded: track.instrument.state.initialized });
    };

    private audibleChanged = () => {
        // XXX: this is called way too often. Need a callback only when the audible state of this track changes.
        const { trackPlayer, arrangementPlayer } = this.props;

        this.setState({
            audible: arrangementPlayer.trackPlayers.has(trackPlayer.track),
        });
    };
}
