/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Auth } from "../../src/server/Auth.js";
import type {
    DbRow, IDatabaseAdapter, IDbExecuteResult, IDbStatement, ITestConnectionResult,
} from "../../src/server/database.js";
import type { ITagRow } from "../../src/server/TagAccess.js";

export const adminsGroupId = 1;
export const worldGroupId = 2;
export const memberGroupId = 10;
export const foreignGroupId = 20;

export const adminUserId = 1;
export const ownerUserId = 3;
export const foreignUserId = 4;

export const globalTagId = 5;
export const memberTagId = 6;
export const foreignTagId = 21;
export const unknownTagId = 99;

export const scoreId = 7;
export const otherScoreId = 9;

/** One tag assignment of a score, as the set-list membership reads it. */
export interface IScoreTagFixture extends DbRow {
    scoreId: number;
    tagId: number;
}

export interface ISetListRowFixture extends DbRow {
    id: number;
    name: string;
    filters: string;
    revision: number;
}

/**
 * Answers the statements the set-list routes, the permission checks and the tag scope rules issue, with everything
 * in memory. It models the two permission tables the way the backend uses them: one owner row per entity and one
 * row per group grant.
 */
export class FakeSetListDatabase implements IDatabaseAdapter {
    public readonly groups = [
        { id: adminsGroupId, name: Auth.adminGroupName, adminId: null },
        { id: worldGroupId, name: Auth.worldGroupName, adminId: null },
        { id: memberGroupId, name: "Bateria", adminId: ownerUserId },
        { id: foreignGroupId, name: "Fremd", adminId: foreignUserId },
    ];

    public readonly userGroups = [{ userId: ownerUserId, groupId: memberGroupId }];

    public readonly tags: ITagRow[] = [
        { id: globalTagId, name: "Groovy", colorIndex: 1, groupId: null, systemKey: null },
        { id: memberTagId, name: "Bateria Internal", colorIndex: 2, groupId: memberGroupId, systemKey: null },
        { id: foreignTagId, name: "Fremd Internal", colorIndex: 3, groupId: foreignGroupId, systemKey: null },
    ];

    public readonly setLists: ISetListRowFixture[] = [];

    public readonly setListScores: Array<{ setListId: number; scoreId: number; position: number; }> = [];

    public readonly scores = [{ id: scoreId, name: "Samba" }, { id: otherScoreId, name: "Bateria" }];

    public readonly scoreTags: IScoreTagFixture[] = [
        { scoreId, tagId: globalTagId },
        { scoreId: otherScoreId, tagId: globalTagId },
    ];

    /** Owner per entity, keyed by `<entityType>:<entityId>`. */
    public readonly owners = new Map<string, number | null>();

    /** Group grants per entity, keyed by `<entityType>:<entityId>`. */
    public readonly grants = new Map<string, Map<number, boolean>>();

    private nextListId = 100;

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

    public query<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
        return Promise.resolve(this.rows(sql, params) as unknown as T[]);
    }

    public execute(sql: string, params: unknown[] = []): Promise<IDbExecuteResult> {
        const affectedRows = this.apply(sql, params);

        return Promise.resolve({ affectedRows, insertId: 0 });
    }

    public insertReturningId(sql: string, params: unknown[] = []): Promise<IDbExecuteResult> {
        if (sql.startsWith("INSERT INTO set_lists")) {
            const id = this.nextListId++;
            this.setLists.push({
                id,
                name: String(params[0]),
                filters: String(params[1]),
                revision: 1,
            });

            return Promise.resolve({ affectedRows: 1, insertId: id });
        }

        return Promise.resolve({ affectedRows: 1, insertId: 0 });
    }

    public executeMultiple(): Promise<void> {
        return Promise.resolve();
    }

    public executeTransaction(statements: IDbStatement[]): Promise<void> {
        for (const statement of statements) {
            this.apply(statement.sql, statement.params ?? []);
        }

        return Promise.resolve();
    }

    public shutdown(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * @param entityType The entity type of the permission rows.
     * @param entityId The entity in question.
     * @param ownerId The owner to store.
     * @param groupIds The groups to grant; writable when the entry is an object with `writable`.
     */
    public seedGrants(entityType: string, entityId: number, ownerId: number | null,
        groupIds: Array<number | { groupId: number; writable: boolean; }> = []): void {
        const key = `${entityType}:${entityId}`;
        this.owners.set(key, ownerId);

        const grants = new Map<number, boolean>();
        for (const entry of groupIds) {
            if (typeof entry === "number") {
                grants.set(entry, false);
            } else {
                grants.set(entry.groupId, entry.writable);
            }
        }

        this.grants.set(key, grants);
    }

    private rows(sql: string, params: unknown[]): DbRow[] {
        if (sql.includes("ug JOIN `groups` g")) {
            const group = this.groups.find((entry) => {
                return entry.name === String(params[1]);
            });
            const member = this.userGroups.some((entry) => {
                return entry.userId === Number(params[0]) && entry.groupId === group?.id;
            });

            return [{ cnt: member ? 1 : 0 }];
        }

        if (sql.includes("COUNT(*) AS cnt FROM user_groups")) {
            const member = this.userGroups.some((entry) => {
                return entry.userId === Number(params[0]) && entry.groupId === Number(params[1]);
            });

            return [{ cnt: member ? 1 : 0 }];
        }

        if (sql.includes("FROM user_groups WHERE user_id = ?")) {
            return this.userGroups.filter((entry) => {
                return entry.userId === Number(params[0]);
            }).map((entry) => {
                return { groupId: entry.groupId };
            });
        }

        if (sql.includes("WHERE admin_id = ?")) {
            return this.groups.filter((entry) => {
                return entry.adminId === Number(params[0]);
            }).map((entry) => {
                return { id: entry.id };
            });
        }

        if (sql.includes("id = ? AND admin_id = ?")) {
            const administers = this.groups.some((entry) => {
                return entry.id === Number(params[0]) && entry.adminId === Number(params[1]);
            });

            return administers ? [{ id: Number(params[0]) }] : [];
        }

        if (sql.includes("FROM `groups` WHERE name = ?")) {
            return this.groups.filter((entry) => {
                return entry.name === String(params[0]);
            }).map((entry) => {
                return { id: entry.id };
            });
        }

        if (sql.includes("FROM tags WHERE id IN")) {
            return this.tags.filter((tag) => {
                return params.map(Number).includes(tag.id);
            });
        }

        if (sql.includes("FROM tags WHERE id = ?")) {
            return this.tags.filter((tag) => {
                return tag.id === Number(params[0]);
            });
        }

        if (sql.includes("FROM permissions WHERE entity_type = ? AND entity_id IN")) {
            return params.slice(1).map(Number).filter((entityId) => {
                return this.owners.get(`${String(params[0])}:${entityId}`) !== undefined;
            }).map((entityId) => {
                return { entityId, ownerId: this.owners.get(`${String(params[0])}:${entityId}`) ?? null };
            });
        }

        if (sql.includes("FROM permissions WHERE entity_type = ? AND entity_id = ?")) {
            const key = `${String(params[0])}:${Number(params[1])}`;

            return this.owners.has(key) ? [{ ownerId: this.owners.get(key) ?? null }] : [];
        }

        if (sql.includes("FROM entity_groups WHERE entity_type = ? AND entity_id IN")) {
            const rows: DbRow[] = [];
            for (const entityId of params.slice(1).map(Number)) {
                const grants = this.grants.get(`${String(params[0])}:${entityId}`);
                for (const [groupId, writable] of grants ?? []) {
                    rows.push({ entityId, groupId, writable: writable ? 1 : 0 });
                }
            }

            return rows;
        }

        if (sql.includes("FROM entity_groups WHERE entity_type = ? AND entity_id = ?")) {
            const grants = this.grants.get(`${String(params[0])}:${Number(params[1])}`);

            return Array.from(grants ?? []).map(([groupId, writable]) => {
                return { groupId, writable: writable ? 1 : 0 };
            });
        }

        if (sql.includes("FROM set_list_scores")) {
            return this.setListScores.filter((entry) => {
                return entry.setListId === Number(params[0]);
            }).sort((left, right) => {
                return left.position - right.position;
            }).map((entry) => {
                return { scoreId: entry.scoreId };
            });
        }

        if (sql.includes("FROM score_tags")) {
            return this.scoreTags.map((entry) => {
                return { scoreId: entry.scoreId, tagId: entry.tagId };
            });
        }

        if (sql.includes("FROM scores")) {
            return this.scores.map((score) => {
                return { id: score.id };
            });
        }

        if (sql.includes("FROM set_lists WHERE id = ?")) {
            return this.setLists.filter((entry) => {
                return entry.id === Number(params[0]);
            });
        }

        if (sql.includes("FROM set_lists")) {
            return [...this.setLists];
        }

        return [];
    }

    private apply(sql: string, params: unknown[]): number {
        if (sql.startsWith("INSERT INTO permissions")) {
            this.owners.set(`${String(params[0])}:${Number(params[1])}`, Number(params[2]));

            return 1;
        }

        if (sql.startsWith("DELETE FROM permissions")) {
            this.owners.delete(`${String(params[0])}:${Number(params[1])}`);

            return 1;
        }

        if (sql.startsWith("INSERT INTO entity_groups")) {
            const key = `${String(params[0])}:${Number(params[1])}`;
            const grants = this.grants.get(key) ?? new Map<number, boolean>();
            const groupId = Number(params[2]);
            const writable = sql.includes("writable = 0") ? false : Boolean(params[3]);

            grants.set(groupId, writable || (grants.get(groupId) ?? false));
            this.grants.set(key, grants);

            return 1;
        }

        if (sql.startsWith("DELETE FROM entity_groups")) {
            const key = `${String(params[0])}:${Number(params[1])}`;

            if (params.length > 2) {
                this.grants.get(key)?.delete(Number(params[2]));
            } else {
                this.grants.delete(key);
            }

            return 1;
        }

        if (sql.startsWith("DELETE FROM set_list_scores")) {
            const setListId = Number(params[0]);
            const before = this.setListScores.length;

            for (let index = this.setListScores.length - 1; index >= 0; index--) {
                if (this.setListScores[index].setListId === setListId) {
                    this.setListScores.splice(index, 1);
                }
            }

            return before - this.setListScores.length;
        }

        if (sql.startsWith("INSERT INTO set_list_scores") || sql.startsWith("INSERT IGNORE INTO set_list_scores")) {
            let added = 0;

            for (let index = 0; index + 2 < params.length; index += 3) {
                const setListId = Number(params[index]);
                const scoreId = Number(params[index + 1]);
                const position = Number(params[index + 2]);
                const known = this.setListScores.some((entry) => {
                    return entry.setListId === setListId && entry.scoreId === scoreId;
                });

                if (!known && this.scores.some((score) => {
                    return score.id === scoreId;
                })) {
                    this.setListScores.push({ setListId, scoreId, position });
                    added++;
                }
            }

            return added;
        }

        if (sql.startsWith("DELETE FROM set_lists")) {
            const index = this.setLists.findIndex((entry) => {
                return entry.id === Number(params[0]);
            });

            if (index >= 0) {
                this.setLists.splice(index, 1);
            }

            return index >= 0 ? 1 : 0;
        }

        if (sql.startsWith("UPDATE set_lists SET name")) {
            const list = this.setLists.find((entry) => {
                return entry.id === Number(params[2]) && entry.revision === Number(params[3]);
            });

            if (!list) {
                return 0;
            }

            list.name = String(params[0]);
            list.filters = String(params[1]);
            list.revision += 1;

            return 1;
        }

        if (sql.startsWith("UPDATE set_lists SET revision")) {
            const list = this.setLists.find((entry) => {
                return entry.id === Number(params[0]);
            });

            if (!list || (params.length > 1 && list.revision !== Number(params[1]))) {
                return 0;
            }

            list.revision += 1;

            return 1;
        }

        return 1;
    }
}
