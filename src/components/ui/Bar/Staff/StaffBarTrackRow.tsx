/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import type {
    ISbDmTrack,
    ITimeParamsView, ScoreBookDataModel
} from "../../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../../player/types.js";
import { requisitions } from "../../../../supplement/Requisitions.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { StaffNoteViewer } from "../../Note/StaffNoteViewer.js";

export interface IStaffBarTrackRowProps extends ICommonUIProperties {
    track: ISbDmTrack;
    barNumber: number;
    timeParams: ITimeParamsView;

    trackPlayer: TrackPlayer;
    arrangementPlayer: ArrangementPlayer;
    touchEditingEnabled: boolean;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

interface IStaffBarTrackRowState {
    readonly changeCount: number;
}

/**
 * Renders one track's notes for a single bar in staff mode.
 */
export class StaffBarTrackRow extends UIComponent<IStaffBarTrackRowProps, IStaffBarTrackRowState> {
    public constructor(props: IStaffBarTrackRowProps) {
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
        const { arrangementPlayer, barNumber, timeParams, track } = this.props;

        const measure = track.measures[barNumber - 1];
        const baseSteps = measure.steps.length
            - measure.subdivisions.reduce((sum, s) => {
                return sum + s.actual - s.normal;
            }, 0);

        const maxNoteLine = Math.max(1, ...Object.values(track.instrument.noteStyles).map((ns) => {
            return ns.noteLine ?? 1;
        }));

        const rowClassName = this.generateFinalClassName([
            "bar-track-row",
            "staff-mode",
        ]);

        return (
            <StaffNoteViewer
                className={rowClassName}
                isLastBar={barNumber === timeParams.length}
                timeSignature={timeParams.timeSignature}
                scoreMetrics={arrangementPlayer.scoreMetrics}
                baseSteps={baseSteps}
                measure={measure}
                maxNoteLine={maxNoteLine}
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
