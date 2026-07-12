/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ITiming } from "../../../core/ScoreBookDataModel.js";
import type { ITimeParams } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { getParityClass } from "../../../core/utils.js";
import { type BarDivisibility } from "./GuideRail.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment } from "../framework/ui-types.js";

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
        const className = this.generateFinalClassName([
            "guiderail-timing",
            "note-width",
            getParityClass(bar, step, timeSignature, stepResolution),
            this.classFromProperty(isStartOfBar, ["", "startOfBar"])
        ]);

        return (
            <Container className={className} crossAlignment={ChildAlignment.Center}>
                <div className='guiderail-timing-content'>
                    {timingLabel}
                </div>
            </Container>
        );
    }

    private getTimingText(timeParams: Readonly<ITimeParams>, barDivisibility: BarDivisibility, timing: ITiming,
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
