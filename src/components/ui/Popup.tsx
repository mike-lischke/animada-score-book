/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef } from "preact";

import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { Container } from "./framework/Container.js";
import { Orientation } from "./framework/ui-types.js";

export interface IPopupProps extends ICommonUIProperties {
    innerRef?: preact.RefObject<HTMLDivElement>;
}

export class Popup extends UIComponent<IPopupProps> {
    public constructor(props: IPopupProps) {
        super(props);

        this.props.innerRef ??= createRef<HTMLDivElement>();

        this.state = {};
    }

    public render() {
        const { id, innerRef } = this.props;

        return (
            <Container
                id={id}
                innerRef={innerRef}
                className="popup"
                orientation={Orientation.TopDown}
                onClick={this.handleClick}
            >
                {this.props.children}
            </Container>
        );
    }

    private handleClick = (e: MouseEvent | KeyboardEvent) => {
        const { innerRef } = this.props;

        innerRef?.current?.classList.remove("visible");
    };
}
