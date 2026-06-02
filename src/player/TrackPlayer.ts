/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import {
    SbDmEntityType, type ISbDmNoteEvent, type ISbDmTrack, type ISbDmTrackMeasure, type RealTime
} from "../core/ScoreBookDataModel.js";
import {
    addFractions, compareFractions, reduceFraction, subtractFractions,
} from "../core/serialisation/numeric-functions.js";
import type { IFraction, ISubdivision } from "../core/types/general.js";
import { getNewId } from "../core/utils.js";
import type { TimeCoordinator } from "./TimeCoordinator.js";
import { Event, IInterval } from "./types.js";

interface ISerializedMeasureEvent {
    start: IFraction;
    duration: IFraction;
    noteStyleId: string;
}

/**
 * Coordinates playback for a single track.
 *
 * - Caches real-time positions for note events based on `timeCoordinator`.
 * - Produces audio events for time intervals.
 * - Keeps caches in sync with instrument load state, track edits, and timing changes.
 * - Provides a robust lifecycle via `onStop()` and `dispose()`.
 */
export class TrackPlayer {
    public readonly track: ISbDmTrack;

    private readonly timeCoordinator: TimeCoordinator;

    private disposed = false;

    private setupNotes: (() => void) | null = null;

    /**
     * Creates a player for the given track and sets up note timing caches and subscriptions.
     *
     * @param track The track view to observe and play.
     * @param timeCoordinator Converts score timings to real-time and provides loop/length context.
     */
    public constructor(track: ISbDmTrack, timeCoordinator: TimeCoordinator) {
        this.track = track;
        this.timeCoordinator = timeCoordinator;

        // Build runtime measure events immediately for UI/rendering, even if audio buffers are not loaded yet.
        this.rebuildEventCache();

        // Rebuild once instrument assets become ready.
        if (!this.track.instrument.state.initialized) {
            this.setupNotes = () => {
                this.rebuildEventCache();
                this.track.instrument.unsubscribe(this.setupNotes!);
                this.setupNotes = null;
            };
            this.track.instrument.subscribe(this.setupNotes);
        }

        // Subscriptions to keep internal caches in sync.
        this.track.subscribe(this.handleTrackChange);
        this.timeCoordinator.subscribe(this.handleTimeChange);
        this.track.arrangement.subscribe(this.destroySelfIfNeeded);
    }

    /**
     * Builds all audio events for the given real-time interval.
     * Returns an empty list if the instrument is not loaded or the player is disposed.
     *
     * @param interval The real-time interval for which to retrieve events. `end` is treated as exclusive.
     *
     * @returns Events occurring within the interval, ordered by time.
     */
    public getEvents = (interval: IInterval): Event[] => {
        if (this.disposed || !this.track.instrument.state.initialized) {
            return [];
        }

        const events: Event[] = [];

        for (const event of this.track.notes) {
            const realTime = this.timeCoordinator.convertEventToRealTime(event);
            // Treat `end` as exclusive. Events exactly on this end are included in the following interval.
            if (realTime >= interval.end) {
                break;
            }

            if (realTime >= interval.start && event.noteStyle) {
                events.push(this.getAudioEvent(event, realTime));
            }
        }

        return events;
    };

    /** No-op; retained for the IEventSource interface. */
    public onStop = (): void => {
        /* nothing transient to reset */
    };

    /** Disposes all subscriptions and internal state. Safe to call multiple times. */
    public dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;

        // Unsubscribe from all sources and clear any pending instrument setup subscription.
        this.timeCoordinator.unsubscribe(this.handleTimeChange);
        this.track.unsubscribe(this.handleTrackChange);
        this.track.arrangement.unsubscribe(this.destroySelfIfNeeded);
        if (this.setupNotes) {
            this.track.instrument.unsubscribe(this.setupNotes);
            this.setupNotes = null;
        }
    }

    /** Rebuilds runtime note events from steps/subdivisions and stores them in measure.events. */
    private rebuildEventCache = (): void => {
        for (const measure of this.track.measures) {
            const runtimeEvents = this.materializeMeasureEvents(measure);
            measure.events.splice(0, measure.events.length, ...runtimeEvents);
        }
    };

    private materializeMeasureEvents(measure: ISbDmTrackMeasure): ISbDmNoteEvent[] {
        const serializedEvents = this.createSerializedEventsFromMeasure(measure);
        const stepsPerBar = measure.meter.stepResolution;
        const pulseFraction = this.parsePulseFraction();
        const measureEnd: IFraction = { numerator: 1, denominator: 1 };

        const filteredEvents = serializedEvents.filter((event) => {
            if (event.noteStyleId !== "0") {
                return true;
            }

            return !this.isGridSlotDuration(event.duration, stepsPerBar);
        });

        return filteredEvents.map((event, index) => {
            let duration = event.duration;
            if (event.noteStyleId !== "0" && this.isGridMultipleDuration(duration, stepsPerBar)) {
                const nextStart = filteredEvents[index + 1]?.start ?? measureEnd;
                const pulseEnd = this.pulseBoundaryAfter(event.start, pulseFraction);
                const limit = compareFractions(nextStart, pulseEnd) < 0 ? nextStart : pulseEnd;
                const extendedDuration = subtractFractions(limit, event.start);
                if (compareFractions(extendedDuration, duration) > 0) {
                    duration = extendedDuration;
                }
            }

            return {
                id: getNewId(),
                type: SbDmEntityType.NoteEvent,
                measureNumber: measure.number,
                start: event.start,
                duration,
                track: this.track,
                timing: this.timingForEventStart(event.start, measure.number, stepsPerBar),
                noteStyle: event.noteStyleId === "0"
                    ? undefined
                    : this.track.instrument.noteStyles[event.noteStyleId],
            };
        });
    };

    private createSerializedEventsFromMeasure(measure: ISbDmTrackMeasure): ISerializedMeasureEvent[] {
        const stepsPerBar = measure.meter.stepResolution;
        const steps = [...measure.steps].sort((left, right) => {
            return left.index - right.index;
        });

        const stepStyleIds = steps.map((step) => {
            return step.noteStyleId ?? "0";
        });

        const subdivisions = measure.subdivisions;
        const topLevelSubdivisions = [...subdivisions]
            .filter((s) => {
                return s.parentSubdivisionId == null;
            })
            .sort((left, right) => {
                return left.startStep - right.startStep;
            });

        // Group child subdivisions by parent id and slot-relative index.
        // startStep is absolute, so the slot within the parent is (child.startStep - parent.startStep).
        const subdivisionsById = new Map(subdivisions.map((s) => {
            return [s.id, s] as const;
        }));

        const childrenByParentId = new Map<number, Map<number, ISubdivision>>();
        for (const sub of subdivisions) {
            if (sub.parentSubdivisionId != null) {
                const parent = subdivisionsById.get(sub.parentSubdivisionId);
                if (parent == null) {
                    continue;
                }

                const relativeSlot = sub.startStep - parent.startStep;
                let slotMap = childrenByParentId.get(sub.parentSubdivisionId);
                if (!slotMap) {
                    slotMap = new Map();
                    childrenByParentId.set(sub.parentSubdivisionId, slotMap);
                }
                slotMap.set(relativeSlot, sub);
            }
        }

        // Returns the total number of entries a subdivision (and all its descendants) occupies
        // in measure.steps[]. A nested child with actual=N replaces child.normal of the
        // parent's slots, so we subtract normal and add the child's expanded count.
        const totalVisibleSteps = (sub: ISubdivision): number => {
            const children = childrenByParentId.get(sub.id);
            if (!children || children.size === 0) {
                return sub.actual;
            }

            let size = sub.actual;
            for (const child of children.values()) {
                size = size - child.normal + totalVisibleSteps(child);
            }

            return size;
        };

        // startStep on top-level subdivisions is the absolute steps-array index. Convert to a
        // base-grid-keyed map by walking both counters in parallel.
        // We advance absIdx by totalVisibleSteps (not s.actual) so that nested subdivisions
        // whose sub-notes expand beyond s.actual are correctly skipped.
        const topLevelByAbsStep = new Map(topLevelSubdivisions.map((s) => {
            return [s.startStep, s] as const;
        }));

        const subdivisionsByBaseStep = new Map<number, ISubdivision>();
        {
            let absIdx = 0;

            for (let bStep = 0; bStep < stepsPerBar;) {
                const s = topLevelByAbsStep.get(absIdx);

                if (s) {
                    subdivisionsByBaseStep.set(bStep, s);
                    absIdx += totalVisibleSteps(s);
                    bStep += s.normal;
                } else {
                    absIdx++;
                    bStep++;
                }
            }
        }

        const serializedEvents: ISerializedMeasureEvent[] = [];
        let visibleStepIndex = 0;

        // Recursively expands a subdivision. parentNoteDuration is the duration of a single
        // slot in the enclosing context (1/stepsPerBar for top-level subdivisions).
        const expandSubdivision = (sub: ISubdivision, eventStart: IFraction,
            parentNoteDuration: IFraction): void => {
            const noteDuration = reduceFraction(
                sub.normal * parentNoteDuration.numerator,
                parentNoteDuration.denominator * sub.actual,
            );

            const children = childrenByParentId.get(sub.id);
            let slotStart = eventStart;
            let noteIndex = 0;

            while (noteIndex < sub.actual) {
                const child = children?.get(noteIndex);
                if (child) {
                    expandSubdivision(child, slotStart, noteDuration);
                    slotStart = addFractions(
                        slotStart,
                        reduceFraction(noteDuration.numerator * child.normal, noteDuration.denominator),
                    );
                    noteIndex += child.normal;
                } else {
                    serializedEvents.push({
                        start: slotStart,
                        duration: noteDuration,
                        noteStyleId: stepStyleIds[visibleStepIndex] ?? "0",
                    });
                    slotStart = addFractions(slotStart, noteDuration);
                    visibleStepIndex += 1;
                    noteIndex += 1;
                }
            }
        };

        let baseStep = 0;

        while (baseStep < stepsPerBar) {
            const sub = subdivisionsByBaseStep.get(baseStep);
            if (!sub) {
                serializedEvents.push({
                    start: reduceFraction(baseStep, stepsPerBar),
                    duration: reduceFraction(1, stepsPerBar),
                    noteStyleId: stepStyleIds[visibleStepIndex] ?? "0",
                });
                baseStep += 1;
                visibleStepIndex += 1;

                continue;
            }

            expandSubdivision(sub, reduceFraction(baseStep, stepsPerBar), reduceFraction(1, stepsPerBar));
            baseStep += sub.normal;
        }

        return serializedEvents;
    }

    private isGridSlotDuration(duration: IFraction, stepsPerBar: number): boolean {
        return duration.numerator * stepsPerBar === duration.denominator;
    }

    private isGridMultipleDuration(duration: IFraction, stepsPerBar: number): boolean {
        return (duration.numerator * stepsPerBar) % duration.denominator === 0;
    }

    private parsePulseFraction(): IFraction {
        const [numerator, denominator] = this.track.arrangement.timeParams.pulse.split("/").map(Number);
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
            return { numerator: 1, denominator: 4 };
        }

        return reduceFraction(numerator, denominator);
    }

    private pulseBoundaryAfter(start: IFraction, pulse: IFraction): IFraction {
        const startInPulses = (start.numerator * pulse.denominator) / (start.denominator * pulse.numerator);
        const nextK = Math.floor(startInPulses) + 1;
        const candidate = reduceFraction(nextK * pulse.numerator, pulse.denominator);
        const measureEnd: IFraction = { numerator: 1, denominator: 1 };

        return compareFractions(candidate, measureEnd) < 0 ? candidate : measureEnd;
    }

    private timingForEventStart(start: IFraction, measureNumber: number, stepsPerBar: number): {
        bar: number;
        step: number;
    } {
        const stepIndex = (start.numerator * stepsPerBar) / start.denominator;
        const step = Math.floor(stepIndex) + 1;

        return { bar: measureNumber, step };
    }

    /** Responds to structural changes in the track by rebuilding the event cache. */
    private handleTrackChange = (): void => {
        this.rebuildEventCache();
    };

    /** Reacts to arrangement timing changes by rebuilding the event cache. */
    private handleTimeChange = (): void => {
        this.rebuildEventCache();
    };

    /** Stops reacting if the track is removed from its arrangement (unsubscribes). */
    private destroySelfIfNeeded = (): void => {
        if (!this.track.arrangement.tracks.includes(this.track)) {
            this.timeCoordinator.unsubscribe(this.handleTimeChange);
            this.track.arrangement.unsubscribe(this.destroySelfIfNeeded);
        }
    };

    /**
     * Builds an audio event for a given note event at the provided real-time position.
     *
     * @param event The note event to play.
     * @param realTime The real-time position of the event.
     *
     * @returns An audio event for the note.
     */
    private getAudioEvent = (event: ISbDmNoteEvent, realTime: RealTime): Event => {
        return {
            kind: "audio",
            event,
            realTime,
            audioBuffer: event.noteStyle!.audioBuffer!
        };
    };
}
