/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { TagPalette } from "../core/TagPalette.js";
import { Auth, EntityType, isValidEntityType } from "./Auth.js";
import type { IDbStatement } from "./database.js";
import { EmailConfirmation } from "./EmailConfirmation.js";
import { ConfirmationReason } from "./Mailer.js";
import { type RequestContext } from "./RequestContext.js";
import { SetListAccess } from "./SetListAccess.js";

export class AdminRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    public async handleListUsers(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user || !(await this.ctx.auth.isUserInAdminGroup(user.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const rows = await this.ctx.auth.adapter.query(
            `SELECT u.id, u.email, u.display_name, u.created_at, u.updated_at,
                (ug.user_id IS NOT NULL) AS is_admin,
                (SELECT MAX(la.created_at) FROM login_audit la WHERE la.user_id = u.id) AS last_login
         FROM users u
         LEFT JOIN user_groups ug ON u.id = ug.user_id
             AND ug.group_id = (SELECT id FROM \`groups\` WHERE name = ?)
         WHERE u.email != ?
         ORDER BY u.email`,
            [Auth.adminGroupName, Auth.anonymousEmail],
        );

        this.ctx.sendJson(res, {
            users: rows.map((u) => {
                return {
                    id: u.id,
                    email: u.email,
                    displayName: u.display_name,
                    isAdmin: Boolean(u.is_admin),
                    lastLogin: u.last_login,
                    createdAt: u.created_at,
                    updatedAt: u.updated_at,
                };
            }),
        });
    };

    /**
     * Creates an account for somebody else. Like every account of this installation, it stays unusable until the
     * person it belongs to opens the confirmation link the backend mails.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleCreateUser(req: IncomingMessage, res: ServerResponse) {
        const authUser = this.ctx.getAuthUser(req);

        if (!authUser || !(await this.ctx.auth.isUserInAdminGroup(authUser.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (!EmailConfirmation.isAvailable(this.ctx)) {
            this.ctx.sendError(
                res,
                "Creating an account needs a mail account. Add the mail settings to backend-config.json and "
                + "restart the backend.",
                503,
                "mailMissing",
            );

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const email = Auth.normalizeEmail(String(body.email ?? ""));
        const password = String(body.password ?? "");
        const displayName = String(body.displayName ?? "").trim() || email;

        if (!Auth.isValidEmail(email)) {
            this.ctx.sendError(res, "Please enter a valid email address.");

            return;
        }

        if (password.length < 6) {
            this.ctx.sendError(res, "Password must be at least 6 characters");

            return;
        }

        const existing = await this.ctx.auth.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM users WHERE email = ?",
            [email],
        );

        if ((existing[0]?.cnt ?? 0) > 0) {
            this.ctx.sendError(res, "That email address is already registered.", 409);

            return;
        }

        const result = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
            [email, await Auth.hashPassword(password), displayName],
        );

        const sent = await EmailConfirmation.request(this.ctx, req, {
            email,
            purpose: ConfirmationReason.Activation,
            displayName,
            invitedBy: await this.creatorName(authUser.userId),
        });

        if (!sent) {
            // The account never existed without a confirmation link, so the failed attempt leaves nothing behind.
            await this.ctx.auth.adapter.execute("DELETE FROM users WHERE id = ?", [result.insertId]);
            this.ctx.sendError(res, "The confirmation mail could not be sent. Please try again later.", 502);

            return;
        }

        this.ctx.sendJson(res, { success: true, id: result.insertId });
    };

    public async handleUpdateUser(req: IncomingMessage, res: ServerResponse) {
        const authUser = this.ctx.getAuthUser(req);

        if (!authUser || !(await this.ctx.auth.isUserInAdminGroup(authUser.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (id === undefined) {
            this.ctx.sendError(res, "id required");

            return;
        }

        const updates: string[] = [];
        const params: unknown[] = [];

        if (body.displayName !== undefined) {
            updates.push("display_name = ?");
            params.push(String(body.displayName).trim());
        }

        if (body.password) {
            const passwordHash = await Auth.hashPassword(String(body.password));

            updates.push("password_hash = ?");
            params.push(passwordHash);
        }

        if (updates.length === 0) {
            this.ctx.sendError(res, "No fields to update");

            return;
        }

        params.push(id);

        await this.ctx.auth.adapter.execute(
            `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
            params,
        );

        this.ctx.sendJson(res, { success: true });
    };

    public async handleDeleteUser(req: IncomingMessage, res: ServerResponse) {
        const authUser = this.ctx.getAuthUser(req);

        if (!authUser || !(await this.ctx.auth.isUserInAdminGroup(authUser.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (id === undefined) {
            this.ctx.sendError(res, "id required");

            return;
        }

        if (id === authUser.userId) {
            const adminCount = await this.ctx.auth.adapter.query<{ cnt: number; }>(
                `SELECT COUNT(*) AS cnt FROM user_groups
             WHERE group_id = (SELECT id FROM \`groups\` WHERE name = ?)`,
                [Auth.adminGroupName],
            );

            if ((adminCount[0]?.cnt ?? 0) <= 1) {
                this.ctx.sendError(res, "Cannot delete the last admin user");

                return;
            }
        }

        await this.ctx.auth.adapter.execute("DELETE FROM users WHERE id = ?", [id]);

        this.ctx.sendJson(res, { success: true });
    };

    public async handleListGroups(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const rows = await this.ctx.auth.adapter.query(
            "SELECT g.id, g.name, g.description, g.color_index AS colorIndex, g.admin_id AS adminId," +
            " COALESCE(NULLIF(u.display_name, ''), u.email) AS adminName," +
            " (g.password_hash IS NOT NULL) AS hasPassword," +
            " g.last_login AS lastLogin, g.created_at AS createdAt" +
            " FROM `groups` g LEFT JOIN users u ON u.id = g.admin_id ORDER BY g.name",
        );

        this.ctx.sendJson(res, {
            groups: rows.map((g) => {
                return {
                    id: g.id,
                    name: g.name,
                    description: g.description,
                    colorIndex: g.colorIndex,
                    adminId: g.adminId,
                    adminName: g.adminName ?? undefined,
                    hasPassword: Boolean(g.hasPassword),
                    lastLogin: g.lastLogin,
                    createdAt: g.createdAt,
                };
            }),
        });
    };

    public async handleListPublicGroups(req: IncomingMessage, res: ServerResponse) {
        const rows = await this.ctx.auth.adapter.query(
            "SELECT name FROM `groups` WHERE password_hash IS NOT NULL ORDER BY name",
        );

        this.ctx.sendJson(res, {
            groups: rows.map((g) => {
                return g.name;
            }),
        });
    };

    public async handleCreateGroup(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user || !(await this.ctx.auth.isUserInAdminGroup(user.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const name = String(body.name ?? "").trim();
        const description = body.description !== undefined ? String(body.description).trim() : "";
        const colorIndex = body.colorIndex === undefined ? 0 : TagPalette.optionalIndex(body.colorIndex);
        const password = typeof body.password === "string" && body.password ? body.password : undefined;
        const adminId = body.adminId !== undefined ? Number(body.adminId) || null : null;

        if (!name) {
            this.ctx.sendError(res, "Group name required");

            return;
        }

        if (colorIndex === undefined) {
            this.ctx.sendError(res, "Invalid colour index");

            return;
        }

        const existing = await this.ctx.auth.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM `groups` WHERE name = ?",
            [name],
        );

        if ((existing[0]?.cnt ?? 0) > 0) {
            this.ctx.sendError(res, "Group name already exists");

            return;
        }

        let passwordHash: string | null = null;
        if (password) {
            passwordHash = await Auth.hashPassword(password);
        }

        const result = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO `groups` (name, description, color_index, password_hash, admin_id)" +
            " VALUES (?, ?, ?, ?, ?)",
            [name, description, colorIndex, passwordHash, adminId],
        );

        this.ctx.sendJson(res, { success: true, id: result.insertId, colorIndex });
    };

    public async handleUpdateGroup(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (id === undefined) {
            this.ctx.sendError(res, "id required");

            return;
        }

        const groupRow = await this.ctx.auth.adapter.query<{ adminId: number | null; }>(
            "SELECT admin_id AS adminId FROM `groups` WHERE id = ?",
            [id],
        );

        if (groupRow.length === 0) {
            this.ctx.sendError(res, "Group not found", 404);

            return;
        }

        const isGroupAdmin = groupRow[0].adminId === user?.userId;

        if (!user || (!(await this.ctx.auth.isUserInAdminGroup(user.userId)) && !isGroupAdmin)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const groupInfo = await this.ctx.auth.adapter.query<{ name: string; }>(
            "SELECT name FROM `groups` WHERE id = ?",
            [id],
        );

        if (groupInfo[0]?.name === Auth.worldGroupName) {
            this.ctx.sendError(res, "The World group cannot be edited.");

            return;
        }

        const name = body.name !== undefined ? String(body.name).trim() : undefined;
        const description = body.description !== undefined ? String(body.description).trim() : undefined;
        const colorIndex = body.colorIndex === undefined ? undefined : TagPalette.optionalIndex(body.colorIndex);
        const password = body.password !== undefined
            ? (typeof body.password === "string" && body.password ? body.password : null)
            : undefined;
        const adminId = body.adminId !== undefined ? (Number(body.adminId) || null) : undefined;

        if (colorIndex === undefined && body.colorIndex !== undefined) {
            this.ctx.sendError(res, "Invalid colour index");

            return;
        }

        if (adminId !== undefined) {
            if (!await this.ctx.auth.isUserInAdminGroup(user.userId)) {
                this.ctx.sendError(res, "Only admins can change the group owner.", 403);

                return;
            }
        }

        if (!name && description === undefined && colorIndex === undefined
            && password === undefined && adminId === undefined) {
            this.ctx.sendError(res, "No fields to update");

            return;
        }

        const updates: string[] = [];
        const params: unknown[] = [];

        if (name) {
            updates.push("name = ?");
            params.push(name);
        }

        if (description !== undefined) {
            updates.push("description = ?");
            params.push(description);
        }

        if (colorIndex !== undefined) {
            updates.push("color_index = ?");
            params.push(colorIndex);
        }

        if (password !== undefined) {
            const groupInfo2 = await this.ctx.auth.adapter.query<{ name: string; }>(
                "SELECT name FROM `groups` WHERE id = ?",
                [id],
            );

            if (groupInfo2[0]?.name === Auth.adminGroupName && password !== null) {
                this.ctx.sendError(res, "Cannot set a shared password on the Admins group.");

                return;
            }

            if (password === null) {
                updates.push("password_hash = NULL");
            } else {
                updates.push("password_hash = ?");
                params.push(await Auth.hashPassword(password));
            }
        }

        if (adminId !== undefined) {
            updates.push("admin_id = ?");
            params.push(adminId);
        }

        params.push(id);

        await this.ctx.auth.adapter.execute(
            `UPDATE \`groups\` SET ${updates.join(", ")} WHERE id = ?`,
            params,
        );

        this.ctx.sendJson(res, { success: true });
    };

    public async handleDeleteGroup(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user || !(await this.ctx.auth.isUserInAdminGroup(user.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (id === undefined) {
            this.ctx.sendError(res, "id required");

            return;
        }

        const groupInfo = await this.ctx.auth.adapter.query<{ name: string; }>(
            "SELECT name FROM `groups` WHERE id = ?",
            [id],
        );

        if (groupInfo[0]?.name === Auth.adminGroupName) {
            this.ctx.sendError(res, "The Admins group cannot be deleted.");

            return;
        }

        const statements = await this.tagTransferStatements(id);
        statements.push({ sql: "DELETE FROM `groups` WHERE id = ?", params: [id] });

        await this.ctx.auth.adapter.executeTransaction(statements);

        this.ctx.sendJson(res, { success: true });
    };

    public async handleAddUserToGroup(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        const body = await this.ctx.readJsonBody(req);
        const groupId = body.groupId !== undefined ? Number(body.groupId) : undefined;

        if (groupId === undefined) {
            return;
        }

        const groupRow = await this.ctx.auth.adapter.query<{ adminId: number | null; }>(
            "SELECT admin_id AS adminId FROM `groups` WHERE id = ?",
            [groupId],
        );
        const isGroupAdmin = groupRow[0]?.adminId === user?.userId;

        if (!user || (!(await this.ctx.auth.isUserInAdminGroup(user.userId)) && !isGroupAdmin)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const userId = body.userId !== undefined ? Number(body.userId) : undefined;

        if (userId === undefined) {
            this.ctx.sendError(res, "userId and groupId required");

            return;
        }

        await this.ctx.auth.adapter.execute(
            "INSERT IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)",
            [userId, groupId],
        );

        this.ctx.sendJson(res, { success: true });
    };

    public async handleRemoveUserFromGroup(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        const body = await this.ctx.readJsonBody(req);
        const groupId = body.groupId !== undefined ? Number(body.groupId) : undefined;

        if (groupId === undefined) {
            return;
        }

        const groupRow = await this.ctx.auth.adapter.query<{ adminId: number | null; }>(
            "SELECT admin_id AS adminId FROM `groups` WHERE id = ?",
            [groupId],
        );
        const isGroupAdmin = groupRow[0]?.adminId === user?.userId;

        if (!user || (!(await this.ctx.auth.isUserInAdminGroup(user.userId)) && !isGroupAdmin)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const userId = body.userId !== undefined ? Number(body.userId) : undefined;

        if (userId === undefined) {
            this.ctx.sendError(res, "userId and groupId required");

            return;
        }

        const groupInfo = await this.ctx.auth.adapter.query<{ name: string; }>(
            "SELECT name FROM `groups` WHERE id = ?",
            [groupId],
        );

        if (groupInfo[0]?.name === Auth.adminGroupName) {
            const adminCount = await this.ctx.auth.adapter.query<{ cnt: number; }>(
                "SELECT COUNT(*) AS cnt FROM user_groups WHERE group_id = ?",
                [groupId],
            );

            if ((adminCount[0]?.cnt ?? 0) <= 1) {
                this.ctx.sendError(res, "Cannot remove the last admin user.");

                return;
            }
        }

        await this.ctx.auth.adapter.execute(
            "DELETE FROM user_groups WHERE user_id = ? AND group_id = ?",
            [userId, groupId],
        );

        this.ctx.sendJson(res, { success: true });
    };

    public async handleListGroupMembers(req: IncomingMessage, res: ServerResponse) {
        const authUser = this.ctx.getAuthUser(req);

        const url = this.ctx.getRequestUrl(req);
        const groupId = Number(url.searchParams.get("groupId"));

        if (!groupId) {
            this.ctx.sendError(res, "groupId required");

            return;
        }

        const groupRow = await this.ctx.auth.adapter.query<{ adminId: number | null; }>(
            "SELECT admin_id AS adminId FROM `groups` WHERE id = ?",
            [groupId],
        );
        const isGroupAdmin = groupRow[0]?.adminId === authUser?.userId;

        if (!authUser || (!(await this.ctx.auth.isUserInAdminGroup(authUser.userId)) && !isGroupAdmin)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const rows = await this.ctx.auth.adapter.query(
            `SELECT u.id, u.email, u.display_name
         FROM users u
         JOIN user_groups ug ON u.id = ug.user_id
         WHERE ug.group_id = ?
         ORDER BY u.email`,
            [groupId],
        );

        this.ctx.sendJson(res, {
            members: rows.map((u) => {
                return {
                    id: u.id,
                    email: u.email,
                    displayName: u.display_name,
                };
            }),
        });
    };

    public async handleGetPermissions(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const url = this.ctx.getRequestUrl(req);
        const entityType = url.searchParams.get("entityType") ?? "";
        const entityIdStr = url.searchParams.get("entityId");
        const entityId = entityIdStr !== null ? Number(entityIdStr) : null;

        if (!entityType || entityId === null) {
            this.ctx.sendError(res, "entityType and entityId required");

            return;
        }

        if (!isValidEntityType(entityType)) {
            this.ctx.sendError(res, `Invalid entityType: ${entityType}`);

            return;
        }

        const resolvedOwner = await this.ctx.auth.getExplicitOwner(entityType, entityId);

        if (!user || (!(await this.ctx.auth.isUserInAdminGroup(user.userId))
            && resolvedOwner !== user.userId)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const groups = await this.ctx.auth.getExplicitEntityGroups(entityType, entityId);

        this.ctx.sendJson(res, {
            permission: {
                entityType,
                entityId,
                ownerId: resolvedOwner,
                groups: groups.map((g) => {
                    return { groupId: g.groupId, writable: g.writable };
                }),
            },
        });
    };

    public async handleSetPermissions(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const entityType = String(body.entityType ?? "");
        const entityId = body.entityId !== undefined && body.entityId !== null
            ? Number(body.entityId) : null;

        if (!isValidEntityType(entityType) || entityId === null) {
            this.ctx.sendError(res, "entityType and entityId required");

            return;
        }

        const isAdmin = await this.ctx.auth.isUserInAdminGroup(user.userId);
        const resolvedOwner = await this.ctx.auth.getExplicitOwner(entityType, entityId);

        if (!isAdmin && resolvedOwner !== user.userId) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (entityType === EntityType.SetList
            && !(await this.setListChangeAllowed(res, entityId, body, resolvedOwner))) {
            return;
        }

        if (body.ownerId !== undefined) {
            const newOwnerId = body.ownerId !== null ? Number(body.ownerId) : null;

            await this.ctx.auth.setOwner(entityType, entityId, newOwnerId);
        }

        if (Array.isArray(body.addGroups)) {
            for (const g of body.addGroups as Array<{ groupId: number; writable: boolean; }>) {
                await this.ctx.auth.addEntityGroup(entityType, entityId, g.groupId, g.writable);
            }
        }

        if (Array.isArray(body.removeGroups)) {
            for (const g of body.removeGroups as Array<{ groupId: number; }>) {
                await this.ctx.auth.removeEntityGroup(entityType, entityId, g.groupId);
            }
        }

        if (entityType === EntityType.SetList) {
            const changed = body.ownerId !== undefined
                || (Array.isArray(body.addGroups) && body.addGroups.length > 0)
                || (Array.isArray(body.removeGroups) && body.removeGroups.length > 0);

            // A changed audience is a changed list: the next edit has to see this revision.
            if (changed) {
                await this.ctx.auth.adapter.execute(
                    "UPDATE set_lists SET revision = revision + 1 WHERE id = ?", [entityId],
                );
            }

            const updated = await SetListAccess.find(this.ctx.auth.adapter, entityId);
            this.ctx.sendJson(res, { success: true, revision: updated?.revision });

            return;
        }

        this.ctx.sendJson(res, { success: true });
    };

    /**
     * @param value A `addGroups` or `removeGroups` field of a permission request.
     *
     * @returns The group ids it names, ignoring anything that is not one.
     */
    private static groupIds(value: unknown): number[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value.map((entry) => {
            return Number((entry as { groupId?: unknown; }).groupId);
        }).filter((groupId) => {
            return Number.isInteger(groupId) && groupId > 0;
        });
    }

    /**
     * Checks a permission change of a set list: the caller has to edit the current state, and the stored tag
     * combination has to stay usable for everybody the list reaches. A combination never widens through sharing.
     *
     * @param res The response to write a rejection to.
     * @param listId The list whose permissions change.
     * @param body The request body.
     * @param ownerId The owner the list has right now.
     *
     * @returns True when the change may be applied.
     */
    private async setListChangeAllowed(res: ServerResponse, listId: number, body: Record<string, unknown>,
        ownerId: number | null): Promise<boolean> {
        const row = await SetListAccess.find(this.ctx.auth.adapter, listId);
        if (row === undefined) {
            this.ctx.sendError(res, "Set list not found", 404);

            return false;
        }

        const revision = body.revision === undefined ? undefined : Number(body.revision);
        if (revision !== undefined && revision !== row.revision) {
            this.ctx.sendJson(res, { error: "The set list was changed in the meantime.", revision: row.revision }, 409);

            return false;
        }

        const addedGroupIds = AdminRoutes.groupIds(body.addGroups);
        const removedGroupIds = AdminRoutes.groupIds(body.removeGroups);
        const audience = await SetListAccess.plannedAudience(this.ctx.auth, listId, addedGroupIds, removedGroupIds);

        const owner = body.ownerId === undefined
            ? ownerId ?? undefined
            : body.ownerId === null ? undefined : Number(body.ownerId);

        let groups: number[][] | undefined;
        try {
            groups = SetListAccess.readGroups(JSON.parse(row.filters) as unknown);
        } catch {
            groups = undefined;
        }

        if (groups === undefined) {
            this.ctx.sendJson(res, { error: "The stored tag combination is damaged." }, 409);

            return false;
        }

        const problem = await SetListAccess.filterProblem(this.ctx.auth, groups, audience, owner);
        if (problem !== undefined) {
            this.ctx.sendJson(res, { error: SetListAccess.problemMessage(problem), filterProblem: problem }, 409);

            return false;
        }

        return true;
    }

    /**
     * Builds the statements that hand the tags of a group over to the administrators, so that deleting the group
     * does not take them with it. A tag whose name an existing global tag already uses is merged into it.
     *
     * @param groupId The group that is about to be deleted.
     *
     * @returns The statements to run inside the deletion's transaction.
     */
    private async tagTransferStatements(groupId: number): Promise<IDbStatement[]> {
        const statements: IDbStatement[] = [];
        const tags = await this.ctx.auth.adapter.query<{ id: number; name: string; }>(
            "SELECT id, name FROM tags WHERE group_id = ?", [groupId],
        );

        for (const tag of tags) {
            const globalRows = await this.ctx.auth.adapter.query<{ id: number; }>(
                "SELECT id FROM tags WHERE group_id IS NULL AND name = ?", [tag.name],
            );

            if (globalRows.length === 0) {
                statements.push({ sql: "UPDATE tags SET group_id = NULL WHERE id = ?", params: [tag.id] });

                continue;
            }

            // The assignments move to the global tag; the ones it already has are dropped as duplicates.
            statements.push({
                sql: "UPDATE IGNORE score_tags SET tag_id = ? WHERE tag_id = ?", params: [globalRows[0].id, tag.id],
            });
            statements.push({ sql: "DELETE FROM score_tags WHERE tag_id = ?", params: [tag.id] });
            statements.push({ sql: "DELETE FROM tags WHERE id = ?", params: [tag.id] });
        }

        return statements;
    }

    /**
     * @param userId The administrator who creates an account.
     *
     * @returns The name to mention in the mail that announces the account, or undefined when the row is gone.
     */
    private async creatorName(userId: number): Promise<string | undefined> {
        const rows = await this.ctx.auth.adapter.query<{ displayName: string; email: string; }>(
            "SELECT display_name AS displayName, email FROM users WHERE id = ?",
            [userId],
        );
        const name = rows[0] as { displayName: string; email: string; } | undefined;

        return name === undefined ? undefined : (name.displayName.trim() || name.email);
    }
}
