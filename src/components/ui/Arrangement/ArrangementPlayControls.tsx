/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild, createRef } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { Button } from "../framework/Button.js";
import { CheckState, Toggle } from "../framework/Toggle.js";
import { UIIcon } from "../framework/UIIcon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { Popup } from "../framework/Popup.js";
import { Slider } from "../framework/Slider.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { PlayStopButton } from "./PlayStopButton.js";

/** Playback tempo bounds and step, in beats per minute. */
const tempoMin = 30;
const tempoMax = 200;
const tempoStep = 5;

export interface IArrangementPlayControlsProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer,
    dataModel: ScoreBookDataModel;
    editMode: boolean;
}

interface IArrangementPlayControlsState {
    currentVolume: number;
    currentTempo: number;

    /** The tempo as stored in the arrangement (last persisted value). Used to detect playback deviations. */
    scoreTempo: number;
}

export class ArrangementPlayControls
    extends UIComponent<IArrangementPlayControlsProperties, IArrangementPlayControlsState> {
    private settingsButtonRef = createRef<HTMLButtonElement | null>();
    private settingsPopupRef = createRef<Popup | null>();

    public constructor(props: IArrangementPlayControlsProperties) {
        super(props);

        const arrangementView = props.dataModel.arrangement!;
        const tempo = arrangementView.timeParams.tempo;
        this.state = {
            currentVolume: arrangementView.mainVolume,
            currentTempo: tempo,
            scoreTempo: tempo,
        };
    }

    public override componentDidUpdate(previousProps: Readonly<IArrangementPlayControlsProperties>,
        previousState: Readonly<IArrangementPlayControlsState>): void {
        const { arrangementPlayer, dataModel, editMode } = this.props;
        const { scoreTempo } = this.state;

        const arrangement = dataModel.arrangement!;

        // A new arrangement (and player) was loaded (e.g., New Song) — re-sync the tempo baseline so the
        // edit-mode restore below does not overwrite the new score with a stale tempo.
        if (previousProps.arrangementPlayer !== arrangementPlayer) {
            this.setState({
                currentTempo: arrangement.timeParams.tempo,
                scoreTempo: arrangement.timeParams.tempo,
            });

            return;
        }

        // When entering edit mode, restore the arrangement tempo so the user edits from the saved baseline.
        if (!previousProps.editMode && editMode) {
            arrangement.timeParams.tempo = scoreTempo;
            this.setState({ currentTempo: scoreTempo });

            return;
        }

        // Sync currentTempo when the arrangement tempo changes externally (undo/redo in edit mode,
        // or arrangement reload). In edit mode also keep scoreTempo in sync.
        if (previousState.currentTempo !== arrangement.timeParams.tempo) {
            if (editMode) {
                this.setState({
                    currentTempo: arrangement.timeParams.tempo,
                    scoreTempo: arrangement.timeParams.tempo,
                });
            } else {
                this.setState({ currentTempo: arrangement.timeParams.tempo });
            }
        }
    }

    public override shouldComponentUpdate(nextProps: Readonly<IArrangementPlayControlsProperties>,
        nextState: Readonly<IArrangementPlayControlsState>): boolean {
        const { arrangementPlayer, dataModel, editMode } = this.props;
        const { currentVolume, currentTempo, scoreTempo } = this.state;

        if (arrangementPlayer !== nextProps.arrangementPlayer) {
            return true;
        }

        if (dataModel !== nextProps.dataModel) {
            return true;
        }

        if (editMode !== nextProps.editMode) {
            return true;
        }

        if (currentVolume !== nextState.currentVolume) {
            return true;
        }

        if (currentTempo !== nextState.currentTempo) {
            return true;
        }

        if (scoreTempo !== nextState.scoreTempo) {
            return true;
        }

        return false;
    }

    public override render(): ComponentChild {
        const { arrangementPlayer, dataModel, editMode } = this.props;
        const { currentVolume, currentTempo, scoreTempo } = this.state;

        const arrangementView = dataModel.arrangement!;
        const tempoDeviates = !editMode && currentTempo !== scoreTempo;

        const tempoCaption = tempoDeviates ? `${currentTempo}*` : `${currentTempo}`;
        const tempoTooltip = tempoDeviates
            ? `Playback tempo (${currentTempo} bpm) differs from the arrangement tempo (${scoreTempo} bpm).`
            + " Enter Edit Mode to persist the change."
            : "Playback tempo (beats per minute)";

        return (
            <Container
                id="arrangementPlayControls"
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.Start}
                crossAlignment={ChildAlignment.Center}
                gap={8}
                style={{ width: "max-content" }}
                {...this.dataAttributes}
            >
                <PlayStopButton id="playbackButton" arrangementPlayer={arrangementPlayer} />
                <Container
                    className="tempoStepper"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    gap={2}
                    data-tooltip={tempoTooltip}
                >
                    <Icon src={UIIcon.Pulse} data-tooltip="inherit" />
                    <Label className="tempoUnit" caption="BPM" data-tooltip="inherit" />
                    <Button
                        compact
                        plain
                        className="tempoStepButton"
                        caption="-"
                        data-tooltip="Decrease playback tempo"
                        disabled={currentTempo <= tempoMin}
                        onClick={this.handleTempoDown}
                    />
                    <Label className="tempoValue" caption={tempoCaption} data-tooltip="inherit" />
                    <Button
                        compact
                        plain
                        className="tempoStepButton"
                        caption="+"
                        data-tooltip="Increase playback tempo"
                        disabled={currentTempo >= tempoMax}
                        onClick={this.handleTempoUp}
                    />
                </Container>
                <Toggle
                    className="playControlToggle"
                    data-tooltip="Loop playback"
                    checkState={arrangementView.loop ? CheckState.Checked : CheckState.Unchecked}
                    checkedIcon={<Icon src={UIIcon.Check} />}
                    uncheckedIcon={<Icon src={UIIcon.Close} />}
                    onChange={(event, checkState) => {
                        arrangementView.loop = checkState === CheckState.Checked;
                        AppStorage.saveSetting("loop", arrangementView.loop);
                    }}
                />
                <Toggle
                    className="playControlToggle"
                    data-tooltip="Metronome"
                    checkState={arrangementView.useMetronome ? CheckState.Checked : CheckState.Unchecked}
                    checkedIcon={<Icon src={UIIcon.Check} />}
                    uncheckedIcon={<Icon src={UIIcon.Close} />}
                    onChange={(event, checkState) => {
                        arrangementView.useMetronome = checkState === CheckState.Checked;
                        AppStorage.saveSetting("metronome", arrangementView.useMetronome);
                    }}
                />
                <Container
                    className="volumeControl"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    gap={4}
                    data-tooltip="Master volume"
                >
                    <Icon src={UIIcon.Unmute} data-tooltip="inherit" />
                    <Slider
                        id="volumeSlider"
                        value={currentVolume}
                        min={0}
                        max={100}
                        data-tooltip="inherit"
                        className="du-range-xs"
                        style={{ width: "90px" }}
                        onChange={(value) => {
                            arrangementView.mainVolume = value;
                            this.setState({ currentVolume: arrangementView.mainVolume }, () => {
                                AppStorage.saveSetting("masterVolume", arrangementView.mainVolume);
                            });
                        }}
                    />
                    <Label
                        className="volumeValue"
                        caption={`${Math.round(currentVolume)}%`}
                        data-tooltip="inherit"
                    />
                </Container>
                <Button
                    id="playbackSettingsButton"
                    plain
                    compact
                    imageOnly
                    innerRef={this.settingsButtonRef}
                    className="playControlSettingsButton"
                    data-tooltip="Playback settings"
                    onClick={this.handleSettingsClick}
                >
                    <Icon src={UIIcon.Gear} data-tooltip="inherit" />
                </Button>
                <Popup
                    id="playbackSettingsPopup"
                    ref={this.settingsPopupRef}
                    className="playbackSettingsPopup"
                    placement={ComponentPlacement.TopRight}
                    showArrow={false}
                >
                    <Container
                        className="playbackSettings"
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Stretch}
                        gap={8}
                    >
                        <Container
                            className="playControlSetting"
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                            gap={6}
                        >
                            <Toggle
                                id="countInToggle"
                                data-tooltip="Play a count-in before playback starts"
                                checkState={arrangementView.countIn ? CheckState.Checked : CheckState.Unchecked}
                                checkedIcon={<Icon src={UIIcon.Check} />}
                                uncheckedIcon={<Icon src={UIIcon.Close} />}
                                onChange={(event, checkState) => {
                                    arrangementView.countIn = checkState === CheckState.Checked;
                                    AppStorage.saveSetting("countIn", arrangementView.countIn);
                                }}
                            />
                            <Label caption="Count In" />
                        </Container>
                    </Container>
                </Popup>
            </Container>
        );
    }

    private handleTempoChange(delta: number): void {
        const { dataModel, editMode } = this.props;
        const { currentTempo } = this.state;

        const value = Math.min(tempoMax, Math.max(tempoMin, currentTempo + delta));
        if (value === currentTempo) {
            return;
        }

        const arrangementView = dataModel.arrangement!;
        if (editMode) {
            dataModel.setTempo(value);
            this.setState({ currentTempo: value, scoreTempo: value });
        } else {
            this.setState({ currentTempo: value });
            arrangementView.timeParams.tempo = value;
        }
    }

    private handleTempoDown = (): void => {
        this.handleTempoChange(-tempoStep);
    };

    private handleTempoUp = (): void => {
        this.handleTempoChange(tempoStep);
    };

    private handleSettingsClick = (): void => {
        const popup = this.settingsPopupRef.current;
        const button = this.settingsButtonRef.current;
        if (!popup || !button) {
            return;
        }

        if (popup.isOpen) {
            popup.close(true);
        } else {
            popup.open(button);
        }
    };
};
