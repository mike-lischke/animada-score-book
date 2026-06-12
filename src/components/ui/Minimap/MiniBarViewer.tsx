/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement } from "../../../core/ScoreBookDataModel.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import {
    SelectionGranularity, type ISelectionDelta, type ISelectionEntry, type ISelectionHitTester,
} from "../../../ui/selection-types.js";
import type { ICommonUIProperties } from "../framework/UIComponent.js";
import { UIComponent } from "../framework/UIComponent.js";

export interface IMiniBarViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
    stepsPerBar: number;
    services: ScoreBookUiServices;
}

interface IMiniBarViewerState {
    /** True when the whole measure is selected. */
    measureSelected: boolean;

    /** Track IDs that have a track-level selection in this bar. */
    selectedTrackIds: ReadonlySet<number>;
}

export class MiniBarViewer extends UIComponent<IMiniBarViewerProps, IMiniBarViewerState>
    implements ISelectionHitTester {

    public constructor(props: IMiniBarViewerProps) {
        super(props);

        this.state = { measureSelected: false, selectedTrackIds: new Set() };
    }

    public override componentDidMount(): void {
        const { services } = this.props;
        services.selectionManager.registerHitTester(this);
        requisitions.register("selectionChanged", this.handleSelectionChanged);
    }

    public override componentWillUnmount(): void {
        const { services } = this.props;
        services.selectionManager.unregisterHitTester(this);
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
    }

    public hitTest(rect: DOMRect): ISelectionEntry[] {
        const { barNumber } = this.props;
        const element = this.base as HTMLElement | null;
        if (!element) {
            return [];
        }

        const elRect = element.getBoundingClientRect();
        if (rect.right < elRect.left || rect.left > elRect.right
            || rect.bottom < elRect.top || rect.top > elRect.bottom) {
            return [];
        }

        return [{
            granularity: SelectionGranularity.Measure,
            bar: barNumber,
            trackId: 0,
        }];
    }

    public override render(): ComponentChild {
        const { barNumber, arrangement, stepsPerBar } = this.props;
        const { measureSelected, selectedTrackIds } = this.state;
        const className = this.generateFinalClassName(["mini-bar-viewer"]);

        return (
            <div className={className} data-bar={barNumber}>
                {measureSelected && <div className="mini-bar-selection-overlay" />}
                {arrangement.tracks.map((track) => {
                    const events = barNumber - 1 < track.measures.length
                        ? track.measures[barNumber - 1].events
                        : [];

                    const activeSteps = new Set<number>();
                    for (const event of events) {
                        if (!event.noteStyle) {
                            continue;
                        }

                        const step = Math.floor(
                            (event.start.numerator * stepsPerBar) / event.start.denominator,
                        ) + 1;
                        activeSteps.add(step);
                    }

                    const neutralColor = `color-mix(in srgb, var(--color-base-200) 30%, var(--color-base-100))`;
                    const trackSelected = selectedTrackIds.has(track.id);

                    return (
                        <div key={track.id} className="bar-track-row mini-bar-track-row"
                            data-bar={barNumber} data-track={track.id}>
                            {trackSelected && <div className="mini-bar-selection-overlay" />}
                            {Array.from({ length: stepsPerBar }, (_, index) => {
                                const step = index + 1;
                                const isActive = activeSteps.has(step);

                                return (
                                    <div
                                        key={`${track.id}-${barNumber}-${step}`}
                                        className="mini-note-viewer"
                                        style={{
                                            backgroundColor: isActive
                                                ? track.instrument.color
                                                : neutralColor,
                                        }}
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        );
    }

    private handleSelectionChanged = (_delta: ISelectionDelta): Promise<boolean> => {
        const { barNumber, services } = this.props;
        const sm = services.selectionManager;

        if (sm.isMeasureSelected(barNumber)) {
            this.setState({ measureSelected: true, selectedTrackIds: new Set() });

            return Promise.resolve(true);
        }

        const selectedTrackIds = new Set<number>();
        for (const entry of sm.currentSelection.values()) {
            // Track-level selection (bar: 0) — applies to all bars of that track.
            if (entry.granularity === SelectionGranularity.Track && entry.trackId > 0) {
                selectedTrackIds.add(entry.trackId);
            }

            // Per-bar track selection — applies only to this specific bar.
            if (entry.bar === barNumber && entry.trackId > 0) {
                selectedTrackIds.add(entry.trackId);
            }
        }

        this.setState({ measureSelected: false, selectedTrackIds });

        return Promise.resolve(true);
    };

}
