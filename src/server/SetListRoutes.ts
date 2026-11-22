/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { NameText } from "../core/NameText.js";
import { TagCombination } from "../core/TagCombination.js";
import { AccessLevel, EntityType, type IPermissionSummary, type ITokenPayload } from "./Auth.js";
import type { IDbStatement } from "./database.js";
import { type RequestContext } from "./RequestContext.js";
import { SetListAccess, SetListFilterProblem, type ISetListRow } from "./SetListAccess.js";
import { SetListMembership } from "./SetListMembership.js";
import { SetListOrder } from "./SetListOrder.js";
import { TagAccess, type ITagRow } from "./TagAccess.js";

/** A set list as the client receives it. */
interface ISetListJson {
    id: number;
    name: string;
    revision: number;
    groups?: number[][];
    filterProblem?: SetListFilterProblem;
    perm: IPermissionSummary;
}

/**
 * The handlers behind the set-list actions. A set list is a named, saved tag combination with a score order of its
 * own; it copies no score and grants no score access. These handlers own the list itself: its name, its combination,
 * its revision and its stored order. `SetListMembership` resolves which scores it holds, `SetListOrder` how they are
 * placed, so neither a filter nor an order can widen what a caller may see.
 */
export class SetListRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    /**
     * Lists the set lists the caller may read, with the stored combination and the state it is in.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleListSetLists(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const rows = await this.ctx.auth.adapter.query<ISetListRow>(
            "SELECT id, name, filters, revision FROM set_lists", [],
        );

        const summaries = await this.ctx.auth.getPermissionSummaries(user, EntityType.SetList, rows.map((row) => {
            return row.id;
        }));

        const entries: ISetListJson[] = [];
        for (const row of rows) {
            const summary = summaries.get(row.id);
            if (summary?.canRead !== true) {
                continue;
            }

            entries.push(await this.listJson(row, summary));
        }

        this.ctx.sendJson(res, { setLists: entries });
    }

    /**
     * Reads one set list with its scores: the saved combination, an optional extra filter, and the visible scores
     * in the list's order. Scores the caller cannot read stay out of the result, but keep their places.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleGetSetList(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const queryId = this.ctx.getRequestUrl(req).searchParams.get("id");
        const rawId = queryId ?? body.id;
        const listId = rawId === undefined || rawId === null ? undefined : Number(rawId);

        if (listId === undefined || !Number.isInteger(listId)) {
            this.ctx.sendError(res, "Set list id required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.SetList, listId, AccessLevel.Read);
        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const row = await SetListAccess.find(this.ctx.auth.adapter, listId);
        if (row === undefined) {
            this.ctx.sendError(res, "Set list not found", 404);

            return;
        }

        const summary = await this.ctx.auth.getPermissionSummary(user, EntityType.SetList, listId);
        const entry = await this.listJson(row, summary);

        if (entry.groups === undefined || entry.filterProblem !== undefined) {
            this.ctx.sendJson(res, { ...entry, scores: [] });

            return;
        }

        const extraGroups = body.groups === undefined ? [] : SetListAccess.readGroups(body.groups);
        if (extraGroups === undefined) {
            this.ctx.sendError(res, "Invalid tag combination");

            return;
        }

        const extraProblem = await this.extraFilterProblem(user, extraGroups);
        if (extraProblem !== undefined) {
            this.sendFilterProblem(res, extraProblem);

            return;
        }

        const groups = TagCombination.combine({ groups: entry.groups }, { groups: extraGroups }).groups;
        const storedIds = await this.scoreOrder(listId);
        const membership = await SetListMembership.resolve(this.ctx.auth, user, storedIds, groups);

        this.ctx.sendJson(res, { ...entry, scores: membership.visible });
    }

    /**
     * Stores the order a caller wants for the scores it can see. Scores it cannot see, and scores that stopped
     * matching, keep their places, so nothing is lost when only a part of the list is visible. The revision has to
     * be the stored one, so two people cannot overwrite each other's order.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleReorderSetList(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const listId = body.id !== undefined ? Number(body.id) : undefined;
        const revision = body.revision !== undefined ? Number(body.revision) : undefined;

        if (listId === undefined || !Number.isInteger(listId)
            || revision === undefined || !Number.isInteger(revision)) {
            this.ctx.sendError(res, "id and revision required");

            return;
        }

        const order = SetListRoutes.scoreIdOrder(body.order);
        if (order === undefined) {
            this.ctx.sendError(res, "order required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.SetList, listId, AccessLevel.Write);
        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const row = await SetListAccess.find(this.ctx.auth.adapter, listId);
        if (row === undefined) {
            this.ctx.sendError(res, "Set list not found", 404);

            return;
        }

        if (row.revision !== revision) {
            this.sendConflict(res, row.revision);

            return;
        }

        const groups = SetListRoutes.storedGroups(row);
        if (groups === undefined) {
            this.sendFilterProblem(res, SetListFilterProblem.Malformed);

            return;
        }

        const audience = await SetListAccess.audience(this.ctx.auth, listId);
        const ownerId = (await this.ctx.auth.getExplicitOwner(EntityType.SetList, listId)) ?? undefined;
        const problem = await SetListAccess.filterProblem(this.ctx.auth, groups, audience, ownerId);
        if (problem !== undefined) {
            this.sendFilterProblem(res, problem);

            return;
        }

        const storedIds = await this.scoreOrder(listId);
        const membership = await SetListMembership.resolve(this.ctx.auth, user, storedIds, groups);
        const nextOrder = SetListOrder.applyVisibleOrder(membership.canonical, membership.visible, order);

        if (nextOrder === undefined) {
            this.ctx.sendJson(res, {
                error: "The order must name exactly the scores the list shows to you.",
                revision: row.revision,
            }, 409);

            return;
        }

        const claimed = await this.ctx.auth.adapter.execute(
            "UPDATE set_lists SET revision = revision + 1 WHERE id = ? AND revision = ?", [listId, revision],
        );

        if (claimed.affectedRows === 0) {
            const current = await SetListAccess.find(this.ctx.auth.adapter, listId);
            this.sendConflict(res, current?.revision ?? revision);

            return;
        }

        await this.storeOrder(listId, nextOrder);

        this.ctx.sendJson(res, { success: true, revision: revision + 1 });
    }

    /**
     * Creates a private set list that belongs to the caller.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleCreateSetList(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const name = this.storableName(res, body.name);
        const groups = SetListAccess.readGroups(body.groups ?? []);

        if (name === undefined) {
            return;
        }

        if (groups === undefined) {
            this.ctx.sendError(res, "Invalid tag combination");

            return;
        }

        // A new list is private, so the owner is the only one who has to be able to use its tags.
        const privateAudience = { groupIds: [], isWorld: false };
        const problem = await SetListAccess.filterProblem(this.ctx.auth, groups, privateAudience, user.userId);
        if (problem !== undefined) {
            this.sendFilterProblem(res, problem);

            return;
        }

        const result = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO set_lists (name, filters, revision) VALUES (?, ?, 1)",
            [name, JSON.stringify(groups)],
        );
        const listId = result.insertId;

        await this.ctx.auth.setOwner(EntityType.SetList, listId, user.userId);

        this.ctx.sendJson(res, { success: true, id: listId, revision: 1 });
    }

    /**
     * Renames a set list, changes its tag combination, or both. The revision the caller edited has to be the stored
     * one, so two people cannot overwrite each other's change.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleUpdateSetList(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const listId = body.id !== undefined ? Number(body.id) : undefined;
        const revision = body.revision !== undefined ? Number(body.revision) : undefined;

        if (listId === undefined || !Number.isInteger(listId)
            || revision === undefined || !Number.isInteger(revision)) {
            this.ctx.sendError(res, "id and revision required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.SetList, listId, AccessLevel.Write);
        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const row = await SetListAccess.find(this.ctx.auth.adapter, listId);
        if (row === undefined) {
            this.ctx.sendError(res, "Set list not found", 404);

            return;
        }

        if (row.revision !== revision) {
            this.sendConflict(res, row.revision);

            return;
        }

        const storedGroups = SetListRoutes.storedGroups(row);
        const groups = body.groups === undefined ? storedGroups : SetListAccess.readGroups(body.groups);

        if (groups === undefined) {
            this.ctx.sendError(res, "Invalid tag combination");

            return;
        }

        const name = body.name === undefined ? row.name : this.storableName(res, body.name);
        if (name === undefined) {
            return;
        }

        const audience = await SetListAccess.audience(this.ctx.auth, listId);
        const ownerId = (await this.ctx.auth.getExplicitOwner(EntityType.SetList, listId)) ?? undefined;
        const problem = await SetListAccess.filterProblem(this.ctx.auth, groups, audience, ownerId);
        if (problem !== undefined) {
            this.sendFilterProblem(res, problem);

            return;
        }

        const result = await this.ctx.auth.adapter.execute(
            "UPDATE set_lists SET name = ?, filters = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
            [name, JSON.stringify(groups), listId, revision],
        );

        if (result.affectedRows === 0) {
            // Another change slipped in between the read and the write.
            const current = await SetListAccess.find(this.ctx.auth.adapter, listId);
            this.sendConflict(res, current?.revision ?? revision);

            return;
        }

        this.ctx.sendJson(res, { success: true, revision: revision + 1 });
    }

    /**
     * Deletes a set list with its order and its permission rows.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleDeleteSetList(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const listId = body.id !== undefined ? Number(body.id) : undefined;

        if (listId === undefined || !Number.isInteger(listId)) {
            this.ctx.sendError(res, "id required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.SetList, listId, AccessLevel.Write);
        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const { adapter } = this.ctx.auth;

        await adapter.execute("DELETE FROM set_lists WHERE id = ?", [listId]);
        await adapter.execute(
            "DELETE FROM permissions WHERE entity_type = ? AND entity_id = ?", [EntityType.SetList, listId],
        );
        await adapter.execute(
            "DELETE FROM entity_groups WHERE entity_type = ? AND entity_id = ?", [EntityType.SetList, listId],
        );

        this.ctx.sendJson(res, { success: true });
    }

    /**
     * @param row The stored list.
     *
     * @returns The combination the list holds, or undefined when its stored JSON is damaged.
     */
    private static storedGroups(row: ISetListRow): number[][] | undefined {
        try {
            return SetListAccess.readGroups(JSON.parse(row.filters) as unknown);
        } catch {
            return undefined;
        }
    }

    /**
     * @param value The `order` field of the request body.
     *
     * @returns The score ids it names, or undefined when it is not a list of distinct positive ids.
     */
    private static scoreIdOrder(value: unknown): number[] | undefined {
        if (!Array.isArray(value)) {
            return undefined;
        }

        const order = value.map((entry) => {
            return Number(entry);
        });

        if (order.some((scoreId) => {
            return !Number.isInteger(scoreId) || scoreId <= 0;
        })) {
            return undefined;
        }

        return new Set(order).size === order.length ? order : undefined;
    }

    /**
     * @param row The stored list.
     * @param summary The caller's access to it.
     *
     * @returns The list as the client receives it, including what its stored combination is worth right now.
     */
    private async listJson(row: ISetListRow, summary: IPermissionSummary): Promise<ISetListJson> {
        const groups = SetListRoutes.storedGroups(row);

        let problem: SetListFilterProblem | undefined = SetListFilterProblem.Malformed;
        if (groups !== undefined) {
            const audience = await SetListAccess.audience(this.ctx.auth, row.id);
            const ownerId = (await this.ctx.auth.getExplicitOwner(EntityType.SetList, row.id)) ?? undefined;

            problem = await SetListAccess.filterProblem(this.ctx.auth, groups, audience, ownerId);
        }

        return {
            id: row.id,
            name: row.name,
            revision: row.revision,
            groups,
            filterProblem: problem,
            perm: summary,
        };
    }

    /**
     * @param listId The list to read the order of.
     *
     * @returns The ids the list knows, in its stored order, whether or not they match today.
     */
    private async scoreOrder(listId: number): Promise<number[]> {
        const rows = await this.ctx.auth.adapter.query<{ scoreId: number; }>(
            "SELECT score_id AS scoreId FROM set_list_scores WHERE set_list_id = ? ORDER BY position, score_id",
            [listId],
        );

        return rows.map((row) => {
            return row.scoreId;
        });
    }

    /**
     * @param listId The list whose order changes.
     * @param scoreIds The complete order the list is to hold.
     */
    private async storeOrder(listId: number, scoreIds: number[]): Promise<void> {
        const statements: IDbStatement[] = [
            { sql: "DELETE FROM set_list_scores WHERE set_list_id = ?", params: [listId] },
        ];

        if (scoreIds.length > 0) {
            const params: unknown[] = [];
            scoreIds.forEach((scoreId, index) => {
                params.push(listId, scoreId, index + 1);
            });
            const values = scoreIds.map(() => {
                return "(?, ?, ?)";
            }).join(", ");

            statements.push({
                sql: "INSERT IGNORE INTO set_list_scores (set_list_id, score_id, position) VALUES " + values,
                params,
            });
        }

        await this.ctx.auth.adapter.executeTransaction(statements);
    }

    /**
     * @param user The authenticated caller, or undefined for a visitor.
     * @param groups The AND groups of the extra filter.
     *
     * @returns Why the caller cannot use the filter, or undefined when every tag it names is usable.
     */
    private async extraFilterProblem(user: ITokenPayload | undefined,
        groups: number[][]): Promise<SetListFilterProblem | undefined> {
        const tagIds = SetListAccess.tagIds(groups);
        if (tagIds.length === 0) {
            return undefined;
        }

        const placeholders = tagIds.map(() => {
            return "?";
        }).join(", ");
        const tags = await this.ctx.auth.adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, group_id AS groupId, system_key AS systemKey "
            + `FROM tags WHERE id IN (${placeholders})`, tagIds,
        );

        const known = new Map(tags.map((tag) => {
            return [tag.id, tag];
        }));
        const context = await TagAccess.contextFor(this.ctx.auth, user);

        for (const tagId of tagIds) {
            const tag = known.get(tagId);

            if (tag === undefined) {
                return SetListFilterProblem.UnavailableTag;
            }

            if (!TagAccess.canUse(context, tag)) {
                return SetListFilterProblem.NotUsable;
            }
        }

        return undefined;
    }

    /**
     * @param res The response to write a rejection to.
     * @param value The `name` field of the request body.
     *
     * @returns The name as it must be stored, or undefined when the request was rejected.
     */
    private storableName(res: ServerResponse, value: unknown): string | undefined {
        const name = NameText.normalize(String(value ?? ""));

        if (name.length === 0) {
            this.ctx.sendError(res, "Name required");

            return undefined;
        }

        if (!NameText.isWellFormed(name)) {
            this.ctx.sendError(res, "A set list name must be valid Unicode.");

            return undefined;
        }

        if (NameText.codePointCount(name) > SetListAccess.maxNameLength) {
            this.ctx.sendError(res, `A set list name may hold at most ${SetListAccess.maxNameLength} characters.`);

            return undefined;
        }

        return name;
    }

    private sendFilterProblem(res: ServerResponse, problem: SetListFilterProblem): void {
        this.ctx.sendJson(res, { error: SetListAccess.problemMessage(problem), filterProblem: problem }, 409);
    }

    private sendConflict(res: ServerResponse, revision: number): void {
        this.ctx.sendJson(res, { error: "The set list was changed in the meantime.", revision }, 409);
    }
}
