/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext, type ComponentChild } from "preact";

import type { IArrangementView, ITimeParamsView, Subscription } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { TimingViewer } from "./TimingViewer.js";

export type BarDivisibility = 1 | 2 | 4;
export const BarDivisibilityContext = createContext<BarDivisibility | null>(null);

export interface IGuideRailProps extends ICommonUIProperties {
    arrangement: IArrangementView;
}

interface IGuideRailState {
    barDivisibility: BarDivisibility;
}

export class GuideRail extends UIComponent<IGuideRailProps, IGuideRailState> {

    public constructor(props: IGuideRailProps) {
        super(props);

        this.state = {
            barDivisibility: this.getBarDivisibility(props.arrangement.timeParams)
        };
    }

    public override componentDidMount(): void {
        const { arrangement } = this.props;
        arrangement.timeParams.subscribe(this.timeParamsSubscription as Subscription);
    }

    public override componentWillUnmount(): void {
        const { arrangement } = this.props;
        arrangement.timeParams.unsubscribe(this.timeParamsSubscription as Subscription);
    }

    public override render(): ComponentChild {
        const { arrangement } = this.props;
        const { barDivisibility } = this.state;

        // Because only time-param can change at a time, we know numBars only ever changes if numNotes also changes
        const numBars = arrangement.timeParams.length;
        const display = numBars > 1 ? "block" : "none";

        return (
            <BarDivisibilityContext.Provider value={barDivisibility} >
                <div className='guiderail-wrapper' style={{ display }}>
                    <div className='guiderail-meta'></div>
                    <div className='guiderail'>
                        {arrangement.timeParams.timings.map((timing) => {
                            return <TimingViewer timing={timing} key={`${timing.bar}.${timing.step}`} />;
                        })}
                    </div>
                    <div className="scroll-shadow left-scroll-shadow" />
                    <div className="scroll-shadow right-scroll-shadow" />
                </div>
            </BarDivisibilityContext.Provider>
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

    private timeParamsSubscription = (timeParams: ITimeParamsView) => {
        this.setState({
            barDivisibility: this.getBarDivisibility(timeParams)
        });
    };
}
