/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { useEditCommand } from "../../../ui/hooks/useEditCommand.js";
import { ServicesContext } from "../ScoreBookViewer.js";
import { ComponentBase, type IComponentState } from "../ComponentBase/ComponentBase.js";
import { ExpandingSpacer } from "../ExpandingSpacer.js";
import { Overlay } from "../Overlay.js";
import { SmallSpacer } from "../SmallSpacer.js";
import { ArrangementPlayerContext } from "./ArrangementViewer.js";
import type { ContextType } from "preact";
import type { Subscription, ITrackView, IArrangementView } from "../../../Core/types/general.js";

interface IArrangementControlsBottomState extends IComponentState {
    arePolyrhythms?: boolean;
}

export class ArrangementControlsBottom extends ComponentBase<{}, IArrangementControlsBottomState> {
    private arrangementSubscription?: Subscription;
    private subscribedTracks = new Set<ITrackView>();

    private arrangementPlayerContext?: ContextType<typeof ArrangementPlayerContext>;
    private servicesContext?: ContextType<typeof ServicesContext>;

    public constructor(props: {}) {
        super(props);

        this.state = {};
    }

    public override componentWillUnmount(): void {
        const arrangement = this.arrangementPlayerContext!.arrangement;

        arrangement.unsubscribe(this.arrangementCallback);
        arrangement.unsubscribe(this.arrangementSubscription!);
        this.subscribedTracks.forEach((track) => {
            track.unsubscribe(this.arrangementCallback as Subscription);
        });

        this.subscribedTracks.clear();
        this.arrangementPlayerContext = undefined;
        this.servicesContext = undefined;
    }

    public render() {
        const { arePolyrhythms } = this.state;

        const edit = useEditCommand();

        return (
            <ArrangementPlayerContext.Consumer>
                {(arrangementPlayerContext) => {
                    return (
                        <ServicesContext.Consumer>
                            {(servicesContext) => {
                                this.useArrangementAndTrackSubscription(arrangementPlayerContext, servicesContext);
                                const arrangement = arrangementPlayerContext!.arrangement;
                                if (arePolyrhythms === undefined) {
                                    this.setState({
                                        arePolyrhythms: this.hasPolyrhythms(arrangement),
                                    });

                                    return null;
                                }

                                const modeManager = servicesContext!.modeManager;

                                return (
                                    <div className="arrangement-controls arrangement-controls-bottom">
                                        <button
                                            className="push-button"
                                            onClick={() => {
                                                Overlay.toggleOverlay("instrument_browser", "show");
                                            }}
                                        >Add Instrument</button>

                                        <SmallSpacer />
                                        <ExpandingSpacer />

                                        {
                                            arePolyrhythms
                                                ? (
                                                    <>
                                                        <button
                                                            className="push-button"
                                                            onClick={() => {
                                                                modeManager.deletePolyrhythmMode = true;
                                                                Overlay.toggleOverlay("delete_polyrhythms", "show");
                                                            }}
                                                        >Delete polyrhythms...</button>
                                                        <SmallSpacer />
                                                    </>
                                                )
                                                : (<></>)
                                        }

                                        <button
                                            className="push-button"
                                            onClick={() => {
                                                Overlay.toggleOverlay("clear_tracks", "show");
                                            }}
                                        >Clear all sounds</button>

                                        <Overlay name="clear_tracks">
                                            <div style={{
                                                display: "flex",
                                                height: "100%",
                                                width: "100%",
                                                boxSizing: "border-box"
                                            }}>
                                                <ExpandingSpacer />
                                                <button
                                                    className="push-button"
                                                    onClick={() => {
                                                        edit({
                                                            type: "EditCommand_ArrangementClear", arrangement,
                                                            command: "clear all tracks"
                                                        });
                                                        Overlay.toggleOverlay("clear_tracks", "hide");
                                                    }}
                                                >Really, clear sounds</button>
                                                <SmallSpacer />
                                                <button
                                                    className="push-button"
                                                    onClick={() => {
                                                        Overlay.toggleOverlay("clear_tracks", "hide");
                                                    }}
                                                >No, go back</button>
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
                                                <button
                                                    className="push-button"
                                                    onClick={() => {
                                                        return modeManager.deletePolyrhythmMode = false;
                                                    }}
                                                >Done</button>
                                            </div>
                                        </Overlay>
                                    </div>
                                );
                            }}
                        </ServicesContext.Consumer>
                    );
                }}
            </ArrangementPlayerContext.Consumer>
        );
    }

    private hasPolyrhythms(arrangement: IArrangementView): boolean {
        for (const track of arrangement.tracks) {
            if (track.polyrhythms.length) {
                return true;
            }
        }

        return false;
    }

    private arrangementCallback = () => {
        const arrangement = this.arrangementPlayerContext!.arrangement;

        const arePolyrhythms = this.hasPolyrhythms(arrangement);
        if (!arePolyrhythms) {
            Overlay.toggleOverlay("delete_polyrhythms", "hide");

            const modeManager = this.servicesContext!.modeManager;
            modeManager.deletePolyrhythmMode = false;
        }
        this.setState({ arePolyrhythms: arePolyrhythms });
    };

    private useArrangementAndTrackSubscription = (
        arrangementPlayerContext: ContextType<typeof ArrangementPlayerContext>,
        servicesContext?: ContextType<typeof ServicesContext>
    ): void => {
        if (this.arrangementPlayerContext !== arrangementPlayerContext) {
            this.arrangementPlayerContext = arrangementPlayerContext;
            this.servicesContext = servicesContext;

            const arrangement: IArrangementView = arrangementPlayerContext!.arrangement;

            arrangement.tracks.forEach((track) => {
                track.subscribe(this.arrangementCallback as Subscription);
                this.subscribedTracks.add(track);
            });

            const arrangementSubscription = () => {
                this.subscribedTracks.forEach((track) => {
                    if (!arrangement.tracks.includes(track)) {
                        track.unsubscribe(this.arrangementCallback as Subscription);
                        this.subscribedTracks.delete(track);
                    }
                });

                arrangement.tracks.forEach((track) => {
                    if (!this.subscribedTracks.has(track)) {
                        track.subscribe(this.arrangementCallback as Subscription);
                        this.subscribedTracks.add(track);
                    }
                });
            };

            arrangement.subscribe(arrangementSubscription);
            this.arrangementSubscription = arrangementSubscription;

            const modeManager = servicesContext!.modeManager;
            modeManager.subscribe(() => {
                if (!modeManager.deletePolyrhythmMode) {
                    Overlay.toggleOverlay("delete_polyrhythms", "hide");
                }
            });
        }
    };
};
