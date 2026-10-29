/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { AnimationEngine, IAnimationFrameStats } from "../../../ui/AnimationEngine.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface IAnimationDiagnosticsProps extends ICommonUIProperties {
    engine: AnimationEngine;
}

interface IAnimationDiagnosticsState {
    stats: IAnimationFrameStats;
}

export class AnimationDiagnostics extends UIComponent<IAnimationDiagnosticsProps, IAnimationDiagnosticsState> {
    private unsubscribe?: () => void;

    public constructor(props: IAnimationDiagnosticsProps) {
        super(props);

        this.state = { stats: props.engine.frameStats };
    }

    public override componentDidMount(): void {
        this.subscribeToEngine();
    }

    public override componentDidUpdate(previousProps: IAnimationDiagnosticsProps): void {
        const { engine } = this.props;
        if (previousProps.engine !== engine) {
            this.subscribeToEngine();
        }
    }

    public override componentWillUnmount(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
    }

    public render(): ComponentChild {
        const { stats } = this.state;
        const fps = stats.framesPerSecond.toFixed(1);
        const frameAverage = stats.averageFrameIntervalMs.toFixed(2);
        const frameMaximum = stats.maximumFrameIntervalMs.toFixed(2);
        const animationAverage = stats.averageAnimationDurationMs.toFixed(2);
        const animationMaximum = stats.maximumAnimationDurationMs.toFixed(2);
        const visualDeltaAverage = stats.averageVisualDeltaPx.toFixed(2);
        const visualDeltaMaximum = stats.maximumVisualDeltaPx.toFixed(2);

        return (
            <div className="animation-diagnostics">
                <strong>Animation diagnostics</strong>
                <span>RAF: {fps} fps</span>
                <span>Frame: {frameAverage} ms avg / {frameMaximum} ms max</span>
                <span>Animation work: {animationAverage} ms avg / {animationMaximum} ms max</span>
                <span>Playhead delta: {visualDeltaAverage} px avg / {visualDeltaMaximum} px max per frame</span>
                <span>Missed frame slots: {stats.missedFrameCount}</span>
            </div>
        );
    }

    private handleStats = (stats: IAnimationFrameStats): void => {
        this.setState({ stats });
    };

    private subscribeToEngine(): void {
        const { engine } = this.props;
        this.unsubscribe?.();
        this.setState({ stats: engine.frameStats });
        this.unsubscribe = engine.subscribeFrameStats(this.handleStats);
    }
}
