/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";
import { createRef } from "preact";

import { BarActionStrip, type IBarActionStripProps } from "./BarActionStrip.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface IArrangementActionBarProps extends ICommonUIProperties {
    editMode: boolean;
    mixerExpanded: boolean;
    trackViewMode: "grid" | "staff";
    trackControlsRef: preact.RefObject<HTMLDivElement | null>;
    onToggleMixer: () => void;
    onTrackViewModeChange: (mode: "grid" | "staff") => void;
    barActionStrip: Omit<IBarActionStripProps, "actionViewportRef">;
}

/** Persistent score controls and per-measure actions. */
export class ArrangementActionBar extends UIComponent<IArrangementActionBarProps> {
    private barActionStripRef = createRef<BarActionStrip | null>();
    private actionViewportRef = createRef<HTMLDivElement | null>();
    private controlsRef = createRef<HTMLDivElement | null>();

    public override componentDidMount(): void {
        this.layout();
    }

    public override componentDidUpdate(): void {
        this.layout();
    }

    public layout(): void {
        const { trackControlsRef } = this.props;
        const controls = this.controlsRef.current;
        const trackControls = trackControlsRef.current;
        if (controls !== null && trackControls !== null) {
            // The bar spans the whole frame while the track controls sit inside the padding of the viewer, so the
            // cell starts at the bar's edge and ends on the panel's right edge.
            const width = trackControls.getBoundingClientRect().right - controls.getBoundingClientRect().left;
            controls.style.flexBasis = `${width}px`;
            controls.style.width = `${width}px`;
        }

        this.barActionStripRef.current?.layout();
    }

    public render(): ComponentChild {
        const { editMode, mixerExpanded, trackViewMode, barActionStrip } = this.props;

        let actions: ComponentChild;
        if (editMode) {
            actions = <BarActionStrip
                ref={this.barActionStripRef}
                {...barActionStrip}
                actionViewportRef={this.actionViewportRef}
            />;
        }

        const className = this.generateFinalClassName(["arrangement-action-bar"]);
        const controlsClassName = this.generateFinalClassName([
            "arrangement-action-controls",
            this.classFromProperty(mixerExpanded, "expanded"),
        ]);
        const mixerClassName = this.generateFinalClassName([
            "actionControlSwitch", "trackControlsToggle", this.classFromProperty(mixerExpanded, "is-active"),
        ]);
        const staffMode = trackViewMode === "staff";
        const viewClassName = this.generateFinalClassName([
            "actionControlSwitch", "trackViewModeToggle", this.classFromProperty(staffMode, "is-active"),
        ]);
        const mixerTooltip = mixerExpanded ? "Collapse mixer" : "Expand mixer";
        const viewTooltip = staffMode ? "Show grid view" : "Show staff view";

        return (
            <Container
                id="arrangementActionBar"
                className={className}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <Container
                    className={controlsClassName}
                    innerRef={this.controlsRef}
                    orientation={Orientation.TopDown}
                    mainAlignment={ChildAlignment.Center}
                    crossAlignment={ChildAlignment.Start}
                >
                    <Button
                        className={mixerClassName}
                        aria-pressed={mixerExpanded}
                        title={mixerTooltip}
                        onClick={this.handleMixerToggle}
                    >
                        <Icon src={UIIcon.Mixer} />
                        <span className="actionControlSwitchLabel">Mixer</span>
                        <span className="actionControlSwitchDot" />
                    </Button>
                    <Button
                        className={viewClassName}
                        aria-pressed={staffMode}
                        title={viewTooltip}
                        onClick={this.handleTrackViewModeToggle}
                    >
                        <Icon src={UIIcon.Music} />
                        <span className="actionControlSwitchLabel">Staff</span>
                        <span className="actionControlSwitchDot" />
                    </Button>
                </Container>
                <div className="bar-action-strip-viewport" ref={this.actionViewportRef}>
                    {actions}
                </div>
            </Container>
        );
    }

    private handleTrackViewModeToggle = (event: MouseEvent | KeyboardEvent): void => {
        const { trackViewMode, onTrackViewModeChange } = this.props;
        event.stopPropagation();
        onTrackViewModeChange(trackViewMode === "staff" ? "grid" : "staff");
    };

    private handleMixerToggle = (event: MouseEvent | KeyboardEvent): void => {
        const { onToggleMixer } = this.props;
        event.stopPropagation();
        onToggleMixer();
    };
}
