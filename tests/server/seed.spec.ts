/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { createSeedSql, type ISeedScore, type ISeedTag } from "../../build/seed.js";

const score: ISeedScore = {
    id: 10005,
    name: "Rock 'n' Roll",
    content: "{\"path\":\"A\\\\B\"}",
};

const tag: ISeedTag = { id: 7, name: "Set list", colorIndex: 4 };

describe("createSeedSql", () => {
    it("writes tags, scores and assignments", () => {
        const sql = createSeedSql([score], [tag], [
            { scoreId: 10005, tagId: 7 },
            { scoreId: 10005, systemKey: "instrument:5" },
        ]);

        expect(sql).toContain("INSERT IGNORE INTO tags (id, name, color_index) VALUES");
        expect(sql).toContain("  (7, 'Set list', 4);");
        expect(sql).toContain("INSERT INTO scores (id, name, content) VALUES");
        expect(sql).toContain("INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES (10005, 7);");
    });

    it("names a system tag by its key instead of an id", () => {
        const sql = createSeedSql([score], [], [{ scoreId: 10005, systemKey: "instrument:5" }]);

        expect(sql).toContain(
            "INSERT IGNORE INTO score_tags (score_id, tag_id) SELECT 10005, id FROM tags " +
            "WHERE system_key = 'instrument:5';",
        );
    });

    it("escapes quotes and backslashes the way MySQL reads them", () => {
        const sql = createSeedSql([score], [tag], []);

        expect(sql).toContain("'Rock \\'n\\' Roll'");
        expect(sql).toContain("'{\"path\":\"A\\\\\\\\B\"}'");
    });

    it("writes a placeholder instead of an empty insert", () => {
        const sql = createSeedSql([], [], []);

        expect(sql.match(/-- No rows\./g)).toHaveLength(3);
        expect(sql).not.toContain("INSERT");
    });
});
