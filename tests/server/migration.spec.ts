/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { checksum, deriveDbName, extractRows, sanitizeBranchName } from "../../build/migration.js";

describe("extractRows", () => {
    it("extracts from mysql2 tuple format [rows, fields]", () => {
        const rows = [{ id: 1 }, { id: 2 }];
        const fields = [{ name: "id" }];
        const result = extractRows<{ id: number; }>([rows, fields]);

        expect(result).toEqual(rows);
    });

    it("returns empty array for mysql2 empty result", () => {
        const result = extractRows<{ id: number; }>([[], []]);

        expect(result).toEqual([]);
    });

    it("returns empty array for unexpected format", () => {
        const result = extractRows<{ id: number; }>(null);

        expect(result).toEqual([]);
    });

    it("returns empty array when mysql2 first element is not an array", () => {
        const result = extractRows<{ id: number; }>(["not an array", []]);

        expect(result).toEqual([]);
    });
});

describe("checksum", () => {
    it("produces deterministic output", () => {
        const a = checksum("hello");
        const b = checksum("hello");

        expect(a).toBe(b);
    });

    it("different input produces different output", () => {
        const a = checksum("hello");
        const b = checksum("world");

        expect(a).not.toBe(b);
    });

    it("handles empty string", () => {
        const result = checksum("");

        expect(result).toBeTypeOf("string");
        expect(result.length).toBe(64); // SHA-256 hex
    });

    it("output is 64 hex characters", () => {
        const result = checksum("test");

        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("sanitizeBranchName", () => {
    it("passes through simple names", () => {
        expect(sanitizeBranchName("editing")).toBe("editing");
        expect(sanitizeBranchName("fix-bug")).toBe("fix-bug");
        expect(sanitizeBranchName("feature_abc")).toBe("feature_abc");
    });

    it("replaces slashes with underscores", () => {
        expect(sanitizeBranchName("features/editing")).toBe("features_editing");
        expect(sanitizeBranchName("a/b/c")).toBe("a_b_c");
    });

    it("replaces special characters", () => {
        expect(sanitizeBranchName("feat@2024")).toBe("feat_2024");
        expect(sanitizeBranchName("branch.name")).toBe("branch_name");
        expect(sanitizeBranchName("fix #123")).toBe("fix__123");
    });

    it("handles empty string", () => {
        expect(sanitizeBranchName("")).toBe("");
    });
});

describe("deriveDbName", () => {
    it("uses base name for main branch", () => {
        expect(deriveDbName("animada_score_book", "main")).toBe("animada_score_book");
    });

    it("uses base name for release branches", () => {
        expect(deriveDbName("animada_score_book", "release/1.0")).toBe("animada_score_book");
        expect(deriveDbName("animada_score_book", "release-hotfix")).toBe("animada_score_book");
    });

    it("appends sanitized branch name for feature branches", () => {
        expect(deriveDbName("animada_score_book", "editing")).toBe("animada_score_book__editing");
        expect(deriveDbName("animada_score_book", "features/editing")).toBe(
            "animada_score_book__features_editing",
        );
    });

    it("handles empty base name", () => {
        expect(deriveDbName("", "mybranch")).toBe("__mybranch");
    });
});
