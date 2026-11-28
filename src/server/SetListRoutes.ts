/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { NameText } from "../core/NameText.js";
import { isSetListIconKey } from "../core/SetListIcons.js";
import { setListEntryNoteLimit } from "../core/DatabaseTypes.js";
import { TagPalette } from "../core/TagPalette.js";
import { EntityType, type ITokenPayload } from "./Auth.js";
import type { IDbStatement } from "./database.js";
import { type RequestContext } from "./RequestContext.js";
import { SetListAccess, type ISetListRights, type ISetListRow } from "./SetListAccess.js";
import { SetListMembership } from "./SetListMembership.js";
import { SetListOrder } from "./SetListOrder.js";
import { ScoreEntries, type IScoreEntryJson } from "./ScoreEntries.js";
import { TagAccess, type ITagAccessContext, type ITagRow } from "./TagAccess.js";
import { TagFilter, TagFilterProblem } from "./TagFilter.js";

/** A score of a set list as the client receives it: the card's description plus what the list added to the entry. */
interface ISetListScoreJson extends IScoreEntryJson {
    /** The description the entry carries in this list, if it has one. */
    note?: string;

    /** The key of the icon the entry shows, if its author picked one. */
    icon?: string;
}

/** A set list as the client receives it. */
interface ISetListJson {
    id: number;
    name: string;
    tagId: number;
    revision: number;

    /** How many member scores the caller may read, which is what the selector's pill shows. */
    memberCount: number;

    /** The groups the list is granted to, with the write flag the permission rows hold. */
    groups: Array<{ groupId: number; writable: boolean; }>;

    /** The owner of the list, exactly as a score has one. */
    ownerId?: number;
    ownerName?: string;

    /** Whether the caller may change the list. */
    editable: boolean;

    /** Whether the caller may grant the list to groups: its owner and the administrators. */
    managesAccess: boolean;
}

/**
 * The handlers behind the set-list actions. A set list is defined by one tag: a score belongs to it while that tag is
 * assigned, so the list copies no score and grants no score access. A list belongs to the administrator who created
 * it, sharing it with a group grants reading only, and the administrators of the instance reach every list; the rules
 * themselves live in `SetListAccess`. These handlers
 * own the list itself - its name, its group grants, its revision and its saved order. `SetListMembership` resolves
 * which scores it holds and `SetListOrder` how they are placed, so neither a grant nor an order can widen what a
 * caller may see.
 */
export class SetListRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    /**
     * Lists the set lists the caller may select, with the number of member scores they may read.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleListSetLists(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const rows = await this.ctx.auth.adapter.query<ISetListRow>(
            "SELECT id, tag_id AS tagId, revision FROM set_lists", [],
        );

        const tags = await this.tagRows(rows.map((row) => {
            return row.tagId;
        }));
        const shares = await this.sharingRows();
        const owners = await this.ownerRows();
        const access = await SetListAccess.rights(this.ctx.auth, user, rows.map((row) => {
            return row.id;
        }));
        const counts = await this.memberCounts(user, rows, tags, access);

        const entries: ISetListJson[] = [];
        for (const row of rows) {
            const tag = tags.get(row.tagId);
            const rights = access.get(row.id);
            if (tag === undefined || rights === undefined) {
                continue;
            }

            const owner = owners.get(row.id);

            entries.push(this.listJson(row, tag, rights.editable, rights.editable,
                shares.get(row.id) ?? [], owner?.ownerId, counts.get(row.id) ?? 0, owner?.ownerName));
        }

        entries.sort((left, right) => {
            return NameText.compare(left.name, right.name);
        });

        this.ctx.sendJson(res, {
            setLists: entries,
            readableScoreCount: await this.readableScoreCount(user),
            canCreate: SetListRoutes.createsLists(await TagAccess.contextFor(this.ctx.auth, user)),
        });
    }

    /**
     * Reads one set list with its scores: the visible members in the list's saved order, narrowed by the optional
     * manual filter. Scores the caller cannot read stay out of the result and never influence its count.
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

        const entry = await SetListAccess.load(this.ctx.auth.adapter, listId);
        const access = user === undefined
            ? new Map<number, ISetListRights>()
            : await SetListAccess.rights(this.ctx.auth, user, [listId]);
        const rights = access.get(listId);
        if (entry === undefined || user === undefined || rights === undefined) {
            this.ctx.sendError(res, "Set list not found", 404);

            return;
        }

        const sharedGroups = await SetListAccess.sharedGroups(this.ctx.auth, listId);
        const ownerId = await this.ctx.auth.getExplicitOwner(EntityType.SetList, listId) ?? undefined;
        const ownerName = await this.ownerName(ownerId);

        const extraGroups = body.groups === undefined ? TagFilter.empty : TagFilter.readGroups(body.groups);
        if (extraGroups === undefined) {
            this.ctx.sendError(res, "Invalid tag combination");

            return;
        }

        const extraProblem = await TagFilter.problem(this.ctx.auth, user, extraGroups);
        if (extraProblem !== undefined) {
            this.sendFilterProblem(res, extraProblem);

            return;
        }

        const storedIds = await this.scoreOrder(listId);

        // The count belongs to the list itself, not to the manual filter the caller currently uses.
        const members = await SetListMembership.resolve(this.ctx.auth, user, storedIds, entry.tag.id, TagFilter.empty);
        const membership = extraGroups.length === 0
            ? members
            : await SetListMembership.resolve(this.ctx.auth, user, storedIds, entry.tag.id, extraGroups);
        const scores = await ScoreEntries.list(this.ctx.auth, user, membership.visible);
        const entries = await this.entryNotes(listId);
        const described = scores.map((score): ISetListScoreJson => {
            const extra = entries.get(score.id);

            return extra === undefined ? score : { ...score, ...extra };
        });
        const json = this.listJson(entry.row, entry.tag, rights.editable, rights.editable, sharedGroups, ownerId,
            members.visible.length, ownerName);

        this.ctx.sendJson(res, { ...json, scores: described });
    }

    /**
     * Stores the description and the icon of one entry. They belong to the entry, not to the score, so the same score
     * may read differently in two lists. The order and the revision stay untouched.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleSaveSetListEntry(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const listId = body.id !== undefined ? Number(body.id) : undefined;
        const scoreId = body.scoreId !== undefined ? Number(body.scoreId) : undefined;

        if (listId === undefined || !Number.isInteger(listId)
            || scoreId === undefined || !Number.isInteger(scoreId)) {
            this.ctx.sendError(res, "id and scoreId required");

            return;
        }

        const note = String(body.note ?? "").trim();
        if (NameText.codePointCount(note) > setListEntryNoteLimit) {
            this.ctx.sendError(res, `A note may hold at most ${setListEntryNoteLimit} characters.`);

            return;
        }

        // An icon the catalogue does not know is refused instead of stored, so no entry ends up without an
        // appearance after the catalogue changed.
        const icon = body.icon ?? undefined;
        if (icon !== undefined && !isSetListIconKey(icon)) {
            this.ctx.sendError(res, "Unknown icon.");

            return;
        }

        const allowed = await SetListAccess.canEdit(this.ctx.auth, user, listId);
        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const rows = await this.ctx.auth.adapter.query<{ scoreId: number; }>(
            "SELECT score_id AS scoreId FROM set_list_scores WHERE set_list_id = ? AND score_id = ?",
            [listId, scoreId],
        );

        if (rows.length === 0) {
            this.ctx.sendError(res, "The score is not part of this set list.", 404);

            return;
        }

        await this.ctx.auth.adapter.execute(
            "UPDATE set_list_scores SET note = ?, icon = ? WHERE set_list_id = ? AND score_id = ?",
            [note.length === 0 ? null : note, icon ?? null, listId, scoreId],
        );

        this.ctx.sendJson(res, { success: true });
    }

    /**
     * Stores the order a caller wants for the members it can read. Members it cannot read keep their places, so
     * nothing is lost when only a part of the list is visible. The revision has to be the stored one, so two people
     * cannot overwrite each other's order.
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

        const allowed = await SetListAccess.canEdit(this.ctx.auth, user, listId);
        const entry = allowed ? await SetListAccess.load(this.ctx.auth.adapter, listId) : undefined;
        if (!allowed || entry === undefined) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (entry.row.revision !== revision) {
            this.sendConflict(res, entry.row.revision);

            return;
        }

        const storedIds = await this.scoreOrder(listId);
        const membership = await SetListMembership.resolve(this.ctx.auth, user, storedIds, entry.tag.id,
            TagFilter.empty);

        // Reordering starts without a manual filter, so the submitted order names exactly the members the caller can
        // read. Anything else would silently move members the caller does not know about.
        const nextOrder = SetListOrder.applyVisibleOrder(membership.canonical, membership.visible, order);

        if (nextOrder === undefined) {
            this.ctx.sendJson(res, {
                error: "The order must name exactly the scores the list shows to you.",
                revision: entry.row.revision,
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
     * Creates a set list together with its tag. Only administrators create lists. A list and its tag are private to
     * their creator from the start: the tag sits in no catalogue, and the name only has to be free in the creator's
     * own namespace. Sharing with groups grants reading only, and each of those groups must not hold another list of
     * that name already - the check that keeps their lists tellable apart.
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
        if (name === undefined) {
            return;
        }

        const context = await TagAccess.contextFor(this.ctx.auth, user);
        if (!SetListRoutes.createsLists(context)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const sharedWith = SetListRoutes.readGroupIds(body.groups);
        if (sharedWith === undefined) {
            this.ctx.sendError(res, "Invalid groups");

            return;
        }

        // Sharing is a grant of the caller, so only the groups they answer for may receive it.
        const allowed = sharedWith.every((id) => {
            return context.isAdmin || context.adminGroupIds.includes(id);
        });
        if (!allowed || !await this.groupsExist(sharedWith)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const clash = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM tags WHERE name = ? AND name_user_scope = ? AND name_group_scope = 0",
            [name, user.userId],
        );

        if (clash.length > 0) {
            this.ctx.sendError(res, "You already own a set list with that name.", 409);

            return;
        }

        const conflicting = await SetListAccess.sharedNameConflict(this.ctx.auth.adapter, name, sharedWith);
        if (conflicting !== undefined) {
            this.ctx.sendError(res, `The group "${conflicting}" already holds a set list with that name.`, 409);

            return;
        }

        const ownerParams = [name, user.userId];
        const statements: IDbStatement[] = [
            {
                // The scope column mirrors the owner, which is what the unique key over the name runs on.
                sql: "INSERT INTO tags (name, color_index, owner_user_id, name_user_scope) VALUES (?, 0, ?, ?)",
                params: [name, user.userId, user.userId],
            },
            {
                // The list is created from the tag in the same transaction, so neither exists without the other.
                sql: "INSERT INTO set_lists (tag_id) SELECT id FROM tags WHERE name = ? AND owner_user_id = ?",
                params: ownerParams,
            },
            {
                sql: "UPDATE tags SET color_index = id % ? WHERE name = ? AND owner_user_id = ?",
                params: [TagPalette.count, ...ownerParams],
            },
            {
                // The creator owns the list, and nobody else reaches it until a group is granted reading access.
                sql: "INSERT INTO permissions (entity_type, entity_id, owner_id) "
                    + "SELECT ?, l.id, ? FROM set_lists l JOIN tags t ON t.id = l.tag_id "
                    + "WHERE t.name = ? AND t.owner_user_id = ? "
                    + "ON DUPLICATE KEY UPDATE owner_id = ?",
                params: [EntityType.SetList, user.userId, ...ownerParams, user.userId],
            },
        ];

        for (const sharedGroupId of sharedWith) {
            statements.push({
                sql: "INSERT INTO entity_groups (entity_type, entity_id, group_id, writable) "
                    + "SELECT ?, l.id, ?, 0 FROM set_lists l JOIN tags t ON t.id = l.tag_id "
                    + "WHERE t.name = ? AND t.owner_user_id = ?",
                params: [EntityType.SetList, sharedGroupId, ...ownerParams],
            });
        }

        await this.ctx.auth.adapter.executeTransaction(statements);

        const entries = await this.ctx.auth.adapter.query<ISetListRow>(
            "SELECT l.id, l.tag_id AS tagId, l.revision FROM set_lists l JOIN tags t ON t.id = l.tag_id "
            + "WHERE t.name = ? AND t.owner_user_id = ?", ownerParams,
        );

        this.ctx.sendJson(res, { success: true, id: entries[0]?.id, revision: entries[0]?.revision });
    }

    /**
     * Lists the groups a set list may be shared with. An administrator shares with any group, a group administrator
     * with the groups they administer, and everybody else with none - which is why the same call answers whether the
     * caller may create a list at all.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleListShareGroups(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const user = this.ctx.getAuthUser(req);
        const context = user === undefined
            ? undefined
            : await TagAccess.contextFor(this.ctx.auth, user);

        if (user === undefined || context === undefined || (!context.isAdmin && context.adminGroupIds.length === 0)) {
            this.ctx.sendJson(res, { groups: [] });

            return;
        }

        const rows = context.isAdmin
            ? await this.ctx.auth.adapter.query<{ id: number; name: string; }>(
                "SELECT id, name FROM `groups`", [])
            : await this.ctx.auth.adapter.query<{ id: number; name: string; }>(
                "SELECT id, name FROM `groups` WHERE admin_id = ?", [user.userId]);

        const groups = rows.map((row) => {
            return { id: row.id, name: row.name };
        }).sort((left, right) => {
            return NameText.compare(left.name, right.name);
        });

        this.ctx.sendJson(res, { groups });
    }

    /**
     * Renames a set list, which renames its tag. The revision the caller edited has to be the stored one, so two
     * people cannot overwrite each other's change.
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

        const allowed = await SetListAccess.canEdit(this.ctx.auth, user, listId);
        const entry = allowed ? await SetListAccess.load(this.ctx.auth.adapter, listId) : undefined;
        if (!allowed || entry === undefined) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (entry.row.revision !== revision) {
            this.sendConflict(res, entry.row.revision);

            return;
        }

        const name = this.storableName(res, body.name);
        if (name === undefined) {
            return;
        }

        const duplicate = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM tags WHERE name = ? AND name_user_scope = IFNULL(?, 0) "
            + "AND name_group_scope = IFNULL(?, 0) AND id != ?",
            [name, entry.tag.ownerUserId, entry.tag.ownerGroupId, entry.tag.id],
        );

        if (duplicate.length > 0) {
            this.ctx.sendError(res, "You already own a set list with that name.", 409);

            return;
        }

        // A group the list is shared with must not end up with two lists of this name either.
        const groups = (await SetListAccess.sharedGroups(this.ctx.auth, listId)).map((grant) => {
            return grant.groupId;
        });
        const conflicting = await SetListAccess.sharedNameConflict(this.ctx.auth.adapter, name, groups, listId);
        if (conflicting !== undefined) {
            this.ctx.sendError(res, `The group "${conflicting}" already holds a set list with that name.`, 409);

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

        await this.ctx.auth.adapter.execute("UPDATE tags SET name = ? WHERE id = ?", [name, entry.tag.id]);

        this.ctx.sendJson(res, { success: true, revision: revision + 1 });
    }

    /**
     * Deletes a set list by deleting its tag: the catalog loses the tag, the scores lose the assignment and the list
     * with its order and sharing goes with it.
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

        const allowed = await SetListAccess.canEdit(this.ctx.auth, user, listId);
        const entry = allowed ? await SetListAccess.load(this.ctx.auth.adapter, listId) : undefined;
        if (!allowed || entry === undefined) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const statements: IDbStatement[] = [
            { sql: "DELETE FROM tags WHERE id = ?", params: [entry.tag.id] },
            {
                sql: "DELETE FROM permissions WHERE entity_type = ? AND entity_id = ?",
                params: [EntityType.SetList, listId],
            },
            {
                sql: "DELETE FROM entity_groups WHERE entity_type = ? AND entity_id = ?",
                params: [EntityType.SetList, listId],
            },
        ];

        await this.ctx.auth.adapter.executeTransaction(statements);

        this.ctx.sendJson(res, { success: true });
    }

    /**
     * @param context The rules of the caller.
     *
     * @returns Whether the caller may create a set list at all: only an administrator of the installation or of a
     * group does.
     */
    private static createsLists(context: ITagAccessContext): boolean {
        return context.isSignedIn && (context.isAdmin || context.adminGroupIds.length > 0);
    }

    /**
     * @param value The `groups` field of a request body: the ids of the groups a list is shared with.
     *
     * @returns Those ids without repetitions, empty for a missing field, or undefined when the value is not a list of
     * positive integers.
     */
    private static readGroupIds(value: unknown): number[] | undefined {
        if (value === undefined || value === null) {
            return [];
        }

        if (!Array.isArray(value)) {
            return undefined;
        }

        const ids: number[] = [];
        for (const entry of value) {
            const id = Number(entry);
            if (!Number.isInteger(id) || id <= 0) {
                return undefined;
            }

            ids.push(id);
        }

        return Array.from(new Set(ids));
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
     * @param user The authenticated caller, or undefined for a visitor.
     *
     * @returns How many scores the caller may read, which is the count of the All Scores pill.
     */
    private async readableScoreCount(user: ITokenPayload | undefined): Promise<number> {
        const rows = await this.ctx.auth.adapter.query<{ id: number; }>("SELECT id FROM scores", []);
        const summaries = await this.ctx.auth.getPermissionSummaries(user, EntityType.Score, rows.map((row) => {
            return row.id;
        }));

        return rows.filter((row) => {
            return summaries.get(row.id)?.canRead === true;
        }).length;
    }

    /**
     * @returns The owner of every set list that has one, keyed by list id, with the name the dialog shows.
     */
    private async ownerRows(): Promise<Map<number, { ownerId: number; ownerName: string; }>> {
        const rows = await this.ctx.auth.adapter.query<{ entityId: number; ownerId: number; ownerName: string; }>(
            "SELECT p.entity_id AS entityId, p.owner_id AS ownerId, "
            + "COALESCE(NULLIF(u.display_name, ''), u.email) AS ownerName FROM permissions p "
            + "LEFT JOIN users u ON u.id = p.owner_id WHERE p.entity_type = ? AND p.owner_id IS NOT NULL",
            [EntityType.SetList],
        );

        return new Map(rows.map((row) => {
            return [row.entityId, { ownerId: row.ownerId, ownerName: row.ownerName }] as
                [number, { ownerId: number; ownerName: string; }];
        }));
    }

    /**
     * @param ownerId The owner in question.
     *
     * @returns The display name of that user, or undefined when the list has no owner.
     */
    private async ownerName(ownerId: number | undefined): Promise<string | undefined> {
        if (ownerId === undefined) {
            return undefined;
        }

        const rows = await this.ctx.auth.adapter.query<{ ownerName: string; }>(
            "SELECT COALESCE(NULLIF(display_name, ''), email) AS ownerName FROM users WHERE id = ?", [ownerId],
        );

        return rows.length > 0 ? rows[0].ownerName : undefined;
    }

    /**
     * @param groupIds The groups a list is to be shared with.
     *
     * @returns Whether every one of them names a stored group.
     */
    private async groupsExist(groupIds: readonly number[]): Promise<boolean> {
        if (groupIds.length === 0) {
            return true;
        }

        const placeholders = groupIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await this.ctx.auth.adapter.query<{ id: number; }>(
            `SELECT id FROM \`groups\` WHERE id IN (${placeholders})`, [...groupIds],
        );

        return rows.length === groupIds.length;
    }

    /**
     * @param tagIds The tags to read.
     *
     * @returns The tag rows, keyed by id.
     */
    private async tagRows(tagIds: number[]): Promise<Map<number, ITagRow>> {
        if (tagIds.length === 0) {
            return new Map();
        }

        const placeholders = tagIds.map(() => {
            return "?";
        }).join(", ");
        const rows = await this.ctx.auth.adapter.query<ITagRow>(
            "SELECT id, name, color_index AS colorIndex, owner_user_id AS ownerUserId, "
            + "owner_group_id AS ownerGroupId, system_key AS systemKey "
            + `FROM tags WHERE id IN (${placeholders})`, tagIds,
        );

        return new Map(rows.map((row) => {
            return [row.id, row] as [number, ITagRow];
        }));
    }

    /**
     * @returns The group grants of every set list, keyed by list id.
     */
    private async sharingRows(): Promise<Map<number, Array<{ groupId: number; writable: boolean; }>>> {
        const rows = await this.ctx.auth.adapter.query<{ entityId: number; groupId: number; writable: number; }>(
            "SELECT entity_id AS entityId, group_id AS groupId, writable FROM entity_groups WHERE entity_type = ?",
            [EntityType.SetList],
        );

        const result = new Map<number, Array<{ groupId: number; writable: boolean; }>>();
        for (const row of rows) {
            const groups = result.get(row.entityId) ?? [];
            groups.push({ groupId: row.groupId, writable: Boolean(row.writable) });
            result.set(row.entityId, groups);
        }

        return result;
    }

    /**
     * @param user The authenticated caller, or undefined for a visitor.
     * @param rows Every stored list; unreadable ones produce no count.
     * @param tags The tags of those lists, keyed by tag id.
     * @param listAccess The caller's access to those lists, keyed by list id.
     *
     * @returns How many members of each list the caller may read, keyed by list id.
     */
    private async memberCounts(user: ITokenPayload | undefined, rows: ISetListRow[], tags: Map<number, ITagRow>,
        listAccess: Map<number, ISetListRights>): Promise<Map<number, number>> {
        const readable = rows.filter((row) => {
            return tags.has(row.tagId) && listAccess.get(row.id)?.readable === true;
        });

        const counts = new Map<number, number>();
        if (readable.length === 0) {
            return counts;
        }

        const tagIds = readable.map((row) => {
            return row.tagId;
        });
        const placeholders = tagIds.map(() => {
            return "?";
        }).join(", ");
        const assignments = await this.ctx.auth.adapter.query<{ tagId: number; scoreId: number; }>(
            `SELECT tag_id AS tagId, score_id AS scoreId FROM score_tags WHERE tag_id IN (${placeholders})`, tagIds,
        );

        const scoreIds = Array.from(new Set(assignments.map((entry) => {
            return entry.scoreId;
        })));
        const summaries = await this.ctx.auth.getPermissionSummaries(user, EntityType.Score, scoreIds);

        for (const row of readable) {
            const members = assignments.filter((entry) => {
                return entry.tagId === row.tagId && summaries.get(entry.scoreId)?.canRead === true;
            });

            counts.set(row.id, members.length);
        }

        return counts;
    }

    /**
     * @param row The stored list.
     * @param tag The tag that defines it.
     * @param editable Whether the caller may change the list.
     * @param managesAccess Whether the caller may grant the list to groups.
     * @param groups The group grants of the list.
     * @param ownerId The owner of the list, if it has one.
     * @param memberCount How many members the caller may read.
     * @param ownerName The owner's display name, if it has one.
     *
     * @returns The list as the client receives it.
     */
    private listJson(row: ISetListRow, tag: ITagRow, editable: boolean, managesAccess: boolean,
        groups: Array<{ groupId: number; writable: boolean; }>, ownerId: number | undefined, memberCount: number,
        ownerName?: string): ISetListJson {
        return {
            id: row.id,
            name: tag.name,
            tagId: tag.id,
            revision: row.revision,
            memberCount,
            groups,
            ownerId,
            ownerName,
            editable,
            managesAccess,
        };
    }

    /**
     * @param listId The list to read the descriptions of.
     *
     * @returns What each entry of that list carries beyond the score itself, keyed by score id. Entries without a
     * description and without an icon are left out.
     */
    private async entryNotes(listId: number): Promise<Map<number, { note?: string; icon?: string; }>> {
        const rows = await this.ctx.auth.adapter.query<{ scoreId: number; note: string | null; icon: string | null; }>(
            "SELECT score_id AS scoreId, note, icon FROM set_list_scores WHERE set_list_id = ?", [listId],
        );

        const result = new Map<number, { note?: string; icon?: string; }>();
        for (const row of rows) {
            const note = row.note ?? undefined;
            const icon = row.icon ?? undefined;
            if (note !== undefined || icon !== undefined) {
                result.set(row.scoreId, { note, icon });
            }
        }

        return result;
    }

    /**
     * @param listId The list to read the order of.
     *
     * @returns The ids the list knows, in its saved order.
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

    private sendFilterProblem(res: ServerResponse, problem: TagFilterProblem): void {
        this.ctx.sendJson(res, { error: TagFilter.problemMessage(problem), filterProblem: problem }, 409);
    }

    private sendConflict(res: ServerResponse, revision: number): void {
        this.ctx.sendJson(res, { error: "The set list was changed in the meantime.", conflict: true, revision }, 409);
    }
}
