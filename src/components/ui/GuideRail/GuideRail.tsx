/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import type { ISbDmArrangement } from "../../../core/ScoreBookDataModel.js";
import type { ITimeParams } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { Container } from "../framework/Container.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { TimingViewer } from "./TimingViewer.js";

export type BarDivisibility = 1 | 2 | 4;

export interface IGuideRailProps extends ICommonUIProperties {
    arrangementView: Readonly<ISbDmArrangement>;
}

interface IGuideRailState {
    barDivisibility: BarDivisibility;
}

export class GuideRail extends UIComponent<IGuideRailProps, IGuideRailState> {

    public constructor(props: IGuideRailProps) {
        super(props);

        this.state = {
            barDivisibility: this.getBarDivisibility(props.arrangementView.timeParams)
        };
    }

    public override componentDidMount(): void {
        requisitions.register("timeParamsChanged", this.handleTimeParamsChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("timeParamsChanged", this.handleTimeParamsChanged);
    }

    public override render(): ComponentChild {
        const { arrangementView } = this.props;
        const { barDivisibility } = this.state;

        return (
            <Container
                className='guiderail'
            >
                {arrangementView.timeParams.timings.map((timing) => {
                    return <TimingViewer
                        timing={timing}
                        key={`${timing.bar}.${timing.step}`}
                        timeParams={arrangementView.timeParams}
                        barDivisibility={barDivisibility}
                    />;
                })}
            </Container>
        );
    }

    private getBarDivisibility(timeParams: Readonly<ITimeParams>): BarDivisibility {
        const beatsPerBar = Number(timeParams.timeSignature.split("/")[0]);
        if (beatsPerBar % 4 === 0) {
            return 4;
        }

        if (beatsPerBar % 2 === 0) {
            return 2;
        }

        return 1;
    }

    private handleTimeParamsChanged = (): Promise<boolean> => {
        const { arrangementView } = this.props;

        this.setState({
            barDivisibility: this.getBarDivisibility(arrangementView.timeParams)
        });

        return Promise.resolve(true);
    };
}
