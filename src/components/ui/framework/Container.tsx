/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ChildAlignment, ChildWrap, Orientation } from "./ui-types.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

import { type ComponentChild, type CSSProperties } from "preact";

export interface IContainerProperties extends ICommonUIProperties {
    orientation?: Orientation;
    mainAlignment?: ChildAlignment;
    crossAlignment?: ChildAlignment;
    wrap?: ChildWrap;
    scrollPosition?: number;
    gap?: number | string;

    innerRef?: preact.RefObject<HTMLDivElement>;
}

/** A grouping element with flex layout. */
export class Container extends UIComponent<IContainerProperties> {

    public static override defaultProps = {
        orientation: Orientation.LeftToRight,
    };

    public override componentDidUpdate(prevProps: IContainerProperties): void {

        const { innerRef, scrollPosition } = this.props;

        if (scrollPosition !== undefined) {
            innerRef?.current?.scrollTo({ left: 0, top: scrollPosition });
        }
    }

    public render(): ComponentChild {
        const {
            id, children, style, orientation, mainAlignment, crossAlignment, wrap, innerRef,
            onClick, onDblClick, onPointerDown, onPointerUp, onPointerMove, onPointerEnter, onPointerLeave,
            onDragStart, onDragEnd,
            title, gap, onScroll,
        } = this.props;

        const newStyle: CSSProperties = { ...style };
        if (orientation !== undefined) {
            newStyle.flexDirection = orientation;
        }

        if (mainAlignment !== undefined) {
            newStyle.justifyContent = mainAlignment;
        }

        if (crossAlignment !== undefined) {
            newStyle.alignItems = crossAlignment;
        }

        if (wrap !== undefined) {
            newStyle.flexWrap = wrap;
        }

        if (gap !== undefined) {
            newStyle.gap = gap;
        }

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
                onDblClick={onDblClick}
                onScroll={onScroll}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerMove={onPointerMove}
                onPointerEnter={onPointerEnter}
                onPointerLeave={onPointerLeave}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                title={title}
                {...this.dataAttributes}
            >
                {children}
            </div>
        );
    }

}
