/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import singleNoteIcon from "../../../assets/images/notes/16th-note.svg";
import restIcon from "../../../assets/images/notes/16th-rest.svg";
import groupedNoteIcon from "../../../assets/images/notes/4th-note.svg";
import commonTimeIcon from "../../../assets/images/notes/common-time.svg";

import { type ComponentChild, type VNode } from "preact";

import type { ISbDmNote } from "../../../core/ScoreBookDataModel.js";
import type { IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IStaffNoteViewerProps extends ICommonUIProperties {
    isFirstBar: boolean;
    isLastBar: boolean;
    timeSignature: string;
    scoreMetrics: IScoreMetrics;
    barNotes: ReadonlyArray<Pick<ISbDmNote, "timing" | "noteStyle">>;
    slotCount?: number;
}

interface ITupletLabel {
    leftPercent: number;
    text: string;
}

export class StaffNoteViewer extends UIComponent<IStaffNoteViewerProps> {
    public override render(): ComponentChild {
        const { isFirstBar, isLastBar, timeSignature, scoreMetrics, barNotes, slotCount } = this.props;
        const [beatsPerBar, beatUnit] = timeSignature.split("/");
        const className = this.generateFinalClassName([
            "staff-note-viewer",
            this.classFromProperty(isFirstBar, "first-bar"),
            this.classFromProperty(isLastBar, "last-bar"),
        ]);

        const defaultStepsPerBar = scoreMetrics.stepsPerBar;
        const stepsPerBar = slotCount ?? defaultStepsPerBar;
        const stepScale = defaultStepsPerBar > 0 ? stepsPerBar / defaultStepsPerBar : 1;
        const pulsesPerBar = scoreMetrics.pulsesPerBar;
        const stepsPerPulse = scoreMetrics.stepsPerPulse * stepScale;
        const noteByStep = new Map<number, Pick<ISbDmNote, "timing" | "noteStyle">>(barNotes.map((n) => {
            return [n.timing.step, n];
        }));

        const tupletLabels = this.computeTupletLabels(noteByStep, stepsPerBar, stepsPerPulse, pulsesPerBar);
        const slotWidth = `${100 / stepsPerBar}%`;

        return (
            <div className={className} aria-hidden>
                {isFirstBar
                    ? (
                        <div className="staff-note-viewer-prefix">
                            <div className="staff-note-viewer-neutral-clef" />
                            <div className="staff-note-viewer-time-signature">
                                {timeSignature === "4/4"
                                    ? (
                                        <img
                                            className="staff-note-viewer-common-time"
                                            src={commonTimeIcon}
                                            alt="Common time"
                                        />
                                    )
                                    : (
                                        <>
                                            <span className="top">{beatsPerBar}</span>
                                            <span className="bottom">{beatUnit}</span>
                                        </>
                                    )}
                            </div>
                        </div>
                    )
                    : null}
                <div className="staff-note-viewer-middle-line" />
                <div className="staff-note-viewer-runs">
                    {Array.from({ length: stepsPerBar }, (_, i) => {
                        return this.renderSlot(i + 1, noteByStep, slotWidth, stepsPerBar, stepsPerPulse);
                    })}
                </div>
                {tupletLabels.length > 0
                    ? (
                        <div className="staff-note-viewer-tuplets">
                            {tupletLabels.map((label) => {
                                return (
                                    <span
                                        key={`${label.leftPercent}-${label.text}`}
                                        className="staff-note-viewer-tuplet-number"
                                        style={{ left: `${label.leftPercent}%` }}
                                    >
                                        {label.text}
                                    </span>
                                );
                            })}
                        </div>
                    )
                    : null}
                {isLastBar ? <div className="staff-note-viewer-final-barline" /> : null}
            </div>
        );
    }

    private computeTupletLabels(
        noteByStep: Map<number, Pick<ISbDmNote, "timing" | "noteStyle">>,
        stepsPerBar: number,
        stepsPerPulse: number,
        pulsesPerBar: number,
    ): ITupletLabel[] {
        const labels: ITupletLabel[] = [];
        const pulseCount = Math.max(1, Math.round(pulsesPerBar));

        for (let pulseIndex = 0; pulseIndex < pulseCount; pulseIndex++) {
            const start = Math.floor(pulseIndex * stepsPerPulse) + 1;
            const endExclusive = Math.min(stepsPerBar + 1, Math.floor((pulseIndex + 1) * stepsPerPulse) + 1);
            const slotsInPulse = endExclusive - start;
            if (slotsInPulse <= 0 || this.isPowerOfTwo(slotsInPulse)) {
                continue;
            }

            let hasSoundingNote = false;
            for (let step = start; step < endExclusive; step++) {
                if (noteByStep.get(step)?.noteStyle !== undefined) {
                    hasSoundingNote = true;
                    break;
                }
            }

            if (!hasSoundingNote) {
                continue;
            }

            labels.push({
                leftPercent: (((start - 1) + (slotsInPulse / 2)) / stepsPerBar) * 100,
                text: slotsInPulse.toString(),
            });
        }

        return labels;
    }

    private isPowerOfTwo(value: number): boolean {
        if (value <= 0 || !Number.isInteger(value)) {
            return false;
        }

        return (value & (value - 1)) === 0;
    }

    private renderSlot(
        step: number,
        noteByStep: Map<number, Pick<ISbDmNote, "timing" | "noteStyle">>,
        width: string,
        stepsPerBar: number,
        stepsPerPulse: number,
    ): VNode {
        const note = noteByStep.get(step);
        const isNote = note?.noteStyle !== undefined;
        const previousNote = noteByStep.get(step - 1);
        const nextNote = noteByStep.get(step + 1);
        const currentPulse = Math.floor((step - 1) / stepsPerPulse);
        const previousPulse = Math.floor((step - 2) / stepsPerPulse);
        const nextPulse = Math.floor(step / stepsPerPulse);
        const hasBeamFromPrevious =
            step > 1 && isNote && previousNote?.noteStyle !== undefined && previousPulse === currentPulse;
        const hasBeamToNext =
            step < stepsPerBar && isNote && nextNote?.noteStyle !== undefined && currentPulse === nextPulse;
        const noteSymbol = hasBeamFromPrevious || hasBeamToNext ? groupedNoteIcon : singleNoteIcon;
        const className = this.generateFinalClassName([
            "staff-note-viewer-run",
            this.classFromProperty(hasBeamToNext, "beam-right"),
        ]);

        return (
            <div key={step} className={className} style={{ width }}>
                {isNote
                    ? <img className="staff-note-viewer-note-symbol" src={noteSymbol} alt="" />
                    : <img className="staff-note-viewer-rest-symbol" src={restIcon} alt="" />}
            </div>
        );
    }
}
