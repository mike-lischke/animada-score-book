/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, it } from "vitest";

import type { ISbDmTrack, ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import type { IMeasureEvent } from "../../src/core/types/general.js";
import { ScoreElementKind, ScoreElementRegistry } from "../../src/ui/ScoreElementRegistry.js";
import { SelectionGranularity, type ISelectionTarget } from "../../src/ui/SelectionSerializer.js";

it("resolves the cells a selection target addresses", () => {
    const registry = new ScoreElementRegistry();
    const cell = document.createElement("div");
    const run = document.createElement("div");
    const arrangement: { tracks: ISbDmTrack[]; } = { tracks: [] };
    const track = { id: 3, measures: [], arrangement } as unknown as ISbDmTrack;
    arrangement.tracks.push(track);
    const measure = { number: 2, track } as unknown as ISbDmTrackMeasure;
    track.measures.push(measure);
    const event: IMeasureEvent = {
        start: { numerator: 1, denominator: 2 },
        duration: { numerator: 1, denominator: 4 },
    };

    registry.createRef({ kind: ScoreElementKind.GridCell, bar: 2, trackId: 3, step: 2, start: event.start },
        event)(cell);
    registry.createRef({ kind: ScoreElementKind.StaffRun, bar: 2, trackId: 3, step: 2 }, event)(run);

    // A cell is addressed by its exact start; without one the lookup returns every element of the event.
    expect(registry.findTargetElements({
        granularity: SelectionGranularity.Note, measure, event, start: event.start,
    })).toEqual([cell]);
    expect(registry.findTargetElements({
        granularity: SelectionGranularity.Note, measure, event,
    })).toEqual([cell, run]);
});

it("expands a bar-level or track-piece target to the rendered pieces", () => {
    const registry = new ScoreElementRegistry();
    const firstCell = document.createElement("div");
    const secondCell = document.createElement("div");
    const arrangement: { tracks: ISbDmTrack[]; } = { tracks: [] };
    const firstTrack = { id: 1, measures: [], arrangement } as unknown as ISbDmTrack;
    const secondTrack = { id: 2, measures: [], arrangement } as unknown as ISbDmTrack;
    arrangement.tracks.push(firstTrack, secondTrack);
    const firstMeasure = { number: 1, track: firstTrack } as unknown as ISbDmTrackMeasure;
    const secondMeasure = { number: 1, track: secondTrack } as unknown as ISbDmTrackMeasure;
    firstTrack.measures.push(firstMeasure);
    secondTrack.measures.push(secondMeasure);

    registry.createRef({ kind: ScoreElementKind.GridCell, bar: 1, trackId: 1, step: 0 })(firstCell);
    registry.createRef({ kind: ScoreElementKind.GridCell, bar: 1, trackId: 2, step: 0 })(secondCell);

    expect(registry.findTargetElements({ granularity: SelectionGranularity.Measure, measure: firstMeasure }))
        .toEqual([firstCell, secondCell]);
    expect(registry.findTargetElements({
        granularity: SelectionGranularity.TrackPiece, track: secondTrack, measure: secondMeasure,
    })).toEqual([secondCell]);
    expect(registry.findTargetElements({ granularity: SelectionGranularity.Track, track: secondTrack }))
        .toEqual([secondCell]);
});

it("unions the cells of a note group and drops elements of groups without events", () => {
    const registry = new ScoreElementRegistry();
    const firstCell = document.createElement("div");
    const secondCell = document.createElement("div");
    const measure = { number: 1, track: { id: 1 } } as unknown as ISbDmTrackMeasure;
    const firstEvent: IMeasureEvent = {
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 4 },
    };
    const secondEvent: IMeasureEvent = {
        start: { numerator: 1, denominator: 4 },
        duration: { numerator: 1, denominator: 4 },
    };

    registry.createRef({ kind: ScoreElementKind.StaffRun, bar: 1, trackId: 1 }, firstEvent)(firstCell);
    registry.createRef({ kind: ScoreElementKind.StaffRun, bar: 1, trackId: 1 }, secondEvent)(secondCell);

    expect(registry.findTargetElements({
        granularity: SelectionGranularity.NoteGroup, measure, events: [firstEvent, secondEvent],
    })).toEqual([firstCell, secondCell]);
    expect(registry.findTargetElements({
        granularity: SelectionGranularity.NoteGroup, measure, events: [],
    })).toEqual([]);
});

it("finds the element at a score position by step or exact start", () => {
    const registry = new ScoreElementRegistry();
    const cell = document.createElement("div");
    const slot = document.createElement("div");

    registry.createRef({ kind: ScoreElementKind.GridCell, bar: 3, trackId: 5, step: 1 })(cell);
    registry.createRef({
        kind: ScoreElementKind.GridCell, bar: 3, trackId: 5, step: 2, start: { numerator: 1, denominator: 3 },
    })(slot);

    expect(registry.findPositionElement(3, 5, ScoreElementKind.GridCell, 1)).toBe(cell);
    expect(registry.findPositionElement(3, 5, ScoreElementKind.GridCell, 2, { numerator: 1, denominator: 3 }))
        .toBe(slot);
    expect(registry.findPositionElement(3, 5, ScoreElementKind.StaffRun, 1)).toBeUndefined();
    expect(registry.findPositionElement(4, 5, ScoreElementKind.GridCell, 1)).toBeUndefined();
});

it("replaces and clears callback-ref registrations", () => {
    const registry = new ScoreElementRegistry();
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const arrangement: { tracks: ISbDmTrack[]; } = { tracks: [] };
    const track = { id: 7, measures: [], arrangement } as unknown as ISbDmTrack;
    arrangement.tracks.push(track);
    const measure = { number: 2, track } as unknown as ISbDmTrackMeasure;
    track.measures.push(measure);
    const start = { numerator: 1, denominator: 2 };
    const event: IMeasureEvent = { start, duration: { numerator: 1, denominator: 4 } };
    const target: ISelectionTarget = { granularity: SelectionGranularity.Note, measure, event, start };
    const ref = registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 2,
        trackId: 7,
        step: 4,
        start,
    }, event);

    ref(firstElement);
    expect(registry.findTargetElements(target, ScoreElementKind.GridCell)).toEqual([firstElement]);

    ref(secondElement);
    expect(registry.findTargetElements(target, ScoreElementKind.GridCell)).toEqual([secondElement]);
    expect(registry.getLocation(firstElement)).toBeUndefined();

    ref(null);
    expect(registry.findTargetElements(target, ScoreElementKind.GridCell)).toEqual([]);
});

it("resolves a rendered element by the model object it renders", () => {
    const registry = new ScoreElementRegistry();
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const target: IMeasureEvent = {
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 4 },
    };
    const ref = registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 1,
        trackId: 3,
        step: 0,
    }, target);

    expect(registry.findTargetElement(target)).toBeUndefined();

    ref(firstElement);
    expect(registry.findTargetElement(target)).toBe(firstElement);

    ref(secondElement);
    expect(registry.findTargetElement(target)).toBe(secondElement);

    ref(null);
    expect(registry.findTargetElement(target)).toBeUndefined();
});

it("reports the model object a rendered element stands for", () => {
    const registry = new ScoreElementRegistry();
    const element = document.createElement("div");
    const target: IMeasureEvent = {
        start: { numerator: 1, denominator: 4 },
        duration: { numerator: 1, denominator: 4 },
    };

    registry.createRef({ kind: ScoreElementKind.GridCell, bar: 1, trackId: 3, step: 4 }, target)(element);

    expect(registry.getTarget(element)).toBe(target);

    registry.createRef({ kind: ScoreElementKind.GridCell, bar: 1, trackId: 3, step: 5 })(document.createElement("div"));
    expect(registry.getTarget(element)).toBe(target);
    expect(registry.getTarget(document.createElement("div"))).toBeUndefined();
});

it("forgets the model object index when the registry is cleared", () => {
    const registry = new ScoreElementRegistry();
    const element = document.createElement("div");
    const target: IMeasureEvent = {
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 4 },
    };

    registry.createRef({ kind: ScoreElementKind.TrackRow, bar: 1, trackId: 3 }, target)(element);
    expect(registry.findTargetElement(target)).toBe(element);

    registry.clear();
    expect(registry.findTargetElement(target)).toBeUndefined();
});

it("distinguishes tuplet slots that share a step", () => {
    const registry = new ScoreElementRegistry();
    const firstSlot = document.createElement("div");
    const secondSlot = document.createElement("div");
    const track = { id: 2 } as unknown as ISbDmTrack;
    const measure = { number: 1, track } as unknown as ISbDmTrackMeasure;
    const start = { numerator: 5, denominator: 12 };
    const event: IMeasureEvent = { start, duration: { numerator: 1, denominator: 12 } };

    registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 1,
        trackId: 2,
        step: 3,
        start: { numerator: 3, denominator: 8 },
    })(firstSlot);
    registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 1,
        trackId: 2,
        step: 3,
        start,
    })(secondSlot);

    expect(registry.findTargetElements({
        granularity: SelectionGranularity.Note, measure, event, start,
    })).toEqual([secondSlot]);
});

it("filters registered elements by kind, bar, and track", () => {
    const registry = new ScoreElementRegistry();
    const firstRow = document.createElement("div");
    const secondRow = document.createElement("div");
    const gridCell = document.createElement("div");

    registry.createRef({
        kind: ScoreElementKind.TrackRow,
        bar: 1,
        trackId: 2,
    })(firstRow);
    registry.createRef({
        kind: ScoreElementKind.TrackRow,
        bar: 2,
        trackId: 2,
    })(secondRow);
    registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 1,
        trackId: 2,
        step: 3,
    })(gridCell);

    expect(registry.findElements(ScoreElementKind.TrackRow, undefined, 2)).toEqual([firstRow, secondRow]);
    expect(registry.findElements(ScoreElementKind.TrackRow, 1, 2)).toEqual([firstRow]);
    expect(registry.getLocation(gridCell)).toMatchObject({
        kind: ScoreElementKind.GridCell,
        bar: 1,
        trackId: 2,
        step: 3,
    });
});
