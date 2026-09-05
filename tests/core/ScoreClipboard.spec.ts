/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { ScoreBookDataModel, type ISbDmInstrument, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { PasteResultKind, ScoreClipboard, SubdivisionPasteMode } from "../../src/core/ScoreClipboard.js";
import { addFractions, compareFractions } from "../../src/core/serialisation/numeric-functions.js";
import { SelectionGranularity, type ISelectionEntry } from "../../src/ui/selection-types.js";
import { createInstrument, hydrateMeasureEvents } from "../unit-test-helpers.js";

/**
 * Returns the note style id covering the given step of a measure, or undefined for rests.
 *
 * @param measure The measure to inspect.
 * @param step The 0-based grid step to look up.
 * @returns The note style id covering the step, or undefined.
 */
const noteAtStep = (measure: ISbDmTrackMeasure, step: number): string | undefined => {
    const stepsPerBar = measure.meter.stepResolution;
    const start = { numerator: step, denominator: stepsPerBar };

    const event = measure.events.find((candidate) => {
        if (candidate.noteStyleId === undefined) {
            return false;
        }

        const end = addFractions(candidate.start, candidate.duration);

        return compareFractions(candidate.start, start) <= 0 && compareFractions(start, end) < 0;
    });

    return event?.noteStyleId;
};

/**
 * Returns the note style id of the event that begins exactly at the given fraction.
 *
 * @param measure The measure to inspect.
 * @param numerator The fraction numerator.
 * @param denominator The fraction denominator.
 * @returns The note style id at that exact position, or undefined for rests.
 */
const noteAtFraction = (measure: ISbDmTrackMeasure, numerator: number, denominator: number): string | undefined => {
    const start = { numerator, denominator };

    return measure.events.find((candidate) => {
        return compareFractions(candidate.start, start) === 0;
    })?.noteStyleId;
};

describe("ScoreClipboard", () => {
    let model: ScoreBookDataModel;
    let clipboard: ScoreClipboard;

    const instrumentA = (): ISbDmInstrument => {
        return createInstrument("a", 0, 0);
    };

    const instrumentB = (): ISbDmInstrument => {
        return createInstrument("b", 1, 1);
    };

    const exposeInstruments = (instruments: ISbDmInstrument[]): void => {
        (model as unknown as { data: { instruments: ISbDmInstrument[]; }; }).data.instruments = instruments;
    };

    beforeEach(() => {
        model = new ScoreBookDataModel();
        clipboard = new ScoreClipboard(model);
    });

    it("tiles a rest and a note pair without expanding the note's absorbed rests", () => {
        const instruments = [createInstrument("surdo", 0, 0), createInstrument("surdo", 1, 1)];
        model.startNewArrangement(instruments);
        const tracks = model.arrangement!.tracks;
        const source = tracks[0];
        const target = tracks[1];

        // A rest at the first cell followed by a note that absorbs the rest of the pulse.
        model.setGridNote(source.id, 1, 1, "note");

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: source.id, startStep: 0, endStep: 0 },
            {
                granularity: SelectionGranularity.Note, bar: 1, trackId: source.id, startStep: 1, endStep: 1,
                noteId: source.measures[0].noteEvents[1].id,
            },
        ]);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: target.id },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);

        // The two copied cells tile to eight alternating rest/note pairs.
        for (let step = 0; step < 16; step++) {
            if (step % 2 === 0) {
                expect(noteAtStep(target.measures[0], step)).toBeUndefined();
            } else {
                expect(noteAtStep(target.measures[0], step)).toBe("note");
            }
        }
    });

    it("tiles a copied note across a selected note group", () => {
        const instruments = [instrumentA()];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");

        const copied = clipboard.copy([{
            granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0,
        }]);

        expect(copied).toBe(true);

        const result = clipboard.paste([{
            granularity: SelectionGranularity.NoteGroup, bar: 1, trackId: track.id, startStep: 4, endStep: 7,
        }]);

        expect(result.kind).toBe(PasteResultKind.Success);
        for (let step = 4; step <= 7; step++) {
            expect(noteAtStep(track.measures[0], step)).toBe("1");
        }
    });

    it("truncates the source when the target range is smaller", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];

        for (let step = 0; step < 4; step++) {
            model.setGridNote(track.id, 1, step, String(step + 1));
        }

        clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 1 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 2 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 3 },
        ]);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.NoteGroup, bar: 1, trackId: track.id, startStep: 5, endStep: 6 },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(noteAtStep(track.measures[0], 5)).toBe("1");
        expect(noteAtStep(track.measures[0], 6)).toBe("2");
        expect(noteAtStep(track.measures[0], 7)).toBeUndefined();
    });

    it("pastes a multi-track source onto a range selection of one track", () => {
        const instruments = [createInstrument("repi", 0, 0), createInstrument("repi", 1, 1)];
        model.startNewArrangement(instruments);
        const tracks = model.arrangement!.tracks;

        model.setGridNote(tracks[0].id, 1, 0, "A");
        model.setGridNote(tracks[1].id, 1, 0, "B");

        clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[0].id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[1].id, startStep: 0 },
        ]);

        // Two adjacent cells on the first track only: the second source track must not be pasted
        // into the unselected second track.
        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[0].id, startStep: 4, endStep: 4 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[0].id, startStep: 5, endStep: 5 },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(noteAtStep(tracks[0].measures[0], 4)).toBe("A");
        expect(noteAtStep(tracks[0].measures[0], 5)).toBe("A");
        expect(noteAtStep(tracks[1].measures[0], 4)).toBeUndefined();
        expect(noteAtStep(tracks[1].measures[0], 5)).toBeUndefined();
    });

    it("tiles a copied track piece across a whole track", () => {
        model.startNewArrangement([instrumentA()], { length: 3 });
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");

        const copied = clipboard.copy([{
            granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: track.id,
        }]);

        expect(copied).toBe(true);

        const result = clipboard.paste([{
            granularity: SelectionGranularity.Track, bar: 0, trackId: track.id,
        }]);

        expect(result.kind).toBe(PasteResultKind.Success);
        for (const measure of track.measures) {
            expect(noteAtStep(measure, 0)).toBe("1");
        }
    });

    it("tiles a multi-bar note selection across a target range", () => {
        model.startNewArrangement([instrumentA()], { length: 2 });
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");
        model.setGridNote(track.id, 1, 1, "2");
        model.setGridNote(track.id, 2, 0, "3");
        model.setGridNote(track.id, 2, 1, "4");

        const copied = clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 1 },
            { granularity: SelectionGranularity.Note, bar: 2, trackId: track.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 2, trackId: track.id, startStep: 1 },
        ]);

        expect(copied).toBe(true);

        const result = clipboard.paste([{
            granularity: SelectionGranularity.NoteGroup, bar: 1, trackId: track.id, startStep: 4, endStep: 13,
        }]);

        expect(result.kind).toBe(PasteResultKind.Success);

        const expected = ["1", "2", "3", "4", "1", "2", "3", "4", "1", "2"];
        for (let offset = 0; offset < expected.length; offset++) {
            expect(noteAtStep(track.measures[0], 4 + offset)).toBe(expected[offset]);
        }
    });

    it("pastes the full source starting at a single note cursor", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];

        for (let step = 0; step < 4; step++) {
            model.setGridNote(track.id, 1, step, String(step + 1));
        }

        const copied = clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 1 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 2 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 3 },
        ]);

        expect(copied).toBe(true);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 8 },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(noteAtStep(track.measures[0], 8)).toBe("1");
        expect(noteAtStep(track.measures[0], 9)).toBe("2");
        expect(noteAtStep(track.measures[0], 10)).toBe("3");
        expect(noteAtStep(track.measures[0], 11)).toBe("4");
    });

    it("pastes a multi-track note selection across matching tracks", () => {
        const instruments = [createInstrument("a", 0, 0), createInstrument("b", 1, 1), createInstrument("c", 2, 2)];
        model.startNewArrangement(instruments, { length: 2 });

        const trackA = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "a";
        })!;
        const trackB = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "b";
        })!;
        const trackC = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "c";
        })!;

        model.setGridNote(trackA.id, 1, 0, "a1");
        model.setGridNote(trackA.id, 1, 1, "a2");
        model.setGridNote(trackB.id, 1, 0, "b1");
        model.setGridNote(trackB.id, 1, 1, "b2");
        model.setGridNote(trackC.id, 1, 0, "c1");
        model.setGridNote(trackC.id, 1, 1, "c2");

        const copied = clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackA.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackA.id, startStep: 1 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackB.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackB.id, startStep: 1 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackC.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackC.id, startStep: 1 },
        ]);

        expect(copied).toBe(true);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 2, trackId: trackA.id, startStep: 0 },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(noteAtStep(trackA.measures[1], 0)).toBe("a1");
        expect(noteAtStep(trackA.measures[1], 1)).toBe("a2");
        expect(noteAtStep(trackB.measures[1], 0)).toBe("b1");
        expect(noteAtStep(trackB.measures[1], 1)).toBe("b2");
        expect(noteAtStep(trackC.measures[1], 0)).toBe("c1");
        expect(noteAtStep(trackC.measures[1], 1)).toBe("c2");
    });

    it("skips source tracks whose instrument is missing", () => {
        const instruments = [createInstrument("a", 0, 0), createInstrument("b", 1, 1), createInstrument("c", 2, 2)];
        model.startNewArrangement(instruments, { length: 2 });

        const trackA = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "a";
        })!;
        const trackB = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "b";
        })!;
        const trackC = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "c";
        })!;

        model.setGridNote(trackA.id, 1, 0, "a1");
        model.setGridNote(trackB.id, 1, 0, "b1");
        model.setGridNote(trackC.id, 1, 0, "c1");

        const copied = clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackA.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackB.id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: trackC.id, startStep: 0 },
        ]);

        expect(copied).toBe(true);

        // Reload without instrument "b" — its track was deleted in between.
        model.startNewArrangement([createInstrument("a", 0, 0), createInstrument("c", 2, 2)], { length: 2 });

        const newTrackA = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "a";
        })!;
        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 2, trackId: newTrackA.id, startStep: 0 },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(noteAtStep(newTrackA.measures[1], 0)).toBe("a1");

        const newTrackC = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "c";
        })!;
        expect(noteAtStep(newTrackC.measures[1], 0)).toBe("c1");
        expect(model.arrangement!.tracks.some((track) => {
            return track.instrument.typeId === "b";
        })).toBe(false);
    });

    it("tiles a single-track source vertically across same-instrument tracks", () => {
        const instruments = [createInstrument("a", 0, 0), createInstrument("a", 1, 1), createInstrument("a", 2, 2)];
        model.startNewArrangement(instruments);

        const tracks = model.arrangement!.tracks;
        model.setGridNote(tracks[0].id, 1, 0, "1");
        model.setGridNote(tracks[0].id, 1, 1, "2");

        const copied = clipboard.copy([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[0].id, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[0].id, startStep: 1 },
        ]);

        expect(copied).toBe(true);

        const entries: ISelectionEntry[] = [];
        for (const track of tracks) {
            for (let step = 4; step <= 8; step++) {
                entries.push({ granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: step });
            }
        }

        const result = clipboard.paste(entries);

        expect(result.kind).toBe(PasteResultKind.Success);

        for (const track of tracks) {
            expect(noteAtStep(track.measures[0], 4)).toBe("1");
            expect(noteAtStep(track.measures[0], 5)).toBe("2");
            expect(noteAtStep(track.measures[0], 6)).toBe("1");
            expect(noteAtStep(track.measures[0], 7)).toBe("2");
            expect(noteAtStep(track.measures[0], 8)).toBe("1");
        }
    });

    it("replaces the whole target measure when a measure is pasted onto a note", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");
        model.setGridNote(track.id, 1, 1, "1");

        clipboard.copy([{ granularity: SelectionGranularity.Measure, bar: 1, trackId: 0 }]);

        model.setGridNote(track.id, 1, 0);
        model.setGridNote(track.id, 1, 1);

        const result = clipboard.paste([{
            granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 5,
        }]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(noteAtStep(track.measures[0], 0)).toBe("1");
        expect(noteAtStep(track.measures[0], 1)).toBe("1");
        expect(noteAtStep(track.measures[0], 5)).toBeUndefined();
    });

    it("rejects pasting a track piece into a different instrument", () => {
        model.startNewArrangement([instrumentA(), instrumentB()]);
        const trackA = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "a";
        })!;
        const trackB = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "b";
        })!;
        model.setGridNote(trackA.id, 1, 0, "1");

        clipboard.copy([{ granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: trackA.id }]);

        const result = clipboard.paste([{ granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: trackB.id }]);

        expect(result.kind).toBe(PasteResultKind.InstrumentMismatch);
    });

    it("rejects pasting across different meters", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");

        clipboard.copy([{ granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: track.id }]);

        model.startNewArrangement([instrumentA()], { stepResolution: 8 });
        const targetTrack = model.arrangement!.tracks[0];

        const result = clipboard.paste([
            { granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: targetTrack.id },
        ]);

        expect(result.kind).toBe(PasteResultKind.MeterMismatch);
    });

    it("cut copies the content and clears the source", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");
        model.setGridNote(track.id, 1, 1, "1");

        const cut = clipboard.cut([{ granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: track.id }]);

        expect(cut).toBe(true);
        expect(noteAtStep(track.measures[0], 0)).toBeUndefined();
        expect(noteAtStep(track.measures[0], 1)).toBeUndefined();
        expect(clipboard.isEmpty).toBe(false);
    });

    it("offers to create a missing track for a track paste", () => {
        const instruments = [instrumentA(), instrumentB()];
        model.startNewArrangement(instruments);
        exposeInstruments(instruments);

        const sourceTrack = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "a";
        })!;
        model.setGridNote(sourceTrack.id, 1, 0, "1");

        clipboard.copy([{ granularity: SelectionGranularity.Track, bar: 0, trackId: sourceTrack.id }]);

        model.startNewArrangement([instrumentB()]);
        const targetTrack = model.arrangement!.tracks[0];

        const pending = clipboard.paste([
            { granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: targetTrack.id },
        ]);

        expect(pending.kind).toBe(PasteResultKind.NeedsTrackCreation);

        const created = clipboard.paste(
            [{ granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: targetTrack.id }], true,
        );

        expect(created.kind).toBe(PasteResultKind.Success);

        const newTrack = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "a";
        });
        expect(newTrack).toBeDefined();
        expect(noteAtStep(newTrack!.measures[0], 0)).toBe("1");
    });

    it("returns no selection for an empty paste target", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");

        clipboard.copy([{ granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0 }]);

        const result = clipboard.paste([] as ISelectionEntry[]);

        expect(result.kind).toBe(PasteResultKind.NoSelection);
    });

    it("copies the whole note, not just its start cell", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");
        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const noteId = track.measures[0].noteEvents[0].id;
        clipboard.copy([{
            granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, noteId,
        }]);

        const result = clipboard.paste([{
            granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 8, endStep: 8,
        }]);

        expect(result.kind).toBe(PasteResultKind.Success);
        // The pasted note keeps the full quarter-note duration (steps 8-11), not a single step.
        expect(noteAtStep(track.measures[0], 8)).toBe("1");
        expect(noteAtStep(track.measures[0], 11)).toBe("1");
        expect(noteAtStep(track.measures[0], 12)).toBeUndefined();
    });

    it("keeps content after a single-note cursor paste", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];

        for (let step = 0; step < 8; step++) {
            model.setGridNote(track.id, 1, step, "A");
        }

        clipboard.copy([{ granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0 }]);

        const result = clipboard.paste([{
            granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 4,
        }]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(noteAtStep(track.measures[0], 4)).toBe("A");
        expect(noteAtStep(track.measures[0], 5)).toBe("A");
        expect(noteAtStep(track.measures[0], 6)).toBe("A");
        expect(noteAtStep(track.measures[0], 7)).toBe("A");
    });

    it("replaces a note without shifting its tail when pasting over its start cell", () => {
        const instruments = [createInstrument("caixa", 0, 0), createInstrument("caixa", 1, 1)];
        model.startNewArrangement(instruments);
        const tracks = model.arrangement!.tracks;

        // Source: a single-cell note, followed by another note so it does not absorb the pulse.
        model.setGridNote(tracks[0].id, 1, 0, "src");
        model.setGridNote(tracks[0].id, 1, 1, "src-next");

        // Target: a pulse-length note at the second cell, as if the user typed "1" there.
        model.setGridNote(tracks[1].id, 1, 1, "typed");

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        clipboard.copy([{
            granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[0].id, startStep: 0, endStep: 0,
            noteId: tracks[0].measures[0].noteEvents[0].id,
        }]);

        const result = clipboard.paste([{
            granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[1].id, startStep: 1, endStep: 1,
            noteId: tracks[1].measures[0].noteEvents[0].id,
        }]);

        expect(result.kind).toBe(PasteResultKind.Success);

        // The pasted note replaces the start cell; the remaining tail of the old note must become
        // a rest instead of sliding one cell to the right.
        expect(noteAtStep(tracks[1].measures[0], 1)).toBe("src");
        expect(noteAtStep(tracks[1].measures[0], 2)).toBeUndefined();
        expect(noteAtStep(tracks[1].measures[0], 3)).toBeUndefined();
    });

    it("pastes a multi-track cell selection across a whole track", () => {
        const instruments = [
            createInstrument("s1", 0, 0), createInstrument("s2", 1, 1), createInstrument("s3", 2, 2),
        ];
        model.startNewArrangement(instruments, { length: 2 });
        const tracks = model.arrangement!.tracks;

        for (const track of tracks) {
            for (let step = 0; step < 3; step++) {
                model.setGridNote(track.id, 1, step, `${track.id}-${step}`);
            }
        }

        const entries: ISelectionEntry[] = [];
        for (const track of tracks) {
            for (let step = 0; step < 3; step++) {
                entries.push({
                    granularity: SelectionGranularity.Note, bar: 1, trackId: track.id,
                    startStep: step, endStep: step,
                });
            }
        }

        clipboard.copy(entries);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.Track, bar: 0, trackId: tracks[0].id },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);

        // The three-note source tiles seamlessly across both measures of every matching track,
        // each track receiving its own copied notes.
        for (const track of tracks) {
            expect(noteAtStep(track.measures[0], 0)).toBe(`${track.id}-0`);
            expect(noteAtStep(track.measures[0], 1)).toBe(`${track.id}-1`);
            expect(noteAtStep(track.measures[0], 2)).toBe(`${track.id}-2`);
            expect(noteAtStep(track.measures[1], 0)).toBe(`${track.id}-1`);
            expect(noteAtStep(track.measures[1], 1)).toBe(`${track.id}-2`);
            expect(noteAtStep(track.measures[1], 2)).toBe(`${track.id}-0`);
        }
    });

    it("rejects a multi-track paste onto a different instrument", () => {
        const instruments = [
            createInstrument("repi", 0, 0), createInstrument("repi", 1, 1), createInstrument("repi", 2, 2),
            createInstrument("surdo", 3, 3),
        ];
        model.startNewArrangement(instruments);
        const tracks = model.arrangement!.tracks;

        const repiTracks = tracks.filter((track) => {
            return track.instrument.typeId === "repi";
        });
        const surdoTrack = tracks.find((track) => {
            return track.instrument.typeId === "surdo";
        })!;

        for (const track of repiTracks) {
            for (let step = 0; step < 3; step++) {
                model.setGridNote(track.id, 1, step, `${track.id}-${step}`);
            }
        }

        const entries: ISelectionEntry[] = [];
        for (const track of repiTracks) {
            for (let step = 0; step < 3; step++) {
                entries.push({
                    granularity: SelectionGranularity.Note, bar: 1, trackId: track.id,
                    startStep: step, endStep: step,
                });
            }
        }

        clipboard.copy(entries);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: surdoTrack.id, startStep: 5, endStep: 5 },
        ]);

        expect(result.kind).toBe(PasteResultKind.InstrumentMismatch);

        for (const track of repiTracks) {
            expect(noteAtStep(track.measures[0], 5)).toBeUndefined();
        }

        expect(noteAtStep(surdoTrack.measures[0], 5)).toBeUndefined();
    });

    it("rejects a multi-track paste whose block overflows into a different instrument", () => {
        const instruments = [
            createInstrument("repi", 0, 0), createInstrument("repi", 1, 1), createInstrument("repi", 2, 2),
            createInstrument("surdo", 3, 3),
        ];
        model.startNewArrangement(instruments);
        const tracks = model.arrangement!.tracks;

        const repiTracks = tracks.slice(0, 3);
        const lastRepiTrack = repiTracks[2];

        for (const track of repiTracks) {
            for (let step = 0; step < 3; step++) {
                model.setGridNote(track.id, 1, step, `${track.id}-${step}`);
            }
        }

        const entries: ISelectionEntry[] = [];
        for (const track of repiTracks) {
            for (let step = 0; step < 3; step++) {
                entries.push({
                    granularity: SelectionGranularity.Note, bar: 1, trackId: track.id,
                    startStep: step, endStep: step,
                });
            }
        }

        clipboard.copy(entries);

        // Cursor on the last of the three copied tracks: the remaining source rows would land in
        // the following track, which is a different instrument.
        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: lastRepiTrack.id, startStep: 5, endStep: 5 },
        ]);

        expect(result.kind).toBe(PasteResultKind.InstrumentMismatch);
        expect(noteAtStep(lastRepiTrack.measures[0], 5)).toBeUndefined();
    });

    it("inserts a copied subdivision at the cursor (Fall 1)", () => {
        const instruments = [createInstrument("tamborim", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        track.measures[0].events.splice(0, track.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${track.id}-${index}`,
                };
            }));
        track.measures[0].subdivisions.splice(0, track.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: track.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const cursorSlot = 5;
        const result = clipboard.paste([
            {
                granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
                start: { numerator: cursorSlot, denominator: 12 }, noteId: track.measures[0].noteEvents[cursorSlot]?.id,
            },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);

        // The 12-slot subdivision stays intact; the copied slots replace only the selected slots.
        expect(track.measures[0].subdivisions).toEqual([
            { startIndex: 0, actual: 12, normal: 16, isTuplet: true },
        ]);

        expect(noteAtFraction(track.measures[0], 5, 12)).toBe(`${track.id}-0`);
        expect(noteAtFraction(track.measures[0], 6, 12)).toBe(`${track.id}-1`);
        expect(noteAtFraction(track.measures[0], 7, 12)).toBe(`${track.id}-2`);
        expect(noteAtFraction(track.measures[0], 0, 12)).toBe(`${track.id}-0`);
        expect(noteAtFraction(track.measures[0], 8, 12)).toBe(`${track.id}-8`);
    });

    it("inserts a copied subdivision into a matching selection (Fall 3)", () => {
        const instruments = [createInstrument("tamborim", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        track.measures[0].events.splice(0, track.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${track.id}-${index}`,
                };
            }));
        track.measures[0].subdivisions.splice(0, track.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: track.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const targetEntries: ISelectionEntry[] = [];
        for (let slot = 5; slot <= 7; slot++) {
            targetEntries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: track.measures[0].noteEvents[slot]?.id,
            });
        }

        const result = clipboard.paste(targetEntries);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(track.measures[0].subdivisions).toEqual([
            { startIndex: 0, actual: 12, normal: 16, isTuplet: true },
        ]);

        expect(noteAtFraction(track.measures[0], 5, 12)).toBe(`${track.id}-0`);
        expect(noteAtFraction(track.measures[0], 6, 12)).toBe(`${track.id}-1`);
        expect(noteAtFraction(track.measures[0], 7, 12)).toBe(`${track.id}-2`);
        expect(noteAtFraction(track.measures[0], 8, 12)).toBe(`${track.id}-8`);
    });

    it("pastes a subdivision into another subdivision without stripping it", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        for (const track of [sourceTrack, targetTrack]) {
            track.measures[0].events.splice(0, track.measures[0].events.length,
                ...Array.from({ length: 12 }, (_, index) => {
                    return {
                        start: { numerator: index, denominator: 12 },
                        duration: { numerator: 1, denominator: 12 },
                        noteStyleId: `${track.id}-${index}`,
                    };
                }));
            track.measures[0].subdivisions.splice(0, track.measures[0].subdivisions.length, {
                startIndex: 0, actual: 12, normal: 16, isTuplet: true,
            });
        }

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: sourceTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const result = clipboard.paste([
            {
                granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: 0, endStep: 0,
                start: { numerator: 5, denominator: 12 }, noteId: targetTrack.measures[0].noteEvents[5]?.id,
            },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);

        // The target's 12-slot subdivision stays intact; no nested subdivision is created.
        expect(targetTrack.measures[0].subdivisions).toEqual([
            { startIndex: 0, actual: 12, normal: 16, isTuplet: true },
        ]);
        expect(noteAtFraction(targetTrack.measures[0], 5, 12)).toBe(`${sourceTrack.id}-0`);
        expect(noteAtFraction(targetTrack.measures[0], 6, 12)).toBe(`${sourceTrack.id}-1`);
        expect(noteAtFraction(targetTrack.measures[0], 7, 12)).toBe(`${sourceTrack.id}-2`);
        expect(noteAtFraction(targetTrack.measures[0], 8, 12)).toBe(`${targetTrack.id}-8`);
    });

    it("inserts a copied subdivision at a plain cursor (Fall 1)", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        sourceTrack.measures[0].events.splice(0, sourceTrack.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${sourceTrack.id}-${index}`,
                };
            }));
        sourceTrack.measures[0].subdivisions.splice(0, sourceTrack.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: sourceTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const result = clipboard.paste([
            {
                granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: 5, endStep: 5,
            },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(result.selectionInvalidated).toBe(true);

        // The leading rest is clipped, so the subdivision's first slot is the second event.
        expect(targetTrack.measures[0].subdivisions).toEqual([{
            startIndex: 1, actual: 3, normal: 4, isTuplet: true,
        }]);
        expect(noteAtFraction(targetTrack.measures[0], 15, 48)).toBe(`${sourceTrack.id}-0`);
        expect(noteAtFraction(targetTrack.measures[0], 19, 48)).toBe(`${sourceTrack.id}-1`);
        expect(noteAtFraction(targetTrack.measures[0], 23, 48)).toBe(`${sourceTrack.id}-2`);
    });

    it("asks and embeds a subdivision into a smaller subdivision selection", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        for (const track of [sourceTrack, targetTrack]) {
            track.measures[0].events.splice(0, track.measures[0].events.length,
                ...Array.from({ length: 12 }, (_, index) => {
                    return {
                        start: { numerator: index, denominator: 12 },
                        duration: { numerator: 1, denominator: 12 },
                        noteStyleId: `${track.id}-${index}`,
                    };
                }));
            track.measures[0].subdivisions.splice(0, track.measures[0].subdivisions.length, {
                startIndex: 0, actual: 12, normal: 16, isTuplet: true,
            });
        }

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: sourceTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const targetEntries: ISelectionEntry[] = [];
        for (let slot = 5; slot <= 6; slot++) {
            targetEntries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: targetTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        const pending = clipboard.paste(targetEntries);
        expect(pending.kind).toBe(PasteResultKind.NeedsSubdivisionMode);

        const result = clipboard.paste(targetEntries, false, SubdivisionPasteMode.NewBase);

        expect(result.kind).toBe(PasteResultKind.Success);

        // The target's 12-slot subdivision stays, and the copied notes become a nested 3:2 tuplet
        // that replaces the two selected slots.
        expect(targetTrack.measures[0].subdivisions).toEqual([
            { startIndex: 0, actual: 12, normal: 16, isTuplet: true },
            { startIndex: 5, actual: 3, normal: 2, isTuplet: true },
        ]);
        expect(noteAtFraction(targetTrack.measures[0], 15, 36)).toBe(`${sourceTrack.id}-0`);
        expect(noteAtFraction(targetTrack.measures[0], 17, 36)).toBe(`${sourceTrack.id}-1`);
        expect(noteAtFraction(targetTrack.measures[0], 19, 36)).toBe(`${sourceTrack.id}-2`);
    });

    it("creates a new subdivision when the target is smaller than the source (Fall 4)", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        sourceTrack.measures[0].events.splice(0, sourceTrack.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${sourceTrack.id}-${index}`,
                };
            }));
        sourceTrack.measures[0].subdivisions.splice(0, sourceTrack.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: sourceTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: 5, endStep: 5 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: 6, endStep: 6 },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);

        // Two selected cells become the basis of a new 3:2 tuplet subdivision. The leading
        // whole-measure rest is clipped to a rest before the range, so the subdivision's first
        // slot is the second event of the measure.
        expect(targetTrack.measures[0].subdivisions).toEqual([{
            startIndex: 1, actual: 3, normal: 2, isTuplet: true,
        }]);

        expect(noteAtFraction(targetTrack.measures[0], 15, 48)).toBe(`${sourceTrack.id}-0`);
        expect(noteAtFraction(targetTrack.measures[0], 17, 48)).toBe(`${sourceTrack.id}-1`);
        expect(noteAtFraction(targetTrack.measures[0], 19, 48)).toBe(`${sourceTrack.id}-2`);
    });

    it("rejects a multi-track subdivision source as too complex", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const tracks = model.arrangement!.tracks;

        for (const track of tracks) {
            track.measures[0].events.splice(0, track.measures[0].events.length,
                ...Array.from({ length: 12 }, (_, index) => {
                    return {
                        start: { numerator: index, denominator: 12 },
                        duration: { numerator: 1, denominator: 12 },
                        noteStyleId: `${track.id}-${index}`,
                    };
                }));
            track.measures[0].subdivisions.splice(0, track.measures[0].subdivisions.length, {
                startIndex: 0, actual: 12, normal: 16, isTuplet: true,
            });
        }

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (const track of tracks) {
            for (let slot = 0; slot < 3; slot++) {
                entries.push({
                    granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
                    start: { numerator: slot, denominator: 12 }, noteId: track.measures[0].noteEvents[slot]?.id,
                });
            }
        }

        clipboard.copy(entries);

        const result = clipboard.paste([
            {
                granularity: SelectionGranularity.Note, bar: 1, trackId: tracks[0].id, startStep: 0, endStep: 0,
                start: { numerator: 5, denominator: 12 }, noteId: tracks[0].measures[0].noteEvents[5]?.id,
            },
        ]);

        expect(result.kind).toBe(PasteResultKind.TooComplex);
    });

    it("rejects a mixed subdivision source as too complex", () => {
        const instruments = [createInstrument("tamborim", 0, 0)];
        model.startNewArrangement(instruments);
        const track = model.arrangement!.tracks[0];

        // Four subdivision slots followed by one plain grid note in the same measure.
        track.measures[0].events.splice(0, track.measures[0].events.length,
            ...Array.from({ length: 4 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${track.id}-${index}`,
                };
            }));
        track.measures[0].events.push({
            start: { numerator: 4, denominator: 12 }, duration: { numerator: 8, denominator: 12 },
            noteStyleId: `${track.id}-plain`,
        });
        track.measures[0].subdivisions.splice(0, track.measures[0].subdivisions.length, {
            startIndex: 0, actual: 4, normal: 4, isTuplet: false,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: track.measures[0].noteEvents[slot]?.id,
            });
        }

        entries.push({
            granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
            start: { numerator: 4, denominator: 12 }, noteId: track.measures[0].noteEvents[4]?.id,
        });

        clipboard.copy(entries);

        const result = clipboard.paste([
            {
                granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0, endStep: 0,
                start: { numerator: 8, denominator: 12 }, noteId: track.measures[0].noteEvents[8]?.id,
            },
        ]);

        expect(result.kind).toBe(PasteResultKind.TooComplex);
    });

    it("asks for a mode when pasting a subdivision onto a larger plain selection", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        sourceTrack.measures[0].events.splice(0, sourceTrack.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${sourceTrack.id}-${index}`,
                };
            }));
        sourceTrack.measures[0].subdivisions.splice(0, sourceTrack.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: sourceTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const targetEntries: ISelectionEntry[] = Array.from({ length: 9 }, (_, step) => {
            return {
                granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: step, endStep: step,
            };
        });

        const result = clipboard.paste(targetEntries);

        expect(result.kind).toBe(PasteResultKind.NeedsSubdivisionMode);
    });

    it("pastes a subdivision onto a plain selection as a new basis", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        sourceTrack.measures[0].events.splice(0, sourceTrack.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${sourceTrack.id}-${index}`,
                };
            }));
        sourceTrack.measures[0].subdivisions.splice(0, sourceTrack.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: sourceTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const targetEntries: ISelectionEntry[] = Array.from({ length: 9 }, (_, step) => {
            return {
                granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: step, endStep: step,
            };
        });

        const result = clipboard.paste(targetEntries, false, SubdivisionPasteMode.NewBase);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(targetTrack.measures[0].subdivisions).toEqual([{
            startIndex: 0, actual: 3, normal: 9, isTuplet: true,
        }]);

        expect(noteAtFraction(targetTrack.measures[0], 0, 16)).toBe(`${sourceTrack.id}-0`);
        expect(noteAtFraction(targetTrack.measures[0], 3, 16)).toBe(`${sourceTrack.id}-1`);
        expect(noteAtFraction(targetTrack.measures[0], 6, 16)).toBe(`${sourceTrack.id}-2`);
    });

    it("dissolves a subdivision onto a plain selection", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        sourceTrack.measures[0].events.splice(0, sourceTrack.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${sourceTrack.id}-${index}`,
                };
            }));
        sourceTrack.measures[0].subdivisions.splice(0, sourceTrack.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let slot = 0; slot < 3; slot++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: sourceTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        clipboard.copy(entries);

        const targetEntries: ISelectionEntry[] = Array.from({ length: 9 }, (_, step) => {
            return {
                granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: step, endStep: step,
            };
        });

        const result = clipboard.paste(targetEntries, false, SubdivisionPasteMode.Dissolve);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(targetTrack.measures[0].subdivisions).toEqual([]);

        expect(noteAtFraction(targetTrack.measures[0], 0, 16)).toBe(`${sourceTrack.id}-0`);
        expect(noteAtFraction(targetTrack.measures[0], 3, 16)).toBe(`${sourceTrack.id}-1`);
        expect(noteAtFraction(targetTrack.measures[0], 6, 16)).toBe(`${sourceTrack.id}-2`);
    });

    it("pastes plain notes into a subdivision target", () => {
        const instruments = [createInstrument("tamborim", 0, 0), createInstrument("tamborim", 1, 1)];
        model.startNewArrangement(instruments);
        const sourceTrack = model.arrangement!.tracks[0];
        const targetTrack = model.arrangement!.tracks[1];

        for (let step = 0; step < 3; step++) {
            model.setGridNote(sourceTrack.id, 1, step, `${sourceTrack.id}-${step}`);
        }

        targetTrack.measures[0].events.splice(0, targetTrack.measures[0].events.length,
            ...Array.from({ length: 12 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 12 },
                    duration: { numerator: 1, denominator: 12 },
                    noteStyleId: `${targetTrack.id}-${index}`,
                };
            }));
        targetTrack.measures[0].subdivisions.splice(0, targetTrack.measures[0].subdivisions.length, {
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        });

        hydrateMeasureEvents(model.arrangement! as Arrangement);

        const entries: ISelectionEntry[] = [];
        for (let step = 0; step < 3; step++) {
            entries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: sourceTrack.id, startStep: step, endStep: step,
            });
        }

        clipboard.copy(entries);

        const targetEntries: ISelectionEntry[] = [];
        for (let slot = 5; slot <= 7; slot++) {
            targetEntries.push({
                granularity: SelectionGranularity.Note, bar: 1, trackId: targetTrack.id, startStep: 0, endStep: 0,
                start: { numerator: slot, denominator: 12 }, noteId: targetTrack.measures[0].noteEvents[slot]?.id,
            });
        }

        const result = clipboard.paste(targetEntries);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(result.selectionInvalidated).toBeUndefined();

        // The subdivision is preserved and the selected slots receive the plain notes.
        expect(targetTrack.measures[0].subdivisions).toEqual([{
            startIndex: 0, actual: 12, normal: 16, isTuplet: true,
        }]);
        expect(noteAtFraction(targetTrack.measures[0], 5, 12)).toBe(`${sourceTrack.id}-0`);
        expect(noteAtFraction(targetTrack.measures[0], 6, 12)).toBe(`${sourceTrack.id}-1`);
        expect(noteAtFraction(targetTrack.measures[0], 7, 12)).toBe(`${sourceTrack.id}-2`);
        expect(noteAtFraction(targetTrack.measures[0], 8, 12)).toBe(`${targetTrack.id}-8`);
    });

    it("pastes into an empty measure without corrupting it", () => {
        const instruments = [
            createInstrument("repi", 0, 0), createInstrument("repi", 1, 1), createInstrument("repi", 2, 2),
        ];
        model.startNewArrangement(instruments, { length: 2 });
        const tracks = model.arrangement!.tracks;

        for (const track of tracks) {
            for (let step = 0; step < 3; step++) {
                model.setGridNote(track.id, 1, step, `${track.id}-${step}`);
            }
        }

        const entries: ISelectionEntry[] = [];
        for (const track of tracks) {
            for (let step = 0; step < 3; step++) {
                entries.push({
                    granularity: SelectionGranularity.Note, bar: 1, trackId: track.id,
                    startStep: step, endStep: step,
                });
            }
        }

        clipboard.copy(entries);

        const result = clipboard.paste([
            { granularity: SelectionGranularity.Note, bar: 2, trackId: tracks[0].id, startStep: 5, endStep: 5 },
        ]);

        expect(result.kind).toBe(PasteResultKind.Success);
        expect(result.selectionInvalidated).toBeUndefined();

        for (const track of tracks) {
            expect(noteAtStep(track.measures[1], 5)).toBe(`${track.id}-0`);
            expect(noteAtStep(track.measures[1], 6)).toBe(`${track.id}-1`);
            expect(noteAtStep(track.measures[1], 7)).toBe(`${track.id}-2`);
            expect(noteAtStep(track.measures[1], 0)).toBeUndefined();
            expect(noteAtStep(track.measures[1], 8)).toBeUndefined();

            // The measure must keep tiling its full length after the paste.
            const measureLength = track.measures[1].events.reduce((sum, event) => {
                return addFractions(sum, event.duration);
            }, { numerator: 0, denominator: 1 });
            expect(compareFractions(measureLength, { numerator: 1, denominator: 1 })).toBe(0);
        }
    });
});
