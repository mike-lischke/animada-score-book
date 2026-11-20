/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { TagCombination } from "../../src/core/TagCombination.js";
import { SystemTagKind, type ITagInfo } from "../../src/core/types/tags.js";

const tag = (id: number, name: string): ITagInfo => {
    return {
        id, name, colorIndex: 2, editable: false, assignable: true, usageCount: 0,
        systemKind: SystemTagKind.Instrument,
    };
};

const tags = [tag(1, "Caixa"), tag(2, "Surdo"), tag(3, "Tamborim")];

describe("TagCombination — normalize", () => {
    it("sorts and de-duplicates the ids of every group", () => {
        expect(TagCombination.normalize({ groups: [[3, 1, 3]] })).toEqual({ groups: [[1, 3]] });
    });

    it("drops the empty groups", () => {
        expect(TagCombination.normalize({ groups: [[], [2]] })).toEqual({ groups: [[2]] });
    });

    it("brings the groups into a stable order", () => {
        const first = TagCombination.normalize({ groups: [[3], [1]] });
        const second = TagCombination.normalize({ groups: [[1], [3]] });

        expect(first).toEqual(second);
    });
});

describe("TagCombination — equals", () => {
    it("treats both orders as the same combination", () => {
        expect(TagCombination.equals({ groups: [[1, 2]] }, { groups: [[2, 1]] })).toBe(true);
        expect(TagCombination.equals({ groups: [[1], [2]] }, { groups: [[2], [1]] })).toBe(true);
    });

    it("keeps AND apart from OR", () => {
        expect(TagCombination.equals({ groups: [[1, 2]] }, { groups: [[1], [2]] })).toBe(false);
    });
});

describe("TagCombination — restrict", () => {
    it("removes the ids the user cannot use", () => {
        const restricted = TagCombination.restrict({ groups: [[1, 2], [3]] }, new Set([1]));

        expect(restricted).toEqual({ groups: [[1]] });
    });

    it("drops a group that becomes empty that way", () => {
        const restricted = TagCombination.restrict({ groups: [[1], [3]] }, new Set([1]));

        expect(restricted).toEqual({ groups: [[1]] });
    });

    it("yields the empty combination when no id survives", () => {
        expect(TagCombination.restrict({ groups: [[3]] }, new Set([1]))).toEqual(TagCombination.empty);
    });
});

describe("TagCombination — caption", () => {
    it("names a single group without parentheses", () => {
        expect(TagCombination.caption({ groups: [[1, 2]] }, tags)).toBe("Caixa AND Surdo");
    });

    it("brackets the groups when they are OR-ed", () => {
        expect(TagCombination.caption({ groups: [[1, 2], [3]] }, tags)).toBe("(Caixa AND Surdo) OR Tamborim");
    });

    it("leaves out ids that no known tag explains", () => {
        expect(TagCombination.caption({ groups: [[1, 9]] }, tags)).toBe("Caixa");
    });

    it("is empty for the empty combination", () => {
        expect(TagCombination.caption(TagCombination.empty, tags)).toBe("");
    });
});
