/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { TrackClipboard } from "../../src/core/TrackClipboard.js";
import type { IArrangement, INote, INoteStyle, ITiming, ITrack } from "../../src/core/types/general.js";

describe("TrackClipboard", () => {
    let mockTrack: ITrack;
    let target: TrackClipboard;

    const makeNoteStyle = (id: string): INoteStyle => {
        return {
            id,
            symbol: undefined,
            muting: undefined,
            audioBuffer: null,
            instrument: {
                id: "inst",
                displayOrder: 0,
                displayName: "Instrument",
                icon: "",
                colourGroup: "blue",
                noteStyles: {},
                loaded: true,
                subscribe: () => { /* no-op */ },
                unsubscribe: () => { /* no-op */ },
            }
        };
    };

    const makeTiming = (step: number): ITiming => {
        return { bar: 1, step };
    };

    beforeEach(() => {
        // Minimal track stub with notes and getNoteAt.
        // Minimal track stub
        mockTrack = {
            id: 1,
            arrangement: {} as unknown as IArrangement,
            instrument: makeNoteStyle("1").instrument,
            notes: [] as INote[],
            polyrhythms: [],
            getNoteAt: (timing: ITiming) => {
                // Simplified: timings are contiguous and start at step 1
                return mockTrack.notes[timing.step - 1];
            },
            getNoteIterator: () => {
                return mockTrack.notes.values();
            },
            addPolyrhythm: () => { /* no-op */ },
            removePolyrhythm: () => { /* no-op */ },
            clear: () => { /* no-op */ },
            subscribe: () => { /* no-op */ },
            unsubscribe: () => { /* no-op */ },
        } as unknown as ITrack;

        const notes: INote[] = new Array(10).fill(null).map((_, i) => {
            return {
                id: String(i + 1),
                timing: makeTiming(i + 1),
                track: mockTrack,
                noteStyle: makeNoteStyle(String(i + 1)),
                subscribe: () => { /* no-op */ },
                unsubscribe: () => { /* no-op */ },
            } as INote;
        });

        // Insert a rest at step 6
        notes[5].noteStyle = undefined;

        mockTrack.notes = notes;

        target = new TrackClipboard(mockTrack);
    });

    const ids = () => {
        return mockTrack.notes.map((n) => {
            return n.noteStyle?.id;
        });
    };

    it("copies and pastes", () => {
        target.copy({ start: makeTiming(1), end: makeTiming(3) });
        target.paste({ start: makeTiming(3), end: makeTiming(5) });
        expect(ids()).toEqual(["1", "2", "1", "2", "3", undefined, "7", "8", "9", "10"]);
    });

    it.skip("copies and pastes without specifying end", () => {
        target.copy({ start: makeTiming(1), end: makeTiming(3) });
        expect(target.length).toBe(3);
        target.paste({ start: makeTiming(5) });
        expect(ids()).toEqual(["1", "2", "3", "4", "1", "2", "3", "8", "9", "10"]);
    });

    it.skip("doesn't paste past the end of the track", () => {
        expect(mockTrack.notes).toHaveLength(10);
        target.copy({ start: makeTiming(7), end: makeTiming(9) });
        target.paste({ start: makeTiming(9) });
        expect(ids()).toEqual(["1", "2", "3", "4", "5", undefined, "7", "8", "7", "8"]);
        expect(mockTrack.notes).toHaveLength(10);
    });

    it.skip("retains original copied NoteStyles even if track has changed", () => {
        target.copy({ start: makeTiming(2), end: makeTiming(3) });
        const newNoteStyle = makeNoteStyle("1000");
        mockTrack.notes[1].noteStyle = newNoteStyle;
        target.paste({ start: makeTiming(7) });
        expect(ids()).toEqual(["1", "1000", "3", "4", "5", undefined, "2", "3", "9", "10"]);
    });

    it.skip("copies rests", () => {
        target.copy({ start: makeTiming(5), end: makeTiming(7) });
        target.paste({ start: makeTiming(1) });
        expect(ids()).toEqual(["5", undefined, "7", "4", "5", undefined, "7", "8", "9", "10"]);
    });
});
