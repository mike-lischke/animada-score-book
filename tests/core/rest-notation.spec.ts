/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    decomposeRestSpan, NoteLength, noteValueForUnits, noteValueFraction, standardNoteValueFractions,
} from "../../src/core/rest-notation.js";

describe("rest notation", () => {
    it("resolves the note value of a duration in 32nd-note units", () => {
        expect(noteValueForUnits(16)).toEqual({ length: NoteLength.Half, dotted: false });
        expect(noteValueForUnits(24)).toEqual({ length: NoteLength.Half, dotted: true });
        expect(noteValueForUnits(3)).toEqual({ length: NoteLength.Sixteenth, dotted: true });

        // The dotted thirty-second is the one value below a 32nd-note unit.
        expect(noteValueForUnits(1.5)).toEqual({ length: NoteLength.ThirtySecond, dotted: true });
        expect(noteValueForUnits(0)).toBeUndefined();
        expect(noteValueForUnits(48)).toBeUndefined();
    });

    it("converts a note value into its fraction of a whole note", () => {
        expect(noteValueFraction({ length: NoteLength.Quarter, dotted: false }))
            .toEqual({ numerator: 1, denominator: 4 });
        expect(noteValueFraction({ length: NoteLength.Quarter, dotted: true }))
            .toEqual({ numerator: 3, denominator: 8 });
    });

    it("offers the standard values largest first", () => {
        expect(standardNoteValueFractions).toEqual([
            { numerator: 1, denominator: 1 },
            { numerator: 3, denominator: 4 },
            { numerator: 1, denominator: 2 },
            { numerator: 3, denominator: 8 },
            { numerator: 1, denominator: 4 },
            { numerator: 3, denominator: 16 },
            { numerator: 1, denominator: 8 },
            { numerator: 3, denominator: 32 },
            { numerator: 1, denominator: 16 },
            { numerator: 3, denominator: 64 },
            { numerator: 1, denominator: 32 },
        ]);
    });
});

describe("rest span decomposition", () => {
    it("decomposes a whole rest into a single whole value", () => {
        expect(decomposeRestSpan({ numerator: 1, denominator: 1 }))
            .toEqual([{ numerator: 1, denominator: 1 }]);
    });

    it("keeps a dotted quarter rest as one value wherever it stands", () => {
        // Only the span decides the split, so a value of one and a half pulses is not broken up.
        expect(decomposeRestSpan({ numerator: 3, denominator: 8 }))
            .toEqual([{ numerator: 3, denominator: 8 }]);
    });

    it("decomposes a span longer than any single value, largest first", () => {
        expect(decomposeRestSpan({ numerator: 7, denominator: 8 })).toEqual([
            { numerator: 3, denominator: 4 },
            { numerator: 1, denominator: 8 },
        ]);
    });

    it("keeps the length of a span that no standard value can express", () => {
        expect(decomposeRestSpan({ numerator: 1, denominator: 96 }))
            .toEqual([{ numerator: 1, denominator: 96 }]);
    });
});
