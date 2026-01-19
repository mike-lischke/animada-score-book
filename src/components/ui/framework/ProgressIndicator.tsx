/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { Container } from "./Container.js";
import { ChildAlignment, Orientation } from "./ui-types.js";

interface IProgressIndicatorProperties extends ICommonUIProperties {
    /** The opacity of the indicator host container (default: 1). */
    backgroundOpacity?: number;

    /** True for a linear indicator, false for a circular one (default: false). */
    linear?: boolean;

    /**
     * A value between 0 and 1 (inclusive, default: undefined).
     * If no position is specified, the indicator will be indeterminate.
     */
    position?: number;

    /**
     * Manually specify a width and height value for the indicator itself (not the host).
     * If not given default values are used, depending on the indicator style.
     * For circular indicators both values should be equal.
     */
    indicatorWidth?: number;
    indicatorHeight?: number;

    stroke?: number;
}

export class ProgressIndicator extends UIComponent<IProgressIndicatorProperties> {

    public render(): ComponentChild {
        const {
            id, backgroundOpacity = 1, linear = false, position, indicatorWidth,
            indicatorHeight, style, stroke,
        } = this.props;
        const className = this.generateFinalClassName(["progressIndicatorHost"]);

        const strokeWidth = stroke ?? 5; // Only for circles.

        let indicator;
        let width = indicatorWidth ?? 400;
        let height = indicatorHeight ?? 10;
        if (linear) {
            const barClassName = position == null ? "linear animated" : "linear";
            indicator = <div className="linearBackground">
                <div className={barClassName} />
            </div>;
        } else {
            width = indicatorWidth ?? 80;
            height = indicatorHeight ?? 80;

            const circleClassName = position == null ? "circleBackground animated" : "circleBackground";
            const radius = (width - (2 * strokeWidth)) / 2;
            const offset = (width - strokeWidth) / 2;
            indicator = <svg className={circleClassName}>
                <circle cx={offset} cy={offset} r={radius} />
                <circle cx={offset} cy={offset} r={radius} />
            </svg>;
        }

        const indicatorStyle = {
            "opacity": backgroundOpacity,
            "--position": position ?? 0,
            "--width": width,
            "--height": height,
            "--strokeWidth": strokeWidth,
            ...style,
        };

        return (
            <Container
                id={id}
                className={className}
                orientation={Orientation.TopDown}
                mainAlignment={ChildAlignment.Center}
                crossAlignment={ChildAlignment.Center}
                style={indicatorStyle}
            >
                {indicator}
            </Container>
        );
    }
}
