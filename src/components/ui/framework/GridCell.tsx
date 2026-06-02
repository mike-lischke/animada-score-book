/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import type { ChildAlignment, Orientation } from "./ui-types.js";
import { Container } from "./Container.js";

interface IGridCellProperties extends ICommonUIProperties {
    columnSpan?: number;
    rowSpan?: number;
    orientation?: Orientation;
    mainAlignment?: ChildAlignment;
    crossAlignment?: ChildAlignment;
}

/** A component representing a single cell in a grid layout. */
export class GridCell extends UIComponent<IGridCellProperties> {

    public render(): ComponentChild {
        const {
            id, style = {}, columnSpan, rowSpan, orientation, mainAlignment, crossAlignment, children,
        } = this.props;

        if (rowSpan) {
            style.gridRow = `span ${rowSpan}`;
        }

        if (columnSpan) {
            style.gridColumn = `span ${columnSpan}`;
        }

        const className = this.generateFinalClassName(["gridCell"]);

        const otherProps: Record<string, unknown> = {};
        otherProps.mainAlignment = mainAlignment;
        otherProps.crossAlignment = crossAlignment;
        otherProps.orientation = orientation;

        return (
            <Container
                id={id}
                className={className}
                style={style}
                {...otherProps}
            >
                {children}
            </Container >
        );
    }
}
