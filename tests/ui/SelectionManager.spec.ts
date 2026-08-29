/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmNoteEvent, type ISbDmTrack
} from "../../src/core/ScoreBookDataModel.js";
import type { Mutable } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import {
    SelectionGranularity, type ISelectionDelta, type ISelectionEntry
} from "../../src/ui/selection-types.js";

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
        measureNumber: 1,
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 1 },
        timing: { bar: 1, step: 1 },
        track: undefined as unknown as ISbDmTrack,
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
        expect(manager.isNoteSelected(1, 1, 1)).toBe(false);
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

        const note: ISelectionEntry = {
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: 1,
            startStep: 0,
            endStep: 0,
            noteId: 1,
        };

        manager.selectSingleNote(note);
        added.length = 0;
        removed.length = 0;

        const clearedA: ISelectionEntry = {
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: 1,
            startStep: 0,
            endStep: 0,
        };

        const clearedB: ISelectionEntry = {
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: 1,
            startStep: 2,
            endStep: 2,
        };

        manager.replaceSelection([clearedA, clearedB]);
        requisitions.unregister("selectionChanged", spy);

        expect(manager.currentSelection.size).toBe(2);
        expect([...manager.currentSelection.values()]).toEqual([clearedA, clearedB]);
        expect(added).toEqual([clearedA, clearedB]);
        expect(removed).toEqual([note]);
    });
});
