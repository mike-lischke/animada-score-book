/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import pauseIcon from "../../../assets/images/icons/pause.svg";
import pencilIcon from "../../../assets/images/icons/pencil_white.svg";
import playIcon from "../../../assets/images/icons/play.svg";

import type { ComponentChild } from "preact";

import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { EventEngine } from "../../../player/EventEngine.js";
import type { ScoreBookUiServices } from "../../../ui/AnimadaScoreBookUi.js";
import { ExpandingSpacer } from "../ExpandingSpacer.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Overlay } from "../Overlay.js";
import { SelectionControls } from "../SelectionControls.js";
import { SmallSpacer } from "../SmallSpacer.js";
import { TimeControls } from "./TimeControls.js";
import { UndoRedoControls } from "./UndoRedoControls.js";

export interface IArrangementControlsTopProps extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer,
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

interface IArrangementControlsTopState {
    playing: boolean;
    editingTitle: boolean;
    title: string;
}

export class ArrangementControlsTop extends UIComponent<IArrangementControlsTopProps, IArrangementControlsTopState> {
    private eventEngineUnsubscribe?: () => void;
    private selectionChangeUnsubscribe?: () => void;
    private arrangementUnsubscribe?: () => void;
    private justFinishedEditingTitle = false;

    public constructor(props: IArrangementControlsTopProps) {
        super(props);

        this.state = {
            playing: EventEngine.instance.state === "playing",
            editingTitle: false,
            title: props.arrangementPlayer.arrangementView.title,
        };
    }

    public override componentDidMount(): void {
        const { arrangementPlayer: arrangementPlayerContext, services } = this.props;

        this.eventEngineUnsubscribe = EventEngine.instance.subscribe(this.onPlaybackStateChange);
        const arrangement = arrangementPlayerContext.arrangementView;
        this.arrangementUnsubscribe = arrangement.subscribe(this.titleChangeSubscription);
        this.selectionChangeUnsubscribe = services.selectionManager.subscribe(this.onSelectionChange);
    }

    public override componentWillUnmount(): void {
        this.eventEngineUnsubscribe?.();
        this.selectionChangeUnsubscribe?.();
        this.arrangementUnsubscribe?.();
    }

    public override render(): ComponentChild {
        const { arrangementPlayer, services, undoManager } = this.props;
        const { playing } = this.state;

        const arrangement = arrangementPlayer.arrangementView;

        return (
            <>
                <div className="arrangement-controls arrangement-controls-top">
                    {
                        playing ? (
                            <Button
                                imageOnly
                                className="playback-control push-button"
                                onClick={() => {
                                    EventEngine.instance.stop();
                                }}>
                                <img src={pauseIcon} alt="stop" />
                            </Button>
                        ) : (
                            <Button
                                imageOnly
                                className="playback-control push-button"
                                onClick={() => {
                                    void EventEngine.instance.play();
                                }}>
                                <img src={playIcon} alt="play" />
                            </Button>
                        )
                    }
                    <SmallSpacer />
                    <TimeControls arrangementView={arrangement} undoManager={undoManager} />
                    <SmallSpacer />

                    <div className='other-controls-wrapper'>
                        <Button
                            className="push-button medium gray edit-title-button"
                            onClick={this.onClickEditTitle}
                        >
                            T&nbsp;<img src={pencilIcon} style={{ height: "0.78em" }} />
                        </Button>
                        <SmallSpacer />
                        <UndoRedoControls undoManager={undoManager} />
                    </div>

                    <SmallSpacer />
                    <ExpandingSpacer />

                    <Overlay name="selection_controls">
                        <SelectionControls
                            arrangementPlayer={arrangementPlayer}
                            services={services}
                            undoManager={undoManager}
                        />
                    </Overlay>
                </div>
            </>
        );
    }

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
        const { arrangementPlayer: arrangementPlayerContext } = this.props;

        const arrangement = arrangementPlayerContext.arrangementView;
        this.setState({ title: arrangement.title });
    };

    private onPlaybackStateChange = () => {
        this.setState({ playing: EventEngine.instance.state === "playing" });
    };

    private onSelectionChange = () => {
        const { services } = this.props;

        const selectionManager = services.selectionManager;
        Overlay.toggleOverlay("selection_controls", selectionManager.selections.size ? "show" : "hide");
    };
};
