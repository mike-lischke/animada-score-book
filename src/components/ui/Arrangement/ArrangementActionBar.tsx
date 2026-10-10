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
import { CheckState, Toggle } from "../framework/Toggle.js";
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
            const width = trackControls.getBoundingClientRect().width;
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
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Button
                        className="trackControlsToggle"
                        imageOnly
                        compact
                        data-tooltip={mixerExpanded ? "Collapse mixer" : "Expand mixer"}
                        onClick={this.handleMixerToggle}
                    >
                        <Icon src={UIIcon.Settings} data-tooltip="inherit" />
                    </Button>
                    <Container
                        className="trackViewModeToggleGroup"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Toggle
                            className="trackViewModeToggle du-toggle-xs"
                            vertical
                            checkState={trackViewMode === "staff" ? CheckState.Checked : CheckState.Unchecked}
                            onChange={this.handleTrackViewModeToggle}
                        />
                        <Container
                            className="trackViewModeIcons"
                            orientation={Orientation.TopDown}
                            crossAlignment={ChildAlignment.Center}
                            mainAlignment={ChildAlignment.SpaceBetween}
                        >
                            <div className="trackViewModeGridIcon" aria-label="Show grid view" />
                            <div className="trackViewModeStaffIcon" aria-label="Show staff view">
                                <span className="trackViewModeStaffIconHead" />
                                <span className="trackViewModeStaffIconStem" />
                            </div>
                        </Container>
                    </Container>
                </Container>
                <div className="bar-action-strip-viewport" ref={this.actionViewportRef}>
                    {actions}
                </div>
            </Container>
        );
    }

    private handleTrackViewModeToggle = (event: InputEvent, checkState: CheckState): void => {
        const { onTrackViewModeChange } = this.props;
        const mode = checkState === CheckState.Checked ? "staff" : "grid";
        event.preventDefault();
        onTrackViewModeChange(mode);
    };

    private handleMixerToggle = (event: MouseEvent | KeyboardEvent): void => {
        const { onToggleMixer } = this.props;
        event.stopPropagation();
        onToggleMixer();
    };
}
