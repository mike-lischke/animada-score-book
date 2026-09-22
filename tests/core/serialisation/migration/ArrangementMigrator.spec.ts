/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../../../src/core/Arrangement.js";
import { Track } from "../../../../src/core/Track.js";
import type { ISbDmInstrument } from "../../../../src/core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "../../../../src/core/serialisation/migration/ArrangementMigrator.js";
import type { IBananaDrumSnapshot } from "../../../../src/core/serialisation/migration/BananaDrumMigrator.js";
import { getArrangementSnapshot } from "../../../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot, IAudioData, Mutable } from "../../../../src/core/types/general.js";
import { createInstrument, hydrateMeasureEvents } from "../../../unit-test-helpers.js";

/**
 * Creates a live Arrangement from a snapshot via the public API.
 *
 * @param snapshot The arrangement snapshot or share-link arrangement to migrate.
 * @param instruments The available instruments.
 * @returns A fully constructed arrangement.
 */
const createArrangement = (
    snapshot: IArrangementSnapshot | IBananaDrumSnapshot,
    instruments: ISbDmInstrument[],
): Arrangement => {
    return ArrangementMigrator.migrateToArrangement(snapshot, instruments).arrangement;
};

describe("ArrangementMigrator", () => {
    it("splits cross-bar polyrhythms when loading a snapshot", () => {
        const instruments = [createInstrument("0", 0, 0)];

        const snapshot: IBananaDrumSnapshot = {
            title: "Cross Bar",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 16 },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    notes: Array.from<string>({ length: 35 }).fill("0"),
                    polyrhythms: [{ id: 999, start: 14, end: 18, length: 8 }],
                },
            ]
        };

        const arrangement = createArrangement(snapshot, instruments);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        // After migration the runtime Track only carries measures. The cross-bar polyrhythm has
        // been split into one polyrhythm per bar; each bar therefore contains a sequence of
        // non-grid (polyrhythm) events with non-1/stepsPerBar duration.
        const stepsPerBar = 16;
        const isPolyrhythmEvent = (event: { duration: { numerator: number; denominator: number; }; }) => {
            return (event.duration.numerator * stepsPerBar) % event.duration.denominator !== 0;
        };

        const bar1Polyrhythm = track.measures[0].events.filter(isPolyrhythmEvent);
        const bar2Polyrhythm = track.measures[1].events.filter(isPolyrhythmEvent);
        expect(bar1Polyrhythm).toHaveLength(3);
        expect(bar2Polyrhythm).toHaveLength(5);
    });

    it("keeps already single-bar polyrhythms unchanged", () => {
        const instruments = [createInstrument("0", 0, 0)];

        const snapshot: IBananaDrumSnapshot = {
            title: "Already Normalized",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 16 },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    notes: Array.from<string>({ length: 33 }).fill("0"),
                    polyrhythms: [{ id: 200, start: 10, end: 12, length: 4 }],
                },
            ]
        };

        const arrangement = createArrangement(snapshot, instruments);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        const stepsPerBar = 16;
        const isPolyrhythmEvent = (event: { duration: { numerator: number; denominator: number; }; }) => {
            return (event.duration.numerator * stepsPerBar) % event.duration.denominator !== 0;
        };

        const polyrhythmEvents = track.measures[0].events.filter(isPolyrhythmEvent);
        expect(polyrhythmEvents).toHaveLength(4);
    });

    it("keeps polyrhythms when a snapshot round-trips through the current schema", () => {
        const instrument = createInstrument("0", 0, 0);
        const hitStyle = {
            id: "1",
            audioBuffer: null,
            instrument,
            sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }
        } as IAudioData;
        (instrument as Mutable<ISbDmInstrument>).noteStyles = { "1": hitStyle };

        const shareLink: IBananaDrumSnapshot = {
            title: "Measure Events With Polyrhythm",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 8 },
            tracks: [
                {
                    id: 100,
                    instrumentId: "0",
                    notes: Array.from({ length: 9 }, () => {
                        return "0";
                    }),
                    polyrhythms: [{ id: 900, start: 0, end: 1, length: 3 }],
                },
            ],
        };

        const sourceArrangement = createArrangement(shareLink, [instrument]);
        const sourceTrack = sourceArrangement.tracks[0] as Track;
        const sourceMeasure = sourceTrack.measures[0];

        // Set the second polyrhythm note directly on the measure event (the source of truth).
        const subdivision = sourceMeasure.subdivisions[0];
        sourceMeasure.events[subdivision.startIndex + 1].noteStyleId = "1";
        const snapshot = getArrangementSnapshot(sourceArrangement);

        const arrangement = createArrangement(snapshot, [instrument]);
        hydrateMeasureEvents(arrangement);
        const track = arrangement.tracks[0] as Track;

        const stepsPerBar = 8;
        const polyrhythmEvents = track.measures[0].noteEvents.filter((event) => {
            return (event.duration.numerator * stepsPerBar) % event.duration.denominator !== 0;
        });

        expect(polyrhythmEvents).toHaveLength(3);
        expect(polyrhythmEvents[1].audioData?.id).toBe("1");
    });

    it("produces tuplet groups from nested share-link polyrhythms", () => {
        const instrument = createInstrument("3", 3, 3);
        (instrument as Mutable<ISbDmInstrument>).noteStyles = {
            "1": {
                id: "1", audioBuffer: null, instrument,
                sampleProfile: { builtInDamping: 0, builtInAccent: false, ghost: false }
            } as IAudioData,
        };

        const snapshot: IBananaDrumSnapshot = {
            title: "Nested Tuplet Parent",
            timeParams: {
                timeSignature: "6/8",
                tempo: 50,
                length: 1,
                pulse: "3/8",
                stepResolution: 8,
            },
            tracks: [{
                id: 531,
                instrumentId: "3",
                notes: Array.from({ length: 9 }, () => {
                    return "1";
                }),
                polyrhythms: [
                    { id: 529, start: 1, end: 1, length: 3 },
                    { id: 530, start: 3, end: 3, length: 2 },
                ],
            }],
        };

        const migrated = createArrangement(snapshot, [instrument]);
        const subdivisions = migrated.tracks[0]?.measures[0]?.subdivisions ?? [];

        // Nested polyrhythms flatten into independent subdivision groups.
        expect(subdivisions.length).toBeGreaterThanOrEqual(1);
        expect(subdivisions.some((subdivision) => {
            return subdivision.actual === 3;
        })).toBe(true);
        expect(subdivisions.some((subdivision) => {
            return subdivision.actual === 2;
        })).toBe(true);
    });

});

import { bateriaInstruments } from "../../../../src/bateria-instruments.js";
import { MockInstrument } from "../../mocks/MockInstrument.js";

const bdInstruments = bateriaInstruments.map((meta) => {
    return new MockInstrument(meta);
});

describe("ArrangementMigrator - BananaDrum URL migration", () => {
    it("migrates the provided BananaDrum song to the expected structure", () => {
        const params = new URLSearchParams(
            "a2=4-4.100.4.1-4.16.ancT9sB~3cD5eiVZCPtZ8-g0q8s2zbqX1uH.1wkTlpVed1IXUvNs1E"
        );

        const { arrangement: migrated } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);
        expect(migrated.title).toEqual("Untitled Arrangement");
        expect({
            timeSignature: migrated.timeParams.timeSignature,
            tempo: migrated.timeParams.tempo,
            length: migrated.timeParams.length,
            pulse: migrated.timeParams.pulse,
            stepResolution: migrated.timeParams.stepResolution,
        }).toEqual({
            timeSignature: "4/4",
            tempo: 100,
            length: 4,
            pulse: "1/4",
            stepResolution: 16,
        });
        expect(migrated.tracks).toHaveLength(2);

        const agogoTrack = migrated.tracks.find((track) => {
            return track.instrument.typeId === "a";
        });
        const chocalhoTrack = migrated.tracks.find((track) => {
            return track.instrument.typeId === "1";
        });

        expect(agogoTrack).toBeDefined();
        expect(chocalhoTrack).toBeDefined();

        // The agogô track carries tuplets (6:8 in bar 2); the chocalho track is grid-only.
        const agogoTuplets = agogoTrack!.measures.flatMap((measure) => {
            return measure.subdivisions;
        });
        expect(agogoTuplets.some((subdivision) => {
            return subdivision.actual === 6 && subdivision.normal === 8;
        })).toBe(true);

        expect(chocalhoTrack!.measures.every((measure) => {
            return measure.subdivisions.length === 0;
        })).toBe(true);
    });

    it("migrates 6/8 with nested + unnested subdivisions to events and tuplets", () => {
        const params = new URLSearchParams("t=Bolero%203&a2=6-8.50.1.3-8.8.319ihbrp-4UX1WbY5oS");

        const { arrangement, migrated } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);
        expect(migrated).toBeTruthy();
        expect(arrangement.title).toEqual("Bolero 3");
        expect(arrangement.tracks).toHaveLength(1);

        const track = arrangement.tracks[0];
        expect(track.measures).toHaveLength(1);
        const measure = track.measures[0];

        expect(measure.meter.beats).toBe(6);
        expect(measure.meter.beatUnits).toBe(8);
        expect(measure.meter.stepResolution).toBe(6);
        expect(measure.meter.beatGroups).toEqual([3, 3]);

        // All 13 visible steps are notes; the 4:1 subdivision is the only asymmetric tuplet.
        expect(measure.events).toHaveLength(13);
        expect(measure.events.every((event) => {
            return event.noteStyleId !== undefined;
        })).toBe(true);

        const tuplets = measure.subdivisions.filter((subdivision) => {
            return subdivision.isTuplet;
        });
        expect(tuplets).toHaveLength(1);
        expect(tuplets[0]).toEqual(expect.objectContaining({
            actual: 4,
            normal: 1,
        }));

        // The two triplet slots, the three notes of the nested triplet and the four notes of the 4:1
        // subdivision produce nine non-grid events. A nested subdivision must not make the expansion
        // skip a sibling subdivision further to the right.
        const nonGridEvents = measure.events.filter((event) => {
            return (event.duration.numerator * 6) % event.duration.denominator !== 0;
        });
        expect(nonGridEvents).toHaveLength(9);
    });

    it("Repi Solo: binary subdivisions are recorded without tuplets", () => {
        /* cspell:disable */
        const params = new URLSearchParams(
            "t=Repi%20Solo%20Gabriel%20Policarpo%20(3%20extra%20Schl%C3%A4ge)" +
            "&a2=4-4.120.13.1-4.16.3w0w0w0w0YD9YD9U0ENPU88v089YD11YD89YD11U0br331Prr1roooero08o1308oee88o11308o" +
            "3108o30oYDAU8o1308oee88o11308o80-2OewGGYWgHHzHhoG0U.3MMM00600MMM00066MMS660666MMMS66MMS06MS0000066MMS" +
            "660066M0000000.8g__LH32dfi3a0W~J6nInt4qwCvXtcPbR0LgWAHCzXe~DzXNWT5bQGt~.9drFHcHu~CY5FUQX1GaQs0S3A1~n" +
            "hyCTb4ybOeMH73m6PPjB4En3PUu"
        );
        /* cspell:enable */

        const { arrangement: snapshot } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);

        // All subdivisions in this song are binary (powers of 2), so none is a tuplet.
        const allSubdivisions = snapshot.tracks.flatMap((track) => {
            return track.measures.flatMap((measure) => {
                return measure.subdivisions;
            });
        });

        expect(allSubdivisions.every((subdivision) => {
            return !subdivision.isTuplet;
        })).toBe(true);
    });

    describe("Beija Flor 2004 - Bossa 2 (I-Break)", () => {
        /* cspell:disable */
        const params = new URLSearchParams(
            "t=Beija%20Flor%202004%20-%20Bossa%202%20(%22I-Break%22)" +
            "&a2=4-4.100.11.1-4.16.0eLNZGdzHEukDW9iGstavnTEZUV~gx4QgRGV2ig2i-AG0BSC8_NqZz1YtDPGa" +
            ".158qP0XXR2KFVaHV84dLQ4di6C~_Ts0FbjnisDTPZgLnroRU" +
            ".2dZ2OpKo50EqVkKFk2FC7IXGgwUu_eARKL6M7ox~mTQ-iiWslWxOwWg~~12" +
            ".3avauavauavauavauavauavauavauavauavauavauavauavauavauavauavauavau8o8o8rR6avauavauavauavau" +
            ".5u8i8jex4f0UkFPcfCKddB~zWd9cyoyAcQet8gNFJV~kdqGZEn42xpgq0WlLsJsZ9yKx3" +
            ".71FWocgPOxWBZDTBGyXUo3YpiP0xvlLX4_wmzM71D-8w06YquxgSrTHpBtZbZOpPc7zrkC" +
            ".81UEKcy2prthJcmKyWqDRGNc~GnCuDIJ~EQ~lPBv_Q-8w06YquxgSrTHpBtZbZOpPc7zrkC" +
            ".91vkkI9HbCqb9Pm42rNj_sLroJbVPl0NDRujYBCwC-8w06YquxgSrTHpBtZbZOpPc7zrkC"
        );
        /* cspell:enable */

        const { arrangement, migrated } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);

        it("migrates successfully with correct metadata", () => {
            expect(migrated).toBe(true);
            expect(arrangement.title).toEqual('Beija Flor 2004 - Bossa 2 ("I-Break")');
            expect(arrangement.timeParams).toEqual(expect.objectContaining({
                timeSignature: "4/4",
                tempo: 100,
                length: 11,
                pulse: "1/4",
                stepResolution: 16,
            }));
            expect(arrangement.tracks.length).toBe(8);
            for (const track of arrangement.tracks) {
                expect(track.measures).toHaveLength(11);
            }
        });

        it("keeps the expected number of note events per track", () => {
            hydrateMeasureEvents(arrangement);
            const noteCounts = new Map<string, number>();
            for (const track of arrangement.tracks) {
                const stepsPerBar = track.measures[0].meter.stepResolution;
                const count = [...track.notes].filter((event) => {
                    return event.audioData !== undefined
                        || (event.duration.numerator * stepsPerBar) % event.duration.denominator !== 0;
                }).length;
                noteCounts.set(track.instrument.typeId, count);
            }

            expect(noteCounts.get("0")).toBe(97);
            expect(noteCounts.get("1")).toBe(76);
            expect(noteCounts.get("2")).toBe(106);
            expect(noteCounts.get("3")).toBe(170);
            expect(noteCounts.get("5")).toBe(157);
            expect(noteCounts.get("7")).toBe(86);
            expect(noteCounts.get("8")).toBe(77);
            expect(noteCounts.get("9")).toBe(77);
        });

        it("preserves the tuplet structure of the agogô track", () => {
            const agogoTrack = arrangement.tracks.find((t) => {
                return t.instrument.typeId === "0";
            })!;

            const tupletsOf = (measureNumber: number) => {
                return agogoTrack.measures[measureNumber - 1].subdivisions.filter((subdivision) => {
                    return subdivision.isTuplet;
                });
            };

            // Bar 2: 3:4 tuplet at the end.
            expect(tupletsOf(2)).toHaveLength(1);
            expect(tupletsOf(2)[0]).toEqual(expect.objectContaining({ actual: 3, normal: 4 }));

            // Bars 3, 5, 6, 7, 8: full-bar 12:16 tuplets; bar 4: two 6:8 tuplets.
            expect(tupletsOf(3)[0]).toEqual(expect.objectContaining({ actual: 12, normal: 16 }));
            expect(tupletsOf(4)).toHaveLength(2);
            expect(tupletsOf(4)[0]).toEqual(expect.objectContaining({ actual: 6, normal: 8 }));
            expect(tupletsOf(4)[1]).toEqual(expect.objectContaining({ actual: 6, normal: 8 }));
            expect(tupletsOf(5)[0]).toEqual(expect.objectContaining({ actual: 12, normal: 16 }));
        });

        it("keeps grid-only tracks free of tuplets", () => {
            for (const typeId of ["1", "3", "5"]) {
                const track = arrangement.tracks.find((t) => {
                    return t.instrument.typeId === typeId;
                })!;
                for (const measure of track.measures) {
                    const tuplets = measure.subdivisions.filter((subdivision) => {
                        return subdivision.isTuplet;
                    });
                    expect(tuplets).toHaveLength(0);
                }
            }
        });

    });
});
