/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./Container.css";

import { Component, type ComponentChild, type CSSProperties } from "preact";

/** Content alignment on both the main axis and the cross axis. */
export enum ContentAlignment {
    Start = "flex-start",
    Center = "center",
    End = "flex-end",
    Stretch = "stretch",
    SpaceBetween = "space-between",
    SpaceEvenly = "space-evenly",
}

export enum ContentWrap {
    NoWrap = "nowrap",
    Wrap = "wrap",
    WrapReverse = "wrap-reverse",
}

/**
 * The orientation determines the order and direction of child elements.
 * Not to be confused with e.g. the left-to-right writing system.
 */
export enum Orientation {
    TopDown = "column",
    BottomUp = "column-reverse",
    LeftToRight = "row",
    RightToLeft = "row-reverse",
}

export interface IContainerProperties {
    className?: string;
    style?: CSSProperties;

    orientation?: Orientation;
    mainAlignment?: ContentAlignment;
    crossAlignment?: ContentAlignment;
    wrap?: ContentWrap;
    scrollPosition?: number;

    innerRef?: preact.RefObject<HTMLDivElement>;
}

/** A grouping element with flex layout. */
export class Container extends Component<IContainerProperties> {

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
        const { className, children, style, orientation, mainAlignment, crossAlignment, wrap, innerRef } = this.props;

        const newStyle = {
            flexDirection: orientation,
            justifyContent: mainAlignment,
            alignItems: crossAlignment,
            flexWrap: wrap,
            ...style,
        };

        return (
            <div ref={innerRef} style={newStyle} className={(className ?? "") + " container"}>
                {children}
            </ div>
        );
    }

}
