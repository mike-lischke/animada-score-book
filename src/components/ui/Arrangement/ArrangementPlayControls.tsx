/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { Button } from "../framework/Button.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { UIIcon } from "../framework/UIIcon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { Slider } from "../framework/Slider.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { MetronomeIcon } from "./MetronomeIcon.js";
import { PlayStopButton } from "./PlayStopButton.js";

/** Playback tempo bounds and step, in beats per minute. */
const tempoMin = 30;
const tempoMax = 200;
const tempoStep = 5;

export interface IArrangementPlayControlsProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer,
    dataModel: ScoreBookDataModel;
    editMode: boolean;

    /** True when the bar folds its secondary controls into a menu. */
    compact?: boolean;
}

interface IArrangementPlayControlsState {
    currentVolume: number;
    currentTempo: number;

    /** The tempo as stored in the arrangement (last persisted value). Used to detect playback deviations. */
    scoreTempo: number;

    /** The arrangement's switches, mirrored here because writing them does not re-render this component. */
    loop: boolean;
    useMetronome: boolean;
    countIn: boolean;
}

/** The glyph of a playback switch: either an MDI icon or one of our own drawings. */
type SwitchGlyph = UIIcon | typeof MetronomeIcon;

export class ArrangementPlayControls
    extends UIComponent<IArrangementPlayControlsProperties, IArrangementPlayControlsState> {

    public constructor(props: IArrangementPlayControlsProperties) {
        super(props);

        const arrangementView = props.dataModel.arrangement!;
        const tempo = arrangementView.timeParams.tempo;
        this.state = {
            currentVolume: arrangementView.mainVolume,
            currentTempo: tempo,
            scoreTempo: tempo,
            loop: arrangementView.loop,
            useMetronome: arrangementView.useMetronome,
            countIn: arrangementView.countIn,
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
                loop: arrangement.loop,
                useMetronome: arrangement.useMetronome,
                countIn: arrangement.countIn,
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
        const { arrangementPlayer, dataModel, editMode, compact } = this.props;
        const { currentVolume, currentTempo, scoreTempo, loop, useMetronome, countIn } = this.state;

        if (arrangementPlayer !== nextProps.arrangementPlayer) {
            return true;
        }

        if (dataModel !== nextProps.dataModel) {
            return true;
        }

        if (editMode !== nextProps.editMode || compact !== nextProps.compact) {
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

        if (loop !== nextState.loop || useMetronome !== nextState.useMetronome || countIn !== nextState.countIn) {
            return true;
        }

        return false;
    }

    public override render(): ComponentChild {
        const { arrangementPlayer, editMode, compact = false } = this.props;
        const { currentVolume, currentTempo, scoreTempo, loop, useMetronome, countIn } = this.state;

        const tempoDeviates = !editMode && currentTempo !== scoreTempo;

        const tempoCaption = tempoDeviates ? `${currentTempo}*` : `${currentTempo}`;
        const tempoTooltip = tempoDeviates
            ? `Playback tempo (${currentTempo} bpm) differs from the arrangement tempo (${scoreTempo} bpm).`
            + " Enter Edit Mode to persist the change."
            : "Playback tempo (beats per minute)";

        let playbackOptions: ComponentChild;
        if (compact) {
            playbackOptions = this.renderOverflow(loop, useMetronome, countIn, currentVolume);
        } else {
            playbackOptions = <>
                {this.renderSwitch(UIIcon.Repeat, "Loop playback", loop, this.handleLoopToggle)}
                {this.renderSwitch(MetronomeIcon, "Metronome", useMetronome, this.handleMetronomeToggle)}
                {this.renderSwitch(UIIcon.AccountVoice, "Play a count-in before playback starts", countIn,
                    this.handleCountInToggle)}
                {this.renderVolume(currentVolume)}
            </>;
        }

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
                    gap={4}
                    title={tempoTooltip}
                >
                    <Label className="tempoUnit" caption="BPM" />
                    <Button
                        compact
                        plain
                        className="tempoStepButton"
                        title="Decrease playback tempo"
                        disabled={currentTempo <= tempoMin}
                        onClick={this.handleTempoDown}
                    >
                        <Icon src={UIIcon.HorizontalRule} />
                    </Button>
                    <Label className="tempoValue" caption={tempoCaption} />
                    <Button
                        compact
                        plain
                        className="tempoStepButton"
                        title="Increase playback tempo"
                        disabled={currentTempo >= tempoMax}
                        onClick={this.handleTempoUp}
                    >
                        <Icon src={UIIcon.Add} />
                    </Button>
                </Container>
                {playbackOptions}
            </Container>
        );
    }

    /**
     * Renders the bar's secondary controls as menu entries.
     *
     * @param loop Whether looping is on.
     * @param useMetronome Whether the metronome is on.
     * @param countIn Whether a count-in plays before playback.
     * @param volume The master volume in percent.
     *
     * @returns The overflow menu.
     */
    private renderOverflow(loop: boolean, useMetronome: boolean, countIn: boolean,
        volume: number): ComponentChild {
        const items: IDropdownItem[] = [
            {
                label: "Loop playback",
                icon: <Icon src={UIIcon.Repeat} />,
                detail: loop ? "On" : "Off",
                onClick: this.handleLoopToggle,
            },
            {
                label: "Metronome",
                icon: <MetronomeIcon style={{ width: 16, height: 16 }} />,
                detail: useMetronome ? "On" : "Off",
                onClick: this.handleMetronomeToggle,
            },
            {
                label: "Count-in",
                icon: <Icon src={UIIcon.AccountVoice} />,
                detail: countIn ? "On" : "Off",
                onClick: this.handleCountInToggle,
            },
            {
                label: "Volume",
                icon: <Icon src={UIIcon.Unmute} />,
                detail: this.renderVolume(volume, true),
                onClick: () => {
                    // The slider in the detail is this row's control.
                },
            },
        ];

        const active = loop || useMetronome || countIn;
        let statusDot: ComponentChild;
        if (active) {
            statusDot = <span className="playbackOverflowDot" />;
        }

        const icon = <span className="playbackOverflowIcon">
            <Icon src={UIIcon.Ellipsis} />
            {statusDot}
        </span>;

        return <Dropdown
            className="playbackOverflowMenu"
            icon={icon}
            title="More playback controls"
            items={items}
        />;
    }

    /**
     * Renders the master volume control.
     *
     * @param volume The master volume in percent.
     * @param inline True for the menu row, which has no pill of its own.
     *
     * @returns The volume control.
     */
    private renderVolume(volume: number, inline = false): ComponentChild {
        const slider = <Slider
            id={inline ? undefined : "volumeSlider"}
            value={volume}
            min={0}
            max={100}
            className="du-range-xs"
            style={{ width: "90px" }}
            onChange={this.handleVolumeChange}
        />;

        if (inline) {
            return <span className="playbackVolumeItem" onKeyDown={(e) => {
                e.stopPropagation();
            }}>
                {slider}
                <Label className="volumeValue" caption={`${Math.round(volume)}%`} />
            </span>;
        }

        return <Container
            className="volumeControl"
            orientation={Orientation.LeftToRight}
            crossAlignment={ChildAlignment.Center}
            gap={4}
            title="Master volume"
        >
            <Icon src={UIIcon.Unmute} />
            {slider}
            <Label className="volumeValue" caption={`${Math.round(volume)}%`} />
        </Container>;
    }

    private handleVolumeChange = (value: number): void => {
        const { dataModel } = this.props;
        const arrangementView = dataModel.arrangement!;

        arrangementView.mainVolume = value;
        AppStorage.saveSetting("masterVolume", arrangementView.mainVolume);
        this.setState({ currentVolume: arrangementView.mainVolume });
    };

    /**
     * Renders one of the bar's switches in the shape of the header's edit-mode switch.
     *
     * @param glyph The glyph of the switch.
     * @param tooltip The text the tooltip shows.
     * @param checked Whether the switch is on.
     * @param onChange Invoked when the switch is flipped.
     *
     * @returns The switch.
     */
    private renderSwitch(glyph: SwitchGlyph, tooltip: string, checked: boolean, onChange: () => void): ComponentChild {
        const className = this.generateFinalClassName([
            "playControlSwitch",
            this.classFromProperty(checked, "is-active"),
        ]);

        const icon = typeof glyph === "number"
            ? <Icon src={glyph} alt={tooltip} />
            : <MetronomeIcon alt={tooltip} />;

        const status = <span className="playControlSwitchDot" />;

        return (
            <Button className={className} title={tooltip} onClick={onChange}>
                {icon}
                {status}
            </Button>
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

    private handleLoopToggle = (): void => {
        const { dataModel } = this.props;
        const { loop } = this.state;

        const value = !loop;
        dataModel.arrangement!.loop = value;
        AppStorage.saveSetting("loop", value);
        this.setState({ loop: value });
    };

    private handleMetronomeToggle = (): void => {
        const { dataModel } = this.props;
        const { useMetronome } = this.state;

        const value = !useMetronome;
        dataModel.arrangement!.useMetronome = value;
        AppStorage.saveSetting("metronome", value);
        this.setState({ useMetronome: value });
    };

    private handleCountInToggle = (): void => {
        const { dataModel } = this.props;
        const { countIn } = this.state;

        const value = !countIn;
        dataModel.arrangement!.countIn = value;
        AppStorage.saveSetting("countIn", value);
        this.setState({ countIn: value });
    };
};
