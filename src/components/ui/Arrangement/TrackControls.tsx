/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import type { Mutable } from "../../../core/types/general.js";
import { AppStorage } from "../../../core/AppStorage.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { CheckState, Toggle } from "../framework/Toggle.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { NoteImage, NoteLength } from "../framework/NoteImage.js";
import { SplitSlider } from "../framework/SplitSlider.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface ITrackControlsProperties extends ICommonUIProperties {
    tracks: ISbDmTrack[];
    innerRef?: preact.RefObject<HTMLDivElement>;
}

interface ITrackControlsState {
    mixerExpanded: boolean;
    trackViewMode: "grid" | "staff";
}

/** Icon and track-specific controls. */
export class TrackControls extends UIComponent<ITrackControlsProperties, ITrackControlsState> {
    public constructor(props: ITrackControlsProperties) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const trackViewMode = settings.viewSettings?.arrangementViewSettings?.displayMode ?? "grid";

        this.state = {
            mixerExpanded: false,
            trackViewMode,
        };
    }

    public override componentDidMount(): void {
        this.recomputeEffectiveVolumes();
    }

    public override componentDidUpdate(prevProps: ITrackControlsProperties, prevState: ITrackControlsState): void {
        super.componentDidUpdate(prevProps, prevState);

        const { tracks } = this.props;
        if (prevProps.tracks !== tracks) {
            this.recomputeEffectiveVolumes();
        }
    }

    public render() {
        const { tracks, innerRef } = this.props;
        const { mixerExpanded, trackViewMode } = this.state;

        const listClassName = this.generateFinalClassName([
            "trackControlsList",
            this.classFromProperty(mixerExpanded, "expanded"),
            "rounded-xl shadow-md border border-base-200",
        ]);

        const controls = tracks.map((track) => {
            const instrumentName = track.instrument.displayName;
            const iconPath = track.instrument.image.filePath;

            return (
                <Container
                    key={track.id}
                    className="trackControls"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Container
                        className="trackSliderArea"
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Start}
                    >
                        <span className="trackInstrumentName">{instrumentName}</span>
                        <SplitSlider
                            className="trackVolumeSlider"
                            value={track.volume}
                            fillValue={track.effectiveVolume}
                            min={0}
                            max={2}
                            splitPoint={1}
                            showFill
                            onChange={(value) => {
                                this.handleTrackVolumeChange(track, value);
                            }}
                        />
                        <div className="trackVolumeLegend" aria-hidden>
                            <span className="trackVolumeLegendLeft">◀︎ Mute</span>
                            <span className="trackVolumeLegendRight">Focus ▶︎</span>
                        </div>
                    </Container>
                    <Container
                        className="trackInstrumentShell"
                        style={{ borderColor: track.instrument.color }}
                        mainAlignment={ChildAlignment.Center}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Icon
                            className="trackInstrumentIcon"
                            src={iconPath}
                            alt={instrumentName}
                            width={40}
                            height={40}
                        />
                    </Container>
                </Container>
            );

        });

        return (
            <Container innerRef={innerRef} className={listClassName} orientation={Orientation.TopDown}>
                <Container className="trackControlsHeader" crossAlignment={ChildAlignment.Center}>
                    <Button
                        className="trackControlsToggle"
                        imageOnly
                        onClick={this.toggleMixer}
                    >
                        <Icon src={Codicon.Settings} width={16} height={16} alt="Collapse mixer" />
                    </Button>
                    <Container
                        className="trackViewModeToggleGroup"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Toggle
                            className="trackViewModeToggle toggle-xs"
                            vertical
                            checkState={trackViewMode === "staff" ? CheckState.Checked : CheckState.Unchecked}
                            onChange={this.handleTrackViewModeToggle}
                        />
                        <Container
                            className="trackViewModeIcons"
                            orientation={Orientation.TopDown}
                            crossAlignment={ChildAlignment.Center}
                            mainAlignment={ChildAlignment.SpaceBetween}
                        >
                            <div className="trackViewModeGridIcon" aria-label="Show grid view" />
                            <NoteImage
                                className="trackViewModeStaffIcon"
                                value={NoteLength.Quarter}
                                width={12}
                                height={18}
                                alt="Show staff view"
                            />
                        </Container>
                    </Container>
                </Container>
                <Container
                    className="trackControlsPanel"
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    {controls}
                </Container>
            </Container>
        );
    }

    private toggleMixer = () => {
        this.setState((previousState) => {
            return { mixerExpanded: !previousState.mixerExpanded };
        });
    };

    private handleTrackViewModeToggle = (_e: InputEvent, checkState: CheckState) => {
        const mode = checkState === CheckState.Checked ? "staff" : "grid";

        const settings = AppStorage.loadUISettings() ?? {};
        settings.viewSettings ??= {};
        settings.viewSettings.arrangementViewSettings ??= {};
        settings.viewSettings.arrangementViewSettings.displayMode = mode;
        AppStorage.saveUISettings(settings);

        this.setState({ trackViewMode: mode });
        void requisitions.execute("trackViewModeToggled", mode);
    };

    private handleTrackVolumeChange = (track: ISbDmTrack, value: number) => {
        (track as Mutable<ISbDmTrack>).volume = Math.min(2, Math.max(0, value));
        this.recomputeEffectiveVolumes();
        this.forceUpdate();
    };

    private recomputeEffectiveVolumes = () => {
        const { tracks } = this.props;
        const highestFocusVolume = tracks.reduce((currentHighest, candidateTrack) => {
            if (candidateTrack.volume > currentHighest) {
                return candidateTrack.volume;
            }

            return currentHighest;
        }, 1);

        const nonFocusAttenuation = highestFocusVolume > 1
            ? 2 - Math.min(2, Math.max(1, highestFocusVolume))
            : 1;

        tracks.forEach((candidateTrack) => {
            const mutableTrack = candidateTrack as Mutable<ISbDmTrack>;

            if (candidateTrack.volume > 1) {
                mutableTrack.effectiveVolume = 1;

                return;
            }

            const normalVolume = Math.min(1, Math.max(0, candidateTrack.volume));
            mutableTrack.effectiveVolume = normalVolume * nonFocusAttenuation;
        });
    };
}
