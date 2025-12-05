/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import pauseIcon from "../../../assets/images/icons/pause.svg";
import pencilIcon from "../../../assets/images/icons/pencil_white.svg";
import playIcon from "../../../assets/images/icons/play.svg";

import type { ComponentChild, ContextType } from "preact";
import type { IArrangementView, Subscription } from "../../../core/types/general.js";
import { getEventEngine } from "../../../player/EventEngine.js";
import { UIComponent } from "../framework/UIComponent.js";
import { ExpandingSpacer } from "../ExpandingSpacer.js";
import { Overlay } from "../Overlay.js";
import { ServicesContext } from "../ScoreBookViewer.js";
import { SelectionControls } from "../SelectionControls.js";
import { ShareButton } from "../ShareButton.js";
import { SmallSpacer } from "../SmallSpacer.js";
import { ArrangementTitle } from "./ArrangementTitle.js";
import { ArrangementPlayerContext } from "./ArrangementViewer.js";
import { TimeControls } from "./TimeControls.js";
import { UndoRedo } from "./UndoRedo.js";

const eventEngine = getEventEngine();

interface IArrangementControlsTopState {
    playing: boolean;
    editingTitle: boolean;
    title: string;
}

export class ArrangementControlsTop extends UIComponent<{}, IArrangementControlsTopState> {

    private arrangementPlayerContext?: ContextType<typeof ArrangementPlayerContext>;
    private servicesContext?: ContextType<typeof ServicesContext>;

    private justFinishedEditingTitle = false;

    public constructor(props: {}) {
        super(props);

        this.state = {
            playing: eventEngine.state === "playing",
            editingTitle: false,
            title: "",
        };
    }

    public override componentWillUnmount(): void {
        const arrangementPlayerContext = this.context as ContextType<typeof ArrangementPlayerContext>;
        const arrangement: IArrangementView = arrangementPlayerContext!.arrangement;
        const selectionManager = this.servicesContext!.selectionManager;

        arrangement.unsubscribe(this.titleChangeSubscription as Subscription);
        eventEngine.unsubscribe(this.onPlaybackStateChange);
        selectionManager.unsubscribe(this.onSelectionChange as Subscription);
    }

    public override render(): ComponentChild {
        const { playing, editingTitle, title } = this.state;

        return (
            <ArrangementPlayerContext.Consumer>
                {(arrangementPlayerContext) => {
                    return (
                        <ServicesContext.Consumer>
                            {(servicesContext) => {
                                this.useSubscriptions(arrangementPlayerContext, servicesContext);
                                const arrangement = arrangementPlayerContext!.arrangement;
                                const titleVisible = title.length > 0 || editingTitle;

                                return (
                                    <>
                                        <div className={titleVisible ? "" : "hidden"}>
                                            <ArrangementTitle editMode={editingTitle} onEditEnd={this.onEditEnd} />
                                        </div>
                                        <div className="arrangement-controls arrangement-controls-top">
                                            {
                                                playing ? (
                                                    <button className="playback-control push-button" onClick={() => {
                                                        eventEngine.stop();
                                                    }}>
                                                        <img src={pauseIcon} alt="stop" />
                                                    </button>
                                                ) : (
                                                    <button className="playback-control push-button" onClick={() => {
                                                        void eventEngine.play();
                                                    }}>
                                                        <img src={playIcon} alt="play" />
                                                    </button>
                                                )
                                            }
                                            <SmallSpacer />
                                            <TimeControls arrangement={arrangement} />
                                            <SmallSpacer />

                                            <div className='other-controls-wrapper'>
                                                <button
                                                    className="push-button medium gray edit-title-button"
                                                    onClick={this.onClickEditTitle}
                                                >
                                                    T&nbsp;<img src={pencilIcon} style={{ height: "0.78em" }} />
                                                </button>
                                                <SmallSpacer />
                                                <UndoRedo />
                                            </div>

                                            <SmallSpacer />
                                            <ExpandingSpacer />

                                            <ShareButton />
                                            <Overlay name="selection_controls">
                                                <SelectionControls />
                                            </Overlay>
                                        </div>
                                    </>
                                );
                            }}
                        </ServicesContext.Consumer>
                    );
                }}
            </ArrangementPlayerContext.Consumer>
        );
    }

    private useSubscriptions = (
        arrangementPlayerContext: ContextType<typeof ArrangementPlayerContext>,
        servicesContext?: ContextType<typeof ServicesContext>
    ): void => {
        if (this.arrangementPlayerContext !== arrangementPlayerContext) {
            this.arrangementPlayerContext = arrangementPlayerContext;
            this.servicesContext = servicesContext;

            eventEngine.subscribe(this.onPlaybackStateChange);

            const arrangement = arrangementPlayerContext!.arrangement;
            arrangement.subscribe(this.titleChangeSubscription as Subscription);

            const selectionManager = this.servicesContext!.selectionManager;
            selectionManager.subscribe(this.onSelectionChange as Subscription);

        }
    };

    private onEditEnd = () => {
        this.setState({ editingTitle: false });
        this.justFinishedEditingTitle = true;
        setTimeout(() => {
            return this.justFinishedEditingTitle = false;
        }, 100);
    };

    private onClickEditTitle = () => {
        if (!this.justFinishedEditingTitle) {
            this.setState({ editingTitle: true });
        }
    };

    private titleChangeSubscription = () => {
        const arrangement = this.arrangementPlayerContext!.arrangement;
        this.setState({ title: arrangement.title });
    };

    private onPlaybackStateChange = () => {
        this.setState({ playing: eventEngine.state === "playing" });
    };

    private onSelectionChange = () => {
        const selectionManager = this.servicesContext!.selectionManager;
        Overlay.toggleOverlay("selection_controls", selectionManager.selections.size ? "show" : "hide");
    };
}
