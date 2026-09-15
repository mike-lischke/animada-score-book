/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    decomposeRestSpan, decomposeRestSteps, pulseStepCount, standardRestSteps,
} from "../../src/core/rest-notation.js";

describe("rest notation", () => {
    it("lists grid-aligned standard values for a 16-step bar", () => {
        expect(standardRestSteps(16)).toEqual([16, 12, 8, 6, 4, 3, 2, 1]);
    });

    it("lists grid-aligned standard values for a 32-step bar", () => {
        expect(standardRestSteps(32)).toEqual([32, 24, 16, 12, 8, 6, 4, 3, 2, 1]);
    });

    it("converts a pulse into steps", () => {
        expect(pulseStepCount({ numerator: 1, denominator: 4 }, 16)).toBe(4);
        expect(pulseStepCount({ numerator: 3, denominator: 8 }, 16)).toBe(6);
    });

    it("decomposes a whole rest into a single whole value", () => {
        expect(decomposeRestSteps(0, 16, 4, 16)).toEqual([16]);
    });

    it("decomposes the rest after a leading 16th note into dotted eighth plus dotted half", () => {
        expect(decomposeRestSteps(1, 16, 4, 16)).toEqual([3, 12]);
    });

    it("decomposes a rest starting mid-pulse into an eighth plus a half", () => {
        expect(decomposeRestSteps(6, 16, 4, 16)).toEqual([2, 8]);
    });

    it("keeps a pulse-aligned dotted half rest intact", () => {
        expect(decomposeRestSteps(0, 12, 4, 16)).toEqual([12]);
    });
});

describe("rest notation spans", () => {
    const pulse = { numerator: 1, denominator: 4 };
    const values = [
        { numerator: 1, denominator: 1 },
        { numerator: 3, denominator: 4 },
        { numerator: 1, denominator: 2 },
        { numerator: 3, denominator: 8 },
        { numerator: 1, denominator: 4 },
        { numerator: 3, denominator: 16 },
        { numerator: 1, denominator: 8 },
        { numerator: 1, denominator: 16 },
    ];

    it("decomposes a whole rest of the bar into a single whole value", () => {
        expect(decomposeRestSpan({ numerator: 0, denominator: 1 }, { numerator: 1, denominator: 1 }, pulse,
            values)).toEqual([{ numerator: 1, denominator: 1 }]);
    });

    it("keeps a 3/16 rest as one dotted eighth", () => {
        expect(decomposeRestSpan({ numerator: 1, denominator: 4 }, { numerator: 7, denominator: 16 }, pulse,
            values)).toEqual([{ numerator: 3, denominator: 16 }]);
    });

    it("decomposes the rest after a leading 16th note into dotted eighth plus dotted half", () => {
        const rest = decomposeRestSpan({ numerator: 1, denominator: 16 }, { numerator: 1, denominator: 1 }, pulse,
            values);

        expect(rest).toEqual([{ numerator: 3, denominator: 16 }, { numerator: 3, denominator: 4 }]);
    });

    it("keeps the length of a span that no standard value can express", () => {
        expect(decomposeRestSpan({ numerator: 0, denominator: 1 }, { numerator: 1, denominator: 24 }, pulse,
            values)).toEqual([{ numerator: 1, denominator: 24 }]);
    });
});
