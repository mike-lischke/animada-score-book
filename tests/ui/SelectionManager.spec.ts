/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmNote, type ISbDmTrack
} from "../../src/core/ScoreBookDataModel.js";
import type { Mutable } from "../../src/core/types/general.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";

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
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
        },
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        applyArrangementSnapshot: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
    };

    return arrangement;
};

const makeTrack = (notes: Array<Mutable<ISbDmNote>>, arrangement: ISbDmArrangement): ISbDmTrack => {
    const track: ISbDmTrack = {
        type: SbDmEntityType.Track,
        id: Math.floor(Math.random() * 1000),
        name: "track",
        volume: 1,
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
            colourGroup: "blue",
            state: {
                initialized: true,
                isLeaf: true,
                expanded: false,
                expandedOnce: false,
            },
            noteStyles: {},
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            audioPath: "path/to/audio",
            range: [21, 108],
            noteStyleCount: 1,
        },
        notes,
        polyrhythms: [],
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        addPolyrhythm: vi.fn(),
        removePolyrhythm: vi.fn(),
        clear: vi.fn(),
        getNoteAt: () => {
            return undefined;
        },
        getNoteIterator: function* () {
            for (const n of notes) {
                yield n;
            }
        }
    };

    notes.forEach((n) => {
        n.track = track;
    });

    return track;
};

const makeNote = (id: number): Mutable<ISbDmNote> => {
    return {
        type: SbDmEntityType.Note,
        id,
        timing: { bar: 1, step: 1 },
        track: undefined as unknown as ISbDmTrack,
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
    };
};

describe("SelectionManager (class)", () => {
    let manager: SelectionManager;
    let track: ISbDmTrack;
    let noteA: Mutable<ISbDmNote>;
    let noteB: Mutable<ISbDmNote>;

    beforeEach(() => {
        noteA = makeNote(1);
        noteB = makeNote(2);
        const arrangement = makeArrangement([] as ISbDmTrack[]);
        track = makeTrack([noteA, noteB], arrangement);
        arrangement.tracks.push(track);
        manager = new SelectionManager();
    });

    it("starts with nothing selected", () => {
        expect(manager.selections.size).toBe(0);
        expect(manager.isSelected(noteA)).toBe(false);
    });

    it("selects a single note on click and publishes", () => {
        const publishSpy = vi.fn();
        manager.subscribe(publishSpy);
        manager.handleClick(noteA);
        expect(manager.isSelected(noteA)).toBe(true);
        expect(manager.selections.get(track)!.range).toEqual([noteA, noteA]);
        expect(publishSpy).toHaveBeenCalled();
    });

    it.skip("clicking the same anchor again clears selection", () => {
        manager.handleClick(noteA);
        manager.handleClick(noteA);
        expect(manager.isSelected(noteA)).toBe(false);
    });

    it("drag selects a range on the same track", () => {
        manager.handleClick(noteA);
        manager.handleMouseDown(noteA);
        manager.handleDragSelect(noteB);
        const selection = manager.selections.get(track)!;
        expect(selection.selectedNotes.has(noteA)).toBe(true);
        expect(selection.selectedNotes.has(noteB)).toBe(true);
        expect(selection.range).toEqual([noteA, noteB]);
    });

    it("deselectAll clears selection and publishes", () => {
        const publishSpy = vi.fn();
        manager.subscribe(publishSpy);
        manager.handleClick(noteA);
        manager.deselectAll();
        expect(manager.selections.size).toBe(0);
        expect(publishSpy).toHaveBeenCalled();
    });

    it("can construct via new", () => {
        const m = new SelectionManager();
        expect(m).toBeInstanceOf(SelectionManager);
    });
});
