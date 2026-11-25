/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { ScoreMeta } from "../../src/core/ScoreMeta.js";

/**
 * @param timeParams The packed time params `[timeSignature, tempo, length, pulse]`.
 * @param version The schema version to embed.
 *
 * @returns Score content in the packed format the server stores.
 */
const packed = (timeParams: unknown[], version = 7): string => {
    return JSON.stringify({ v: version, p: timeParams, k: [] });
};

describe("ScoreMeta", () => {
    it("reads tempo, meter, bar count and the length of the written bars", () => {
        // 4 bars of 4/4 at 120 BPM with one pulse per quarter note: 4 * 4 * 0.5 s.
        expect(ScoreMeta.read(packed(["4/4", 120, 4, "1/4"]))).toEqual({
            timeSignature: "4/4", bpm: 120, barCount: 4, durationSeconds: 8,
        });
    });

    it("counts the pulses the meter and the pulse state", () => {
        // 6/8 with a quarter-note pulse holds three pulses, so two bars at 90 BPM last 2 * 3 * (60/90) s.
        expect(ScoreMeta.read(packed(["6/8", 90, 2, "1/4"])).durationSeconds).toBe(4);
    });

    it("rounds the tempo it reports", () => {
        expect(ScoreMeta.read(packed(["4/4", 112.4, 1, "1/4"])).bpm).toBe(112);
    });

    it("reports nothing for content that is not a packed arrangement", () => {
        expect(ScoreMeta.read("{\"foo\":1}")).toEqual({});
        expect(ScoreMeta.read("not json")).toEqual({});
    });

    it("reports nothing for a schema version this build does not read", () => {
        expect(ScoreMeta.read(packed(["4/4", 120, 4, "1/4"], 999))).toEqual({});
    });

    it("leaves the length out when the pulse cannot be read", () => {
        const meta = ScoreMeta.read(packed(["4/4", 120, 4, "q"]));

        expect(meta.bpm).toBe(120);
        expect(meta.barCount).toBe(4);
        expect(meta.durationSeconds).toBeUndefined();
    });

    it("leaves out a tempo that is not a usable number", () => {
        expect(ScoreMeta.read(packed(["4/4", 0, 4, "1/4"])).bpm).toBeUndefined();
    });
});
