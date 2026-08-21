/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ScoreBookDataModel, type ISbDmInstrument } from "../../src/core/ScoreBookDataModel.js";
import { PasteResultKind, ScoreClipboard } from "../../src/core/ScoreClipboard.js";
import { SelectionGranularity, type ISelectionEntry } from "../../src/ui/selection-types.js";
import { createInstrument } from "../unit-test-helpers.js";

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
            expect(track.measures[0].steps[step].noteStyleId).toBe("1");
        }
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
            expect(measure.steps[0].noteStyleId).toBe("1");
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
            expect(track.measures[0].steps[4 + offset].noteStyleId).toBe(expected[offset]);
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
        expect(track.measures[0].steps[8].noteStyleId).toBe("1");
        expect(track.measures[0].steps[9].noteStyleId).toBe("2");
        expect(track.measures[0].steps[10].noteStyleId).toBe("3");
        expect(track.measures[0].steps[11].noteStyleId).toBe("4");
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
        expect(trackA.measures[1].steps[0].noteStyleId).toBe("a1");
        expect(trackA.measures[1].steps[1].noteStyleId).toBe("a2");
        expect(trackB.measures[1].steps[0].noteStyleId).toBe("b1");
        expect(trackB.measures[1].steps[1].noteStyleId).toBe("b2");
        expect(trackC.measures[1].steps[0].noteStyleId).toBe("c1");
        expect(trackC.measures[1].steps[1].noteStyleId).toBe("c2");
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
        expect(newTrackA.measures[1].steps[0].noteStyleId).toBe("a1");

        const newTrackC = model.arrangement!.tracks.find((track) => {
            return track.instrument.typeId === "c";
        })!;
        expect(newTrackC.measures[1].steps[0].noteStyleId).toBe("c1");
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
            expect(track.measures[0].steps[4].noteStyleId).toBe("1");
            expect(track.measures[0].steps[5].noteStyleId).toBe("2");
            expect(track.measures[0].steps[6].noteStyleId).toBe("1");
            expect(track.measures[0].steps[7].noteStyleId).toBe("2");
            expect(track.measures[0].steps[8].noteStyleId).toBe("1");
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
        expect(track.measures[0].steps[0].noteStyleId).toBe("1");
        expect(track.measures[0].steps[1].noteStyleId).toBe("1");
        expect(track.measures[0].steps[5].noteStyleId).toBeUndefined();
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
        expect(track.measures[0].steps[0].noteStyleId).toBeUndefined();
        expect(track.measures[0].steps[1].noteStyleId).toBeUndefined();
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
        expect(newTrack!.measures[0].steps[0].noteStyleId).toBe("1");
    });

    it("returns no selection for an empty paste target", () => {
        model.startNewArrangement([instrumentA()]);
        const track = model.arrangement!.tracks[0];
        model.setGridNote(track.id, 1, 0, "1");

        clipboard.copy([{ granularity: SelectionGranularity.Note, bar: 1, trackId: track.id, startStep: 0 }]);

        const result = clipboard.paste([] as ISelectionEntry[]);

        expect(result.kind).toBe(PasteResultKind.NoSelection);
    });
});
