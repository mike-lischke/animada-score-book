/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import type {
    ISbDmNoteEvent, ISbDmTrack, ITimeParamsView, ScoreBookDataModel
} from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { PolyrhythmEventGroupBuilder, type IEventPolyrhythmGroup } from "../PolyrhythmEventGroupBuilder.js";
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
    notes: ISbDmNoteEvent[];
    polyrhythmGroups: IEventPolyrhythmGroup[];
    trackViewMode: "grid" | "staff";
}

interface IStaffBarData {
    notes: Array<Pick<ISbDmNoteEvent, "timing" | "noteStyle" | "start" | "duration">>;
    slotCount: number;
}

/**
 * Renders one track's notes for a single bar, including polyrhythm fragments that overlap this bar.
 * Polyrhythm fragments are absolutely positioned within the row (mirroring NoteLine's approach).
 */
export class BarTrackRow extends UIComponent<IBarTrackRowProps, IBarTrackRowState> {
    private rowRef = createRef<HTMLDivElement>();
    private noteElements = new Map<number, HTMLDivElement>();
    private fragmentElements = new Map<string, HTMLDivElement>();

    public constructor(props: IBarTrackRowProps) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const trackViewMode = settings.viewSettings?.arrangementViewSettings?.displayMode ?? "grid";
        this.state = {
            ...this.getTrackDisplayData(props.track),
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
        const { arrangementPlayer, barNumber, dataModel, services, timeParams, touchEditingEnabled,
            track, trackPlayer, undoManager } = this.props;
        const { notes, polyrhythmGroups, trackViewMode } = this.state;

        const barNotes = notes.filter((note) => {
            return note.timing.bar === barNumber;
        });

        const touchingGroups = polyrhythmGroups.filter((group) => {
            return group.measureNumber === barNumber;
        });

        const staffBarData = this.computeStaffBarData(barNotes, touchingGroups, barNumber,
            arrangementPlayer.scoreMetrics.stepsPerBar);
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
                            {touchingGroups.map((group) => {
                                return (
                                    <BarPolyrhythmFragment
                                        group={group}
                                        key={group.key}
                                        instrumentColor={track.instrument.color}
                                        elementRef={this.getFragmentElementRef(group.key)}
                                        noteElementRef={this.getNoteElementRef}
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
                                        elementRef={this.getNoteElementRef(note.id)}
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
            ...this.getTrackDisplayData(track),
        });
    };

    private handleTrackViewModeToggled = (trackViewMode: "grid" | "staff") => {
        this.setState({ trackViewMode });

        return Promise.resolve(true);
    };

    private computeStaffBarData(
        barNotes: readonly ISbDmNoteEvent[],
        touchingGroups: readonly IEventPolyrhythmGroup[],
        barNumber: number,
        stepsPerBar: number,
    ): IStaffBarData {
        // If a full-bar polyrhythm is the only sounding source, render using its own subdivision count
        // instead of forcing the default grid resolution.
        const baseHasSoundingNotes = barNotes.some((note) => {
            return note.noteStyle !== undefined;
        });
        const fullBarPolyrhythmSlices = touchingGroups.map((group) => {
            const overlap = this.getPolyrhythmBarOverlap(group);
            if (overlap.startStep !== 1 || overlap.stepsInBar !== stepsPerBar) {
                return undefined;
            }

            if (group.events.length === 0) {
                return undefined;
            }

            return group.events;
        }).filter((slice): slice is IEventPolyrhythmGroup["events"] => {
            return slice !== undefined;
        });

        if (!baseHasSoundingNotes && fullBarPolyrhythmSlices.length > 0) {
            const primarySlice = fullBarPolyrhythmSlices.reduce((longest, current) => {
                return current.length > longest.length ? current : longest;
            });

            const polyStepsPerBar = primarySlice.length;
            const staffNotes = primarySlice.map((event, index) => {
                return {
                    timing: { bar: barNumber, step: index + 1 },
                    noteStyle: event.noteStyle,
                    start: { numerator: index, denominator: polyStepsPerBar },
                    duration: { numerator: 1, denominator: polyStepsPerBar },
                };
            });

            return {
                notes: staffNotes,
                slotCount: polyStepsPerBar,
            };
        }

        const noteByStep = new Map<number, IStaffBarData["notes"][number]>();

        for (const note of barNotes) {
            // Only forward sounding notes; rests are derived from gaps in the staff viewer.
            if (!note.noteStyle) {
                continue;
            }

            noteByStep.set(note.timing.step, {
                timing: note.timing,
                noteStyle: note.noteStyle,
                start: note.start,
                duration: note.duration,
            });
        }

        for (const group of touchingGroups) {
            const overlap = this.getPolyrhythmBarOverlap(group);
            const eventSlice = group.events;
            if (eventSlice.length === 0) {
                continue;
            }

            for (let index = 0; index < eventSlice.length; index++) {
                const polyEvent = eventSlice[index];
                if (!polyEvent.noteStyle) {
                    continue;
                }

                const relativeStep = Math.min(
                    overlap.stepsInBar - 1,
                    Math.floor((index * overlap.stepsInBar) / eventSlice.length),
                );
                const step = overlap.startStep + relativeStep;
                const existing = noteByStep.get(step);
                if (existing?.noteStyle) {
                    continue;
                }

                // Polyrhythm-derived staff notes occupy a single grid slot for layout purposes.
                noteByStep.set(step, {
                    timing: { bar: barNumber, step },
                    noteStyle: polyEvent.noteStyle,
                    start: { numerator: step - 1, denominator: stepsPerBar },
                    duration: { numerator: 1, denominator: stepsPerBar },
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

    private getTrackDisplayData(track: ISbDmTrack): Pick<IBarTrackRowState, "notes" | "polyrhythmGroups"> {
        const { arrangementPlayer } = this.props;
        const notes = track.arrangement.timeParams.timings
            .map((timing) => {
                return track.getNoteAt(timing);
            })
            .filter((note): note is ISbDmNoteEvent => {
                return note !== undefined;
            });

        return {
            notes,
            polyrhythmGroups: new PolyrhythmEventGroupBuilder(track, arrangementPlayer.scoreMetrics.stepsPerBar)
                .build(),
        };
    }

    private getPolyrhythmBarOverlap(group: IEventPolyrhythmGroup): { startStep: number; stepsInBar: number; } {
        return {
            startStep: group.startStep,
            stepsInBar: group.stepsInBar,
        };
    }

    private repositionFragments(): void {
        const { barNumber } = this.props;
        const { polyrhythmGroups } = this.state;
        const rowEl = this.rowRef.current;
        if (!rowEl) {
            return;
        }

        for (const group of polyrhythmGroups) {
            if (group.measureNumber !== barNumber) {
                continue;
            }

            const fragmentEl = this.fragmentElements.get(group.key);
            if (!fragmentEl) {
                continue;
            }

            const startNote = this.noteElements.get(group.startNoteId);
            const endNote = this.noteElements.get(group.endNoteId);
            if (!startNote || !endNote) {
                continue;
            }

            const rowRect = rowEl.getBoundingClientRect();
            const startRect = startNote.getBoundingClientRect();
            const endRect = endNote.getBoundingClientRect();
            const startLeft = startRect.left - rowRect.left;
            const endRight = endRect.right - rowRect.left;

            fragmentEl.style.left = `${startLeft}px`;
            fragmentEl.style.width = `${endRight - startLeft}px`;
        }
    }

    private getNoteElementRef = (noteId: number) => {
        return (element: HTMLDivElement | null) => {
            if (element) {
                this.noteElements.set(noteId, element);
            } else {
                this.noteElements.delete(noteId);
            }
        };
    };

    private getFragmentElementRef = (groupKey: string) => {
        return (element: HTMLDivElement | null) => {
            if (element) {
                this.fragmentElements.set(groupKey, element);
            } else {
                this.fragmentElements.delete(groupKey);
            }
        };
    };
}
