/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ITimeParamsView } from "../../../../core/ScoreBookDataModel.js";
import { requisitions } from "../../../../supplement/Requisitions.js";
import { Container } from "../../framework/Container.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { TimingViewer } from "../../GuideRail/TimingViewer.js";
import { type BarDivisibility } from "../../GuideRail/GuideRail.js";

export interface IBarGuideRailProps extends ICommonUIProperties {
    barNumber: number;
    timeParams: ITimeParamsView;
    barDivisibility: BarDivisibility;
}

/** Renders the guide rail timings for a single bar. */
export class BarGuideRail extends UIComponent<IBarGuideRailProps> {
    public override componentDidMount(): void {
        requisitions.register("timeParamsChanged", this.handleTimeParamsChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("timeParamsChanged", this.handleTimeParamsChanged);
    }

    public override render(): ComponentChild {
        const { barNumber, timeParams, barDivisibility } = this.props;

        const timings = timeParams.timings.filter((t) => {
            return t.bar === barNumber;
        });

        return (
            <Container className="guiderail">
                {timings.map((timing) => {
                    return (
                        <TimingViewer
                            timing={timing}
                            key={`${timing.bar}.${timing.step}`}
                            timeParams={timeParams}
                            barDivisibility={barDivisibility}
                        />
                    );
                })}
            </Container>
        );
    }

    private handleTimeParamsChanged = (): Promise<boolean> => {
        this.forceUpdate();

        return Promise.resolve(true);
    };
}
