/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import type {
    ISbDmTrack,
    ITimeParamsView, ScoreBookDataModel
} from "../../../../core/ScoreBookDataModel.js";
import { StaffRowGeometry, type IStaffRowGeometry } from "../../../../core/StaffRowGeometry.js";
import type { IRangeArticulation } from "../../../../core/types/general.js";
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

    /** The measure column's layout width in px at 100 % zoom, which a beam's slope is derived from. */
    measureWidth: number;

    /** The track's shared row geometry, so every measure lays the track out at the same height. */
    rowGeometry: IStaffRowGeometry;

    trackPlayer: TrackPlayer;
    arrangementPlayer: ArrangementPlayer;
    inEditMode: boolean;
    dataModel: ScoreBookDataModel;
    scoreElementRegistry?: ScoreElementRegistry;

    /** The hairpins and `f` markings to draw for this row, which only the print view supplies. */
    articulations?: readonly IRangeArticulation[];
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
        const { arrangementPlayer, barNumber, dataModel, measureWidth, rowGeometry, timeParams, track,
            scoreElementRegistry, articulations } = this.props;

        const measure = track.measures[barNumber - 1];
        const baseSteps = measure.meter.stepResolution;

        const maxNoteLine = StaffRowGeometry.maxNoteLineOf(track);

        const rowClassName = this.generateFinalClassName(["staff-measure-track-row"]);
        const repeatBars = dataModel.arrangement?.repeatBars;

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
                measureWidth={measureWidth}
                rowGeometry={rowGeometry}
                repeatBars={repeatBars}
                scoreElementRegistry={scoreElementRegistry}
                articulations={articulations}
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
