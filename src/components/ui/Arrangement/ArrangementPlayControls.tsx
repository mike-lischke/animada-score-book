/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { Button } from "../framework/Button.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Grid } from "../framework/Grid.js";
import { GridCell } from "../framework/GridCell.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { UpDown } from "../framework/UpDown.js";
import { ChildAlignment } from "../framework/ui-types.js";

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
            playing: props.arrangementPlayer.state === "playing",
            editingTitle: false,
            title: props.arrangementPlayer.arrangementView.title,
        };
    }

    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;

        this.addSubscription(arrangementPlayer, this.onPlaybackStateChange);
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
                        arrangementPlayer.stop();
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
                        arrangementPlayer.play();
                    }}>
                    <Icon src={Codicon.DebugStart} />
                </Button>
            );
        }

        return (
            <Grid columns={["auto", "40px", "auto", "auto", "auto", "60px"]} id="arrangementPlayControls" >
                <GridCell crossAlignment={ChildAlignment.Center}>
                    <Label>Play your score: </Label>
                </GridCell>
                <GridCell>
                    {playButton}
                </GridCell>
                <GridCell crossAlignment={ChildAlignment.Center}>
                    <Label>@</Label>
                </GridCell>
                <GridCell>
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
                </GridCell>
                <GridCell crossAlignment={ChildAlignment.Center}>bpm</GridCell>
                <GridCell rowSpan={2} crossAlignment={ChildAlignment.Center}>
                    <Container id="timeSignatureDisplay" data-tooltip="Time signature">
                        {arrangementView.timeParams.timeSignature}
                    </Container>
                </GridCell>
                <GridCell crossAlignment={ChildAlignment.Center}>
                    <Label>Record your Score</Label>
                </GridCell>
                <GridCell crossAlignment={ChildAlignment.Center}>
                    <Button
                        imageOnly
                        id="recordButton"
                        data-tooltip="Record your song and export it as an MP3 file."
                        onClick={this.startRecording}
                    >
                        <Icon src={Codicon.Record} data-tooltip="inherit" />
                    </Button>
                </GridCell>
            </Grid>
        );
    }

    private titleChangeSubscription = () => {
        const { arrangementPlayer: arrangementPlayerContext } = this.props;

        const arrangement = arrangementPlayerContext.arrangementView;
        this.setState({ title: arrangement.title });
    };

    private onPlaybackStateChange = () => {
        const { arrangementPlayer } = this.props;
        this.setState({ playing: arrangementPlayer.state === "playing" });
    };

    private startRecording = () => {
        const { arrangementPlayer } = this.props;
        arrangementPlayer.playBars(4, 1, true);

        // arrangementPlayer.startRecording();
    };
};
