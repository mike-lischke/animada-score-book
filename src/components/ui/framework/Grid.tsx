/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { convertPropValue } from "../../../core/utils.js";

interface IGridProperties extends ICommonUIProperties {
    innerRef?: preact.RefObject<HTMLElement>;

    /** The distance between rows in the grid */
    rowGap?: string | number;

    /** The distance between columns in the grid */
    columnGap?: string | number;

    /** If true, all rows have the same height (that of the largest row). */
    equalHeight?: boolean;

    /** Column definition: a single number means just column count. An array specifies both, count and widths. */
    columns: number | Array<number | string>;
}

/** This component implements a standard CSS grid. For more complex grids/tables use the TreeGrid component. */
export class Grid extends UIComponent<IGridProperties> {

    public render(): ComponentChild {
        const { id, children, rowGap, columnGap, equalHeight, columns, style, innerRef } = this.props;

        const className = this.generateFinalClassName([
            "grid",
            this.classFromProperty(equalHeight, "equalHeight"),
        ]);

        let columnsSpec;
        if (typeof columns === "number") {
            columnsSpec = `repeat(${columns}, 1fr)`;
        } else {
            const sizes = columns.map((column): string | undefined => {
                return convertPropValue(column);
            });

            columnsSpec = sizes.join(" ");
        }

        const newStyle = {
            ...style,
            gridTemplateColumns: columnsSpec,
            rowGap: convertPropValue(rowGap),
            columnGap: convertPropValue(columnGap),
        };

        return (
            <div
                id={id}
                ref={innerRef as preact.RefObject<HTMLDivElement>}
                className={className}
                style={newStyle}
            >
                {children}
            </div>
        );
    }

}
