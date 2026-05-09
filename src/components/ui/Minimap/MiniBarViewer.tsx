/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement } from "../../../core/ScoreBookDataModel.js";
import { PolyrhythmEventGroupBuilder, type IEventPolyrhythmGroup } from "../PolyrhythmEventGroupBuilder.js";
import type { ICommonUIProperties } from "../framework/UIComponent.js";
import { UIComponent } from "../framework/UIComponent.js";

export interface IMiniBarViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
    stepsPerBar: number;
}

export class MiniBarViewer extends UIComponent<IMiniBarViewerProps> {
    public override render(): ComponentChild {
        const { barNumber, arrangement, stepsPerBar } = this.props;
        const className = this.generateFinalClassName(["mini-bar-viewer"]);

        return (
            <div className={className} data-bar={barNumber}>
                {arrangement.tracks.map((track) => {
                    const events = barNumber - 1 < track.measures.length ? track.measures[barNumber - 1].events : [];
                    const touchingGroups = new PolyrhythmEventGroupBuilder(track, stepsPerBar)
                        .build().filter((group) => {
                            return group.measureNumber === barNumber;
                        });

                    const activeSteps = new Set<number>();
                    for (const event of events) {
                        if (!event.noteStyle) {
                            continue;
                        }

                        const step = Math.floor((event.start.numerator * stepsPerBar) / event.start.denominator) + 1;
                        activeSteps.add(step);
                    }

                    const polyrhythmSteps = this.getPolyrhythmStepsInBar(touchingGroups);

                    const neutralColor = `color-mix(in srgb, var(--color-base-200) 30%, var(--color-base-100))`;

                    return (
                        <div key={track.id} className="bar-track-row mini-bar-track-row">
                            {Array.from({ length: stepsPerBar }, (_, index) => {
                                const step = index + 1;
                                const isActive = activeSteps.has(step) || polyrhythmSteps.has(step);

                                return (
                                    <div
                                        key={`${track.id}-${barNumber}-${step}`}
                                        className="mini-note-viewer"
                                        style={{
                                            backgroundColor: isActive ? track.instrument.color : neutralColor,
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

    private getPolyrhythmStepsInBar(groups: IEventPolyrhythmGroup[]): Set<number> {
        const activeSteps = new Set<number>();

        for (const group of groups) {
            if (group.events.length === 0) {
                continue;
            }

            for (let index = 0; index < group.events.length; index++) {
                if (!group.events[index]?.noteStyle) {
                    continue;
                }

                const relativeStep = Math.min(
                    group.stepsInBar - 1,
                    Math.floor((index * group.stepsInBar) / group.events.length)
                );
                activeSteps.add(group.startStep + relativeStep);
            }
        }

        return activeSteps;
    }
}
