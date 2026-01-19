/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ChildAlignment, ChildWrap, Orientation } from "./ui-types.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

import { type ComponentChild } from "preact";

export interface IContainerProperties extends ICommonUIProperties {
    orientation?: Orientation;
    mainAlignment?: ChildAlignment;
    crossAlignment?: ChildAlignment;
    wrap?: ChildWrap;
    scrollPosition?: number;

    innerRef?: preact.RefObject<HTMLDivElement>;
}

/** A grouping element with flex layout. */
export class Container extends UIComponent<IContainerProperties> {

    public static override defaultProps = {
        orientation: Orientation.LeftToRight,
    };

    public override componentDidUpdate(): void {
        const { innerRef, scrollPosition } = this.props;

        if (scrollPosition !== undefined) {
            innerRef?.current?.scrollTo({ left: 0, top: scrollPosition });
        }
    }

    public render(): ComponentChild {
        const { id, children, style, orientation, mainAlignment, crossAlignment, wrap, innerRef, onClick } = this.props;

        const newStyle = {
            flexDirection: orientation,
            justifyContent: mainAlignment,
            alignItems: crossAlignment,
            flexWrap: wrap,
            ...style,
        };

        const className = this.generateFinalClassName([
            "container",
        ]);

        return (
            <div
                id={id}
                ref={innerRef}
                style={newStyle}
                className={className}
                onClick={onClick}
            >
                {children}
            </ div>
        );
    }

}
