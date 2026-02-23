/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ITiming } from "../../../core/ScoreBookDataModel.js";
import type { ITimeParams, ITimeParamsView } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NoteViewer } from "../Note/NoteViewer.js";
import { type BarDivisibility } from "./GuideRail.js";

export interface ITimingViewerProperties extends ICommonUIProperties {
    timing: ITiming;
    timeParams: ITimeParams;
    barDivisibility: BarDivisibility;
}

export class TimingViewer extends UIComponent<ITimingViewerProperties> {
    public override render(): ComponentChild {
        const { timing, timeParams, barDivisibility } = this.props;

        const isStartOfBar = timing.step === 1;

        const timingLabel = this.getTimingText(timeParams, barDivisibility, timing, isStartOfBar);

        const { bar, step } = timing;
        const { timeSignature, stepResolution } = timeParams;
        const className = `guiderail-timing note-width ` +
            `${NoteViewer.getParityClass(bar, step, timeSignature, stepResolution)} ` +
            (isStartOfBar ? "startOfBar" : "");

        return (
            <div className={className} >
                <div className='guiderail-timing-content'>
                    {timingLabel}
                </div>
            </div>
        );
    }

    private getTimingText(timeParams: ITimeParamsView, barDivisibility: BarDivisibility, timing: ITiming,
        isStartOfBar: boolean): string {
        const { timeSignature, stepResolution } = timeParams;

        const { bar, step } = timing;

        if (isStartOfBar) {
            return bar.toString();
        }

        if (barDivisibility === 1) {
            return "";
        }

        const stepFromZero = step - 1; // Steps count from 1, but we need to do math starting from 0 below

        if (barDivisibility === 2) {
            const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value) => {
                return Number(value);
            });
            const stepsPerBeat = stepResolution / beatUnit;
            const stepsPerBar = stepsPerBeat * beatsPerBar;

            if ((stepFromZero % stepsPerBar) / stepsPerBar === 0.5) {
                return `${bar}.2`;
            }
        }

        if (barDivisibility === 4) {
            const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value) => {
                return Number(value);
            });
            const stepsPerBeat = stepResolution / beatUnit;
            const stepsPerBar = stepsPerBeat * beatsPerBar;

            if ((stepFromZero % stepsPerBar) / stepsPerBar === 0.25) {
                return `${bar}.2`;
            }

            if ((stepFromZero % stepsPerBar) / stepsPerBar === 0.5) {
                return `${bar}.3`;
            }

            if ((stepFromZero % stepsPerBar) / stepsPerBar === 0.75) {
                return `${bar}.4`;
            }
        }

        return "";
    }
}
