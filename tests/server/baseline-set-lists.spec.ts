/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Vitest runs with the repository root as the working directory, like the tests that read stylesheets.
const baseline = readFileSync("migrations/00000000T000000_baseline.sql", "utf-8");

describe("baseline — set lists", () => {
    it("defines the list and its score order", () => {
        expect(baseline).toContain("CREATE TABLE IF NOT EXISTS set_lists");
        expect(baseline).toContain("CREATE TABLE IF NOT EXISTS set_list_scores");
    });

    it("defines the list by exactly one tag, which owns its name and scope", () => {
        expect(baseline).toMatch(/tag_id\s+INT UNSIGNED NOT NULL/);
        expect(baseline).toContain("UNIQUE KEY uk_set_lists_tag (tag_id)");
        expect(baseline).toContain("FOREIGN KEY (tag_id) REFERENCES tags(id)");
        expect(baseline).toMatch(/ON DELETE CASCADE/);
        expect(baseline).not.toMatch(/filters\s+JSON/);
    });

    it("keeps the list's revision and its order", () => {
        expect(baseline).toMatch(/revision\s+INT UNSIGNED NOT NULL DEFAULT 1/);
        expect(baseline).toMatch(/position\s+INT UNSIGNED NOT NULL/);
    });

    it("references scores instead of copying them, and cleans up after both sides", () => {
        expect(baseline).toContain("FOREIGN KEY (set_list_id) REFERENCES set_lists(id)");
        expect(baseline).toContain("FOREIGN KEY (score_id) REFERENCES scores(id)");
        expect(baseline.match(/FOREIGN KEY \(set_list_id\)/g)).toHaveLength(1);
    });
});
