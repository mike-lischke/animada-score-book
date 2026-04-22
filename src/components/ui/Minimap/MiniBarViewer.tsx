/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { calculateStepsPerBar } from "../../../core/utils.js";
import type { ISbDmArrangement, ISbDmNote, ITimeParamsView } from "../../../core/ScoreBookDataModel.js";
import type { IPolyrhythm } from "../../../core/types/general.js";
import { UIComponent } from "../framework/UIComponent.js";
import type { ICommonUIProperties } from "../framework/UIComponent.js";

export interface IMiniBarViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
}

export class MiniBarViewer extends UIComponent<IMiniBarViewerProps> {
    public override render(): ComponentChild {
        const { barNumber, arrangement } = this.props;
        const className = this.generateFinalClassName(["mini-bar-viewer"]);

        const stepsPerBar = calculateStepsPerBar(
            arrangement.timeParams.timeSignature,
            arrangement.timeParams.stepResolution
        );

        return (
            <div className={className} data-bar={barNumber}>
                {arrangement.tracks.map((track) => {
                    const notesInBar = track.notes.filter((note) => {
                        return note.timing.bar === barNumber;
                    });
                    const touchingPolyrhythms = track.polyrhythms.filter((polyrhythm) => {
                        return polyrhythm.start.timing.bar <= barNumber && polyrhythm.end.timing.bar >= barNumber;
                    });

                    const notesByStep = new Map<number, ISbDmNote>(notesInBar.map((note) => {
                        return [note.timing.step, note];
                    }));

                    const polyrhythmSteps = this.getPolyrhythmStepsInBar(
                        touchingPolyrhythms,
                        barNumber,
                        arrangement.timeParams
                    );

                    const neutralColor = `color-mix(in srgb, var(--color-base-200) 30%, var(--color-base-100))`;

                    return (
                        <div key={track.id} className="bar-track-row mini-bar-track-row">
                            {Array.from({ length: stepsPerBar }, (_, index) => {
                                const step = index + 1;
                                const note = notesByStep.get(step);
                                const isActive = Boolean(note?.noteStyle) || polyrhythmSteps.has(step);

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

    private getPolyrhythmStepsInBar(
        polyrhythms: IPolyrhythm[],
        barNumber: number,
        timeParams: ITimeParamsView,
    ): Set<number> {
        const activeSteps = new Set<number>();
        const stepsPerBar = calculateStepsPerBar(timeParams.timeSignature, timeParams.stepResolution);

        for (const polyrhythm of polyrhythms) {
            const overlap = this.getBarOverlap(polyrhythm, barNumber, stepsPerBar);
            if (!overlap) {
                continue;
            }

            const noteSlice = this.computeNoteSlice(polyrhythm, barNumber, timeParams);
            if (noteSlice.length === 0) {
                continue;
            }

            for (let index = 0; index < noteSlice.length; index++) {
                if (!noteSlice[index]?.noteStyle) {
                    continue;
                }

                const relativeStep = Math.min(
                    overlap.stepsInBar - 1,
                    Math.floor((index * overlap.stepsInBar) / noteSlice.length)
                );
                activeSteps.add(overlap.startStep + relativeStep);
            }
        }

        return activeSteps;
    }

    private getBarOverlap(polyrhythm: IPolyrhythm, barNumber: number,
        stepsPerBar: number): { startStep: number; stepsInBar: number; } | undefined {
        const globalStep = (timing: { bar: number; step: number; }) => {
            return ((timing.bar - 1) * stepsPerBar) + (timing.step - 1);
        };

        const polyStart = globalStep(polyrhythm.start.timing);
        const polyEnd = globalStep(polyrhythm.end.timing);
        const barGlobalStart = (barNumber - 1) * stepsPerBar;
        const barGlobalEnd = barNumber * stepsPerBar;

        const overlapStart = Math.max(polyStart, barGlobalStart);
        const overlapEnd = Math.min(polyEnd + 1, barGlobalEnd);
        const stepsInBar = Math.max(0, overlapEnd - overlapStart);
        if (stepsInBar <= 0) {
            return undefined;
        }

        return {
            startStep: (overlapStart - barGlobalStart) + 1,
            stepsInBar,
        };
    }

    private computeNoteSlice(polyrhythm: IPolyrhythm, barNumber: number, timeParams: ITimeParamsView): ISbDmNote[] {
        const { notes } = polyrhythm;
        if (notes.length === 0) {
            return [];
        }

        const stepsPerBar = calculateStepsPerBar(timeParams.timeSignature, timeParams.stepResolution);

        const globalStep = (timing: { bar: number; step: number; }) => {
            return ((timing.bar - 1) * stepsPerBar) + (timing.step - 1);
        };

        const polyStart = globalStep(polyrhythm.start.timing);
        const polyEnd = globalStep(polyrhythm.end.timing);
        const totalSteps = polyEnd - polyStart + 1;

        if (totalSteps <= 0) {
            return notes;
        }

        const barGlobalStart = (barNumber - 1) * stepsPerBar;
        const barGlobalEnd = barNumber * stepsPerBar;

        const overlapStart = Math.max(polyStart, barGlobalStart);
        const overlapEnd = Math.min(polyEnd + 1, barGlobalEnd);
        const stepsInBar = Math.max(0, overlapEnd - overlapStart);

        if (stepsInBar <= 0) {
            return [];
        }

        let sliceStart = 0;
        for (let b = polyrhythm.start.timing.bar; b < barNumber; b++) {
            const bGlobalStart = (b - 1) * stepsPerBar;
            const bGlobalEnd = b * stepsPerBar;
            const bOverlapStart = Math.max(polyStart, bGlobalStart);
            const bOverlapEnd = Math.min(polyEnd + 1, bGlobalEnd);
            const bSteps = Math.max(0, bOverlapEnd - bOverlapStart);

            sliceStart += Math.round(notes.length * (bSteps / totalSteps));
        }

        const clampedSliceStart = Math.min(notes.length, Math.max(0, sliceStart));
        const sliceCount = Math.max(
            0,
            Math.min(notes.length - clampedSliceStart, Math.round(notes.length * (stepsInBar / totalSteps)))
        );

        return notes.slice(clampedSliceStart, clampedSliceStart + sliceCount);
    }
}
