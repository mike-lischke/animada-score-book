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
export const otherGroupId = 30;

export const adminUserId = 1;
export const ownerUserId = 3;
export const foreignUserId = 4;
export const memberUserId = 8;

export const globalTagId = 5;
export const memberTagId = 6;
export const foreignTagId = 21;
export const setListTagId = 40;
export const unknownTagId = 99;

export const scoreId = 7;
export const otherScoreId = 9;

/** One tag assignment of a score, as membership and the manual filter read it. */
export interface IScoreTagFixture extends DbRow {
    scoreId: number;
    tagId: number;
}

/** One set list as it is stored: the tag defines it, so it carries no name of its own. */
export interface ISetListRowFixture extends DbRow {
    id: number;
    tagId: number;
    revision: number;
}

/**
 * Answers the statements the set-list routes, the tag actions, the permission checks and the tag scope rules issue,
 * with everything in memory. It models tags with their owner scope, the two permission tables (one owner row and one
 * group grant per entity), and the tag assignments that decide set-list membership.
 */
export class FakeSetListDatabase implements IDatabaseAdapter {
    public readonly groups = [
        { id: adminsGroupId, name: Auth.adminGroupName, adminId: null as number | null },
        { id: worldGroupId, name: Auth.worldGroupName, adminId: null as number | null },
        { id: memberGroupId, name: "Bateria", adminId: ownerUserId as number | null },
        { id: foreignGroupId, name: "Fremd", adminId: foreignUserId as number | null },
        { id: otherGroupId, name: "Gäste", adminId: null as number | null },
    ];

    public readonly userGroups = [
        { userId: adminUserId, groupId: adminsGroupId },
        { userId: ownerUserId, groupId: memberGroupId },
        { userId: memberUserId, groupId: memberGroupId },
        { userId: foreignUserId, groupId: foreignGroupId },
    ];

    public readonly tags: ITagRow[] = [
        { id: globalTagId, name: "Groovy", colorIndex: 1, groupId: null, systemKey: null },
        { id: memberTagId, name: "Bateria Internal", colorIndex: 2, groupId: memberGroupId, systemKey: null },
        { id: foreignTagId, name: "Fremd Internal", colorIndex: 3, groupId: foreignGroupId, systemKey: null },
    ];

    public readonly setLists: ISetListRowFixture[] = [];

    public readonly setListScores: Array<{ setListId: number; scoreId: number; position: number; }> = [];

    public readonly scores = [{ id: scoreId, name: "Samba" }, { id: otherScoreId, name: "Bateria" }];

    public readonly users = [
        { id: adminUserId, email: "admin@example.com", displayName: "Administrator" },
        { id: ownerUserId, email: "owner@example.com", displayName: "Owner" },
        { id: foreignUserId, email: "foreign@example.com", displayName: "" },
        { id: memberUserId, email: "member@example.com", displayName: "Member" },
    ];

    public readonly scoreTags: IScoreTagFixture[] = [
        { scoreId, tagId: globalTagId },
        { scoreId: otherScoreId, tagId: globalTagId },
    ];

    /** Owner per entity, keyed by `<entityType>:<entityId>`. */
    public readonly owners = new Map<string, number | null>();

    /** Group grants per entity, keyed by `<entityType>:<entityId>`. */
    public readonly grants = new Map<string, Map<number, boolean>>();

    private nextListId = 100;
    private nextTagId = 200;

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
        const affectedRows = this.apply(sql, params);

        return Promise.resolve({ affectedRows, insertId: this.nextListId - 1 });
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
     * Creates a set list in the fixture with a tag of the same name in the given scope, as the backend does.
     *
     * @param name The name of both the list and its tag.
     * @param groupId The owner scope; undefined makes it a global tag.
     * @param revision The revision the list starts with.
     *
     * @returns The ids of the created list and tag.
     */
    public seedSetList(name: string, groupId: number | undefined, revision = 1): { id: number; tagId: number; } {
        const tagId = this.nextTagId++;
        const id = this.nextListId++;
        this.tags.push({ id: tagId, name, colorIndex: tagId % 10, groupId: groupId ?? null, systemKey: null });
        this.setLists.push({ id, tagId, revision });

        return { id, tagId };
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

    /**
     * @param tagId The set-list tag to look at.
     *
     * @returns The list that the tag defines, if any.
     */
    private listOfTag(tagId: number): ISetListRowFixture | undefined {
        return this.setLists.find((entry) => {
            return entry.tagId === tagId;
        });
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

        if (sql.includes("FROM `groups` WHERE id = ?")) {
            return this.groups.filter((entry) => {
                return entry.id === Number(params[0]);
            }).map((entry) => {
                return { id: entry.id, name: entry.name };
            });
        }

        if (sql.includes("FROM `groups`")) {
            return this.groups.map((entry) => {
                return { id: entry.id, name: entry.name };
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

        if (sql.includes("FROM tags WHERE name = ? AND owner_scope")) {
            if (sql.includes("AND id != ?")) {
                return this.tags.filter((tag) => {
                    return tag.name === String(params[0]) && (tag.groupId ?? 0) === Number(params[1])
                        && tag.id !== Number(params[2]);
                });
            }

            return this.tags.filter((tag) => {
                return tag.name === String(params[0]) && (tag.groupId ?? 0) === Number(params[1]);
            });
        }

        if (sql.includes("FROM tags")) {
            return this.tags;
        }

        if (sql.includes("FROM permissions p")) {
            const rows: DbRow[] = [];
            for (const [key, ownerId] of this.owners) {
                const [entityType, entityId] = key.split(":");
                if (entityType !== String(params[0]) || ownerId === null) {
                    continue;
                }

                const user = this.users.find((entry) => {
                    return entry.id === ownerId;
                });

                const ownerName = user === undefined
                    ? ""
                    : (user.displayName.length > 0 ? user.displayName : user.email);

                rows.push({
                    entityId: Number(entityId),
                    ownerId,
                    ownerName,
                });
            }

            return rows;
        }

        if (sql.includes("FROM users WHERE id = ?")) {
            return this.users.filter((entry) => {
                return entry.id === Number(params[0]);
            }).map((entry) => {
                return { ownerName: entry.displayName || entry.email };
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

        if (sql.includes("FROM entity_groups WHERE entity_type = ?")) {
            const rows: DbRow[] = [];
            for (const [key, grants] of this.grants) {
                const [entityType, entityId] = key.split(":");
                if (entityType !== String(params[0])) {
                    continue;
                }

                for (const [groupId, writable] of grants) {
                    rows.push({ entityId: Number(entityId), groupId, writable: writable ? 1 : 0 });
                }
            }

            return rows;
        }

        if (sql.includes("FROM set_list_scores WHERE set_list_id = ? AND score_id = ?")) {
            return this.setListScores.filter((entry) => {
                return entry.setListId === Number(params[0]) && entry.scoreId === Number(params[1]);
            });
        }

        if (sql.includes("MAX(position)")) {
            const positions = this.setListScores.filter((entry) => {
                return entry.setListId === Number(params[0]);
            }).map((entry) => {
                return entry.position;
            });

            return [{ position: positions.length === 0 ? 1 : Math.max(...positions) + 1 }];
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

        if (sql.includes("FROM score_tags WHERE tag_id IN")) {
            return this.scoreTags.filter((entry) => {
                return params.map(Number).includes(entry.tagId);
            }).map((entry) => {
                return { tagId: entry.tagId, scoreId: entry.scoreId };
            });
        }

        if (sql.includes("FROM score_tags WHERE tag_id = ?")) {
            return this.scoreTags.filter((entry) => {
                return entry.tagId === Number(params[0]);
            }).map((entry) => {
                return { scoreId: entry.scoreId };
            });
        }

        if (sql.includes("FROM score_tags WHERE score_id = ? AND tag_id = ?")) {
            return this.scoreTags.filter((entry) => {
                return entry.scoreId === Number(params[0]) && entry.tagId === Number(params[1]);
            }).map((entry) => {
                return { scoreId: entry.scoreId };
            });
        }

        if (sql.includes("FROM score_tags WHERE score_id IN")) {
            return this.scoreTags.filter((entry) => {
                return params.map(Number).includes(entry.scoreId);
            }).map((entry) => {
                return { scoreId: entry.scoreId, tagId: entry.tagId };
            });
        }

        if (sql.includes("FROM score_tags")) {
            return this.scoreTags.map((entry) => {
                return { scoreId: entry.scoreId, tagId: entry.tagId };
            });
        }

        if (sql.includes("SELECT id, content FROM scores WHERE id IN")) {
            return this.scores.filter((score) => {
                return params.map(Number).includes(score.id);
            }).map((score) => {
                return { id: score.id, content: "" };
            });
        }

        if (sql.includes("FROM scores WHERE id IN")) {
            return this.scores.filter((score) => {
                return params.map(Number).includes(score.id);
            }).map((score) => {
                return { id: score.id, name: score.name };
            });
        }

        if (sql.includes("FROM scores WHERE id = ?")) {
            return this.scores.filter((score) => {
                return score.id === Number(params[0]);
            }).map((score) => {
                return { id: score.id, name: score.name };
            });
        }

        if (sql.includes("FROM scores")) {
            return this.scores.map((score) => {
                return { id: score.id, name: score.name };
            });
        }

        if (sql.includes("JOIN tags t ON t.id = l.tag_id")) {
            return this.setLists.filter((entry) => {
                const tag = this.tags.find((candidate) => {
                    return candidate.id === entry.tagId;
                });

                return tag?.name === String(params[0]) && (tag.groupId ?? 0) === Number(params[1]);
            });
        }

        if (sql.includes("FROM set_lists WHERE tag_id = ?")) {
            return this.setLists.filter((entry) => {
                return entry.tagId === Number(params[0]);
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
        if (sql.startsWith("INSERT INTO permissions") && sql.includes("SELECT")) {
            const entityType = String(params[0]);
            const ownerId = Number(params[1]);
            const name = String(params[2]);
            const groupId = params[3] === null ? null : Number(params[3]);
            const tag = this.tags.find((entry) => {
                return entry.name === name && (entry.groupId ?? 0) === (groupId ?? 0);
            });
            const list = tag === undefined ? undefined : this.listOfTag(tag.id);

            if (list === undefined) {
                return 0;
            }

            this.owners.set(`${entityType}:${list.id}`, ownerId);

            return 1;
        }

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

        if (sql.startsWith("INSERT INTO tags")) {
            const tagId = this.nextTagId++;
            this.tags.push({
                id: tagId,
                name: String(params[0]),
                colorIndex: 0,
                groupId: params[1] === null ? null : Number(params[1]),
                systemKey: null,
            });

            return 1;
        }

        if (sql.startsWith("UPDATE tags SET name")) {
            const tag = this.tags.find((entry) => {
                return entry.id === Number(params[params.length - 1]);
            });

            if (tag) {
                tag.name = String(params[0]);

                return 1;
            }

            return 0;
        }

        if (sql.startsWith("UPDATE tags SET color_index")) {
            const tag = this.tags.find((entry) => {
                return entry.name === String(params[1]) && (entry.groupId ?? 0) === Number(params[2]);
            });

            if (tag) {
                tag.colorIndex = tag.id % Number(params[0]);

                return 1;
            }

            return 0;
        }

        if (sql.startsWith("DELETE FROM tags")) {
            const tagId = Number(params[0]);
            const list = this.listOfTag(tagId);

            this.tags.splice(0, this.tags.length, ...this.tags.filter((entry) => {
                return entry.id !== tagId;
            }));
            this.scoreTags.splice(0, this.scoreTags.length, ...this.scoreTags.filter((entry) => {
                return entry.tagId !== tagId;
            }));

            if (list !== undefined) {
                this.setLists.splice(0, this.setLists.length, ...this.setLists.filter((entry) => {
                    return entry.id !== list.id;
                }));
                this.setListScores.splice(0, this.setListScores.length, ...this.setListScores.filter((entry) => {
                    return entry.setListId !== list.id;
                }));
            }

            return 1;
        }

        if (sql.startsWith("INSERT INTO set_lists")) {
            const tag = this.tags.find((entry) => {
                return entry.name === String(params[0]) && (entry.groupId ?? 0) === Number(params[1]);
            });

            if (tag === undefined) {
                return 0;
            }

            this.setLists.push({ id: this.nextListId++, tagId: tag.id, revision: 1 });

            return 1;
        }

        if (sql.startsWith("DELETE FROM set_lists")) {
            const listId = Number(params[0]);

            this.setLists.splice(0, this.setLists.length, ...this.setLists.filter((entry) => {
                return entry.id !== listId;
            }));

            return 1;
        }

        if (sql.startsWith("UPDATE set_lists SET revision") && sql.includes("AND revision = ?")) {
            const list = this.setLists.find((entry) => {
                return entry.id === Number(params[0]) && entry.revision === Number(params[1]);
            });

            if (list === undefined) {
                return 0;
            }

            list.revision += 1;

            return 1;
        }

        if (sql.startsWith("UPDATE set_lists SET revision")) {
            const list = this.setLists.find((entry) => {
                return entry.id === Number(params[0]);
            });

            if (list === undefined) {
                return 0;
            }

            list.revision += 1;

            return 1;
        }

        if (sql.startsWith("INSERT INTO score_tags") || sql.startsWith("INSERT IGNORE INTO score_tags")) {
            const scoreIdValue = Number(params[0]);
            const tagId = Number(params[1]);
            const known = this.scoreTags.some((entry) => {
                return entry.scoreId === scoreIdValue && entry.tagId === tagId;
            });

            if (known) {
                return 0;
            }

            this.scoreTags.push({ scoreId: scoreIdValue, tagId });

            return 1;
        }

        if (sql.startsWith("DELETE FROM score_tags")) {
            const before = this.scoreTags.length;

            this.scoreTags.splice(0, this.scoreTags.length, ...this.scoreTags.filter((entry) => {
                return !(entry.scoreId === Number(params[0]) && entry.tagId === Number(params[1]));
            }));

            return before - this.scoreTags.length;
        }

        if (sql.startsWith("DELETE FROM set_list_scores") && params.length > 1) {
            const before = this.setListScores.length;

            this.setListScores.splice(0, this.setListScores.length, ...this.setListScores.filter((entry) => {
                return !(entry.setListId === Number(params[0]) && entry.scoreId === Number(params[1]));
            }));

            return before - this.setListScores.length;
        }

        if (sql.startsWith("DELETE FROM set_list_scores")) {
            const setListId = Number(params[0]);
            const before = this.setListScores.length;

            this.setListScores.splice(0, this.setListScores.length, ...this.setListScores.filter((entry) => {
                return entry.setListId !== setListId;
            }));

            return before - this.setListScores.length;
        }

        if (sql.startsWith("INSERT INTO set_list_scores") || sql.startsWith("INSERT IGNORE INTO set_list_scores")) {
            let added = 0;

            for (let index = 0; index + 2 < params.length; index += 3) {
                const setListId = Number(params[index]);
                const scoreIdValue = Number(params[index + 1]);
                const position = Number(params[index + 2]);
                const known = this.setListScores.some((entry) => {
                    return entry.setListId === setListId && entry.scoreId === scoreIdValue;
                });

                if (!known && this.scores.some((score) => {
                    return score.id === scoreIdValue;
                })) {
                    this.setListScores.push({ setListId, scoreId: scoreIdValue, position });
                    added++;
                }
            }

            return added;
        }

        return 1;
    }
}
