/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    isPackedArrangement, packArrangementSnapshot, stringifyPackedArrangement, tryParsePackedArrangement,
    unpackArrangementSnapshot
} from "../../../src/core/serialisation/snapshot-packing.js";
import type { IArrangementSnapshot } from "../../../src/core/types/general.js";

const sampleSnapshot: IArrangementSnapshot = {
    version: 3,
    title: "Sample",
    timeParams: {
        timeSignature: "4/4",
        tempo: 120,
        length: 2,
        pulse: "4n",
        stepResolution: 16,
    },
    tracks: [
        {
            id: 1,
            instrumentId: "ag",
            measures: [
                {
                    number: 1,
                    meter: {
                        beats: 4,
                        beatUnits: 4,
                        stepResolution: 16,
                        beatGroups: [4, 4, 4, 4],
                    },
                    steps: [
                        { index: 0, noteStyleId: "x" },
                        { index: 1 },
                        { index: 2 },
                        { index: 3 },
                        { index: 4, noteStyleId: "o" },
                        { index: 5 },
                        { index: 6 },
                        { index: 7 },
                        { index: 8 },
                        { index: 9 },
                        { index: 10 },
                        { index: 11 },
                        { index: 12 },
                        { index: 13 },
                        { index: 14 },
                        { index: 15 },
                    ],
                    subdivisions: [],
                },
                {
                    number: 2,
                    meter: {
                        beats: 4,
                        beatUnits: 4,
                        stepResolution: 16,
                        beatGroups: [4, 4, 4, 4],
                    },
                    steps: Array.from({ length: 16 }, (_, index) => {
                        return { index };
                    }),
                    subdivisions: [],
                },
            ],
        },
        {
            id: 2,
            instrumentId: "rp",
            measures: [{
                number: 1,
                meter: {
                    beats: 4,
                    beatUnits: 4,
                    stepResolution: 16,
                    beatGroups: [4, 4, 4, 4],
                },
                steps: Array.from({ length: 16 }, (_, index) => {
                    return { index };
                }),
                subdivisions: [],
            }],
        },
    ],
};

describe("CompactSnapshot", () => {
    it("packs and unpacks an arrangement snapshot losslessly", () => {
        const packed = packArrangementSnapshot(sampleSnapshot);
        const restored = unpackArrangementSnapshot(packed);
        expect(restored).toEqual(sampleSnapshot);
    });

    it("omits the title field when undefined", () => {
        const withoutTitle: IArrangementSnapshot = { ...sampleSnapshot };
        delete withoutTitle.title;
        const packed = packArrangementSnapshot(withoutTitle);
        expect(packed.t).toBeUndefined();
        expect(unpackArrangementSnapshot(packed).title).toBeUndefined();
    });

    it("produces a smaller JSON than the verbose snapshot", () => {
        const compact = stringifyPackedArrangement(sampleSnapshot);
        const verbose = JSON.stringify(sampleSnapshot);
        expect(compact.length).toBeLessThan(verbose.length);
    });

    it("recognises packed payloads via the type guard", () => {
        const packed = packArrangementSnapshot(sampleSnapshot);
        expect(isPackedArrangement(packed)).toBe(true);
        expect(isPackedArrangement(sampleSnapshot)).toBe(false);
        expect(isPackedArrangement(null)).toBe(false);
        expect(isPackedArrangement("xyz")).toBe(false);
    });

    it("tryParsePackedArrangement returns undefined for non-JSON input", () => {
        expect(tryParsePackedArrangement("a2=ab12&t=foo")).toBeUndefined();
        expect(tryParsePackedArrangement("not json")).toBeUndefined();
        expect(tryParsePackedArrangement("{not valid}")).toBeUndefined();
        expect(tryParsePackedArrangement("[1,2,3]")).toBeUndefined();
    });

    it("tryParsePackedArrangement round-trips compact JSON", () => {
        const json = stringifyPackedArrangement(sampleSnapshot);
        const restored = tryParsePackedArrangement(json);
        expect(restored).toEqual(sampleSnapshot);
    });

    it("normalizes null parentSubdivisionId from packed JSON", () => {
        const packedWithNullParent = {
            v: 2,
            t: "Tuplet Null Parent",
            p: ["6/8", 50, 1, "3/8", 8],
            k: [[
                1,
                "3",
                [[
                    1,
                    [6, 8, 6, [3, 3]],
                    ["1", "1", "1", "1", "1", "1", "1", "1"],
                    [[496, 1, 1, 3, 1]],
                ]],
            ]],
        };

        const restored = tryParsePackedArrangement(JSON.stringify(packedWithNullParent));

        expect(restored).toBeDefined();
        if (!restored) {
            throw new Error("Expected packed snapshot to parse");
        }
        expect(restored.tracks[0]?.measures[0]?.subdivisions[0]?.parentSubdivisionId).toBe(1);
        expect(restored.tracks[0]?.measures[0]?.subdivisions[0]?.isTuplet).toBe(false);
    });
});
