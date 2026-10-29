/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { EditEntryMode, TrackViewMode, type IPoint } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { Container } from "../framework/Container.js";
import { FloatingBar, type IFloatingBarState } from "../framework/FloatingBar.js";
import { Label } from "../framework/Label.js";
import { type ISegmentOption, SegmentedSwitch } from "../framework/SegmentedSwitch.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import type { ICommonUIProperties } from "../framework/UIComponent.js";

/** The distance the bar keeps from the overlay's left and top edges while it sits in its default place. */
const modeBarLeft = 6;
const modeBarTop = 4;

const viewOptions: ReadonlyArray<ISegmentOption<TrackViewMode>> = [
    {
        value: TrackViewMode.Grid,
        label: "Grid",
        title: "Show the score as a note grid (G)",
    },
    {
        value: TrackViewMode.Staff,
        label: "Staff",
        title: "Show the score as staff notation (S)",
    },
];

const entryOptions: ReadonlyArray<ISegmentOption<EditEntryMode>> = [
    {
        value: EditEntryMode.Overwrite,
        label: "Overwrite",
        title: "Enter notes by replacing the content at the cursor (O)",
    },
    {
        value: EditEntryMode.Insert,
        label: "Insert",
        title: "Enter notes by pushing the content behind the cursor (I)",
    },
];

export interface IArrangementModeBarProperties extends ICommonUIProperties {
    trackViewMode: TrackViewMode;

    /** The entry mode in effect; omitted where entry mode means nothing, i.e. outside the staff edit view. */
    entryMode?: EditEntryMode;

    onTrackViewModeChange: (mode: TrackViewMode) => void;
}

/** Floating bar that switches between the grid and staff views and between insert and overwrite entry. */
export class ArrangementModeBar extends FloatingBar<IArrangementModeBarProperties, IFloatingBarState> {
    protected readonly positionSetting = "modeBarPosition";

    public render(): ComponentChild {
        const { trackViewMode, entryMode } = this.props;

        const viewSection = <>
            <Label className="mode-bar-heading" caption="View" />
            <SegmentedSwitch
                className="track-view-mode-switch"
                options={viewOptions}
                value={trackViewMode}
                onChange={this.handleTrackViewModeChange}
            />
        </>;

        let entrySection: ComponentChild;
        if (entryMode !== undefined) {
            entrySection = <>
                <span className="mode-bar-divider" />
                <Label className="mode-bar-heading" caption="Entry" />
                <SegmentedSwitch options={entryOptions} value={entryMode} onChange={this.handleEntryModeChange} />
            </>;
        }

        return (
            <Container
                id="arrangementModeBar"
                className={this.generateFinalClassName(["arrangement-mode-bar"])}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                gap={8}
                innerRef={this.hostRef}
                style={this.placementStyle()}
                onPointerDown={this.handlePointerDown}
                {...this.dataAttributes}
            >
                {viewSection}
                {entrySection}
            </Container>
        );
    }

    /**
     * @param target The element the pointer went down on.
     *
     * @returns True when that element takes the bar: everything but the switches does.
     */
    protected isDragHandle(target: HTMLElement): boolean {
        return target.closest(".btn") === null;
    }

    /**
     * @returns The place the bar takes at the overlay's top left corner while it was not dragged.
     */
    protected defaultPlacement(): IPoint {
        return { x: modeBarLeft, y: modeBarTop };
    }

    private handleTrackViewModeChange = (mode: TrackViewMode): void => {
        const { onTrackViewModeChange } = this.props;
        onTrackViewModeChange(mode);
    };

    private handleEntryModeChange = (mode: EditEntryMode): void => {
        void requisitions.execute("editEntryModeChanged", mode);
    };
}
