/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { AppStorage } from "../../../core/AppStorage.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { type BarDivisibility } from "../GuideRail/GuideRail.js";
import { BarGuideRail } from "./BarGuideRail.js";
import { BarTrackRow } from "./BarTrackRow.js";

export interface IBarViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
    arrangementPlayer: ArrangementPlayer;
    touchEditingEnabled: boolean;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

interface IBarViewerState {
    tracks: ISbDmTrack[];
    barDivisibility: BarDivisibility;
    trackViewMode: "grid" | "staff";
}

/**
 * Renders a single bar column: a guide rail header followed by one BarTrackRow per track.
 * Multiple BarViewers are laid out horizontally inside the arrangement scroll container.
 */
export class BarViewer extends UIComponent<IBarViewerProps, IBarViewerState> {
    public constructor(props: IBarViewerProps) {
        super(props);

        const { arrangement } = props;
        const settings = AppStorage.loadUISettings() ?? {};
        const trackViewMode = settings.viewSettings?.arrangementViewSettings?.displayMode ?? "grid";
        this.state = {
            tracks: [...arrangement.tracks],
            barDivisibility: this.getBarDivisibility(arrangement),
            trackViewMode,
        };
    }

    public override componentDidUpdate(previousProps: Readonly<IBarViewerProps>): void {
        const { arrangement } = this.props;
        if (arrangement !== previousProps.arrangement) {
            this.removeSubscription(previousProps.arrangement, this.arrangementChanged);
            this.removeSubscription(previousProps.arrangement.timeParams, this.timeParamsChanged);

            this.addSubscription(arrangement, this.arrangementChanged);
            this.addSubscription(arrangement.timeParams, this.timeParamsChanged);

            this.setState({
                tracks: [...arrangement.tracks],
                barDivisibility: this.getBarDivisibility(arrangement),
            });
        }
    }

    public override componentDidMount(): void {
        const { arrangement } = this.props;
        this.addSubscription(arrangement, this.arrangementChanged);
        this.addSubscription(arrangement.timeParams, this.timeParamsChanged);
        requisitions.register("trackViewModeToggled", this.handleTrackViewModeToggled);
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();
        requisitions.unregister("trackViewModeToggled", this.handleTrackViewModeToggled);
    }

    public override render(): ComponentChild {
        const { barNumber, arrangement, arrangementPlayer, services, touchEditingEnabled, undoManager,
            dataModel } = this.props;
        const { tracks, barDivisibility, trackViewMode } = this.state;

        const className = this.generateFinalClassName([
            "bar-viewer",
            this.classFromProperty(trackViewMode === "staff", "staff-mode"),
        ]);

        return (
            <div className={className} data-bar={barNumber}>
                <BarGuideRail
                    barNumber={barNumber}
                    timeParams={arrangement.timeParams}
                    barDivisibility={barDivisibility}
                />
                {tracks.map((track) => {
                    const trackPlayer = arrangementPlayer.trackPlayers.get(track);
                    if (!trackPlayer) {
                        return null;
                    }

                    return (
                        <BarTrackRow
                            key={track.id}
                            track={track}
                            barNumber={barNumber}
                            timeParams={arrangement.timeParams}
                            trackPlayer={trackPlayer}
                            arrangementPlayer={arrangementPlayer}
                            touchEditingEnabled={touchEditingEnabled}
                            services={services}
                            undoManager={undoManager}
                            dataModel={dataModel}
                        />
                    );
                })}
            </div>
        );
    }

    private arrangementChanged = () => {
        const { arrangement } = this.props;
        this.setState({ tracks: [...arrangement.tracks] });
    };

    private timeParamsChanged = () => {
        const { arrangement } = this.props;
        this.setState({
            barDivisibility: this.getBarDivisibility(arrangement),
        });
    };

    private handleTrackViewModeToggled = (trackViewMode: "grid" | "staff") => {
        this.setState({ trackViewMode });

        return Promise.resolve(true);
    };

    private getBarDivisibility(arrangement: ISbDmArrangement): BarDivisibility {
        const beatsPerBar = Number(arrangement.timeParams.timeSignature.split("/")[0]);

        if (beatsPerBar % 4 === 0) {
            return 4;
        }

        if (beatsPerBar % 2 === 0) {
            return 2;
        }

        return 1;
    }
}
