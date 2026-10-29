/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Damping, type ISbDmArrangement, type ISbDmTrack } from "../../src/core/ScoreBookDataModel.js";
import { StaffRowGeometry } from "../../src/core/StaffRowGeometry.js";
import {
    RangeArticulationKind, type IAudioData, type IForteMark, type IHairpin, type IRangeArticulation,
} from "../../src/core/types/general.js";

/** A 4/4 grid, which is all the notation rules the row geometry calls need. */
const grid = { stepsPerBar: 16, beatGroups: [4, 4, 4, 4] };

/**
 * Builds a one-measure track whose single event is a quarter note on the given staff line.
 *
 * @param id The track id.
 * @param noteLine The staff line the note sits on.
 * @param accent Whether the note carries an accent, which deepens its ink.
 *
 * @returns A minimal track holding one sounding note.
 */
const trackWithNote = (id: number, noteLine: number, accent = false): ISbDmTrack => {
    return {
        id,
        instrument: { noteStyles: { "1": { id: "1", noteLine } } },
        measures: [{
            events: [{
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 1, denominator: 4 },
                noteStyleId: "1",
                articulation: accent ? { damping: Damping.Open, accent: true, ghost: false } : undefined,
            }],
            subdivisions: [],
            meter: { stepResolution: 16 },
            noteEvents: [{ audioData: { id: "1", noteLine, characteristics: {}, sampleProfile: {} } }],
        }],
    } as unknown as ISbDmTrack;
};

/**
 * Builds a one-measure track holding a single whole-bar rest, which carries no stem.
 *
 * @param id The track id.
 *
 * @returns A minimal track holding one rest.
 */
const trackWithRest = (id: number): ISbDmTrack => {
    return {
        id,
        instrument: { noteStyles: {} },
        measures: [{
            events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
            subdivisions: [],
            meter: { stepResolution: 16 },
            noteEvents: [],
        }],
    } as unknown as ISbDmTrack;
};

/**
 * @param tracks The tracks of the arrangement.
 *
 * @returns An arrangement of those tracks, laid out at the default measure width.
 */
const arrangementOfTracks = (tracks: ISbDmTrack[]): ISbDmArrangement => {
    return { tracks } as unknown as ISbDmArrangement;
};

/**
 * @param tracks The tracks of the arrangement.
 * @param markings The range markings the arrangement carries.
 *
 * @returns An arrangement of those tracks carrying the given markings.
 */
const arrangementWithMarkings = (tracks: ISbDmTrack[], markings: IRangeArticulation[]): ISbDmArrangement => {
    return {
        tracks,
        rangeArticulations: {
            forTrack: () => {
                return markings;
            },
        },
    } as unknown as ISbDmArrangement;
};

/** A hairpin opening over the first half of the first bar. */
const hairpin: IHairpin = {
    id: 1,
    trackId: 1,
    kind: RangeArticulationKind.Crescendo,
    from: { bar: 1, start: { numerator: 0, denominator: 1 } },
    to: { bar: 1, start: { numerator: 1, denominator: 2 } },
};

/** An `f` marking at the first event of the first bar. */
const forteMark: IForteMark = {
    id: 2,
    trackId: 1,
    kind: RangeArticulationKind.Forte,
    at: { bar: 1, start: { numerator: 0, denominator: 1 } },
};

/** Half the height of the band a hairpin's opening takes, in px. */
const hairpinBandHalfPx = 6;

/** Half the height of the band the dynamic `f` takes, in px. */
const forteBandHalfPx = 12;

describe("StaffRowGeometry", () => {
    it("places the staff line by its own offset and states the row's centre from it", () => {
        const track = trackWithNote(1, 1);

        const geometry = StaffRowGeometry.ofTrack(track, arrangementOfTracks([track]), grid);

        expect(geometry.staffLineOffsetPx).toBeGreaterThan(0);
        expect(geometry.heightPx).toBeGreaterThan(geometry.staffLineOffsetPx);
        expect(geometry.centrePx).toBeCloseTo(geometry.staffLineOffsetPx - (geometry.heightPx / 2));
    });

    it("gives a stemmed note a taller row than a rest", () => {
        const note = trackWithNote(1, 1);
        const rest = trackWithRest(2);

        const noteGeometry = StaffRowGeometry.ofTrack(note, arrangementOfTracks([note]), grid);
        const restGeometry = StaffRowGeometry.ofTrack(rest, arrangementOfTracks([rest]), grid);

        // The note's stem reaches above the head, so its row is taller than the rest's.
        expect(noteGeometry.staffLineOffsetPx).toBeGreaterThan(restGeometry.staffLineOffsetPx);
    });

    it("gives a note on the lowest line of a taller staff a taller row than one on a single line", () => {
        const single = trackWithNote(1, 1);
        const multi = trackWithNote(2, 1);
        multi.instrument.noteStyles["4"] = { id: "4", noteLine: 4 } as IAudioData;

        const singleGeometry = StaffRowGeometry.ofTrack(single, arrangementOfTracks([single]), grid);
        const multiGeometry = StaffRowGeometry.ofTrack(multi, arrangementOfTracks([multi]), grid);

        // The lowest line of a four-line staff sits below its middle, so the same stem reaches higher.
        expect(multiGeometry.staffLineOffsetPx).toBeGreaterThan(singleGeometry.staffLineOffsetPx);
    });

    it("reserves room below the notation for the label of a nested tuplet", () => {
        const track = trackWithNote(1, 1);
        const arrangement = arrangementOfTracks([track]);
        const plain = StaffRowGeometry.ofTrack(track, arrangement, grid).heightPx;

        track.measures[0].subdivisions.push(
            { startIndex: 0, actual: 3, normal: 4, isTuplet: true },
            { startIndex: 0, actual: 3, normal: 1, isTuplet: true },
        );
        const nested = StaffRowGeometry.ofTrack(track, arrangement, grid).heightPx;

        expect(nested).toBeGreaterThan(plain);
    });

    it("measures every track of an arrangement, keyed by track id", () => {
        const tracks = [trackWithNote(1, 1), trackWithRest(2)];

        const geometries = StaffRowGeometry.ofArrangement(arrangementOfTracks(tracks), grid);

        expect(geometries.size).toBe(2);
        expect(geometries.has(1)).toBe(true);
        expect(geometries.has(2)).toBe(true);
    });

    it("states a marking band for a track the arrangement gives a hairpin, and none without markings", () => {
        const track = trackWithNote(1, 1);

        const marked = StaffRowGeometry.ofTrack(track, arrangementWithMarkings([track], [hairpin]), grid);
        const plain = StaffRowGeometry.ofTrack(track, arrangementOfTracks([track]), grid);

        expect(marked.bandCentrePx).toBeDefined();
        expect(plain.bandCentrePx).toBeUndefined();
    });

    it("keeps the marking band's top clear of the notation's ink", () => {
        const track = trackWithNote(1, 1);

        const geometry = StaffRowGeometry.ofTrack(track, arrangementWithMarkings([track], [hairpin]), grid);

        // The note's ink reaches 5 px below the staff line; the band's top must sit below that.
        expect(geometry.bandCentrePx! + (geometry.heightPx / 2) - hairpinBandHalfPx)
            .toBeGreaterThan(geometry.staffLineOffsetPx + 5);
    });

    it("reserves a taller row for an f marking than for a hairpin", () => {
        // The accented note's deeper ink lifts the row off its least height, so the f's larger band half shows.
        const track = trackWithNote(1, 1, true);

        const hairpinGeometry = StaffRowGeometry.ofTrack(track, arrangementWithMarkings([track], [hairpin]), grid);
        const forteGeometry = StaffRowGeometry.ofTrack(track, arrangementWithMarkings([track], [forteMark]), grid);

        // The band is symmetric about its middle, so the f's larger half grows the row by twice the difference.
        expect(forteGeometry.heightPx - hairpinGeometry.heightPx)
            .toBeCloseTo((forteBandHalfPx - hairpinBandHalfPx) * 2);
    });
});
