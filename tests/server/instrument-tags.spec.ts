/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { InstrumentTags } from "../../src/server/InstrumentTags.js";
import type {
    DbRow, IDatabaseAdapter, IDbExecuteResult, IDbStatement, ITestConnectionResult,
} from "../../src/server/database.js";

/** Records the statements of a sync run and answers the two queries it makes. */
class FakeDatabaseAdapter implements IDatabaseAdapter {
    public readonly executed: IDbStatement[] = [];

    public constructor(private readonly assignedTagIds: number[]) { }

    public testConnection(): Promise<ITestConnectionResult> {
        return Promise.resolve({ success: true });
    }

    public initialize(): Promise<void> {
        return Promise.resolve();
    }

    public dropAllTables(): Promise<void> {
        return Promise.resolve();
    }

    public isInitialized(): boolean {
        return true;
    }

    public ping(): Promise<boolean> {
        return Promise.resolve(true);
    }

    public query<T extends DbRow = DbRow>(sql: string): Promise<T[]> {
        if (sql.includes("FROM tags WHERE system_key LIKE")) {
            return Promise.resolve([
                { id: 5, systemKey: "instrument:5" },
                { id: 6, systemKey: "instrument:1" },
            ] as unknown as T[]);
        }

        if (sql.includes("FROM score_tags")) {
            return Promise.resolve(this.assignedTagIds.map((tagId) => {
                return { tagId };
            }) as unknown as T[]);
        }

        return Promise.resolve([] as T[]);
    }

    public execute(sql: string, params?: unknown[]): Promise<IDbExecuteResult> {
        this.executed.push({ sql, params });

        return Promise.resolve({ affectedRows: 1, insertId: 0 });
    }

    public insertReturningId(): Promise<IDbExecuteResult> {
        return Promise.resolve({ affectedRows: 1, insertId: 0 });
    }

    public executeMultiple(): Promise<void> {
        return Promise.resolve();
    }

    public executeTransaction(): Promise<void> {
        return Promise.resolve();
    }

    public shutdown(): Promise<void> {
        return Promise.resolve();
    }
}

const contentWith = (typeIds: string[]): string => {
    return JSON.stringify({
        v: 6,
        p: ["4/4", 120, 11, "1/4"],
        k: typeIds.map((typeId, index) => {
            return [10000 + index, typeId, []];
        }),
    });
};

describe("InstrumentTags.readTypeIds", () => {
    it("reads the type id of every track, once", () => {
        expect(InstrumentTags.readTypeIds(contentWith(["5", "1", "5"]))).toEqual(["5", "1"]);
    });

    it("yields nothing for content that is not a packed arrangement", () => {
        expect(InstrumentTags.readTypeIds("not json")).toEqual([]);
        expect(InstrumentTags.readTypeIds("{\"title\":\"x\"}")).toEqual([]);
        expect(InstrumentTags.readTypeIds("{\"k\":\"nope\"}")).toEqual([]);
    });

    it("skips a track whose instrument is not named by a string", () => {
        expect(InstrumentTags.readTypeIds("{\"k\":[[1,5,[]]]}")).toEqual([]);
    });
});

describe("InstrumentTags.sync", () => {
    it("assigns the instrument tags the content names", async () => {
        const adapter = new FakeDatabaseAdapter([]);

        await InstrumentTags.sync(adapter, 7, contentWith(["5"]));

        expect(adapter.executed).toEqual([
            { sql: "INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES (?, ?)", params: [7, 5] },
        ]);
    });

    it("removes the tag of an instrument the score no longer uses", async () => {
        const adapter = new FakeDatabaseAdapter([6]);

        await InstrumentTags.sync(adapter, 7, contentWith(["5"]));

        expect(adapter.executed).toEqual([
            { sql: "DELETE FROM score_tags WHERE score_id = ? AND tag_id = ?", params: [7, 6] },
            { sql: "INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES (?, ?)", params: [7, 5] },
        ]);
    });

    it("removes every instrument tag when the last track is gone", async () => {
        const adapter = new FakeDatabaseAdapter([5, 6]);

        await InstrumentTags.sync(adapter, 7, contentWith([]));

        expect(adapter.executed).toEqual([
            { sql: "DELETE FROM score_tags WHERE score_id = ? AND tag_id = ?", params: [7, 5] },
            { sql: "DELETE FROM score_tags WHERE score_id = ? AND tag_id = ?", params: [7, 6] },
        ]);
    });

    it("leaves a score whose tags already match alone", async () => {
        const adapter = new FakeDatabaseAdapter([5]);

        await InstrumentTags.sync(adapter, 7, contentWith(["5"]));

        expect(adapter.executed).toHaveLength(0);
    });
});
