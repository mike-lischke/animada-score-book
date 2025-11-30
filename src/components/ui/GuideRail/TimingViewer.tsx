/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { ArrangementPlayerContext } from "../Arrangement/ArrangementViewer.js";
import { ComponentBase, type IComponentProperties } from "../ComponentBase/ComponentBase.js";
import { NoteViewer } from "../Note/NoteViewer.js";
import { BarDivisibilityContext, type BarDivisibility } from "./GuideRail.js";
import type { ITimeParamsView, ITiming } from "../../../core/types/general.js";

export interface ITimingViewerProps extends IComponentProperties {
    timing: ITiming;
}

export class TimingViewer extends ComponentBase<ITimingViewerProps> {
    public override render(): ComponentChild {
        const { timing } = this.props;

        const isStartOfBar = timing.step === 1;

        return (
            <BarDivisibilityContext.Consumer>
                {(barDivisibility) => {
                    return (
                        <ArrangementPlayerContext.Consumer>
                            {(arrangementPlayerContext) => {
                                const timeParams = arrangementPlayerContext!.arrangement.timeParams;
                                const timingLabel = this.useTimingLabel(timeParams, barDivisibility!, timing,
                                    isStartOfBar);
                                const classes = this.useClasses(timeParams, timing, isStartOfBar);

                                return (<div className={classes} >
                                    <div className='guiderail-timing-content'>
                                        {timingLabel}
                                    </div>
                                </div>);
                            }}
                        </ArrangementPlayerContext.Consumer>
                    );
                }}
            </BarDivisibilityContext.Consumer>
        );
    }

    private useClasses(timeParams: ITimeParamsView, timing: ITiming, isStartOfBar: boolean): string {
        const { bar, step } = timing;
        const { timeSignature, stepResolution } = timeParams;

        return `guiderail-timing note-width ${NoteViewer.getParityClass(bar, step, timeSignature, stepResolution)} ` +
            (isStartOfBar ? "start-of-bar" : "");
    }

    private useTimingLabel(timeParams: ITimeParamsView, barDivisibility: BarDivisibility, timing: ITiming,
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
