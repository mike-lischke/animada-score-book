/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import type { IArrangement } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../ui/AnimadaScoreBookUi.js";
import { ExpandingSpacer } from "../ExpandingSpacer.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Overlay } from "../Overlay.js";
import { SmallSpacer } from "../SmallSpacer.js";

export interface IArrangementControlsBottomProps extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer,
    services: ScoreBookUiServices,
    undoManager: UndoManager;
}

interface IArrangementControlsBottomState {
    arePolyrhythms?: boolean;
}

export class ArrangementControlsBottom
    extends UIComponent<IArrangementControlsBottomProps, IArrangementControlsBottomState> {

    private subscribedTracks = new Set<ISbDmTrack>();

    public constructor(props: IArrangementControlsBottomProps) {
        super(props);

        this.state = {};
    }

    public override componentDidMount(): void {
        const { arrangementPlayer, services } = this.props;
        const { arePolyrhythms } = this.state;

        const arrangement = arrangementPlayer.arrangementView;
        this.addSubscription(arrangement, this.arrangementCallback);
        this.addSubscription(arrangement, this.trackUpdate);

        arrangement.tracks.forEach((track) => {
            track.subscribe(this.arrangementCallback);
            this.subscribedTracks.add(track);
        });

        const hasPolyrhythms = this.hasPolyrhythms(arrangement);
        if (!hasPolyrhythms) {
            Overlay.toggleOverlay("delete_polyrhythms", "hide");
            services.modeManager.deletePolyrhythmMode = false;
        }

        if (arePolyrhythms !== hasPolyrhythms) {
            this.setState({ arePolyrhythms: hasPolyrhythms });
        }
    }

    public override componentWillUnmount(): void {
        this.subscribedTracks.forEach((track) => {
            track.unsubscribe(this.arrangementCallback);
        });

        this.subscribedTracks.clear();
    }

    public render() {
        const { arrangementPlayer, services, undoManager } = this.props;
        const { arePolyrhythms } = this.state;

        const arrangement = arrangementPlayer.arrangementView;
        const modeManager = services.modeManager;

        return (
            <div className="arrangement-controls arrangement-controls-bottom">
                <Button
                    className="push-button"
                    onClick={() => {
                        Overlay.toggleOverlay("instrument_browser", "show");
                    }}
                >Add Instrument</Button>

                <SmallSpacer />
                <ExpandingSpacer />

                {
                    arePolyrhythms
                        ? (
                            <>
                                <Button
                                    className="push-button"
                                    onClick={() => {
                                        modeManager.deletePolyrhythmMode = true;
                                        Overlay.toggleOverlay("delete_polyrhythms", "show");
                                    }}
                                >Delete polyrhythms...</Button>
                                <SmallSpacer />
                            </>
                        )
                        : (<></>)
                }

                <Button
                    className="push-button"
                    onClick={() => {
                        Overlay.toggleOverlay("clear_tracks", "show");
                    }}
                >
                    Clear all sounds
                </Button>

                <Overlay name="clear_tracks">
                    <div style={{
                        display: "flex",
                        height: "100%",
                        width: "100%",
                        boxSizing: "border-box"
                    }}>
                        <ExpandingSpacer />
                        <Button
                            className="push-button"
                            onClick={() => {
                                undoManager.edit({
                                    type: "EditCommand_ArrangementClear", arrangement,
                                    command: "clear all tracks"
                                });
                                Overlay.toggleOverlay("clear_tracks", "hide");
                            }}
                        >
                            Really, clear sounds
                        </Button>
                        <SmallSpacer />
                        <Button
                            className="push-button"
                            onClick={() => {
                                Overlay.toggleOverlay("clear_tracks", "hide");
                            }}
                        >
                            No, go back
                        </Button>
                    </div>
                </Overlay>

                <Overlay name="delete_polyrhythms">
                    <div style={{
                        display: "flex",
                        height: "100%",
                        width: "100%",
                        boxSizing: "border-box"
                    }}>
                        <ExpandingSpacer />
                        <Button
                            className="push-button"
                            onClick={() => {
                                return modeManager.deletePolyrhythmMode = false;
                            }}
                        >
                            Done
                        </Button>
                    </div>
                </Overlay>
            </div>
        );
    }

    private hasPolyrhythms(arrangement: IArrangement): boolean {
        for (const track of arrangement.tracks) {
            if (track.polyrhythms.length) {
                return true;
            }
        }

        return false;
    }

    private arrangementCallback = () => {
        const { arrangementPlayer, services } = this.props;

        const arrangement = arrangementPlayer.arrangementView;

        const arePolyrhythms = this.hasPolyrhythms(arrangement);
        if (!arePolyrhythms) {
            Overlay.toggleOverlay("delete_polyrhythms", "hide");

            services.modeManager.deletePolyrhythmMode = false;
        }
        this.setState({ arePolyrhythms: arePolyrhythms });
    };

    private trackUpdate = (): void => {
        const { arrangementPlayer: arrangementPlayerContext } = this.props;
        const arrangement = arrangementPlayerContext.arrangementView;

        this.subscribedTracks.forEach((track) => {
            if (!arrangement.tracks.includes(track)) {
                track.unsubscribe(this.arrangementCallback);
                this.subscribedTracks.delete(track);
            }
        });

        arrangement.tracks.forEach((track) => {
            if (!this.subscribedTracks.has(track)) {
                track.subscribe(this.arrangementCallback);
                this.subscribedTracks.add(track);
            }
        });
    };
};
