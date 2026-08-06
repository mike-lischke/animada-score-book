/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    checksum,
    deriveDbName,
    extractRows,
    parseMigrationSql,
    sanitizeBranchName,
} from "../../build/migration.js";

describe("parseMigrationSql", () => {
    it("returns common SQL for both engines", () => {
        const sql = "CREATE TABLE t (id INT);\n";

        expect(parseMigrationSql(sql, "mysql")).toBe("CREATE TABLE t (id INT);\n");
        expect(parseMigrationSql(sql, "postgres")).toBe("CREATE TABLE t (id INT);\n");
    });

    it("returns only mysql section for mysql engine", () => {
        const sql = [
            "CREATE TABLE t (id INT);",
            "",
            "-- @mysql",
            "ALTER TABLE t ENGINE=InnoDB;",
            "",
            "-- @postgres",
            "ALTER TABLE t ADD COLUMN x INT;",
        ].join("\n");

        const result = parseMigrationSql(sql, "mysql");

        expect(result).toContain("CREATE TABLE t (id INT);");
        expect(result).toContain("ALTER TABLE t ENGINE=InnoDB;");
        expect(result).not.toContain("ADD COLUMN x INT");
    });

    it("returns only postgres section for postgres engine", () => {
        const sql = [
            "CREATE TABLE t (id INT);",
            "",
            "-- @mysql",
            "ALTER TABLE t ENGINE=InnoDB;",
            "",
            "-- @postgres",
            "ALTER TABLE t ADD COLUMN x INT;",
        ].join("\n");

        const result = parseMigrationSql(sql, "postgres");

        expect(result).toContain("CREATE TABLE t (id INT);");
        expect(result).toContain("ALTER TABLE t ADD COLUMN x INT;");
        expect(result).not.toContain("ENGINE=InnoDB");
    });

    it("handles multiple alternating sections", () => {
        const sql = [
            "-- common header",
            "CREATE TABLE t (id INT);",
            "",
            "-- @mysql",
            "ALTER TABLE t ENGINE=InnoDB;",
            "",
            "-- @postgres",
            "ALTER TABLE t ADD COLUMN x INT;",
            "",
            "-- @mysql",
            "CREATE INDEX idx_t_id ON t(id);",
            "",
            "-- @postgres",
            "CREATE INDEX idx_t_id ON t(id);",
        ].join("\n");

        const mysqlResult = parseMigrationSql(sql, "mysql");
        const pgResult = parseMigrationSql(sql, "postgres");

        expect(mysqlResult).toContain("ENGINE=InnoDB");
        expect(mysqlResult).not.toContain("ADD COLUMN x INT");
        expect(pgResult).toContain("ADD COLUMN x INT");
        expect(pgResult).not.toContain("ENGINE=InnoDB");

        // Both should have the common header and the index.
        expect(mysqlResult).toContain("CREATE INDEX idx_t_id");
        expect(pgResult).toContain("CREATE INDEX idx_t_id");
        expect(mysqlResult).toContain("common header");
        expect(pgResult).toContain("common header");
    });

    it("handles empty input", () => {
        expect(parseMigrationSql("", "mysql")).toBe("");
    });

    it("handles input with only engine markers and no common section", () => {
        const sql = [
            "-- @mysql",
            "ALTER TABLE t ENGINE=InnoDB;",
            "",
            "-- @postgres",
            "ALTER TABLE t ADD COLUMN x INT;",
        ].join("\n");

        expect(parseMigrationSql(sql, "mysql").trim()).toBe("ALTER TABLE t ENGINE=InnoDB;");
        expect(parseMigrationSql(sql, "postgres").trim()).toBe("ALTER TABLE t ADD COLUMN x INT;");
    });

    it("marker lines themselves are excluded from output", () => {
        const sql = [
            "-- @mysql",
            "SELECT 1;",
            "-- @postgres",
            "SELECT 2;",
        ].join("\n");

        expect(parseMigrationSql(sql, "mysql")).not.toContain("@mysql");
        expect(parseMigrationSql(sql, "mysql")).not.toContain("@postgres");
    });
});

describe("extractRows", () => {
    it("extracts from mysql2 tuple format [rows, fields]", () => {
        const rows = [{ id: 1 }, { id: 2 }];
        const fields = [{ name: "id" }];
        const result = extractRows<{ id: number; }>([rows, fields]);

        expect(result).toEqual(rows);
    });

    it("extracts from pg object format { rows, fields }", () => {
        const rows = [{ id: 1 }, { id: 2 }];

        const result = extractRows<{ id: number; }>({ rows, fields: [] });

        expect(result).toEqual(rows);
    });

    it("returns empty array for mysql2 empty result", () => {
        const result = extractRows<{ id: number; }>([[], []]);

        expect(result).toEqual([]);
    });

    it("returns empty array for pg empty result", () => {
        const result = extractRows<{ id: number; }>({ rows: [], fields: [] });

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
