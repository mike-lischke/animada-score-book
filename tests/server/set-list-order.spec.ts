/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { SetListOrder } from "../../src/server/SetListOrder.js";

describe("SetListOrder — merge", () => {
    it("keeps the stored order and appends new matches by ascending id", () => {
        expect(SetListOrder.merge([9, 7], [12, 7, 9, 11])).toEqual([9, 7, 11, 12]);
    });

    it("appends a new match after the known scores, whatever its id", () => {
        expect(SetListOrder.merge([9, 7], [3])).toEqual([9, 7, 3]);
    });

    it("keeps the place of a score that does not match at the moment", () => {
        expect(SetListOrder.merge([9, 7, 5], [9, 5])).toEqual([9, 7, 5]);
    });

    it("keeps the stored order when every known score matches", () => {
        expect(SetListOrder.merge([9, 7, 5], [7, 5, 9])).toEqual([9, 7, 5]);
    });

    it("returns the stored order when nothing matches", () => {
        expect(SetListOrder.merge([9, 7, 5], [])).toEqual([9, 7, 5]);
    });
});

describe("SetListOrder — applyVisibleOrder", () => {
    it("rearranges the visible scores among their own places", () => {
        expect(SetListOrder.applyVisibleOrder([5, 9, 7, 3], [9, 7], [7, 9])).toEqual([5, 7, 9, 3]);
    });

    it("leaves the scores the caller does not see in their slots", () => {
        expect(SetListOrder.applyVisibleOrder([5, 9, 7, 3], [3], [3])).toEqual([5, 9, 7, 3]);
    });

    it("accepts an empty order for a list the caller sees no scores of", () => {
        expect(SetListOrder.applyVisibleOrder([5, 9], [], [])).toEqual([5, 9]);
    });

    it("refuses an order that leaves out a visible score", () => {
        expect(SetListOrder.applyVisibleOrder([5, 9, 7], [9, 7], [7])).toBeUndefined();
    });

    it("refuses ids the caller cannot see", () => {
        expect(SetListOrder.applyVisibleOrder([5, 9, 7], [9, 7], [7, 5])).toBeUndefined();
    });

    it("refuses duplicates", () => {
        expect(SetListOrder.applyVisibleOrder([5, 9], [5, 9], [5, 5])).toBeUndefined();
    });
});
