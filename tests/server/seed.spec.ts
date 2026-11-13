/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { createSeedSql, type ISeedFolder, type ISeedScore } from "../../build/seed.js";

const folder: ISeedFolder = { id: 93, parentid: null, name: "Common Scores" };

const score: ISeedScore = {
    id: 10005,
    folderid: 93,
    name: "Rock 'n' Roll",
    content: "{\"path\":\"A\\\\B\"}",
};

describe("createSeedSql", () => {
    it("writes a folder and a score insert", () => {
        const sql = createSeedSql([folder], [score]);

        expect(sql).toContain("-- Folders");
        expect(sql).toContain("INSERT INTO folders (id, parentid, name) VALUES");
        expect(sql).toContain("  (93, NULL, 'Common Scores');");
        expect(sql).toContain("-- Scores");
        expect(sql).toContain("INSERT INTO scores (id, folderid, name, content) VALUES");
    });

    it("escapes quotes and backslashes the way MySQL reads them", () => {
        const sql = createSeedSql([], [score]);

        expect(sql).toContain("'Rock \\'n\\' Roll'");
        expect(sql).toContain("'{\"path\":\"A\\\\\\\\B\"}'");
    });

    it("names the missing parent and folder as NULL", () => {
        const sql = createSeedSql([folder], [{ ...score, folderid: null }]);

        expect(sql).toContain("(93, NULL, 'Common Scores')");
        expect(sql).toContain("(10005, NULL, 'Rock \\'n\\' Roll'");
    });

    it("writes a placeholder instead of an empty insert", () => {
        const sql = createSeedSql([], []);

        expect(sql.match(/-- No rows\./g)).toHaveLength(2);
        expect(sql).not.toContain("INSERT INTO");
    });
});
