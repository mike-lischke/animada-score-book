/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { INoteView, ITrackView, IArrangementView } from "../../src/core/types/general.js";
import { SelectionManager, createSelectionManager } from "../../src/ui/SelectionManager.js";

const makeArrangement = (tracks: ITrackView[]): IArrangementView => {
    const arrangement: IArrangementView = {
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
            subscribe: () => {
                /* no-op */
            },
            unsubscribe: () => {
                /* no-op */
            },
        },
        subscribe: () => {
            /* no-op */
        },
        unsubscribe: () => {
            /* no-op */
        },
    };

    return arrangement;
};

const makeTrack = (notes: INoteView[], arrangement: IArrangementView): ITrackView => {
    const track: ITrackView = {
        id: Math.floor(Math.random() * 1000),
        arrangement,
        instrument: {
            id: "i1",
            displayOrder: 0,
            displayName: "inst",
            icon: "",
            colourGroup: "blue",
            loaded: true,
            noteStyles: {},
            subscribe: () => {
                /* no-op */
            },
            unsubscribe: () => {
                /* no-op */
            },
        },
        notes,
        polyrhythms: [],
        subscribe: () => {
            /* no-op */
        },
        unsubscribe: () => {
            /* no-op */
        },
        getNoteAt: () => {
            return undefined;
        },
        getNoteIterator: function* () {
            for (const n of notes) {
                yield n;
            }
        }
    } as unknown as ITrackView;

    notes.forEach((n) => {
        n.track = track;
    });

    return track;
};

const makeNote = (id: string): INoteView => {
    return {
        id,
        timing: { bar: 1, step: 1 },
        track: undefined as unknown as ITrackView,
        subscribe: () => {
            /* no-op */
        },
        unsubscribe: () => {
            /* no-op */
        },
    } as unknown as INoteView;
};

describe("SelectionManager (class)", () => {
    let manager: SelectionManager;
    let track: ITrackView;
    let noteA: INoteView;
    let noteB: INoteView;

    beforeEach(() => {
        noteA = makeNote("A");
        noteB = makeNote("B");
        const arrangement = makeArrangement([] as ITrackView[]);
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
