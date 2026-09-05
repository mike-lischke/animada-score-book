/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { computeIsTuplet, meterBasis } from "../../src/core/tuplets.js";
import type { IMeterSnapshot } from "../../src/core/types/general.js";

const meter = (beats: number, beatUnits: number): IMeterSnapshot => {
    return { beats, beatUnits, stepResolution: 16, beatGroups: [beats] };
};

describe("meterBasis", () => {
    it("uses {2} for binary meters", () => {
        expect(meterBasis(meter(4, 4))).toEqual(new Set([2]));
        expect(meterBasis(meter(2, 4))).toEqual(new Set([2]));
        expect(meterBasis(meter(3, 4))).toEqual(new Set([2]));
    });

    it("uses {3} for compound ternary meters", () => {
        expect(meterBasis(meter(6, 8))).toEqual(new Set([3]));
        expect(meterBasis(meter(9, 8))).toEqual(new Set([3]));
        expect(meterBasis(meter(12, 8))).toEqual(new Set([3]));
    });

    it("uses an empty basis for irregular meters", () => {
        expect(meterBasis(meter(5, 4))).toEqual(new Set());
        expect(meterBasis(meter(7, 8))).toEqual(new Set());
    });
});

describe("computeIsTuplet", () => {
    it("flags a triplet as a tuplet in a binary meter", () => {
        expect(computeIsTuplet(3, 2, meter(4, 4))).toBe(true);
    });

    it("keeps binary splits non-tuplets in a binary meter", () => {
        expect(computeIsTuplet(4, 4, meter(4, 4))).toBe(false);
        expect(computeIsTuplet(2, 1, meter(4, 4))).toBe(false);
    });

    it("flags a quadruplet as a tuplet in a binary meter", () => {
        expect(computeIsTuplet(4, 3, meter(4, 4))).toBe(true);
    });

    it("flags a duplet as a tuplet in a compound ternary meter", () => {
        expect(computeIsTuplet(2, 3, meter(6, 8))).toBe(true);
    });

    it("flags a ratio with a binary normal side in a compound ternary meter", () => {
        expect(computeIsTuplet(6, 4, meter(6, 8))).toBe(true);
    });

    it("flags every non-trivial ratio as a tuplet in an irregular meter", () => {
        expect(computeIsTuplet(3, 2, meter(5, 4))).toBe(true);
        expect(computeIsTuplet(2, 1, meter(5, 4))).toBe(true);
    });
});
