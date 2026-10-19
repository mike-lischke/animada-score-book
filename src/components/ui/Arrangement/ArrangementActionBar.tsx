/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";
import { createRef } from "preact";

import { BarActionStrip, type IBarActionStripProps } from "./BarActionStrip.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface IArrangementActionBarProps extends ICommonUIProperties {
    editMode: boolean;
    barActionStrip: Omit<IBarActionStripProps, "actionViewportRef">;
}

/** Persistent strip of per-measure actions. */
export class ArrangementActionBar extends UIComponent<IArrangementActionBarProps> {
    private barActionStripRef = createRef<BarActionStrip | null>();
    private actionViewportRef = createRef<HTMLDivElement | null>();

    public override componentDidMount(): void {
        this.layout();
    }

    public override componentDidUpdate(): void {
        this.layout();
    }

    public layout(): void {
        this.barActionStripRef.current?.layout();
    }

    public render(): ComponentChild {
        const { editMode, barActionStrip } = this.props;

        let actions: ComponentChild;
        if (editMode) {
            actions = <BarActionStrip
                ref={this.barActionStripRef}
                {...barActionStrip}
                actionViewportRef={this.actionViewportRef}
            />;
        }

        const className = this.generateFinalClassName(["arrangement-action-bar"]);

        return (
            <Container
                id="arrangementActionBar"
                className={className}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <div className="bar-action-strip-viewport" ref={this.actionViewportRef}>
                    {actions}
                </div>
            </Container>
        );
    }
}
