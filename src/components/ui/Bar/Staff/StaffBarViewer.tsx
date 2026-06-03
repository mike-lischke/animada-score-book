/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement, ISbDmTrack, ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../../player/types.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { StaffBarTrackRow } from "./StaffBarTrackRow.js";
import { StaffMeasureBeam } from "./StaffMeasureBeam.js";

export interface IBarViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
    arrangementPlayer: ArrangementPlayer;
    touchEditingEnabled: boolean;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;

    /** Label explicitly set for this measure. */
    ownLabel?: string;

    /** Most-recent label from an earlier measure; shown dimmed when no ownLabel is set. */
    inheritedLabel?: string;

    /**
     * If given, render only these tracks (in this order) instead of all tracks of the arrangement.
     * Used by the print feature to limit output to the user's selection.
     */
    tracks?: ISbDmTrack[];
}

interface IBarViewerState {
    tracks: ISbDmTrack[];
}

/** Renders the staff-mode bar column with track rows only. */
export class StaffBarViewer extends UIComponent<IBarViewerProps, IBarViewerState> {
    public constructor(props: IBarViewerProps) {
        super(props);

        const { arrangement, tracks } = props;
        this.state = {
            tracks: tracks ?? [...arrangement.tracks],
        };
    }

    public override componentDidMount(): void {
        const { arrangement } = this.props;
        this.addSubscription(arrangement, this.arrangementChanged);
    }

    public override componentDidUpdate(previousProps: Readonly<IBarViewerProps>): void {
        const { arrangement, tracks } = this.props;
        if (arrangement !== previousProps.arrangement) {
            this.removeSubscription(previousProps.arrangement, this.arrangementChanged);
            this.addSubscription(arrangement, this.arrangementChanged);

            this.setState({
                tracks: tracks ?? [...arrangement.tracks],
            });
        } else if (tracks !== previousProps.tracks) {
            this.setState({
                tracks: tracks ?? [...arrangement.tracks],
            });
        }
    }

    public override render(): ComponentChild {
        const { barNumber, arrangement, arrangementPlayer, services, touchEditingEnabled, undoManager,
            dataModel, ownLabel, inheritedLabel } = this.props;
        const { tracks } = this.state;

        return (
            <div className="bar-viewer staff-mode" data-bar={barNumber}>
                <StaffMeasureBeam
                    measureNumber={barNumber}
                    ownLabel={ownLabel}
                    inheritedLabel={inheritedLabel}
                />
                {tracks.map((track) => {
                    const trackPlayer = arrangementPlayer.trackPlayers.get(track);
                    if (!trackPlayer) {
                        return null;
                    }

                    return (
                        <StaffBarTrackRow
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
        const { arrangement, tracks } = this.props;
        this.setState({ tracks: tracks ?? [...arrangement.tracks] });
    };
}
