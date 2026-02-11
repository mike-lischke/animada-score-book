/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import pauseIcon from "../../../assets/images/icons/pause.svg";
import pencilIcon from "../../../assets/images/icons/pencil_white.svg";
import playIcon from "../../../assets/images/icons/play.svg";

import type { ComponentChild, ContextType } from "preact";

import { EventEngine } from "../../../player/EventEngine.js";
import { ExpandingSpacer } from "../ExpandingSpacer.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Overlay } from "../Overlay.js";
import { ServicesContext } from "../ScoreBookViewer.js";
import { SelectionControls } from "../SelectionControls.js";
import { ShareButton } from "../ShareButton.js";
import { SmallSpacer } from "../SmallSpacer.js";
import { ArrangementTitle } from "./ArrangementTitle.js";
import { ArrangementPlayerContext } from "./ArrangementViewer.js";
import { TimeControls } from "./TimeControls.js";
import { UndoRedo } from "./UndoRedo.js";

export interface IArrangementControlsTopProps extends ICommonUIProperties {
    arrangementPlayerContext?: ContextType<typeof ArrangementPlayerContext>,
    servicesContext?: ContextType<typeof ServicesContext>,
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
            title: "",
        };
    }

    public override componentDidMount(): void {
        this.eventEngineUnsubscribe = EventEngine.instance.subscribe(this.onPlaybackStateChange);
    }

    public override componentDidUpdate(): void {
        const { arrangementPlayerContext, servicesContext } = this.props;

        this.selectionChangeUnsubscribe?.();
        this.arrangementUnsubscribe?.();

        const arrangement = arrangementPlayerContext?.arrangementView;
        this.arrangementUnsubscribe = arrangement?.subscribe(this.titleChangeSubscription);
        this.selectionChangeUnsubscribe = servicesContext?.selectionManager.subscribe(this.onSelectionChange);
    }

    public override componentWillUnmount(): void {
        this.eventEngineUnsubscribe?.();
        this.selectionChangeUnsubscribe?.();
        this.arrangementUnsubscribe?.();
    }

    public override render(): ComponentChild {
        const { arrangementPlayerContext } = this.props;
        const { playing, editingTitle, title } = this.state;

        const arrangement = arrangementPlayerContext!.arrangementView;
        const titleVisible = title.length > 0 || editingTitle;

        return (
            <>
                <div className={titleVisible ? "" : "hidden"}>
                    <ArrangementTitle editMode={editingTitle} onEditEnd={this.onEditEnd} />
                </div>
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
                    <TimeControls arrangementView={arrangement} />
                    <SmallSpacer />

                    <div className='other-controls-wrapper'>
                        <Button
                            className="push-button medium gray edit-title-button"
                            onClick={this.onClickEditTitle}
                        >
                            T&nbsp;<img src={pencilIcon} style={{ height: "0.78em" }} />
                        </Button>
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
        const { arrangementPlayerContext } = this.props;
        const arrangement = arrangementPlayerContext!.arrangementView;
        this.setState({ title: arrangement.title });
    };

    private onPlaybackStateChange = () => {
        this.setState({ playing: EventEngine.instance.state === "playing" });
    };

    private onSelectionChange = () => {
        const { servicesContext } = this.props;
        const selectionManager = servicesContext!.selectionManager;
        Overlay.toggleOverlay("selection_controls", selectionManager.selections.size ? "show" : "hide");
    };
};
