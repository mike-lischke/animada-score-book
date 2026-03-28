/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { Button } from "../framework/Button.js";
import { Checkbox } from "../framework/Checkbox.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Grid } from "../framework/Grid.js";
import { GridCell } from "../framework/GridCell.js";
import { Icon } from "../framework/Icon.js";
import { Image, PredefinedImage } from "../framework/Image.js";
import { Label } from "../framework/Label.js";
import { Slider } from "../framework/Slider.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface IArrangementPlayControlsProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer,
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

interface IArrangementPlayControlsState {
    playing: boolean;
    editingTitle: boolean;
    title: string;

    currentVolume: number;
    currentTempo: number;
}

export class ArrangementPlayControls
    extends UIComponent<IArrangementPlayControlsProperties, IArrangementPlayControlsState> {
    public constructor(props: IArrangementPlayControlsProperties) {
        super(props);

        const arrangementView = props.arrangementPlayer.arrangementView;
        this.state = {
            playing: props.arrangementPlayer.state === "playing",
            editingTitle: false,
            title: arrangementView.title,
            currentVolume: arrangementView.mainVolume,
            currentTempo: arrangementView.timeParams.tempo,
        };
    }

    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;

        this.addSubscription(arrangementPlayer, this.onPlaybackStateChange, true);
        const arrangement = arrangementPlayer.arrangementView;
        this.addSubscription(arrangement, this.titleChangeSubscription);
    }

    public override componentDidUpdate(previousProps: Readonly<IArrangementPlayControlsProperties>,
        previousState: Readonly<IArrangementPlayControlsState>): void {
        const { arrangementPlayer } = this.props;

        this.addSubscription(arrangementPlayer, this.onPlaybackStateChange, true);
        const arrangement = arrangementPlayer.arrangementView;
        if (previousState.currentTempo !== arrangement.timeParams.tempo) {
            this.setState({ currentTempo: arrangement.timeParams.tempo });
        }
    }

    public override render(): ComponentChild {
        const { arrangementPlayer, undoManager } = this.props;
        const { playing, currentVolume, currentTempo } = this.state;

        const arrangementView = arrangementPlayer.arrangementView;

        let playButton;
        if (playing) {
            playButton = (
                <Button
                    imageOnly
                    round
                    id="playbackButton"
                    data-tooltip="Stop playback"
                    onClick={() => {
                        arrangementPlayer.stop();
                    }}>
                    <Image key="pauseButton" src={PredefinedImage.PauseImage} data-tooltip="inherit" />
                </Button>
            );
        } else {
            playButton = (
                <Button
                    imageOnly
                    round
                    id="playbackButton"
                    className="softButton shadow-md"
                    data-tooltip="Start playback with the selected tempo and volume settings."
                    onClick={() => {
                        arrangementPlayer.play(undefined, arrangementView.loop);
                    }}>
                    <Image key="playButton" src={PredefinedImage.PlayImage} data-tooltip="inherit" />
                </Button>
            );
        }

        return (
            <Container id="arrangementPlayControls">
                <Grid id="mainPlayControls" columns={["max-content", "max-content"]} className="pl-8 pr-8" equalHeight>
                    <GridCell mainAlignment={ChildAlignment.Center} crossAlignment={ChildAlignment.Center}>
                        {playButton}
                    </GridCell>
                    <GridCell></GridCell>
                    <GridCell></GridCell>
                    <GridCell
                        mainAlignment={ChildAlignment.Center}
                        crossAlignment={ChildAlignment.Center}
                        style={{ width: "50px" }} // To ensure both grid columns have the same width.
                    >
                        <Button
                            imageOnly
                            round
                            id="recordButton"
                            className="softButton shadow-md"
                            data-tooltip="Record your song and export it as an MP3 file."
                            onClick={this.startRecording}
                        >
                            <Image key="recordButton" src={PredefinedImage.Record} data-tooltip="inherit" />
                        </Button>
                    </GridCell>
                </Grid>
                <Container
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Center}
                    data-tooltip="Master volume for playback"
                    style={{ width: "50px" }}
                >
                    <Icon src={Codicon.Unmute} data-tooltip="inherit" />
                    <Slider
                        id="volumeSlider"
                        value={currentVolume / 100}
                        vertical
                        orientation="decreasing"
                        data-tooltip="inherit"
                        onChange={(value) => {
                            arrangementView.mainVolume = Math.round(value * 100);
                            this.setState({ currentVolume: arrangementView.mainVolume }, () => {
                                AppStorage.saveSetting("masterVolume", arrangementView.mainVolume);
                            });
                        }}
                    />
                    <Label caption={`${currentVolume}%`} style={{ fontSize: "80%", marginTop: "4px" }} />
                </Container>
                <Container
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Center}
                    data-tooltip="Tempo for playback (beats per minute)"
                    style={{ width: "50px" }}
                >
                    <Icon src={Codicon.Pulse} data-tooltip="inherit" />
                    <Slider
                        id="tempoSlider"
                        value={(currentTempo - 30) / 270}
                        vertical
                        orientation="decreasing"
                        data-tooltip="inherit"
                        onChange={(value) => {
                            const tempo = Math.round(30 + (270 * value));
                            this.setState({ currentTempo: tempo });
                            undoManager.edit({
                                type: "EditCommand_TimeParamsTempo",
                                timeParams: arrangementView.timeParams,
                                tempo: tempo
                            });

                        }}
                    />
                    <Label caption={`${currentTempo} bpm`} style={{ fontSize: "80%", marginTop: "4px" }} />
                </Container>
                <Container
                    orientation={Orientation.TopDown}
                    mainAlignment={ChildAlignment.SpaceEvenly}
                    crossAlignment={ChildAlignment.Start}
                    style={{ marginLeft: "30px" }}
                >
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        data-tooltip="Loop Playback"
                        gap={4}
                    >
                        <Icon
                            src={Codicon.DebugRerun}
                            data-tooltip="inherit"
                            style={{ margin: "0 4px" }}
                        />
                        <Checkbox
                            data-tooltip="inherit"
                            checked={arrangementView.loop}
                            onChange={(checked) => {
                                arrangementView.loop = checked;
                                AppStorage.saveSetting("loop", checked);
                            }}
                        />
                        <Label caption="Loop" style={{ marginLeft: "4px" }} data-tooltip="inherit" />
                    </Container>
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        data-tooltip="Loop Playback"
                        gap={4}
                    >
                        <Image
                            key="metronomeButton"
                            src={PredefinedImage.Metronome}
                            data-tooltip="inherit"
                            width={24}
                            height={24}
                        />
                        <Checkbox
                            data-tooltip="inherit"
                            checked={arrangementView.useMetronome}
                            onChange={(checked) => {
                                arrangementView.useMetronome = checked;
                                AppStorage.saveSetting("metronome", checked);
                            }}
                        />
                        <Label
                            caption="Metronome"
                            style={{ marginLeft: "4px" }}
                            data-tooltip="inherit" />
                    </Container>
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        data-tooltip="Count in before playback starts"
                        gap={4}
                    >
                        <Image
                            key="countInButton"
                            src={PredefinedImage.CountIn}
                            data-tooltip="inherit"
                            width={24}
                            height={24}
                        />
                        <Checkbox
                            data-tooltip="inherit"
                            checked={arrangementView.countIn}
                            onChange={(checked) => {
                                arrangementView.countIn = checked;
                                AppStorage.saveSetting("countIn", checked);
                            }}
                        />
                        <Label
                            caption="Count In"
                            style={{ marginLeft: "4px" }}
                            data-tooltip="inherit"
                        />
                    </Container>
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
        const { arrangementPlayer } = this.props;
        this.setState({ playing: arrangementPlayer.state === "playing" });
    };

    private startRecording = () => {
        const { arrangementPlayer } = this.props;
        void arrangementPlayer.renderToBlob().then((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${arrangementPlayer.arrangementView.title}.mp3`;
            a.click();
            URL.revokeObjectURL(url);
        });
    };
};
