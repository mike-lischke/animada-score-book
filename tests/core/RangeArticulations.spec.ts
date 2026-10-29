/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { HairpinEnd, RangeArticulations } from "../../src/core/RangeArticulations.js";
import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { reduceFraction } from "../../src/core/serialisation/numeric-functions.js";
import type { IForteMark, IHairpin, IMeasureEvent, IRangeArticulationAnchor } from "../../src/core/types/general.js";
import { RangeArticulationKind } from "../../src/core/types/general.js";
import { createInstrument, setCellNote } from "../unit-test-helpers.js";

/** The grid steps a measure of the test arrangement holds. */
const stepsPerBar = 16;

/** The steps the first track carries notes on, and the ones the second does: the two differ in their onsets. */
const trackNotes = [[0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 8, 12]];

/** The ids the tests build their markings with, far above the ids the model mints. */
const hairpinId = 9001;
const forteId = 9002;

describe("RangeArticulations", { concurrent: false }, () => {
    let model: ScoreBookDataModel;

    /**
     * @param trackIndex The track to look in.
     *
     * @returns The id of that track.
     */
    const trackIdOf = (trackIndex: number): number => {
        return model.arrangement!.tracks[trackIndex].id;
    };

    /**
     * @param bar The 1-based measure to look in.
     * @param trackIndex The track to look in.
     *
     * @returns The events of that measure, in display order.
     */
    const eventsIn = (bar: number, trackIndex: number): IMeasureEvent[] => {
        return model.arrangement!.tracks[trackIndex].measures[bar - 1].events;
    };

    /**
     * @param bar The 1-based measure to list.
     * @param trackIndex The track to list.
     * @param notesOnly True to list the notes of the measure, false to list its rests.
     *
     * @returns The anchors of those events, in order.
     */
    const anchorsIn = (bar: number, trackIndex: number, notesOnly: boolean): IRangeArticulationAnchor[] => {
        return eventsIn(bar, trackIndex).filter((event) => {
            return notesOnly ? event.noteStyleId !== undefined : event.noteStyleId === undefined;
        }).map((event) => {
            return { bar, start: { ...event.start } };
        });
    };

    /**
     * @param bar The 1-based measure.
     * @param step The zero-based grid step.
     *
     * @returns The anchor of the position that step starts at.
     */
    const anchorOf = (bar: number, step: number): IRangeArticulationAnchor => {
        return { bar, start: reduceFraction(step, stepsPerBar) };
    };

    /**
     * @param from The chronologically first anchor.
     * @param to The chronologically second anchor.
     * @param kind The direction the hairpin opens in, rising by default.
     *
     * @returns A hairpin of the first track between those anchors.
     */
    const hairpinOf = (
        from: IRangeArticulationAnchor,
        to: IRangeArticulationAnchor,
        kind: RangeArticulationKind.Crescendo | RangeArticulationKind.Decrescendo = RangeArticulationKind.Crescendo,
    ): IHairpin => {
        return { id: hairpinId, trackId: trackIdOf(0), kind, from: { ...from }, to: { ...to } };
    };

    /**
     * @param at The event the marking sits at.
     * @param trackIndex The track the marking belongs to.
     *
     * @returns An f marking of that track.
     */
    const forteOf = (at: IRangeArticulationAnchor, trackIndex = 0): IForteMark => {
        return { id: forteId, trackId: trackIdOf(trackIndex), kind: RangeArticulationKind.Forte, at: { ...at } };
    };

    beforeEach(() => {
        model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0), createInstrument("1", 1, 1)], { length: 2 });

        trackNotes.forEach((steps, trackIndex) => {
            for (const bar of [1, 2]) {
                for (const step of steps) {
                    setCellNote(model, trackIdOf(trackIndex), bar, step, "1");
                }
            }
        });
    });

    it("orders anchors by measure and then by their position in it", () => {
        expect(RangeArticulations.compareAnchors(anchorOf(1, 0), anchorOf(1, 8))).toBeLessThan(0);
        expect(RangeArticulations.compareAnchors(anchorOf(1, 8), anchorOf(2, 0))).toBeLessThan(0);
        expect(RangeArticulations.compareAnchors(anchorOf(2, 0), anchorOf(2, 0))).toBe(0);
        expect(RangeArticulations.compareAnchors(anchorOf(2, 8), anchorOf(1, 0))).toBeGreaterThan(0);
    });

    it("reports the span between two anchors as a bar fraction", () => {
        expect(RangeArticulations.spanOf(hairpinOf(anchorOf(1, 0), anchorOf(1, 4)))).toEqual({
            numerator: 1,
            denominator: 4,
        });
    });

    it("accepts a hairpin whose anchors run in order within one measure", () => {
        expect(RangeArticulations.isWellFormed(hairpinOf(anchorOf(1, 0), anchorOf(1, 8)))).toBe(true);
    });

    it("rejects anchors in the wrong order and a span below the minimum", () => {
        expect(RangeArticulations.isWellFormed(hairpinOf(anchorOf(1, 8), anchorOf(1, 0)))).toBe(false);

        // Two anchors a sixty-fourth of a bar apart are closer than the smallest span a hairpin keeps.
        const tooNarrow: IHairpin = {
            ...hairpinOf(anchorOf(1, 0), anchorOf(1, 0)),
            to: { bar: 1, start: { numerator: 1, denominator: 64 } },
        };
        expect(RangeArticulations.isWellFormed(tooNarrow)).toBe(false);

        const smallest: IHairpin = { ...tooNarrow, to: { bar: 1, start: { numerator: 1, denominator: 32 } } };
        expect(RangeArticulations.isWellFormed(smallest)).toBe(true);
    });

    it("accepts a hairpin that reaches over a barline", () => {
        const hairpin = hairpinOf(anchorOf(1, 14), anchorOf(2, 0));

        expect(RangeArticulations.isWellFormed(hairpin)).toBe(true);
        expect(RangeArticulations.isValidHairpin(model.arrangement!, hairpin)).toBe(true);
    });

    it("requires the anchors of a hairpin to be sounding notes of its own track", () => {
        const arrangement = model.arrangement!;
        const notes = anchorsIn(1, 0, true);
        const rest = anchorsIn(1, 0, false)[0];

        expect(RangeArticulations.isValidHairpin(arrangement, hairpinOf(notes[0], rest))).toBe(false);
        expect(RangeArticulations.isValidHairpin(arrangement, hairpinOf(notes[0], notes[2]))).toBe(true);

        // A track the arrangement does not hold resolves to no event at all.
        const stranger: IHairpin = { ...hairpinOf(notes[0], notes[2]), trackId: 999 };
        expect(RangeArticulations.isValidHairpin(arrangement, stranger)).toBe(false);
    });

    it("accepts an f on a rest and refuses one on a position that holds no event", () => {
        const arrangement = model.arrangement!;
        const notes = anchorsIn(1, 0, true);
        const rest = anchorsIn(1, 0, false)[0];

        expect(RangeArticulations.isValidForteMark(arrangement, forteOf(notes[0]))).toBe(true);
        expect(RangeArticulations.isValidForteMark(arrangement, forteOf(rest))).toBe(true);

        // Half a step into the first note is not a position an event starts at.
        const inBetween = { bar: 1, start: reduceFraction(1, stepsPerBar * 2) };
        expect(RangeArticulations.isValidForteMark(arrangement, forteOf(inBetween))).toBe(false);
    });

    it("lets hairpins touch at an anchor but not overlap", () => {
        const notes = anchorsIn(1, 0, true);
        const first = hairpinOf(notes[0], notes[2]);

        expect(RangeArticulations.overlaps(first, hairpinOf(notes[2], notes[4]))).toBe(false);
        expect(RangeArticulations.overlaps(first, hairpinOf(notes[1], notes[3]))).toBe(true);
        expect(RangeArticulations.overlaps(first, hairpinOf(notes[4], notes[6]))).toBe(false);
    });

    it("sees hairpins overlap over a barline as well", () => {
        const reaching = hairpinOf(anchorOf(1, 12), anchorOf(2, 4));
        const later = hairpinOf(anchorOf(2, 0), anchorOf(2, 8));

        expect(RangeArticulations.overlaps(reaching, later)).toBe(true);
        expect(RangeArticulations.overlaps(later, reaching)).toBe(true);
    });

    it("never overlaps a hairpin of another track", () => {
        const notes = anchorsIn(1, 0, true);
        const mine = hairpinOf(notes[0], notes[4]);
        const theirs: IHairpin = { ...mine, trackId: trackIdOf(1) };

        expect(RangeArticulations.overlaps(mine, theirs)).toBe(false);
    });

    it("covers the events of its span, its ends included", () => {
        const notes = anchorsIn(1, 0, true);
        const hairpin = hairpinOf(notes[0], notes[2]);

        expect(RangeArticulations.covers(hairpin, notes[0])).toBe(true);
        expect(RangeArticulations.covers(hairpin, notes[1])).toBe(true);
        expect(RangeArticulations.covers(hairpin, notes[2])).toBe(true);
        expect(RangeArticulations.covers(hairpin, notes[3])).toBe(false);
    });

    it("covers an event of the measure a hairpin reaches into", () => {
        const hairpin = hairpinOf(anchorOf(1, 12), anchorOf(2, 8));

        expect(RangeArticulations.covers(hairpin, anchorOf(1, 8))).toBe(false);
        expect(RangeArticulations.covers(hairpin, anchorOf(2, 4))).toBe(true);
        expect(RangeArticulations.covers(hairpin, anchorOf(2, 10))).toBe(false);
    });

    it("refuses an f inside a hairpin, in either order", () => {
        const notes = anchorsIn(1, 0, true);
        const hairpin = hairpinOf(notes[0], notes[4]);
        const inside = forteOf(notes[2]);
        const touching = forteOf(notes[4]);
        const elsewhere = forteOf(anchorOf(2, 0));

        expect(RangeArticulations.conflicts(inside, [hairpin])).toBe(true);
        expect(RangeArticulations.conflicts(hairpin, [inside])).toBe(true);
        expect(RangeArticulations.conflicts(touching, [hairpin])).toBe(true);
        expect(RangeArticulations.conflicts(elsewhere, [hairpin])).toBe(false);
    });

    it("refuses two f markings on one event and ignores the markings of other tracks", () => {
        const notes = anchorsIn(1, 0, true);
        const first = forteOf(notes[0]);
        const second: IForteMark = { ...first, id: forteId + 1 };
        const otherTrack: IForteMark = { ...first, id: forteId + 2, trackId: trackIdOf(1) };

        expect(RangeArticulations.conflicts(second, [first])).toBe(true);
        expect(RangeArticulations.conflicts(otherTrack, [first])).toBe(false);

        // A marking never conflicts with itself, which is what a drag of it relies on.
        expect(RangeArticulations.conflicts(first, [first])).toBe(false);
    });

    it("moves one end of a hairpin and keeps the other", () => {
        const notes = anchorsIn(1, 0, true);
        const hairpin = hairpinOf(notes[0], notes[4]);

        const shorter = RangeArticulations.withMovedEnd(hairpin, HairpinEnd.To, notes[2]);

        expect(shorter.from).toEqual(notes[0]);
        expect(shorter.to).toEqual(notes[2]);
        expect(shorter.kind).toBe(RangeArticulationKind.Crescendo);
    });

    it("turns a hairpin around when an end is dragged past the other", () => {
        const notes = anchorsIn(1, 0, true);
        const hairpin = hairpinOf(notes[0], notes[4]);

        // The span the hairpin then covers opens the other way round, so a crescendo becomes a decrescendo.
        const turned = RangeArticulations.withMovedEnd(hairpin, HairpinEnd.From, notes[6]);

        expect(turned.from).toEqual(notes[4]);
        expect(turned.to).toEqual(notes[6]);
        expect(turned.kind).toBe(RangeArticulationKind.Decrescendo);
    });

    it("keeps the notes a hairpin spans and follows the note it was grabbed at", () => {
        const notes = anchorsIn(1, 0, true);
        const hairpin = hairpinOf(notes[1], notes[3]);

        expect(RangeArticulations.grabOffset(notes, hairpin, notes[1])).toBe(0);
        expect(RangeArticulations.grabOffset(notes, hairpin, notes[2])).toBe(1);

        // Grabbing before the first end cannot drag the hairpin to the left of the track, so it counts as its start.
        expect(RangeArticulations.grabOffset(notes, hairpin, notes[0])).toBe(0);

        const moved = RangeArticulations.translate(hairpin, notes, notes, notes[5], 1);

        expect(moved?.from).toEqual(notes[4]);
        expect(moved?.to).toEqual(notes[6]);
        expect(moved?.kind).toBe(RangeArticulationKind.Crescendo);
    });

    it("puts a hairpin on a track whose notes start elsewhere", () => {
        const source = anchorsIn(1, 0, true);
        const target = anchorsIn(1, 1, true);
        const hairpin = hairpinOf(source[1], source[3]);

        // The anchors of the source are no anchors of the target, so only the number of notes it spans carries over.
        const moved = RangeArticulations.translate(hairpin, source, target, target[1], 0);

        expect(moved?.from).toEqual(target[1]);
        expect(moved?.to).toEqual(target[3]);
    });

    it("stops a hairpin at the end of a track without shortening it", () => {
        const source = anchorsIn(1, 0, true);
        const target = anchorsIn(1, 1, true);
        const hairpin = hairpinOf(source[0], source[2]);

        const moved = RangeArticulations.translate(hairpin, source, target, target[3], 0);

        expect(moved?.from).toEqual(target[1]);
        expect(moved?.to).toEqual(target[3]);
    });

    it("refuses a move whose anchors or span do not fit the tracks", () => {
        const source = anchorsIn(1, 0, true);
        const target = anchorsIn(1, 1, true);

        // Seven notes do not fit a measure of the target track that holds four.
        expect(RangeArticulations.translate(hairpinOf(source[0], source[6]), source, target, target[0], 0))
            .toBeUndefined();

        // A rest is no note anchor, so the span of that hairpin stays unknown.
        const resting = hairpinOf(anchorOf(1, 1), source[2]);
        expect(RangeArticulations.grabOffset(source, resting, source[0])).toBeUndefined();
        expect(RangeArticulations.translate(resting, source, target, target[0], 0)).toBeUndefined();
    });

    it("hands out copies that a caller may change", () => {
        const anchor = anchorOf(1, 0);
        const copy = RangeArticulations.cloneAnchor(anchor);
        copy.bar = 2;

        expect(anchor.bar).toBe(1);
        expect(copy).not.toBe(anchor);
    });

    it("clones a marking together with its anchors", () => {
        const hairpin = hairpinOf(anchorOf(1, 0), anchorOf(1, 8));
        const copy = RangeArticulations.clone(hairpin);
        if (!RangeArticulations.isHairpin(copy)) {
            throw new Error("Expected the copy of a hairpin to be a hairpin.");
        }

        copy.from.bar = 2;

        expect(copy).not.toBe(hairpin);
        expect(copy.to).toEqual(hairpin.to);
        expect(hairpin.from.bar).toBe(1);
    });

    it("keeps a hairpin that reaches over a barline when reading a chunk", () => {
        const chunk = [{
            id: hairpinId,
            trackId: trackIdOf(0),
            kind: RangeArticulationKind.Crescendo,
            from: anchorOf(1, 14),
            to: anchorOf(2, 4),
        }];

        const articulations = new RangeArticulations();
        articulations.load(chunk, model.arrangement!);

        expect(articulations.all).toHaveLength(1);
        expect(articulations.all[0].id).toBe(hairpinId);
    });

    it("drops the broken entries of a chunk and keeps the rest", () => {
        const notes = anchorsIn(1, 0, true);
        const chunk = [
            {
                id: hairpinId,
                trackId: trackIdOf(0),
                kind: RangeArticulationKind.Crescendo,
                from: notes[0],
                to: notes[2],
            },

            // A track the arrangement does not hold.
            {
                id: hairpinId + 1,
                trackId: 999,
                kind: RangeArticulationKind.Crescendo,
                from: notes[0],
                to: notes[2],
            },

            // A kind the score does not know.
            {
                id: hairpinId + 2,
                trackId: trackIdOf(0),
                kind: "sforzando",
                from: notes[0],
                to: notes[2],
            },

            // A measure beyond the arrangement.
            {
                id: hairpinId + 3,
                trackId: trackIdOf(0),
                kind: RangeArticulationKind.Forte,
                at: anchorOf(9, 0),
            },

            // A hairpin that overlaps the one that was kept.
            {
                id: hairpinId + 4,
                trackId: trackIdOf(0),
                kind: RangeArticulationKind.Crescendo,
                from: notes[1],
                to: notes[3],
            },

            // The id an earlier entry already used.
            {
                id: hairpinId,
                trackId: trackIdOf(0),
                kind: RangeArticulationKind.Forte,
                at: notes[1],
            },
        ];

        const articulations = new RangeArticulations();
        articulations.load(chunk, model.arrangement!);

        expect(articulations.all.map((articulation) => {
            return articulation.id;
        })).toEqual([hairpinId]);
    });

    describe("dynamic factor", () => {
        it("plays at the normal level without a marking", () => {
            expect(RangeArticulations.dynamicsFactor([], anchorOf(1, 0))).toBe(1);
        });

        it("ramps a crescendo to the full level and keeps it", () => {
            const markings = [hairpinOf(anchorOf(1, 0), anchorOf(1, 8))];

            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(1, 0))).toBeCloseTo(0.2);
            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(1, 4))).toBeCloseTo(0.6);
            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(1, 8))).toBeCloseTo(1);
            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(2, 0))).toBeCloseTo(1);
        });

        it("ramps a decrescendo down and keeps the soft level", () => {
            const markings = [hairpinOf(anchorOf(1, 0), anchorOf(1, 8), RangeArticulationKind.Decrescendo)];

            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(1, 0))).toBeCloseTo(1);
            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(1, 4))).toBeCloseTo(0.6);
            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(1, 8))).toBeCloseTo(0.2);
            expect(RangeArticulations.dynamicsFactor(markings, anchorOf(2, 0))).toBeCloseTo(0.2);
        });

        it("lets an f restore the normal level and do nothing without a preceding change", () => {
            const after = [
                hairpinOf(anchorOf(1, 0), anchorOf(1, 8), RangeArticulationKind.Decrescendo),
                forteOf(anchorOf(2, 0)),
            ];

            expect(RangeArticulations.dynamicsFactor(after, anchorOf(1, 8))).toBeCloseTo(0.2);
            expect(RangeArticulations.dynamicsFactor(after, anchorOf(2, 0))).toBeCloseTo(1);
            expect(RangeArticulations.dynamicsFactor([forteOf(anchorOf(1, 4))], anchorOf(1, 4))).toBeCloseTo(1);
        });
    });

    describe("portion in a bar", () => {
        it("clips a hairpin to the bars it reaches into", () => {
            const hairpin = hairpinOf(anchorOf(1, 8), anchorOf(2, 4));

            expect(RangeArticulations.portionInBar(hairpin, 1)).toEqual({
                start: anchorOf(1, 8).start,
                end: { numerator: 1, denominator: 1 },
            });
            expect(RangeArticulations.portionInBar(hairpin, 2)).toEqual({
                start: { numerator: 0, denominator: 1 },
                end: anchorOf(2, 4).start,
            });
            expect(RangeArticulations.portionInBar(hairpin, 3)).toBeUndefined();
        });

        it("keeps a hairpin of one bar whole and an f a bare point", () => {
            const hairpin = hairpinOf(anchorOf(1, 0), anchorOf(1, 8));

            expect(RangeArticulations.portionInBar(hairpin, 1)).toEqual({
                start: anchorOf(1, 0).start,
                end: anchorOf(1, 8).start,
            });
            expect(RangeArticulations.portionInBar(forteOf(anchorOf(1, 4)), 1)).toEqual({
                start: anchorOf(1, 4).start,
                end: anchorOf(1, 4).start,
            });
            expect(RangeArticulations.portionInBar(forteOf(anchorOf(1, 4)), 2)).toBeUndefined();
        });
    });

    describe("the marking list", () => {
        it("adds, finds, sizes, iterates and clears markings", () => {
            const articulations = new RangeArticulations();
            const hairpin = hairpinOf(anchorOf(1, 0), anchorOf(1, 8));

            articulations.add(hairpin);
            expect(articulations.size).toBe(1);
            expect(articulations.all).toEqual([hairpin]);
            expect(articulations.find(hairpinId)).toBe(hairpin);
            expect([...articulations]).toEqual([hairpin]);

            expect(articulations.remove(hairpinId)).toBe(hairpin);
            expect(articulations.remove(hairpinId)).toBeUndefined();

            articulations.add(hairpin);
            articulations.clear();
            expect(articulations.size).toBe(0);
        });

        it("moves the anchors from a bar on", () => {
            const articulations = new RangeArticulations();
            articulations.add(hairpinOf(anchorOf(1, 0), anchorOf(2, 0)));

            articulations.shiftAnchors(2, 1);

            expect(articulations.all[0]).toMatchObject({ from: { bar: 1 }, to: { bar: 3 } });
        });

        it("copies a contained marking and leaves a reaching hairpin behind", () => {
            const articulations = new RangeArticulations();
            articulations.add(hairpinOf(anchorOf(1, 0), anchorOf(1, 8)));
            articulations.add({ ...hairpinOf(anchorOf(1, 8), anchorOf(2, 4)), id: hairpinId + 1 });

            articulations.copyContained(1, 3);

            expect(articulations.size).toBe(3);
            expect(articulations.all[2]).toMatchObject({ from: { bar: 3 }, to: { bar: 3 } });
        });

        it("drops every marking anchored in a bar", () => {
            const articulations = new RangeArticulations();
            articulations.add(hairpinOf(anchorOf(1, 0), anchorOf(1, 8)));
            articulations.add({ ...hairpinOf(anchorOf(1, 8), anchorOf(2, 4)), id: hairpinId + 1 });

            expect(articulations.dropInBar(2)).toBe(true);
            expect(articulations.size).toBe(1);
            expect(articulations.all[0].id).toBe(hairpinId);
        });

        it("drops only one track's markings in a bar", () => {
            const articulations = new RangeArticulations();
            articulations.add(hairpinOf(anchorOf(1, 0), anchorOf(1, 8)));
            articulations.add(forteOf(anchorOf(1, 4), 1));

            expect(articulations.dropTrackInBar(trackIdOf(0), 1)).toBe(true);
            expect(articulations.all.map((articulation) => {
                return articulation.trackId;
            })).toEqual([trackIdOf(1)]);
        });

        it("drops a removed track's markings and copies a duplicate's with fresh ids", () => {
            const articulations = new RangeArticulations();
            articulations.add(hairpinOf(anchorOf(1, 0), anchorOf(1, 8)));
            articulations.add(forteOf(anchorOf(1, 4), 1));
            const secondTrackId = trackIdOf(1);

            expect(articulations.removeTrack(trackIdOf(0))).toBe(true);
            expect(articulations.all.map((articulation) => {
                return articulation.trackId;
            })).toEqual([secondTrackId]);

            articulations.duplicateTrack(secondTrackId, 77);
            expect(articulations.size).toBe(2);
            expect(articulations.all[1]).toMatchObject({ trackId: 77 });
            expect(articulations.all[1].id).not.toBe(articulations.all[0].id);
        });

        it("drops a hairpin whose anchor note became a rest", () => {
            const articulations = new RangeArticulations();
            const notes = anchorsIn(1, 0, true);
            articulations.add(hairpinOf(notes[0], notes[2]));
            const trackIds = new Set([trackIdOf(0)]);

            expect(articulations.removeInvalid(model.arrangement!, trackIds)).toBe(false);

            eventsIn(1, 0)[0].noteStyleId = undefined;
            expect(articulations.removeInvalid(model.arrangement!, trackIds)).toBe(true);
            expect(articulations.size).toBe(0);
        });
    });
});
