/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import type { ISbDmNote, ISbDmTrack, ITimeParamsView, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { IPolyrhythm } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { calculateStepsPerBar } from "../../../core/utils.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NoteViewer } from "../Note/NoteViewer.js";
import { BarPolyrhythmFragment, type PolyrhythmFragmentType } from "./BarPolyrhythmFragment.js";

export interface IBarTrackRowProps extends ICommonUIProperties {
    track: ISbDmTrack;
    barNumber: number;
    timeParams: ITimeParamsView;

    trackPlayer: TrackPlayer;
    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

interface IBarTrackRowState {
    notes: ISbDmNote[];
    polyrhythms: IPolyrhythm[];
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
        this.state = {
            notes: [...track.notes],
            polyrhythms: [...track.polyrhythms],
        };
    }

    public override componentDidMount(): void {
        const { track } = this.props;
        this.addSubscription(track, this.trackChanged);
    }

    public override componentDidUpdate(prevProps: IBarTrackRowProps, prevState: IBarTrackRowState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.repositionFragments();
    }

    public override render(): ComponentChild {
        const { track, barNumber, timeParams, trackPlayer, arrangementPlayer, services, undoManager,
            dataModel } = this.props;
        const { notes } = this.state;

        const barNotes = notes.filter((n) => {
            return n.timing.bar === barNumber;
        });

        const touchingPolyrhythms = track.polyrhythms.filter((p) => {
            return p.start.timing.bar <= barNumber && p.end.timing.bar >= barNumber;
        });

        return (
            <div className="bar-track-row" ref={this.rowRef}>
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
                                services={services}
                                undoManager={undoManager}
                                dataModel={dataModel}
                            />
                        );
                    })}
                </div>
                <div className="notes-wrapper">
                    {barNotes.map((note) => {
                        return (
                            <NoteViewer
                                note={note}
                                key={note.id}
                                trackPlayer={trackPlayer}
                                arrangementPlayer={arrangementPlayer}
                                services={services}
                                undoManager={undoManager}
                                dataModel={dataModel}
                            />
                        );
                    })}
                </div>
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

    /**
     * Determines which part of the polyrhythm bracket to render in this bar.
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
     */
    private computeNoteSlice(polyrhythm: IPolyrhythm, barNumber: number,
        timeParams: ITimeParamsView): ISbDmNote[] {
        const { notes } = polyrhythm;
        if (notes.length === 0) {
            return [];
        }

        const stepsPerBar = calculateStepsPerBar(timeParams.timeSignature, timeParams.stepResolution);

        const globalStep = (timing: { bar: number; step: number }) => {
            return (timing.bar - 1) * stepsPerBar + (timing.step - 1);
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
     * Positions each polyrhythm fragment absolutely within the row, based on which track notes
     * correspond to the polyrhythm's boundaries in this bar.
     */
    private repositionFragments(): void {
        const { track, barNumber, timeParams } = this.props;
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
            fragmentEl.style.width = `calc(${endRight - startLeft}px - var(--thick-border-width, 3pt))`;
        }
    }
}
