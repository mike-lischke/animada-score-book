/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmNoteEvent, ISbDmTrack } from "../../core/ScoreBookDataModel.js";
import type { INoteStyle } from "../../core/types/general.js";
import {
    addFractions, areSameFractions, compareFractions,
} from "../../core/serialisation/numeric-functions.js";

export interface IEventPolyrhythmGroup {
    key: string;
    measureNumber: number;
    startStep: number;
    stepsInBar: number;
    startNoteId: number;
    endNoteId: number;
    noteCount: number;
    events: IPolyrhythmGroupEvent[];
}

export interface IPolyrhythmGroupEvent {
    id: number;
    noteStyle?: INoteStyle;
}

export class PolyrhythmEventGroupBuilder {
    public constructor(private readonly track: ISbDmTrack, private readonly stepsPerBar: number) {
    }

    public build(): IEventPolyrhythmGroup[] {
        const { track } = this;
        const groups: IEventPolyrhythmGroup[] = [];

        for (const measure of track.measures) {
            groups.push(...this.derivePolyrhythmGroupsFromMeasure(measure.events, measure.number));
        }

        return groups;
    }

    public hasGroups(): boolean {
        const { track } = this;

        return track.measures.some((measure) => {
            return this.derivePolyrhythmGroupsFromMeasure(measure.events, measure.number).length > 0;
        });
    }

    private derivePolyrhythmGroupsFromMeasure(events: ISbDmNoteEvent[],
        measureNumber: number): IEventPolyrhythmGroup[] {
        const groups: IEventPolyrhythmGroup[] = [];
        const sortedEvents = [...events].sort((left, right) => {
            return compareFractions(left.start, right.start);
        });

        const { stepsPerBar } = this;

        // An event is grid-aligned when its duration is an integer multiple of one grid slot
        // (i.e. k / stepsPerBar). Such events — including grid notes whose duration was extended
        // to absorb following rests within their pulse — are never polyrhythm candidates.
        const isGridAlignedDuration = (event: ISbDmNoteEvent): boolean => {
            return (event.duration.numerator * stepsPerBar) % event.duration.denominator === 0;
        };

        let index = 0;
        while (index < sortedEvents.length) {
            const first = sortedEvents[index];
            if (isGridAlignedDuration(first)) {
                index++;
                continue;
            }

            const groupedEvents: ISbDmNoteEvent[] = [first];
            let expectedStart = addFractions(first.start, first.duration);
            let cursor = index + 1;

            while (cursor < sortedEvents.length) {
                const next = sortedEvents[cursor];
                if (isGridAlignedDuration(next)
                    || !areSameFractions(next.duration, first.duration)
                    || !areSameFractions(next.start, expectedStart)) {
                    break;
                }

                groupedEvents.push(next);
                expectedStart = addFractions(expectedStart, first.duration);
                cursor++;
            }

            if (groupedEvents.length > 1) {
                groups.push(this.createGroup(groupedEvents, measureNumber));
            }

            index = cursor;
        }

        return groups;
    }

    private createGroup(groupedEvents: ISbDmNoteEvent[], measureNumber: number): IEventPolyrhythmGroup {
        const { stepsPerBar, track } = this;
        const first = groupedEvents[0];
        const last = groupedEvents[groupedEvents.length - 1];
        const end = addFractions(last.start, last.duration);
        const startUnits = (first.start.numerator * stepsPerBar) / first.start.denominator;
        const endUnits = (end.numerator * stepsPerBar) / end.denominator;
        const startFloor = Math.floor(startUnits);
        const endCeil = Math.ceil(endUnits);
        const startStep = startFloor + 1;
        const endStep = Math.max(startStep, endCeil);
        const startNote = track.getNoteAt({ bar: measureNumber, step: startStep });
        const endNote = track.getNoteAt({ bar: measureNumber, step: endStep });

        return {
            key: `${measureNumber}:${first.id}:${last.id}:${groupedEvents.length}`,
            measureNumber,
            startStep,
            stepsInBar: Math.max(1, endCeil - startFloor),
            startNoteId: startNote?.id ?? first.id,
            endNoteId: endNote?.id ?? last.id,
            noteCount: groupedEvents.length,
            events: groupedEvents.map((event) => {
                return {
                    id: event.id,
                    noteStyle: event.noteStyle,
                };
            }),
        };
    }
}
