/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import type { IArrangement, ITimeParamsView } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { TimingViewer } from "./TimingViewer.js";

export type BarDivisibility = 1 | 2 | 4;

export interface IGuideRailProps extends ICommonUIProperties {
    arrangementView: Readonly<IArrangement>;
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
        const { arrangementView } = this.props;
        this.addSubscription(arrangementView.timeParams, this.timeParamsSubscription);
    }

    public override render(): ComponentChild {
        const { arrangementView } = this.props;
        const { barDivisibility } = this.state;

        return (
            <div className='guiderail-wrapper'>
                <div className='guiderail-meta'></div>
                <div className='guiderail'>
                    {arrangementView.timeParams.timings.map((timing) => {
                        return <TimingViewer
                            timing={timing}
                            key={`${timing.bar}.${timing.step}`}
                            timeParams={arrangementView.timeParams}
                            barDivisibility={barDivisibility}
                        />;
                    })}
                </div>
            </div>
        );
    }

    private getBarDivisibility(timeParams: ITimeParamsView): BarDivisibility {
        const beatsPerBar = Number(timeParams.timeSignature.split("/")[0]);
        if (beatsPerBar % 4 === 0) {
            return 4;
        }

        if (beatsPerBar % 2 === 0) {
            return 2;
        }

        return 1;
    }

    private timeParamsSubscription = () => {
        const { arrangementView } = this.props;

        this.setState({
            barDivisibility: this.getBarDivisibility(arrangementView.timeParams)
        });
    };
}
