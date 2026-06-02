/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ITimeParamsView } from "../../../../core/ScoreBookDataModel.js";
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
        const { timeParams } = this.props;
        this.addSubscription(timeParams, this.timeParamsChanged);
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

    private timeParamsChanged = () => {
        this.forceUpdate();
    };
}
