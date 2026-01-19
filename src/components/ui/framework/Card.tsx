/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Container } from "./Container.js";
import { Orientation } from "./ui-types.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface ICardProperties extends ICommonUIProperties {
    orientation?: Orientation;
    roundedCorners?: {
        topLeft?: number;
        topRight?: number;
        bottomLeft?: number;
        bottomRight?: number;
    };
}

/** A vertically oriented container with a shadow. */
export class Card extends UIComponent<ICardProperties> {
    public render() {
        const { id, children, style, title, orientation = Orientation.TopDown, roundedCorners = {} } = this.props;
        const className = this.generateFinalClassName(["card"]);

        const newStyle = { ...style };
        if (roundedCorners.topLeft !== undefined) {
            newStyle.borderTopLeftRadius = `${roundedCorners.topLeft}px`;
        }
        if (roundedCorners.topRight !== undefined) {
            newStyle.borderTopRightRadius = `${roundedCorners.topRight}px`;
        }
        if (roundedCorners.bottomLeft !== undefined) {
            newStyle.borderBottomLeftRadius = `${roundedCorners.bottomLeft}px`;
        }
        if (roundedCorners.bottomRight !== undefined) {
            newStyle.borderBottomRightRadius = `${roundedCorners.bottomRight}px`;
        }

        return (
            <Container
                id={id}
                orientation={orientation}
                className={className}
                style={newStyle}
                title={title}>
                {children}
            </Container>
        );
    }
}
