/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { TimeParams } from "../../src/core/TimeParams.js";

describe("TimeParams", () => {
    it("accepts a valid configuration", () => {
        const timeParams = new TimeParams("6/8", 120, 2, "3/8");

        expect(timeParams.timeSignature).toBe("6/8");
        expect(timeParams.tempo).toBe(120);
        expect(timeParams.length).toBe(2);
        expect(timeParams.pulse).toBe("3/8");
    });

    it("rejects an invalid time signature", () => {
        expect(() => {
            new TimeParams("3/x", 120, 1, "1/8");
        }).toThrow(/Invalid time signature/);
    });

    it("rejects an invalid pulse", () => {
        const timeParams = new TimeParams("3/8", 120, 1, "1/8");

        expect(() => {
            timeParams.pulse = "1/3";
        }).toThrow(/Invalid pulse/);
    });
});
