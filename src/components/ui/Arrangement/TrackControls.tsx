/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { AppStorage } from "../../../core/AppStorage.js";
import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import type { Mutable } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import {
    SelectionGranularity, type ISelectionDelta, type ISelectionEntry, type ISelectionHitTester,
} from "../../../ui/selection-types.js";
import { Button } from "../framework/Button.js";
import { UIIcon } from "../framework/UIIcon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { NoteImage, NoteLength } from "../framework/NoteImage.js";
import { SplitSlider } from "../framework/SplitSlider.js";
import { CheckState, Toggle } from "../framework/Toggle.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface ITrackControlsProperties extends ICommonUIProperties {
    tracks: ISbDmTrack[];
    selectionManager: SelectionManager;
    innerRef?: preact.RefObject<HTMLDivElement>;
}

interface ITrackControlsState {
    mixerExpanded: boolean;
    trackViewMode: "grid" | "staff";

    /** Track IDs that are currently selected via Track granularity. */
    selectedTrackIds: ReadonlySet<number>;
}

/** Icon and track-specific controls. */
export class TrackControls extends UIComponent<ITrackControlsProperties, ITrackControlsState>
    implements ISelectionHitTester {
    public constructor(props: ITrackControlsProperties) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const trackViewMode = settings.viewSettings?.arrangementViewSettings?.displayMode ?? "grid";

        this.state = {
            mixerExpanded: false,
            trackViewMode,
            selectedTrackIds: new Set(),
        };
    }

    public override componentDidMount(): void {
        const { selectionManager } = this.props;
        selectionManager.registerHitTester(this);
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        this.recomputeEffectiveVolumes();
    }

    public override componentWillUnmount(): void {
        const { selectionManager } = this.props;
        selectionManager.unregisterHitTester(this);
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
    }

    public override componentDidUpdate(prevProps: ITrackControlsProperties, prevState: ITrackControlsState): void {

        const { tracks } = this.props;
        if (prevProps.tracks !== tracks) {
            this.recomputeEffectiveVolumes();
        }
    }

    public hitTest(rect: DOMRect): ISelectionEntry[] {
        const { tracks } = this.props;
        const element = this.base as HTMLElement | null;
        if (!element) {
            return [];
        }

        const rows = element.querySelectorAll<HTMLElement>(".trackControls");
        const entries: ISelectionEntry[] = [];

        for (let i = 0; i < rows.length; i++) {
            const rowRect = rows[i].getBoundingClientRect();
            if (rect.right >= rowRect.left && rect.left <= rowRect.right
                && rect.bottom >= rowRect.top && rect.top <= rowRect.bottom) {
                const track = tracks[i];
                entries.push({
                    granularity: SelectionGranularity.Track,
                    bar: 0,
                    trackId: track.id,
                });
            }
        }

        return entries;
    }

    public render() {
        const { tracks, innerRef } = this.props;
        const { mixerExpanded, trackViewMode, selectedTrackIds } = this.state;

        const listClassName = this.generateFinalClassName([
            "trackControlsList",
            this.classFromProperty(mixerExpanded, "expanded"),
            "rounded-xl shadow-md border border-base-200",
        ]);

        const controls = tracks.map((track) => {
            const instrumentName = track.instrument.displayName;
            const iconPath = track.instrument.image.filePath;
            const isSelected = selectedTrackIds.has(track.id);

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
                        {isSelected && <div className="track-controls-selection-overlay" />}
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
            <Container
                innerRef={innerRef}
                className={listClassName}
                orientation={Orientation.TopDown}
                data-tutorial="mixer"
            >
                <Container className="trackControlsHeader" crossAlignment={ChildAlignment.Center}>
                    <Button
                        className="trackControlsToggle"
                        imageOnly
                        onClick={this.toggleMixer}
                    >
                        <Icon src={UIIcon.Settings} width={16} height={16} alt="Collapse mixer" />
                    </Button>
                    <Container
                        className="trackViewModeToggleGroup"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Toggle
                            className="trackViewModeToggle du-toggle-xs"
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

    private toggleMixer = (e: MouseEvent | KeyboardEvent) => {
        this.setState((previousState) => {
            return { mixerExpanded: !previousState.mixerExpanded };
        });
        e.stopPropagation();
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

    private handleSelectionChanged = (_delta: ISelectionDelta): Promise<boolean> => {
        const { selectionManager } = this.props;
        const selectedTrackIds = new Set<number>();

        for (const entry of selectionManager.currentSelection.values()) {
            if (entry.granularity === SelectionGranularity.Track && entry.trackId > 0) {
                selectedTrackIds.add(entry.trackId);
            }
        }

        this.setState({ selectedTrackIds });

        return Promise.resolve(true);
    };

}
