/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { TimeParams } from "../../src/core/TimeParams.js";

describe("TimeParams step grid compatibility", () => {
    it("builds timings for compatible configurations", () => {
        const timeParams = new TimeParams("6/8", 120, 2, "3/8", 16);

        expect(timeParams.timings).toHaveLength(24);
        expect(timeParams.isValid({ bar: 1, step: 12 })).toBe(true);
        expect(timeParams.isValid({ bar: 1, step: 13 })).toBe(false);
    });

    it("throws for incompatible time-signature and resolution combinations", () => {
        expect(() => {
            new TimeParams("3/8", 120, 1, "1/8", 4);
        }).toThrow(/Incompatible time signature and step resolution/);
    });
});
