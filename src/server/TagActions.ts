/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { NameText } from "../core/NameText.js";
import { TagCombination } from "../core/TagCombination.js";
import { TagPalette } from "../core/TagPalette.js";
import { AccessLevel, EntityType, type ITokenPayload } from "./Auth.js";
import { InstrumentTags } from "./InstrumentTags.js";
import { type RequestContext } from "./RequestContext.js";
import { ScoreEntries } from "./ScoreEntries.js";
import { SetListAccess } from "./SetListAccess.js";
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

    /** The set list this tag defines; absent for an ordinary metadata tag. */
    setListId?: number;

    editable: boolean;
    assignable: boolean;
    usageCount: number;
}

/**
 * What reading a requested combination yields: the groups the backend can use, and the tag ids it had to leave
 * out. A filter is never widened silently, so a dropped id turns the request into an explicit rejection.
 */
interface IFilterReading {
    groups: number[][];

    /** Tag ids the caller cannot use, whether they are unknown or belong to a scope the caller has no access to. */
    ignoredTagIds: number[];
}

/**
 * The handlers behind the tag and score-list actions. `Router` dispatches to them by `?action=`, so this class is
 * the tag counterpart of `ScoreRoutes`: it serves the tag catalogue, the assignments and the score list that a tag
 * combination matches. The rules themselves live in `TagAccess`; these handlers enforce them and build the JSON.
 */
export class TagActions {
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
        const setListIds = await SetListAccess.listIdsByTag(this.ctx.auth.adapter);
        const writableTagIds = await this.writableSetListTags(user);
        const usage = await this.usageCounts(user, usable.map((tag) => {
            return tag.id;
        }));

        const entries = usable.map((tag) => {
            return TagActions.tagJson(context, tag, groupNames, setListIds, writableTagIds, usage.get(tag.id) ?? 0);
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

        // An administrator may create tags in every scope, a group administrator only in the groups they administer.
        const groupIds = context.isAdmin
            ? (await this.ctx.auth.adapter.query<{ id: number; }>("SELECT id FROM `groups`", [])).map((row) => {
                return row.id;
            })
            : context.adminGroupIds;

        for (const groupId of groupIds) {
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
            const setListIds = await SetListAccess.listIdsByTag(this.ctx.auth.adapter);
            const writableTagIds = await this.writableSetListTags(user);
            this.ctx.sendJson(res, {
                success: true, created: false,
                tag: TagActions.tagJson(context, existing, await this.groupNames(), setListIds, writableTagIds, 0),
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
            tag: TagActions.tagJson(context, created, await this.groupNames(),
                await SetListAccess.listIdsByTag(this.ctx.auth.adapter), await this.writableSetListTags(user), 0)
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
        const setListIds = await SetListAccess.listIdsByTag(this.ctx.auth.adapter);
        const writableTagIds = await this.writableSetListTags(this.ctx.getAuthUser(req));

        if (!TagActions.mayManage(context, tag, setListIds, writableTagIds)) {
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

        const previousName = tag.name;

        await this.ctx.auth.adapter.execute("UPDATE tags SET name = ?, color_index = ? WHERE id = ?",
            [name, colourIndex, tagId]);

        // A set list carries its tag's name, so renaming the tag renames the list and is a change of the list.
        const listId = setListIds.get(tagId);
        if (listId !== undefined && name !== previousName) {
            await this.ctx.auth.adapter.execute("UPDATE set_lists SET revision = revision + 1 WHERE id = ?", [listId]);
        }

        const updated = await this.tagById(tagId);
        const tagJson = updated === undefined
            ? undefined
            : TagActions.tagJson(context, updated, await this.groupNames(), setListIds, writableTagIds, 0);

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
        const setListIds = await SetListAccess.listIdsByTag(this.ctx.auth.adapter);
        const writableTagIds = await this.writableSetListTags(this.ctx.getAuthUser(req));

        if (!TagActions.mayManage(context, tag, setListIds, writableTagIds)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (tag.systemKey !== null) {
            this.ctx.sendError(res, "System tags cannot be deleted.", 409);

            return;
        }

        const list = await SetListAccess.forTag(this.ctx.auth.adapter, tagId);
        if (list === undefined) {
            await this.ctx.auth.adapter.execute("DELETE FROM tags WHERE id = ?", [tagId]);

            this.ctx.sendJson(res, { success: true });

            return;
        }

        // Deleting a set-list tag deletes the list with it. The tag, its assignments and the list rows vanish through
        // their foreign keys; the sharing rows carry no key, so they are removed here in the same transaction.
        await this.ctx.auth.adapter.executeTransaction([
            { sql: "DELETE FROM tags WHERE id = ?", params: [tagId] },
            {
                sql: "DELETE FROM permissions WHERE entity_type = ? AND entity_id = ?",
                params: [EntityType.SetList, list.id],
            },
            {
                sql: "DELETE FROM entity_groups WHERE entity_type = ? AND entity_id = ?",
                params: [EntityType.SetList, list.id],
            },
        ]);

        this.ctx.sendJson(res, { success: true, setListId: list.id });
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

        const { tag, scoreId } = resolved;

        // An instrument tag follows the tracks of the score and is maintained by the backend; it is never assigned
        // by hand, even though its global scope makes it an administrator's tag.
        if (TagAccess.systemKind(tag) === SystemTagKind.Instrument) {
            this.ctx.sendError(res, "Instrument tags follow the tracks of a score and cannot be assigned.", 400);

            return;
        }

        const list = await SetListAccess.forTag(this.ctx.auth.adapter, tag.id);
        if (list === undefined) {
            await this.ctx.auth.adapter.execute("INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES (?, ?)",
                [scoreId, tag.id]);

            this.ctx.sendJson(res, { success: true });

            return;
        }

        await this.assignSetListMember(list.id, scoreId, tag.id);

        this.ctx.sendJson(res, { success: true, setListId: list.id });
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

        const list = await SetListAccess.forTag(this.ctx.auth.adapter, tag.id);
        if (list === undefined) {
            await this.ctx.auth.adapter.execute("DELETE FROM score_tags WHERE score_id = ? AND tag_id = ?",
                [scoreId, tag.id]);

            this.ctx.sendJson(res, { success: true });

            return;
        }

        await this.unassignSetListMember(list.id, scoreId, tag.id);

        this.ctx.sendJson(res, { success: true, setListId: list.id });
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
        const reading = await this.effectiveFilterGroups(req, body.groups);

        if (reading === undefined) {
            this.ctx.sendError(res, "Invalid tag combination");

            return;
        }

        // A tag the caller cannot use would narrow the request. Answering with the scores that remain would show a
        // wider list than asked for, so the request is rejected instead.
        if (reading.ignoredTagIds.length > 0) {
            this.ctx.sendJson(res, {
                error: "The filter names tags that are not available.",
                ignoredTagIds: reading.ignoredTagIds,
            }, 409);

            return;
        }

        const user = this.ctx.getAuthUser(req);
        const scores = await this.readableScores(user, reading.groups);
        const entries = await ScoreEntries.list(this.ctx.auth, user, scores.map((score) => {
            return score.id;
        }));

        this.ctx.sendJson(res, { scores: entries });
    }

    /**
     * @param context The rules of the caller.
     * @param tag The tag in question.
     * @param setListIds The list id of every set-list tag, keyed by tag id.
     * @param writableTagIds The set-list tags whose list the caller may change.
     *
     * @returns Whether the caller may rename or delete the tag. A set-list tag follows the list permission model,
     * so its owner and the groups with write access reach it; an ordinary tag follows its owner scope.
     */
    private static mayManage(context: ITagAccessContext, tag: ITagRow, setListIds: Map<number, number>,
        writableTagIds: ReadonlySet<number>): boolean {
        if (setListIds.has(tag.id)) {
            return writableTagIds.has(tag.id);
        }

        return TagAccess.owns(context, tag);
    }

    /**
     * @param context The rules of the caller.
     * @param tag The tag to describe.
     * @param groupNames The group names, keyed by id.
     * @param setListIds The list id of every set-list tag, keyed by tag id.
     * @param writableTagIds The set-list tags whose list the caller may change.
     * @param usageCount How many readable scores carry the tag.
     *
     * @returns The tag as the client expects it.
     */
    private static tagJson(context: ITagAccessContext, tag: ITagRow, groupNames: Map<number, string>,
        setListIds: Map<number, number>, writableTagIds: ReadonlySet<number>,
        usageCount: number): ITagJson {
        const groupId = tag.groupId ?? undefined;

        const setListId = setListIds.get(tag.id);
        const editable = TagActions.mayManage(context, tag, setListIds, writableTagIds);
        const assignable = setListId === undefined ? TagAccess.canAssign(context, tag) : editable;

        return {
            id: tag.id,
            name: tag.name,
            colorIndex: tag.colorIndex,
            groupId,
            groupName: groupId === undefined ? undefined : groupNames.get(groupId),
            systemKind: TagAccess.systemKind(tag),
            instrumentTypeId: TagAccess.instrumentTypeId(tag),
            setListId,
            editable,
            assignable,
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
     * @param user The authenticated caller, or undefined for a visitor.
     *
     * @returns The ids of the set-list tags whose list the caller may change, which is what managing the tag needs.
     */
    private async writableSetListTags(user: ITokenPayload | undefined): Promise<Set<number>> {
        const listIds = await SetListAccess.listIdsByTag(this.ctx.auth.adapter);
        const summaries = await this.ctx.auth.getPermissionSummaries(user, EntityType.SetList,
            Array.from(listIds.values()));

        const writable = new Set<number>();
        for (const [tagId, listId] of listIds) {
            if (summaries.get(listId)?.canWrite === true) {
                writable.add(tagId);
            }
        }

        return writable;
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

        // A score the caller cannot read answers like an unknown one, so tagging never touches invisible content.
        const readable = await this.ctx.auth.checkPermission(user, EntityType.Score, scoreId, AccessLevel.Read);

        if (scores.length === 0 || !readable) {
            this.ctx.sendError(res, "Score not found", 404);

            return undefined;
        }

        // A tag is its own entity: changing it on a score needs the right to manage the tag's scope, not the score.
        // A set-list tag follows the list, so its owner and the groups with write access may assign it.
        const list = await SetListAccess.forTag(this.ctx.auth.adapter, tag.id);
        const mayAssign = list === undefined
            ? TagAccess.canAssign(context, tag)
            : await SetListAccess.canEdit(this.ctx.auth, user, list.id);

        if (!mayAssign) {
            this.ctx.sendError(res, "Forbidden", 403);

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
    private async effectiveFilterGroups(req: IncomingMessage, rawGroups: unknown): Promise<IFilterReading | undefined> {
        if (rawGroups === undefined) {
            return { groups: [], ignoredTagIds: [] };
        }

        if (!Array.isArray(rawGroups) || rawGroups.length > TagCombination.maxGroups) {
            return undefined;
        }

        const context = await TagAccess.contextFor(this.ctx.auth, this.ctx.getAuthUser(req));
        const usableIds = new Set((await this.usableTags(context)).map((tag) => {
            return tag.id;
        }));

        const groups: number[][] = [];
        const ignoredTagIds: number[] = [];
        for (const rawGroup of rawGroups) {
            if (!Array.isArray(rawGroup) || rawGroup.length > TagCombination.maxTagsPerGroup) {
                return undefined;
            }

            const ids: number[] = [];
            for (const value of rawGroup) {
                const tagId = Number(value);

                // A malformed id would drop out of the group and widen the request, so it is rejected instead.
                if (!Number.isInteger(tagId) || tagId <= 0) {
                    return undefined;
                }

                ids.push(tagId);
            }

            for (const tagId of ids) {
                if (!usableIds.has(tagId)) {
                    ignoredTagIds.push(tagId);
                }
            }

            const group = ids.filter((value) => {
                return usableIds.has(value);
            });

            if (group.length > 0) {
                groups.push(Array.from(new Set(group)));
            }
        }

        return { groups, ignoredTagIds: Array.from(new Set(ignoredTagIds)) };
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
     * Adds a score to a set list: the tag assignment and the appended place are stored together, so the list never
     * holds a member without a position. A score that already carries the tag keeps its place.
     *
     * @param listId The list of the assigned tag.
     * @param scoreId The score that receives the tag.
     * @param tagId The set-list tag.
     */
    private async assignSetListMember(listId: number, scoreId: number, tagId: number): Promise<void> {
        const assigned = await this.ctx.auth.adapter.query<{ scoreId: number; }>(
            "SELECT score_id AS scoreId FROM score_tags WHERE score_id = ? AND tag_id = ?", [scoreId, tagId],
        );

        if (assigned.length > 0) {
            return;
        }

        // A newly tagged score is appended; the position is read before the transaction so the insert stays a
        // single statement. A tie can only come from two simultaneous assignments and is broken by the score id.
        const rows = await this.ctx.auth.adapter.query<{ position: number; }>(
            "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM set_list_scores WHERE set_list_id = ?", [listId],
        );
        const position = rows[0]?.position ?? 1;

        await this.ctx.auth.adapter.executeTransaction([
            { sql: "INSERT IGNORE INTO score_tags (score_id, tag_id) VALUES (?, ?)", params: [scoreId, tagId] },
            {
                sql: "INSERT IGNORE INTO set_list_scores (set_list_id, score_id, position) VALUES (?, ?, ?)",
                params: [listId, scoreId, position],
            },
            { sql: "UPDATE set_lists SET revision = revision + 1 WHERE id = ?", params: [listId] },
        ]);
    }

    /**
     * Removes a score from a set list: the tag assignment and the place go together, so a score that is tagged
     * again later starts at the end.
     *
     * @param listId The list of the removed tag.
     * @param scoreId The score that loses the tag.
     * @param tagId The set-list tag.
     */
    private async unassignSetListMember(listId: number, scoreId: number, tagId: number): Promise<void> {
        const assigned = await this.ctx.auth.adapter.query<{ scoreId: number; }>(
            "SELECT score_id AS scoreId FROM score_tags WHERE score_id = ? AND tag_id = ?", [scoreId, tagId],
        );

        if (assigned.length === 0) {
            return;
        }

        await this.ctx.auth.adapter.executeTransaction([
            {
                sql: "DELETE FROM score_tags WHERE score_id = ? AND tag_id = ?", params: [scoreId, tagId],
            },
            {
                sql: "DELETE FROM set_list_scores WHERE set_list_id = ? AND score_id = ?", params: [listId, scoreId],
            },
            { sql: "UPDATE set_lists SET revision = revision + 1 WHERE id = ?", params: [listId] },
        ]);
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
