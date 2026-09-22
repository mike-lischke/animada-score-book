/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    isPackedArrangement, packArrangementSnapshot, stringifyPackedArrangement, tryParsePackedArrangement,
    unpackArrangementSnapshot, type IPackedArrangement
} from "../../../src/core/serialisation/snapshot-packing.js";
import type { IArrangementSnapshot } from "../../../src/core/types/general.js";

const sampleSnapshot: IArrangementSnapshot = {
    version: 5,
    title: "Sample",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "4n", stepResolution: 16 },
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
                    events: [
                        {
                            start: { numerator: 0, denominator: 1 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "x",
                        },
                        { start: { numerator: 1, denominator: 16 }, duration: { numerator: 3, denominator: 16 } },
                        {
                            start: { numerator: 1, denominator: 4 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "o",
                        },
                        { start: { numerator: 5, denominator: 16 }, duration: { numerator: 11, denominator: 16 } },
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
                    events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
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
                events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
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

    it("rejects packed content of an older schema version", () => {
        const packed: IPackedArrangement = { ...packArrangementSnapshot(sampleSnapshot), v: 4 };

        expect(() => {
            unpackArrangementSnapshot(packed);
        }).toThrowError("Unsupported snapshot schema version: 4");
    });

    it("carries extension chunks through a round-trip", () => {
        const extensions = { measureWidths: { 3: 2000 }, someLaterChunk: [1, 2, 3] };
        const withExtensions: IArrangementSnapshot = { ...sampleSnapshot, extensions };

        const packed = packArrangementSnapshot(withExtensions);

        expect(packed.c).toEqual(extensions);
        expect(unpackArrangementSnapshot(packed).extensions).toEqual(extensions);
    });

    it("omits the chunk container while no feature stores anything", () => {
        const packed = packArrangementSnapshot(sampleSnapshot);

        expect(packed.c).toBeUndefined();
        expect(unpackArrangementSnapshot(packed).extensions).toBeUndefined();
    });

    it("treats an empty chunk container as no extensions", () => {
        const packed: IPackedArrangement = { ...packArrangementSnapshot(sampleSnapshot), c: {} };

        expect(unpackArrangementSnapshot(packed).extensions).toBeUndefined();
    });

    it("preserves scoreId through pack → stringify → parse → unpack round-trip", () => {
        const withScoreId: IArrangementSnapshot = { ...sampleSnapshot, scoreId: 12345 };
        const packed = packArrangementSnapshot(withScoreId);
        const json = JSON.stringify(packed);
        const restored = tryParsePackedArrangement(json);

        expect(restored).toBeDefined();
        expect(restored!.scoreId).toBe(12345);
    });

    it("omits scoreId from packed output when not set", () => {
        const withoutScoreId: IArrangementSnapshot = { ...sampleSnapshot };
        delete withoutScoreId.scoreId;

        const packed = packArrangementSnapshot(withoutScoreId);
        const json = JSON.stringify(packed);
        const restored = tryParsePackedArrangement(json);

        expect(restored).toBeDefined();
        expect(restored!.scoreId).toBeUndefined();
    });
});
