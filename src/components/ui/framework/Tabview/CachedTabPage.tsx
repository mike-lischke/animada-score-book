/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild } from "preact";

import { UIComponent } from "../UIComponent.js";
import { Container } from "../Container.js";
import { Orientation } from "../ui-types.js";

export interface ICachedTabPageProps {
    id: string;
    active: boolean;
    content: ComponentChild;
}

interface ICachedTabPageState {
    hasMountedOnce: boolean;
}

export class CachedTabPage extends UIComponent<ICachedTabPageProps, ICachedTabPageState> {
    public constructor(props: ICachedTabPageProps) {
        super(props);

        this.state = {
            hasMountedOnce: false,
        };
    }

    public override componentDidMount() {
        const { active } = this.props;
        const { hasMountedOnce } = this.state;

        if (active && !hasMountedOnce) {
            this.setState({ hasMountedOnce: true });
        }
    }

    public override componentDidUpdate(prevProps: ICachedTabPageProps, prevState: ICachedTabPageState) {
        super.componentDidUpdate(prevProps, prevState);

        const { active } = this.props;
        const { hasMountedOnce } = this.state;

        if (active && !prevProps.active && !hasMountedOnce) {
            this.setState({ hasMountedOnce: true });
        }
    }

    public render() {
        const { active, content, id } = this.props;
        const { hasMountedOnce } = this.state;

        if (!hasMountedOnce) {
            // Tab has never been active, so don't render anything yet.
            return null;
        }

        // After the first activation, always render the content, but hide it when inactive.
        return (
            <Container
                className="cachedTabPage"
                orientation={Orientation.TopDown}
                data-tab-id={id}
                style={{ display: active ? "flex" : "none", width: "100%", height: "100%" }}
            >
                {content}
            </Container>
        );
    }
}
