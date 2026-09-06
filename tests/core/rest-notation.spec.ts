/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { decomposeRestSteps, pulseStepCount, standardRestSteps } from "../../src/core/rest-notation.js";

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
        const values = standardRestSteps(16);

        expect(decomposeRestSteps(0, 16, 4, values)).toEqual([16]);
    });

    it("decomposes the rest after a leading 16th note into dotted eighth plus dotted half", () => {
        const values = standardRestSteps(16);

        expect(decomposeRestSteps(1, 16, 4, values)).toEqual([3, 12]);
    });

    it("decomposes a rest starting mid-pulse into an eighth plus a half", () => {
        const values = standardRestSteps(16);

        expect(decomposeRestSteps(6, 16, 4, values)).toEqual([2, 8]);
    });

    it("keeps a pulse-aligned dotted half rest intact", () => {
        const values = standardRestSteps(16);

        expect(decomposeRestSteps(0, 12, 4, values)).toEqual([12]);
    });
});
