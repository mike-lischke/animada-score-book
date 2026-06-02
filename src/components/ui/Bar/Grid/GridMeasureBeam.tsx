/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";

export interface IGridMeasureBeamProps extends ICommonUIProperties {
    measureNumber: number;

    /** Center-X of the first note of each beat, in px relative to the viewer's left edge. */
    beatPositions: number[];
    isFirstMeasure: boolean;
    isLastMeasure: boolean;
}

/**
 * Renders a horizontal beam above the track rows of a single measure, with vertical tick marks at each beat
 * position. Tick positions are supplied by the parent after DOM measurement, so they are exact regardless of
 * time signature or whether the measure is stretched to fill the viewport.
 */
export class GridMeasureBeam extends UIComponent<IGridMeasureBeamProps> {
    public override render(): ComponentChild {
        const { measureNumber, beatPositions, isFirstMeasure, isLastMeasure } = this.props;

        const className = this.generateFinalClassName(["grid-measure-beam"]);

        // Beam line boundaries: span full width by default; trim at the first/last beat on edge measures.
        const beamLeft = (isFirstMeasure && beatPositions.length > 0)
            ? `${beatPositions[0]}px`
            : "0";
        const beamRight = (isLastMeasure && beatPositions.length > 0)
            ? `calc(100% - ${beatPositions[beatPositions.length - 1]}px)`
            : "0";

        const style = { "--beam-left": beamLeft, "--beam-right": beamRight } as CSSProperties;

        return (
            <div className={className} style={style}>
                <div
                    className="grid-measure-number"
                    style={beatPositions.length > 0
                        ? { right: `calc(100% - ${beatPositions[0]}px + 4px)` }
                        : { left: "4px" }}
                >
                    {measureNumber}
                </div>
                {beatPositions.map((x, i) => {
                    const beatClassName = `grid-measure-beat${i === 0 ? " bar-start" : ""}`;

                    return (
                        <div key={i} className={beatClassName} style={{ left: `${x}px` }} />
                    );
                })}
            </div>
        );
    }
}
