/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { EventEngine } from "../../../player/EventEngine.js";
import type { ScoreBookUiServices } from "../../../ui/AnimadaScoreBookUi.js";
import { Button } from "../framework/Button.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { UpDown } from "../framework/UpDown.js";

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

export class ArrangementPlayControls extends UIComponent<IArrangementControlsTopProps, IArrangementControlsTopState> {
    public constructor(props: IArrangementControlsTopProps) {
        super(props);

        this.state = {
            playing: EventEngine.instance.state === "playing",
            editingTitle: false,
            title: props.arrangementPlayer.arrangementView.title,
        };
    }

    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;

        this.addSubscription(EventEngine.instance, this.onPlaybackStateChange);
        const arrangement = arrangementPlayer.arrangementView;
        this.addSubscription(arrangement, this.titleChangeSubscription);
    }

    public override render(): ComponentChild {
        const { arrangementPlayer, undoManager } = this.props;
        const { playing } = this.state;

        const arrangementView = arrangementPlayer.arrangementView;

        let playButton;
        if (playing) {
            playButton = (
                <Button
                    imageOnly
                    id="playbackButton"
                    onClick={() => {
                        EventEngine.instance.stop();
                    }}>
                    <Icon src={Codicon.DebugPause} />
                </Button>
            );
        } else {
            playButton = (
                <Button
                    imageOnly
                    id="playbackButton"
                    onClick={() => {
                        void EventEngine.instance.play();
                    }}>
                    <Icon src={Codicon.DebugStart} />
                </Button>
            );
        }

        return (
            <Container
                id="arrangementPlayControls"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <Label>Play your score: </Label>
                {playButton}
                <Label>@</Label>
                <UpDown
                    id="tempo-input"
                    value={arrangementView.timeParams.tempo}
                    min={40}
                    step={10}
                    onChange={(newValue) => {
                        undoManager.edit({
                            type: "EditCommand_TimeParamsTempo",
                            timeParams: arrangementView.timeParams,
                            tempo: newValue
                        });
                    }}
                />
                <span>bpm</span>
                <Container id="timeSignatureDisplay" data-tooltip="Time signature">
                    {arrangementView.timeParams.timeSignature}
                </Container>
            </Container>
        );
    }

    private titleChangeSubscription = () => {
        const { arrangementPlayer: arrangementPlayerContext } = this.props;

        const arrangement = arrangementPlayerContext.arrangementView;
        this.setState({ title: arrangement.title });
    };

    private onPlaybackStateChange = () => {
        this.setState({ playing: EventEngine.instance.state === "playing" });
    };

};
