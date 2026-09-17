/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppStorage } from "../../src/core/AppStorage.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure, type ScoreBookDataModel,
} from "../../src/core/ScoreBookDataModel.js";
import type { IFraction, Mutable } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import {
    SelectionGranularity, type ISelectionDelta, type ISelectionEntry
} from "../../src/ui/SelectionSerializer.js";

const makeArrangement = (tracks: ISbDmTrack[]): ISbDmArrangement => {
    const arrangement: ISbDmArrangement = {
        type: SbDmEntityType.Arrangement,
        id: 1,
        title: "arr",
        tracks,
        timeParams: {
            timeSignature: "4/4",
            tempo: 120,
            length: 1,
            pulse: "1/4",
            stepResolution: 8,
            timings: [],
            isValid: () => {
                return true;
            },
        },
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        duplicateTrack: vi.fn(),
        applyArrangementSnapshot: vi.fn(),
        mainVolume: 100,
        loop: false,
        useMetronome: false,
        countIn: false,
        measureLabels: {},
    };

    return arrangement;
};

const makeTrack = (notes: Array<Mutable<ISbDmNoteEvent>>, arrangement: ISbDmArrangement): ISbDmTrack => {
    const track: ISbDmTrack = {
        type: SbDmEntityType.Track,
        id: Math.floor(Math.random() * 1000),
        name: "track",
        volume: 1,
        effectiveVolume: 1,
        arrangement,
        instrument: {
            type: SbDmEntityType.Instrument,
            id: 1,
            typeId: "inst",
            displayOrder: 0,
            displayName: "inst",
            image: {
                type: SbDmEntityType.InstrumentImage,
                id: 1,
                filePath: "path/to/image.png",
            },
            color: "blue",
            state: {
                initialized: true,
                isLeaf: true,
                expanded: false,
                expandedOnce: false,
            },
            noteStyles: {},
            range: [21, 108],
        },
        measures: [],
        clear: vi.fn(),
        getNoteAt: () => {
            return undefined;
        },
        get notes() {
            return (function* () {
                for (const n of notes) {
                    yield n;
                }
            })();
        }
    };

    notes.forEach((n) => {
        n.track = track;
    });

    return track;
};

const makeNote = (id: number): Mutable<ISbDmNoteEvent> => {
    return {
        type: SbDmEntityType.NoteEvent,
        id,
        measure: {
            type: SbDmEntityType.TrackMeasure,
            id: 1,
            track: { id: 7, measures: [] } as unknown as ISbDmTrack,
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: [],
            subdivisions: [],
            noteEvents: [],
        },
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 1 },
        timing: { bar: 1, step: 1 },
        track: undefined as unknown as ISbDmTrack,
    };
};

/**
 * Builds the selection entry of a note cell. The selection holds model objects, so the tests only
 * need a note, its measure and the addressed start.
 *
 * @param note The note the cell belongs to.
 * @param start The cell start within the note's measure.
 *
 * @returns The selection entry addressing that cell.
 */
const cellEntry = (note: Mutable<ISbDmNoteEvent>, start: IFraction): ISelectionEntry => {
    return {
        granularity: SelectionGranularity.Note,
        target: { granularity: SelectionGranularity.Note, measure: note.measure, event: note, start },
    };
};

describe.sequential("SelectionManager (class)", () => {
    let manager: SelectionManager;
    let track: ISbDmTrack;
    let noteA: Mutable<ISbDmNoteEvent>;
    let noteB: Mutable<ISbDmNoteEvent>;

    beforeEach(() => {
        noteA = makeNote(1);
        noteB = makeNote(2);
        const arrangement = makeArrangement([] as ISbDmTrack[]);
        track = makeTrack([noteA, noteB], arrangement);
        arrangement.tracks.push(track);
        manager = new SelectionManager();
    });

    it("starts with nothing selected", () => {
        expect(manager.currentSelection.size).toBe(0);
        expect(manager.hasSelection).toBe(false);
    });

    it("stores a selection without its model objects", () => {
        vi.useFakeTimers();

        const entry = cellEntry(noteA, { numerator: 0, denominator: 1 });

        manager.replaceSelection([entry]);
        vi.advanceTimersByTime(400);
        vi.useRealTimers();

        const stored = AppStorage.loadUISettings()?.viewSettings?.selectionState ?? "";

        expect(stored).not.toBe("");
        expect(JSON.parse(stored)).toEqual([{
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: 7,
            start: { numerator: 0, denominator: 1 },
            end: { numerator: 1, denominator: 1 },
        }]);
    });

    it("can construct via new", () => {
        const m = new SelectionManager();
        expect(m).toBeInstanceOf(SelectionManager);
    });

    it("replaceSelection swaps the whole selection and publishes a single delta", () => {
        const added: ISelectionEntry[] = [];
        const removed: ISelectionEntry[] = [];

        const spy = (delta: ISelectionDelta): Promise<boolean> => {
            added.push(...delta.added);
            removed.push(...delta.removed);

            return Promise.resolve(true);
        };

        requisitions.register("selectionChanged", spy);

        const note = cellEntry(noteA, { numerator: 0, denominator: 1 });

        manager.selectSingleNote(note);
        added.length = 0;
        removed.length = 0;

        const clearedA = cellEntry(noteA, { numerator: 0, denominator: 1 });
        const clearedB = cellEntry(noteB, { numerator: 2, denominator: 16 });

        manager.replaceSelection([clearedA, clearedB]);
        requisitions.unregister("selectionChanged", spy);

        expect(manager.currentSelection.size).toBe(2);
        expect([...manager.currentSelection.values()]).toEqual([clearedA, clearedB]);
        expect(added).toEqual([clearedA, clearedB]);
        expect(removed).toEqual([note]);
    });

    it("keeps note selections for subdivision slots after note ids are cleared", () => {
        const entries: ISelectionEntry[] = [0, 1, 2].map((slot) => {
            return cellEntry(noteA, { numerator: slot, denominator: 3 });
        });

        manager.replaceSelection(entries);

        expect(manager.currentSelection.size).toBe(3);
        expect([...manager.currentSelection.values()]).toEqual(entries);
    });
});

describe.sequential("SelectionManager re-validation after undo/redo", () => {
    it("keeps selections whose measure content survived an undo and drops the others", () => {
        const arrangement = makeArrangement([] as ISbDmTrack[]);

        const measure1 = {
            id: 11,
            type: SbDmEntityType.TrackMeasure,
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 8, beatGroups: [8] },
            events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 } }],
            subdivisions: [],
            noteEvents: [makeNote(1_001_001)],
        } as unknown as ISbDmTrackMeasure;

        const measure2Events = [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 } },
        ];
        const measure2 = {
            id: 12,
            type: SbDmEntityType.TrackMeasure,
            number: 2,
            meter: { beats: 4, beatUnits: 4, stepResolution: 8, beatGroups: [8] },
            events: measure2Events,
            subdivisions: [],
            noteEvents: [makeNote(1_002_001)],
        } as unknown as ISbDmTrackMeasure;

        const track = makeTrack([], arrangement);
        (track as Mutable<ISbDmTrack>).measures = [measure1, measure2];
        (measure1 as Mutable<ISbDmTrackMeasure>).track = track;
        (measure2 as Mutable<ISbDmTrackMeasure>).track = track;
        arrangement.tracks.push(track);

        const manager = new SelectionManager({ arrangement } as unknown as ScoreBookDataModel);

        manager.selectNotes([
            {
                granularity: SelectionGranularity.Note,
                target: { granularity: SelectionGranularity.Note, measure: measure1, event: measure1.events[0] },
            },
            {
                granularity: SelectionGranularity.Note,
                target: { granularity: SelectionGranularity.Note, measure: measure2, event: measure2.events[0] },
            },
        ]);

        // Simulate an undo that removed the content of measure 2, so its selected cell no longer exists.
        measure2Events.splice(0, 1);

        void requisitions.execute("arrangementReverted", undefined);

        expect(manager.isCellSelected(measure1, { numerator: 0, denominator: 1 })).toBe(true);
        expect(manager.isCellSelected(measure2, { numerator: 0, denominator: 1 })).toBe(false);
    });
});
