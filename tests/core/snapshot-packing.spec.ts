/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    isPackedArrangement, packArrangementSnapshot, stringifyPackedArrangement, tryParsePackedArrangement,
    unpackArrangementSnapshot
} from "../../src/core/serialisation/snapshot-packing.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";

const sampleSnapshot: IArrangementSnapshot = {
    version: 2,
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
                    events: [
                        {
                            start: { numerator: 0, denominator: 1 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "x",
                        },
                        {
                            start: { numerator: 1, denominator: 4 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "o",
                        },
                    ],
                },
                { number: 2, events: [] },
            ],
        },
        {
            id: 2,
            instrumentId: "rp",
            measures: [{ number: 1, events: [] }],
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
});
