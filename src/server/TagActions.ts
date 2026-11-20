/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { NameText } from "../core/NameText.js";
import { TagPalette } from "../core/TagPalette.js";
import { AccessLevel, EntityType, type ITokenPayload } from "./Auth.js";
import { InstrumentTags } from "./InstrumentTags.js";
import { type RequestContext } from "./RequestContext.js";
import { ScoreLock } from "./ScoreLock.js";
import { SystemTagKind, TagAccess, type ITagAccessContext, type ITagRow } from "./TagAccess.js";

/** A tag as the client receives it. */
interface ITagJson {
    id: number;
    name: string;
    colorIndex: number;
    groupId?: number;
    groupName?: string;
    systemKind?: SystemTagKind;

    /** The instrument the tag stands for; set for instrument tags only. */
    instrumentTypeId?: string;

    editable: boolean;
    assignable: boolean;
    usageCount: number;
}

/**
 * The handlers behind the tag and score-list actions. `Router` dispatches to them by `?action=`, so this class is
 * the tag counterpart of `ScoreRoutes`: it serves the tag catalogue, the assignments and the score list that a tag
 * combination matches. The rules themselves live in `TagAccess`; these handlers enforce them and build the JSON.
 */
export class TagActions {
    /** The most AND groups one combination may hold. */
    private static readonly maxFilterGroups = 20;

    /** The most tags one AND group may hold. */
    private static readonly maxFilterTagsPerGroup = 32;

    public constructor(private readonly ctx: RequestContext) { }

    /**
     * Lists the tags the caller can use, with everything the drawer needs to show and complete them.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleListTags(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const context = await TagAccess.contextFor(this.ctx.auth, user);
        const usable = await this.usableTags(context);

        if (usable.length === 0) {
            this.ctx.sendJson(res, { tags: [] });

            return;
        }

        const groupNames = await this.groupNames();
        const usage = await this.usageCounts(user, usable.map((tag) => {
            return tag.id;
        }));

        const entries = usable.map((tag) => {
            return TagActions.tagJson(context, tag, groupNames, usage.get(tag.id) ?? 0);
        }).sort((left, right) => {
            return NameText.compare(left.name, right.name);
        });

        this.ctx.sendJson(res, { tags: entries });
    }

    /**
     * Lists the owner scopes the caller may create tags in. An empty list means the caller cannot create tags.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleListTagOwnerScopes(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const context = await TagAccess.contextFor(this.ctx.auth, user);

        const scopes: Array<{ groupId?: number; name: string; }> = [];

        if (context.isAdmin) {
            scopes.push({ name: TagAccess.globalScopeName });
        }

        for (const groupId of context.adminGroupIds) {
            const rows = await this.ctx.auth.adapter.query<{ name: string; }>(
                "SELECT name FROM `groups` WHERE id = ?", [groupId],
            );

            if (rows.length > 0) {
                scopes.push({ groupId, name: rows[0].name });
            }
        }

        this.ctx.sendJson(res, { scopes });
    }

    /**
     * Creates a tag in an owner scope. A name the caller can already use returns the existing tag instead.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleCreateTag(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const context = await TagAccess.contextFor(this.ctx.auth, user);

        if (!context.isSignedIn) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const name = this.storableName(res, body.name);
        const groupId = TagActions.optionalId(body.groupId);
        const colourIndex = TagPalette.optionalIndex(body.colorIndex);

        if (name === undefined) {
            return;
        }

        if (body.colorIndex !== undefined && colourIndex === undefined) {
            this.ctx.sendError(res, "Invalid colour index");

            return;
        }

        if (!TagAccess.canOwnScope(context, groupId)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const existing = await this.usableTagNamed(context, name);
        if (existing !== undefined) {
            this.ctx.sendJson(res, {
                success: true, created: false,
                tag: TagActions.tagJson(context, existing, await this.groupNames(), 0),
            });

            return;
        }

        const result = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO tags (name, color_index, group_id) VALUES (?, ?, ?)",
            [name, colourIndex ?? 0, groupId ?? null],
        );
        const tagId = result.insertId;

        if (colourIndex === undefined) {
            await this.ctx.auth.adapter.execute("UPDATE tags SET color_index = ? WHERE id = ?",
                [TagActions.colourIndexForId(tagId), tagId]);
        }

        const created = await this.tagById(tagId);
        if (created === undefined) {
            this.ctx.sendError(res, "Tag not found", 404);

            return;
        }

        this.ctx.sendJson(res, {
            success: true,
            created: true,
            tag: TagActions.tagJson(context, created, await this.groupNames(), 0)
        });
    }

    /**
     * Renames a tag or changes its colour. Reserved for the owner of the tag's scope.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleUpdateTag(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.ctx.readJsonBody(req);
        const tagId = TagActions.optionalId(body.id);
        const tag = tagId === undefined ? undefined : await this.tagById(tagId);

        if (tagId === undefined || tag === undefined) {
            this.ctx.sendError(res, "Tag not found", 404);

            return;
        }

        const context = await TagAccess.contextFor(this.ctx.auth, this.ctx.getAuthUser(req));

        if (!TagAccess.owns(context, tag)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        let name = tag.name;
        if (body.name !== undefined) {
            const requested = this.storableName(res, body.name);
            if (requested === undefined) {
                return;
            }

            name = requested;
        }

        const colourIndex = body.colorIndex === undefined
            ? tag.colorIndex
            : TagPalette.optionalIndex(body.colorIndex);

        if (colourIndex === undefined) {
            this.ctx.sendError(res, "Invalid colour index");

            return;
        }

        const duplicate = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM tags WHERE name = ? AND owner_scope = IFNULL(?, 0) AND id != ?",
            [name, tag.groupId, tagId],
        );

        if (duplicate.length > 0) {
            this.ctx.sendError(res, "A tag with that name already exists in this scope.", 409);

            return;
        }

        await this.ctx.auth.adapter.execute("UPDATE tags SET name = ?, color_index = ? WHERE id = ?",
            [name, colourIndex, tagId]);

        const updated = await this.tagById(tagId);
        const tagJson = updated === undefined
            ? undefined
            : TagActions.tagJson(context, updated, await this.groupNames(), 0);

        this.ctx.sendJson(res, { success: true, tag: tagJson });
    }

    /**
     * Deletes a tag and, through the foreign key, all of its assignments. System tags cannot be deleted.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleDeleteTag(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.ctx.readJsonBody(req);
        const tagId = TagActions.optionalId(body.id);
        const tag = tagId === undefined ? undefined : await this.tagById(tagId);

        if (tagId === undefined || tag === undefined) {
            this.ctx.sendError(res, "Tag not found", 404);

            return;
        }

        const context = await TagAccess.contextFor(this.ctx.auth, this.ctx.getAuthUser(req));

        if (!TagAccess.owns(context, tag)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (tag.systemKey !== null) {
            this.ctx.sendError(res, "System tags cannot be deleted.", 409);

            return;
        }

        await this.ctx.auth.adapter.execute("DELETE FROM tags WHERE id = ?", [tagId]);

        this.ctx.sendJson(res, { success: true });
    }

    /**
     * Assigns a tag to a score.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleAssignTag(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const resolved = await this.resolveAssignment(req, res);

        if (resolved === undefined) {
            return;
        }

        await this.ctx.auth.adapter.execute("INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES (?, ?)",
            [resolved.scoreId, resolved.tag.id]);

        this.ctx.sendJson(res, { success: true });
    }

    /**
     * Removes a tag from a score. An instrument tag whose instrument the score still uses stays.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleUnassignTag(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const resolved = await this.resolveAssignment(req, res);

        if (resolved === undefined) {
            return;
        }

        const { tag, scoreId } = resolved;

        if (TagAccess.systemKind(tag) === SystemTagKind.Instrument
            && await InstrumentTags.isInUse(this.ctx.auth.adapter, scoreId, tag.id)) {
            this.ctx.sendError(res, `The score still uses the instrument of "${tag.name}".`, 409);

            return;
        }

        await this.ctx.auth.adapter.execute("DELETE FROM score_tags WHERE score_id = ? AND tag_id = ?",
            [scoreId, tag.id]);

        this.ctx.sendJson(res, { success: true });
    }

    /**
     * Lists the scores a tag combination matches. Every group is an AND, the groups are OR-ed, and an empty
     * combination returns every readable score.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleListScores(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await this.ctx.readJsonBody(req);
        const groups = await this.effectiveFilterGroups(req, body.groups);

        if (groups === undefined) {
            this.ctx.sendError(res, "Invalid tag combination");

            return;
        }

        const user = this.ctx.getAuthUser(req);
        const scores = await this.readableScores(user, groups);

        if (scores.length === 0) {
            this.ctx.sendJson(res, { scores: [] });

            return;
        }

        const summaries = await this.ctx.auth.getPermissionSummaries(user, EntityType.Score,
            scores.map((score) => {
                return score.id;
            }));

        const context = await TagAccess.contextFor(this.ctx.auth, user);
        const usableIds = new Set((await this.usableTags(context)).map((tag) => {
            return tag.id;
        }));
        const tagIds = await this.tagIdsPerScore(scores.map((score) => {
            return score.id;
        }), usableIds);

        const entries = scores.map((score) => {
            const summary = summaries.get(score.id)!;

            return {
                id: score.id,
                name: score.name,
                tagIds: tagIds.get(score.id) ?? [],
                perm: summary,
            };
        });

        this.ctx.sendJson(res, { scores: entries });
    }

    /**
     * @param context The rules of the caller.
     * @param tag The tag to describe.
     * @param groupNames The group names, keyed by id.
     * @param usageCount How many readable scores carry the tag.
     *
     * @returns The tag as the client expects it.
     */
    private static tagJson(context: ITagAccessContext, tag: ITagRow, groupNames: Map<number, string>,
        usageCount: number): ITagJson {
        const groupId = tag.groupId ?? undefined;

        return {
            id: tag.id,
            name: tag.name,
            colorIndex: tag.colorIndex,
            groupId,
            groupName: groupId === undefined ? undefined : groupNames.get(groupId),
            systemKind: TagAccess.systemKind(tag),
            instrumentTypeId: TagAccess.instrumentTypeId(tag),
            editable: TagAccess.owns(context, tag),
            assignable: TagAccess.canAssign(context, tag),
            usageCount,
        };
    }

    /**
     * @param value A request field that names an id.
     *
     * @returns The id, or undefined when the field is missing or not a positive integer.
     */
    private static optionalId(value: unknown): number | undefined {
        if (value === undefined || value === null || value === "") {
            return undefined;
        }

        const id = Number(value);

        return Number.isInteger(id) && id > 0 ? id : undefined;
    }

    /**
     * @param tagId The id of a tag that was just created.
     *
     * @returns The palette colour a new tag gets when the caller named none. Consecutive ids land on different
     * colours, so the tags of one owner stay tellable apart.
     */
    private static colourIndexForId(tagId: number): number {
        return tagId % TagPalette.count;
    }

    /**
     * Reads a tag name from a request and checks every rule a stored name has to meet. Writes the error response
     * itself when a rule does not hold.
     *
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
            this.ctx.sendError(res, "A tag name must be valid Unicode.");

            return undefined;
        }

        if (NameText.codePointCount(name) > TagAccess.maxNameLength) {
            this.ctx.sendError(res, `A tag name may hold at most ${TagAccess.maxNameLength} characters.`);

            return undefined;
        }

        return name;
    }

    /**
     * Reads the score and the tag of an assign request and checks every rule that guards the change. Writes the
     * error response itself when a rule does not hold.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     *
     * @returns The score id and the tag, or undefined when the response is already written.
     */
    private async resolveAssignment(req: IncomingMessage,
        res: ServerResponse): Promise<{ scoreId: number; tag: ITagRow; } | undefined> {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Authentication required.", 401);

            return undefined;
        }

        const body = await this.ctx.readJsonBody(req);
        const scoreId = TagActions.optionalId(body.scoreId);
        const tagId = TagActions.optionalId(body.tagId);

        if (scoreId === undefined || tagId === undefined) {
            this.ctx.sendError(res, "scoreId and tagId required");

            return undefined;
        }

        const context = await TagAccess.contextFor(this.ctx.auth, user);
        const tag = await this.tagById(tagId);

        // An unusable tag answers 404 like an unknown one, so its existence does not leak.
        if (tag === undefined || !TagAccess.canUse(context, tag)) {
            this.ctx.sendError(res, "Tag not found", 404);

            return undefined;
        }

        const scores = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM scores WHERE id = ?", [scoreId],
        );

        if (scores.length === 0) {
            this.ctx.sendError(res, "Score not found", 404);

            return undefined;
        }

        const allowed = TagAccess.systemKind(tag) === SystemTagKind.Demo
            ? context.isAdmin
            : await this.ctx.auth.checkPermission(user, EntityType.Score, scoreId, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return undefined;
        }

        if (await ScoreLock.heldByOther(this.ctx.auth.adapter, scoreId, user.userId)) {
            this.ctx.sendError(res, "Score is locked by another user. Refresh and try again.", 409);

            return undefined;
        }

        return { scoreId, tag };
    }

    /**
     * Drops the tag ids the caller cannot use from a combination and drops the groups that become empty that way.
     *
     * @param req The incoming HTTP request.
     * @param rawGroups The `groups` value of the request body.
     *
     * @returns The effective groups, or undefined when the request is not a valid combination.
     */
    private async effectiveFilterGroups(req: IncomingMessage, rawGroups: unknown): Promise<number[][] | undefined> {
        if (rawGroups === undefined) {
            return [];
        }

        if (!Array.isArray(rawGroups) || rawGroups.length > TagActions.maxFilterGroups) {
            return undefined;
        }

        const context = await TagAccess.contextFor(this.ctx.auth, this.ctx.getAuthUser(req));
        const usableIds = new Set((await this.usableTags(context)).map((tag) => {
            return tag.id;
        }));

        const groups: number[][] = [];
        for (const rawGroup of rawGroups) {
            if (!Array.isArray(rawGroup) || rawGroup.length > TagActions.maxFilterTagsPerGroup) {
                return undefined;
            }

            const group = rawGroup.map((value) => {
                return Number(value);
            }).filter((value) => {
                return Number.isInteger(value) && usableIds.has(value);
            });

            if (group.length > 0) {
                groups.push(Array.from(new Set(group)));
            }
        }

        return groups;
    }

    /**
     * @param user The authenticated caller, or undefined for a visitor.
     * @param groups The effective AND groups of a combination; empty for every readable score.
     *
     * @returns The readable scores the combination matches, ordered by name.
     */
    private async readableScores(user: ITokenPayload | undefined,
        groups: number[][]): Promise<Array<{ id: number; name: string; }>> {
        const conditions: string[] = [];
        const params: unknown[] = [];

        for (const group of groups) {
            const placeholders = group.map(() => {
                return "?";
            }).join(", ");

            conditions.push(`s.id IN (SELECT score_id FROM score_tags WHERE tag_id IN (${placeholders}) `
                + "GROUP BY score_id HAVING COUNT(DISTINCT tag_id) = ?)");
            params.push(...group, group.length);
        }

        const where = conditions.length === 0 ? "" : ` WHERE ${conditions.join(" OR ")}`;
        const rows = await this.ctx.auth.adapter.query<{ id: number; name: string; }>(
            `SELECT s.id, s.name FROM scores s${where}`, params,
        );

        const summaries = await this.ctx.auth.getPermissionSummaries(user, EntityType.Score, rows.map((row) => {
            return row.id;
        }));

        return rows.filter((row) => {
            return summaries.get(row.id)?.canRead ?? false;
        }).sort((left, right) => {
            return NameText.compare(left.name, right.name);
        });
    }

    /**
     * @param user The authenticated caller, or undefined for a visitor.
     * @param tagIds The tags to count.
     *
     * @returns How many scores the caller can read carry each tag.
     */
    private async usageCounts(user: ITokenPayload | undefined, tagIds: number[]): Promise<Map<number, number>> {
        const counts = new Map<number, number>();

        if (tagIds.length === 0) {
            return counts;
        }

        const readable = new Set((await this.readableScores(user, [])).map((score) => {
            return score.id;
        }));

        const placeholders = tagIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await this.ctx.auth.adapter.query<{ tagId: number; scoreId: number; }>(
            `SELECT tag_id AS tagId, score_id AS scoreId FROM score_tags WHERE tag_id IN (${placeholders})`,
            tagIds,
        );

        for (const row of rows) {
            if (!readable.has(row.scoreId)) {
                continue;
            }

            counts.set(row.tagId, (counts.get(row.tagId) ?? 0) + 1);
        }

        return counts;
    }

    /**
     * @param scoreIds The scores to look at.
     * @param usableIds The tag ids the caller can use; everything else stays invisible.
     *
     * @returns The usable tag ids of every score.
     */
    private async tagIdsPerScore(scoreIds: number[], usableIds: Set<number>): Promise<Map<number, number[]>> {
        const result = new Map<number, number[]>();

        if (scoreIds.length === 0) {
            return result;
        }

        const placeholders = scoreIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await this.ctx.auth.adapter.query<{ scoreId: number; tagId: number; }>(
            `SELECT score_id AS scoreId, tag_id AS tagId FROM score_tags WHERE score_id IN (${placeholders})`,
            scoreIds,
        );

        for (const row of rows) {
            if (!usableIds.has(row.tagId)) {
                continue;
            }

            const ids = result.get(row.scoreId) ?? [];
            ids.push(row.tagId);
            result.set(row.scoreId, ids);
        }

        return result;
    }

    /**
     * @param context The rules of the caller.
     *
     * @returns The tags the caller can use.
     */
    private async usableTags(context: ITagAccessContext): Promise<ITagRow[]> {
        if (!context.isSignedIn) {
            return [];
        }

        const tags = await this.ctx.auth.adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, group_id AS groupId, "
            + "system_key AS systemKey FROM tags", [],
        );

        return tags.filter((tag) => {
            return TagAccess.canUse(context, tag);
        });
    }

    /**
     * @param context The rules of the caller.
     * @param name The name to look for.
     *
     * @returns The tag with that name the caller can use, if there is one. The name is compared by the column
     * collation, which ignores case.
     */
    private async usableTagNamed(context: ITagAccessContext, name: string): Promise<ITagRow | undefined> {
        const rows = await this.ctx.auth.adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, group_id AS groupId, "
            + "system_key AS systemKey FROM tags WHERE name = ?", [name],
        );

        return rows.find((tag) => {
            return TagAccess.canUse(context, tag);
        });
    }

    /**
     * @param tagId The tag to read.
     *
     * @returns The tag, or undefined when there is none with that id.
     */
    private async tagById(tagId: number): Promise<ITagRow | undefined> {
        const rows = await this.ctx.auth.adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, group_id AS groupId, "
            + "system_key AS systemKey FROM tags WHERE id = ?", [tagId],
        );

        return rows.length > 0 ? rows[0] : undefined;
    }

    /**
     * @returns The names of all groups, keyed by id, for the owner caption of a tag.
     */
    private async groupNames(): Promise<Map<number, string>> {
        const rows = await this.ctx.auth.adapter.query<{ id: number; name: string; }>(
            "SELECT id, name FROM `groups`",
        );

        return new Map(rows.map((row) => {
            return [row.id, row.name] as [number, string];
        }));
    }
}
