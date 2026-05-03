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
import { BarPolyrhythmFragment } from "./BarPolyrhythmFragment.js";

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
            return p.start.timing.bar === barNumber;
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
                                return (
                                    <BarPolyrhythmFragment
                                        polyrhythm={p}
                                        barNumber={barNumber}
                                        noteSlice={p.notes}
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
            const overlap = this.getPolyrhythmBarOverlap(polyrhythm);
            if (overlap.startStep !== 1 || overlap.stepsInBar !== stepsPerBar) {
                return undefined;
            }

            if (polyrhythm.notes.length === 0) {
                return undefined;
            }

            return polyrhythm.notes;
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
            const overlap = this.getPolyrhythmBarOverlap(polyrhythm);
            const noteSlice = polyrhythm.notes;
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
    ): { startStep: number; stepsInBar: number; } {
        return {
            startStep: polyrhythm.start.timing.step,
            stepsInBar: polyrhythm.end.timing.step - polyrhythm.start.timing.step + 1,
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
            if (polyrhythm.start.timing.bar !== barNumber) {
                continue;
            }

            const fragmentEl = rowEl.querySelector<HTMLDivElement>(
                `#bar-polyrhythm-${polyrhythm.id}-${barNumber}`
            );
            if (!fragmentEl) {
                continue;
            }

            const startNote = document.getElementById(`note-${polyrhythm.start.id}`);
            const endNote = document.getElementById(`note-${polyrhythm.end.id}`);
            if (!startNote || !endNote) {
                continue;
            }

            let startLeft = startNote.offsetLeft;
            if (polyrhythm.start.polyrhythm) {
                const parentFrag = startNote.closest<HTMLDivElement>(".polyrhythm-fragment");
                if (parentFrag) {
                    startLeft += parentFrag.offsetLeft;
                }
            }

            let endRight = endNote.offsetLeft + endNote.offsetWidth;
            if (polyrhythm.end.polyrhythm) {
                const parentFrag = endNote.closest<HTMLDivElement>(".polyrhythm-fragment");
                if (parentFrag) {
                    endRight += parentFrag.offsetLeft;
                }
            }

            fragmentEl.style.left = `${startLeft}px`;
            fragmentEl.style.width = `${endRight - startLeft}px`;
        }
    }
}
