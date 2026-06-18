/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { ArrangementMigrator } from "../../../../src/core/serialisation/migration/ArrangementMigrator.js";
import type { ISubdivision } from "../../../../src/core/types/general.js";
import { bateriaInstruments } from "../../../../src/bateria-instruments.js";
import { MockInstrument } from "../../mocks/MockInstrument.js";

const bdInstruments = bateriaInstruments.map((meta) => {
    return new MockInstrument(meta);
});

/* cspell:disable */
const oBreakSalgueiroUrl =
    "t=O-Break%20Salgueiro%202007%20Handzeichen%3A%20Dreieck" +
    "&a2=4-4.100.19.1-4.16.03hgQUbXnuDd~YM_U6bb3ThnSA9rOtLondqgc4LE7NuEF4tl_mhI_Dw7np6T2Amph1yZXv2cfltPZ-wwK9" +
    ".a3n8Ia4lYaYNXlmOvI90Au91df6F4olcl6y0tvHLKKLBB5OgdyIqvfElxMrqdYI5chb0KpHQ3OSWckHVBl0kVJm7sSOnDUxhFTUwEqCzr" +
    "XfFqCD6-wwK9.11EHv6HNf_tFFT3LSzzEF7M4Q0d7PLDx9mWFm7o~8sdG~DTYXLA_GSXC2WEHbUjFE7VNCQjZpmZG1-3rYmq6Ku" +
    ".23U8gRNeQE72d70zowkIwNyiXaUuQnFtjv52xj8f1Oi78AXuL_PUWj6GWN42wLUFtbEbfJOYW9JE-8N0T9cf461BHDV8fB" +
    ".399888000808080009998eo0avauavauavauavauavauavauavauavau800080808o0o8r56o088d6o099809980" +
    "avauavauavauavauavauavauavauavauavauavauavauavauavamavau-3_u2VDQWnwUf.5ROdT2lgcB1h2bwlk2xOPmxWHzAYTKYx7bI" +
    "DRi0NV4HAJ_BXI4tAM~HCuA49tGxObqQ7_PCfnUoKfWsj5BGNZAcfMUfWHZQIxRz7jmOeputpL9G-3rYmq6Ku" +
    ".769lbD8wA0LyGxPIOcGB8pdu30HCImk1NELdrJrKOm_P0iar_UWMbOMlryOFMQJOh_FhPA_ZBVd-3rYmq6Ku" +
    ".8160V40rCvwJbxBXTSb07tbaPSOnwYhpw1MFJSwwQTKoZVK4nQIj_oSAA7Vq~xeGT0zjoHxdknHd8-3rYmq6Ku" +
    ".969lbD8wA0LyE_znt3RgMbIfjXLhIk8hIRG4CUVQ2AitAPfM00UhSuV0AQUSyhjtUeD_0NuBezD-3rYmq6Ku";
/* cspell:enable */

/**
 * Pretty-prints a subdivision for readable assertion messages.
 *
 * @param sub The subdivision to format.
 *
 * @returns A string representation of the subdivision.
 */
const formatSub = (sub: ISubdivision): string => {
    return `Sub(id=${sub.id}, start=${sub.startStep}, actual=${sub.actual}, normal=${sub.normal}, ` +
        `isTuplet=${sub.isTuplet}, parentId=${sub.parentSubdivisionId ?? "none"})`;
};

describe("O-Break Salgueiro 2007 - Migration", () => {
    const params = new URLSearchParams(oBreakSalgueiroUrl);
    const { arrangement: migrated } = ArrangementMigrator.migrateToArrangement(params, bdInstruments);

    it("migrates successfully with correct song metadata", () => {
        expect(migrated.title).toEqual("O-Break Salgueiro 2007 Handzeichen: Dreieck");
        expect(migrated.timeParams.timeSignature).toBe("4/4");
        expect(migrated.timeParams.tempo).toBe(100);
        expect(migrated.timeParams.length).toBe(19);
        expect(migrated.timeParams.pulse).toBe("1/4");
        expect(migrated.timeParams.stepResolution).toBe(16);
    });

    it("has 9 tracks with correct instrument assignments", () => {
        expect(migrated.tracks).toHaveLength(9);

        const typeIds = migrated.tracks.map((t) => {
            return t.instrument.typeId;
        });
        expect(typeIds).toEqual(["0", "a", "1", "2", "3", "5", "7", "8", "9"]);
    });

    it("has 19 measures in every track", () => {
        for (const track of migrated.tracks) {
            expect(track.measures).toHaveLength(19);
        }
    });

    describe("Bar 4 (index 3) — 9:12 subdivision", () => {
        /**
         * Collects bar 4 data across all tracks.
         */
        const bar4Subdivisions = migrated.tracks.map((track) => {
            const measure = track.measures[3];
            const steps = measure.steps.map((s) => {
                return s.noteStyleId ?? "0";
            });

            return {
                instrumentId: track.instrument.typeId,
                instrumentName: track.instrument.displayName,
                stepCount: measure.steps.length,
                steps,
                subdivisions: measure.subdivisions,
            };
        });

        it("every track has subdivisions in bar 4", () => {
            for (const info of bar4Subdivisions) {
                expect(info.subdivisions.length, info.instrumentName + ": bar 4 should have subdivisions")
                    .toBeGreaterThan(0);
            }
        });

        it("all top-level subdivisions are tuplets (nested 2:1 is correctly not a tuplet)", () => {
            for (const info of bar4Subdivisions) {
                const topLevelSubs = info.subdivisions.filter((s) => {
                    return s.parentSubdivisionId == null;
                });

                for (const sub of topLevelSubs) {
                    expect(sub.isTuplet,
                        info.instrumentName + ": top-level sub " + formatSub(sub) + " should be a tuplet",
                    ).toBe(true);
                }
            }
        });

        it("Agogô and 4-Bell Agogo: single 9:12 tuplet", () => {
            for (const typeId of ["0", "a"]) {
                const info = bar4Subdivisions.find((t) => {
                    return t.instrumentId === typeId;
                })!;
                expect(info.stepCount).toBe(13);
                expect(info.subdivisions).toHaveLength(1);
                expect(info.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0,
                    actual: 9,
                    normal: 12,
                    isTuplet: true,
                    parentSubdivisionId: undefined,
                }));
            }
        });

        it("Chocalho, Tamborim, Caixa, Surdos: 6:8 tuplet + 3:4 tuplet", () => {
            for (const typeId of ["1", "2", "5", "7", "8", "9"]) {
                const info = bar4Subdivisions.find((t) => {
                    return t.instrumentId === typeId;
                })!;
                expect(info.stepCount).toBe(13);
                expect(info.subdivisions).toHaveLength(2);
                expect(info.subdivisions[0]).toEqual(expect.objectContaining({
                    startStep: 0, actual: 6, normal: 8, isTuplet: true, parentSubdivisionId: undefined,
                }));
                expect(info.subdivisions[1]).toEqual(expect.objectContaining({
                    startStep: 6, actual: 3, normal: 4, isTuplet: true, parentSubdivisionId: undefined,
                }));
            }
        });

        it("Repinique: 6:8 tuplet + 3:4 tuplet with nested 2:1", () => {
            const repi = bar4Subdivisions.find((t) => {
                return t.instrumentId === "3";
            })!;
            expect(repi.stepCount).toBe(14);
            expect(repi.subdivisions).toHaveLength(3);

            expect(repi.subdivisions[0]).toEqual(expect.objectContaining({
                startStep: 0, actual: 6, normal: 8, isTuplet: true, parentSubdivisionId: undefined,
            }));

            expect(repi.subdivisions[1]).toEqual(expect.objectContaining({
                startStep: 6, actual: 3, normal: 4, isTuplet: true, parentSubdivisionId: undefined,
            }));

            // Nested 2:1 inside the 3:4 — not a tuplet in 4/4 (2 in S={2}).
            const nested = repi.subdivisions[2];
            expect(nested).toEqual(expect.objectContaining({
                startStep: 8, actual: 2, normal: 1, isTuplet: false,
            }));
            expect(nested.parentSubdivisionId).toBe(repi.subdivisions[1].id);
        });
    });
});
