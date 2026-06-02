/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement } from "../../../core/ScoreBookDataModel.js";
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

                    const activeSteps = new Set<number>();
                    for (const event of events) {
                        if (!event.noteStyle) {
                            continue;
                        }

                        const step = Math.floor((event.start.numerator * stepsPerBar) / event.start.denominator) + 1;
                        activeSteps.add(step);
                    }

                    const neutralColor = `color-mix(in srgb, var(--color-base-200) 30%, var(--color-base-100))`;

                    return (
                        <div key={track.id} className="bar-track-row mini-bar-track-row">
                            {Array.from({ length: stepsPerBar }, (_, index) => {
                                const step = index + 1;
                                const isActive = activeSteps.has(step);

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

}
