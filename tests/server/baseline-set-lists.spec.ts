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

    it("keeps the list's combination, its revision and its order", () => {
        expect(baseline).toMatch(/filters\s+JSON\s+NOT NULL/);
        expect(baseline).toMatch(/revision\s+INT UNSIGNED NOT NULL DEFAULT 1/);
        expect(baseline).toMatch(/position\s+INT UNSIGNED NOT NULL/);
    });

    it("references scores instead of copying them, and cleans up after both sides", () => {
        expect(baseline).toContain("FOREIGN KEY (set_list_id) REFERENCES set_lists(id)");
        expect(baseline).toContain("FOREIGN KEY (score_id) REFERENCES scores(id)");
        expect(baseline.match(/FOREIGN KEY \(set_list_id\)/g)).toHaveLength(1);
    });
});
