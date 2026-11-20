/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { TagPalette } from "../../src/core/TagPalette.js";

describe("TagPalette", () => {
    it("names every colour once", () => {
        const names = TagPalette.colours.map((entry) => {
            return entry.name;
        });

        expect(new Set(names).size).toBe(names.length);
    });

    it("wraps an index that lies outside the palette", () => {
        expect(TagPalette.colourAt(TagPalette.count)).toBe(TagPalette.colours[0]);
        expect(TagPalette.colourAt(-1)).toBe(TagPalette.colours[TagPalette.count - 1]);
    });

    it("accepts only indexes the palette holds", () => {
        expect(TagPalette.isValidIndex(0)).toBe(true);
        expect(TagPalette.isValidIndex(TagPalette.count - 1)).toBe(true);
        expect(TagPalette.isValidIndex(TagPalette.count)).toBe(false);
        expect(TagPalette.isValidIndex(-1)).toBe(false);
        expect(TagPalette.isValidIndex(1.5)).toBe(false);
    });
});
