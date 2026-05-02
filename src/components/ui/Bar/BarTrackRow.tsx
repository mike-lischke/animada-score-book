/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import type { ISbDmNote, ISbDmTrack, ITimeParamsView, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { IPolyrhythm } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { calculateStepsPerBar } from "../../../core/utils.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NoteViewer } from "../Note/NoteViewer.js";
import { StaffNoteViewer } from "../Note/StaffNoteViewer.js";
import { BarPolyrhythmFragment, type PolyrhythmFragmentType } from "./BarPolyrhythmFragment.js";

export interface IBarTrackRowProps extends ICommonUIProperties {
    track: ISbDmTrack;
    barNumber: number;
    timeParams: ITimeParamsView;

    trackPlayer: TrackPlayer;
    arrangementPlayer: ArrangementPlayer;
    touchEditingEnabled: boolean;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

interface IBarTrackRowState {
    notes: ISbDmNote[];
    polyrhythms: IPolyrhythm[];
    trackViewMode: "grid" | "staff";
}

interface IStaffBarData {
    notes: Array<Pick<ISbDmNote, "timing" | "noteStyle">>;
    slotCount: number;
}

/**
 * Renders one track's notes for a single bar, including polyrhythm fragments that overlap this bar.
 * Polyrhythm fragments are absolutely positioned within the row (mirroring NoteLine's approach).
 */
export class BarTrackRow extends UIComponent<IBarTrackRowProps, IBarTrackRowState> {
    private rowRef = createRef<HTMLDivElement>();

    public constructor(props: IBarTrackRowProps) {
        super(props);

        const { track } = props;
        const settings = AppStorage.loadUISettings() ?? {};
        const trackViewMode = settings.viewSettings?.arrangementViewSettings?.displayMode ?? "grid";
        this.state = {
            notes: [...track.notes],
            polyrhythms: [...track.polyrhythms],
            trackViewMode,
        };
    }

    public override componentDidMount(): void {
        const { track } = this.props;
        this.addSubscription(track, this.trackChanged);
        requisitions.register("trackViewModeToggled", this.handleTrackViewModeToggled);
        this.repositionFragments();
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();
        requisitions.unregister("trackViewModeToggled", this.handleTrackViewModeToggled);
    }

    public override componentDidUpdate(prevProps: IBarTrackRowProps, prevState: IBarTrackRowState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.repositionFragments();
    }

    public override render(): ComponentChild {
        const { track, barNumber, timeParams, trackPlayer, arrangementPlayer, services, touchEditingEnabled,
            undoManager, dataModel } = this.props;
        const { notes, trackViewMode } = this.state;

        const barNotes = notes.filter((n) => {
            return n.timing.bar === barNumber;
        });

        const touchingPolyrhythms = track.polyrhythms.filter((p) => {
            return p.start.timing.bar <= barNumber && p.end.timing.bar >= barNumber;
        });

        const staffBarData = this.computeStaffBarData(barNotes, touchingPolyrhythms, barNumber, timeParams);
        const rowClassName = this.generateFinalClassName([
            "bar-track-row",
            this.classFromProperty(trackViewMode === "grid", "grid-mode"),
            this.classFromProperty(trackViewMode === "staff", "staff-mode"),
        ]);

        return (
            <div className={rowClassName} ref={this.rowRef}>
                {trackViewMode !== "staff"
                    ? (
                        <div className="polyrhythms-wrapper">
                            {touchingPolyrhythms.map((p) => {
                                const noteSlice = this.computeNoteSlice(p, barNumber, timeParams);
                                const fragmentType = this.getFragmentType(p, barNumber);

                                return (
                                    <BarPolyrhythmFragment
                                        polyrhythm={p}
                                        barNumber={barNumber}
                                        noteSlice={noteSlice}
                                        fragmentType={fragmentType}
                                        key={`${p.id}-${barNumber}`}
                                        trackPlayer={trackPlayer}
                                        arrangementPlayer={arrangementPlayer}
                                        touchEditingEnabled={touchEditingEnabled}
                                        services={services}
                                        undoManager={undoManager}
                                        dataModel={dataModel}
                                    />
                                );
                            })}
                        </div>
                    )
                    : null}
                {trackViewMode === "staff"
                    ? (
                        <StaffNoteViewer
                            isFirstBar={barNumber === 1}
                            isLastBar={barNumber === timeParams.length}
                            timeSignature={timeParams.timeSignature}
                            scoreMetrics={arrangementPlayer.scoreMetrics}
                            barNotes={staffBarData.notes}
                            slotCount={staffBarData.slotCount}
                        />
                    )
                    : (
                        <div className="notes-wrapper">
                            {barNotes.map((note) => {
                                return (
                                    <NoteViewer
                                        note={note}
                                        key={note.id}
                                        trackPlayer={trackPlayer}
                                        arrangementPlayer={arrangementPlayer}
                                        touchHoldEnabled={touchEditingEnabled}
                                        services={services}
                                        undoManager={undoManager}
                                        dataModel={dataModel}
                                    />
                                );
                            })}
                        </div>
                    )}
            </div>
        );
    }

    private trackChanged = () => {
        const { track } = this.props;
        this.setState({
            notes: [...track.notes],
            polyrhythms: [...track.polyrhythms],
        });
    };

    private handleTrackViewModeToggled = (trackViewMode: "grid" | "staff") => {
        this.setState({ trackViewMode });

        return Promise.resolve(true);
    };

    /**
     * Determines which part of the polyrhythm bracket to render in this bar.
     *
     * @param polyrhythm The polyrhythm to evaluate.
     * @param barNumber The current bar number.
     *
     * @returns a flag indicating whether this is the "start", "middle", "end", or "full" fragment of the polyrhythm.
     */
    private getFragmentType(polyrhythm: IPolyrhythm, barNumber: number): PolyrhythmFragmentType {
        const startBar = polyrhythm.start.timing.bar;
        const endBar = polyrhythm.end.timing.bar;

        if (startBar === endBar) {
            return "full";
        }

        if (barNumber === startBar) {
            return "start";
        }

        if (barNumber === endBar) {
            return "end";
        }

        return "middle";
    }

    /**
     * Computes which subset of `polyrhythm.notes` corresponds to the given bar.
     *
     * The polyrhythm's synthetic notes are distributed evenly across the steps it spans.
     * We find the fraction of steps that fall in this bar and return the corresponding slice.
     *
     * @param polyrhythm The polyrhythm for which to compute the note slice.
     * @param barNumber The bar number for which to compute the slice.
     * @param timeParams The arrangement's time parameters, needed to determine steps per bar.
     *
     * @returns An array of notes corresponding to the given bar.
     */
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
        const barGlobalEnd = barNumber * stepsPerBar; // exclusive

        const overlapStart = Math.max(polyStart, barGlobalStart);
        // polyEnd is an inclusive step index; +1 converts it to an exclusive boundary for Math.min
        const overlapEnd = Math.min(polyEnd + 1, barGlobalEnd);
        const stepsInBar = Math.max(0, overlapEnd - overlapStart);

        if (stepsInBar <= 0) {
            return [];
        }

        // Calculate slice boundaries using prior-bars accumulation to avoid rounding drift.
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
        const sliceCount = Math.max(0, Math.min(notes.length - clampedSliceStart,
            Math.round(notes.length * (stepsInBar / totalSteps))));

        return notes.slice(clampedSliceStart, clampedSliceStart + sliceCount);
    }

    /**
     * @param barNotes The regular notes in the current bar.
     * @param touchingPolyrhythms All polyrhythms that overlap the current bar.
     * @param barNumber The current bar number.
     * @param timeParams The arrangement timing parameters.
     * @returns Staff notes and the slot count used for rendering this bar.
     */
    private computeStaffBarData(
        barNotes: readonly ISbDmNote[],
        touchingPolyrhythms: readonly IPolyrhythm[],
        barNumber: number,
        timeParams: ITimeParamsView,
    ): IStaffBarData {
        const stepsPerBar = calculateStepsPerBar(timeParams.timeSignature, timeParams.stepResolution);

        // If a full-bar polyrhythm is the only sounding source, render using its own subdivision count
        // (e.g. 12 tuplet notes in 4/4) instead of forcing the default grid resolution.
        const baseHasSoundingNotes = barNotes.some((note) => {
            return note.noteStyle !== undefined;
        });
        const fullBarPolyrhythmSlices = touchingPolyrhythms.map((polyrhythm) => {
            const overlap = this.getPolyrhythmBarOverlap(polyrhythm, barNumber, stepsPerBar);
            if (overlap?.startStep !== 1 || overlap.stepsInBar !== stepsPerBar) {
                return undefined;
            }

            const noteSlice = this.computeNoteSlice(polyrhythm, barNumber, timeParams);
            if (noteSlice.length === 0) {
                return undefined;
            }

            return noteSlice;
        }).filter((slice): slice is ISbDmNote[] => {
            return slice !== undefined;
        });

        if (!baseHasSoundingNotes && fullBarPolyrhythmSlices.length > 0) {
            const primarySlice = fullBarPolyrhythmSlices.reduce((longest, current) => {
                return current.length > longest.length ? current : longest;
            });

            const staffNotes = primarySlice.map((note, index) => {
                return {
                    timing: { bar: barNumber, step: index + 1 },
                    noteStyle: note.noteStyle,
                };
            });

            return {
                notes: staffNotes,
                slotCount: primarySlice.length,
            };
        }

        const noteByStep = new Map<number, Pick<ISbDmNote, "timing" | "noteStyle">>();

        for (const note of barNotes) {
            noteByStep.set(note.timing.step, { timing: note.timing, noteStyle: note.noteStyle });
        }

        for (const polyrhythm of touchingPolyrhythms) {
            const overlap = this.getPolyrhythmBarOverlap(polyrhythm, barNumber, stepsPerBar);
            if (!overlap) {
                continue;
            }

            const noteSlice = this.computeNoteSlice(polyrhythm, barNumber, timeParams);
            if (noteSlice.length === 0) {
                continue;
            }

            for (let index = 0; index < noteSlice.length; index++) {
                const polyNote = noteSlice[index];
                if (!polyNote.noteStyle) {
                    continue;
                }

                const relativeStep = Math.min(
                    overlap.stepsInBar - 1,
                    Math.floor((index * overlap.stepsInBar) / noteSlice.length),
                );
                const step = overlap.startStep + relativeStep;
                const existing = noteByStep.get(step);
                if (existing?.noteStyle) {
                    continue;
                }

                noteByStep.set(step, {
                    timing: { bar: barNumber, step },
                    noteStyle: polyNote.noteStyle,
                });
            }
        }

        return {
            notes: [...noteByStep.values()].sort((a, b) => {
                return a.timing.step - b.timing.step;
            }),
            slotCount: stepsPerBar,
        };
    }

    private getPolyrhythmBarOverlap(
        polyrhythm: IPolyrhythm,
        barNumber: number,
        stepsPerBar: number,
    ): { startStep: number; stepsInBar: number; } | undefined {
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

    /**
     * Positions each polyrhythm fragment absolutely within the row, based on which track notes
     * correspond to the polyrhythm's boundaries in this bar.
     */
    private repositionFragments(): void {
        const { track, barNumber } = this.props;
        const rowEl = this.rowRef.current;
        if (!rowEl) {
            return;
        }

        for (const polyrhythm of track.polyrhythms) {
            if (polyrhythm.start.timing.bar > barNumber || polyrhythm.end.timing.bar < barNumber) {
                continue;
            }

            const fragmentEl = rowEl.querySelector<HTMLDivElement>(
                `#bar-polyrhythm-${polyrhythm.id}-${barNumber}`
            );
            if (!fragmentEl) {
                continue;
            }

            const fragmentType = this.getFragmentType(polyrhythm, barNumber);

            let startLeft: number;
            let endRight: number;

            switch (fragmentType) {
                case "full": {
                    const startNote = document.getElementById(`note-${polyrhythm.start.id}`);
                    const endNote = document.getElementById(`note-${polyrhythm.end.id}`);
                    if (!startNote || !endNote) {
                        continue;
                    }

                    startLeft = startNote.offsetLeft;
                    if (polyrhythm.start.polyrhythm) {
                        const parentFrag = startNote.closest<HTMLDivElement>(".polyrhythm-fragment");
                        if (parentFrag) {
                            startLeft += parentFrag.offsetLeft;
                        }
                    }

                    endRight = endNote.offsetLeft + endNote.offsetWidth;
                    if (polyrhythm.end.polyrhythm) {
                        const parentFrag = endNote.closest<HTMLDivElement>(".polyrhythm-fragment");
                        if (parentFrag) {
                            endRight += parentFrag.offsetLeft;
                        }
                    }

                    break;
                }

                case "start": {
                    const startNote = document.getElementById(`note-${polyrhythm.start.id}`);
                    if (!startNote) {
                        continue;
                    }

                    startLeft = startNote.offsetLeft;
                    if (polyrhythm.start.polyrhythm) {
                        const parentFrag = startNote.closest<HTMLDivElement>(".polyrhythm-fragment");
                        if (parentFrag) {
                            startLeft += parentFrag.offsetLeft;
                        }
                    }

                    endRight = rowEl.offsetWidth;
                    break;
                }

                case "end": {
                    const endNote = document.getElementById(`note-${polyrhythm.end.id}`);
                    if (!endNote) {
                        continue;
                    }

                    startLeft = 0;
                    endRight = endNote.offsetLeft + endNote.offsetWidth;
                    if (polyrhythm.end.polyrhythm) {
                        const parentFrag = endNote.closest<HTMLDivElement>(".polyrhythm-fragment");
                        if (parentFrag) {
                            endRight += parentFrag.offsetLeft;
                        }
                    }

                    break;
                }

                default: { // "middle"
                    startLeft = 0;
                    endRight = rowEl.offsetWidth;
                    break;
                }
            }

            fragmentEl.style.left = `${startLeft}px`;
            fragmentEl.style.width = `${endRight - startLeft}px`;
        }
    }
}
