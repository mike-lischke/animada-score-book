/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { NameText } from "../core/NameText.js";
import { AccessLevel, EntityType, type IPermissionSummary, type ITokenPayload } from "./Auth.js";
import { type RequestContext } from "./RequestContext.js";
import { SetListAccess, SetListFilterProblem, type ISetListRow } from "./SetListAccess.js";

/**
 * The handlers behind the set-list actions. A set list is a named, saved tag combination with a score order of its
 * own; it copies no score and grants no score access. Membership and ordering are resolved separately, so these
 * handlers only own the list itself: its name, its combination and its revision.
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

        const entries: Array<Record<string, unknown>> = [];
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
     * Reads one set list with the score ids it holds, in its order.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleGetSetList(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const id = this.ctx.getRequestUrl(req).searchParams.get("id");
        const listId = id !== null ? Number(id) : undefined;

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

        this.ctx.sendJson(res, { ...entry, scores: await this.readableScoreIds(user, listId) });
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
     * @param row The stored list.
     * @param summary The caller's access to it.
     *
     * @returns The list as the client receives it, including what its stored combination is worth right now.
     */
    private async listJson(row: ISetListRow, summary: IPermissionSummary): Promise<Record<string, unknown>> {
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
     * @param user The authenticated caller, or undefined for a visitor.
     * @param listId The list to read the order of.
     *
     * @returns The stored score ids, in the list's order, restricted to the scores the caller may read.
     */
    private async readableScoreIds(user: ITokenPayload | undefined, listId: number): Promise<number[]> {
        const rows = await this.ctx.auth.adapter.query<{ scoreId: number; }>(
            "SELECT score_id AS scoreId FROM set_list_scores WHERE set_list_id = ? ORDER BY position, score_id",
            [listId],
        );

        const scoreIds = rows.map((row) => {
            return row.scoreId;
        });

        if (scoreIds.length === 0) {
            return [];
        }

        const summaries = await this.ctx.auth.getPermissionSummaries(user, EntityType.Score, scoreIds);

        return scoreIds.filter((scoreId) => {
            return summaries.get(scoreId)?.canRead === true;
        });
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
