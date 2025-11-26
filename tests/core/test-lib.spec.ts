/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect } from "vitest";

import { getUniqueTiming } from "./lib/getUniqueTiming.js";
import type { Timing } from "../../src/core/types/general.js";

describe("Test lib", () => {
    it("getUniqueTiming creates sequential timings", () => {
        compareTimings(getUniqueTiming(), { bar: 1, step: 1 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 2 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 3 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 4 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 5 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 6 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 7 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 8 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 9 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 10 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 11 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 12 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 13 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 14 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 15 });
        compareTimings(getUniqueTiming(), { bar: 1, step: 16 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 1 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 2 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 3 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 4 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 5 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 6 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 7 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 8 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 9 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 10 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 11 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 12 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 13 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 14 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 15 });
        compareTimings(getUniqueTiming(), { bar: 2, step: 16 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 1 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 2 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 3 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 4 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 5 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 6 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 7 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 8 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 9 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 10 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 11 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 12 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 13 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 14 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 15 });
        compareTimings(getUniqueTiming(), { bar: 3, step: 16 });
    });
});

const compareTimings = (timing1: Timing, timing2: Timing) => {
    expect(timing1.bar).toEqual(timing2.bar);
    expect(timing1.step).toEqual(timing2.step);
};
