/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import type {
    ISbDmTrack,
    ITimeParamsView, ScoreBookDataModel
} from "../../../../core/ScoreBookDataModel.js";
import type { ArrangementPlayer } from "../../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../../player/TrackPlayer.js";
import { requisitions } from "../../../../supplement/Requisitions.js";
import type { ScoreElementRegistry } from "../../../../ui/ScoreElementRegistry.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { StaffNoteViewer } from "../../Note/StaffNoteViewer.js";

export interface IStaffMeasureTrackRowProps extends ICommonUIProperties {
    track: ISbDmTrack;
    barNumber: number;
    timeParams: ITimeParamsView;

    trackPlayer: TrackPlayer;
    arrangementPlayer: ArrangementPlayer;
    inEditMode: boolean;
    dataModel: ScoreBookDataModel;
    scoreElementRegistry?: ScoreElementRegistry;
}

interface IStaffMeasureTrackRowState {
    readonly changeCount: number;
}

/**
 * Renders one track's notes for a single measure in staff mode.
 */
export class StaffMeasureTrackRow extends UIComponent<IStaffMeasureTrackRowProps, IStaffMeasureTrackRowState> {
    public constructor(props: IStaffMeasureTrackRowProps) {
        super(props);

        this.state = { changeCount: 0 };
    }

    public override componentDidMount(): void {
        requisitions.register("trackChanged", this.handleTrackChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("trackChanged", this.handleTrackChanged);
    }

    public override render(): ComponentChild {
        const { arrangementPlayer, barNumber, timeParams, track, scoreElementRegistry } = this.props;

        const measure = track.measures[barNumber - 1];
        const baseSteps = measure.meter.stepResolution;

        const maxNoteLine = Math.max(1, ...Object.values(track.instrument.noteStyles).map((ns) => {
            return ns.noteLine ?? 1;
        }));

        const rowClassName = this.generateFinalClassName(["staff-measure-track-row"]);

        return (
            <StaffNoteViewer
                className={rowClassName}
                isLastBar={barNumber === timeParams.length}
                timeSignature={timeParams.timeSignature}
                scoreMetrics={arrangementPlayer.scoreMetrics}
                baseSteps={baseSteps}
                measure={measure}
                barNumber={barNumber}
                trackId={track.id}
                maxNoteLine={maxNoteLine}
                scoreElementRegistry={scoreElementRegistry}
            />
        );
    }

    private handleTrackChanged = (trackId: number): Promise<boolean> => {
        const { track } = this.props;

        if (trackId !== track.id) {
            return Promise.resolve(false);
        }

        const { changeCount } = this.state;
        this.setState({ changeCount: changeCount + 1 });

        return Promise.resolve(true);
    };

}
