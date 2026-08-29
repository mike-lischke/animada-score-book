/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { Auth, EntityType, isValidEntityType } from "./Auth.js";
import { type RequestContext } from "./RequestContext.js";

export class AdminRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    public async handleListUsers(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user || !(await this.ctx.auth.isUserInAdminGroup(user.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const rows = await this.ctx.auth.adapter.query(
            `SELECT u.id, u.username, u.display_name, u.created_at, u.updated_at,
                (ug.user_id IS NOT NULL) AS is_admin,
                (SELECT MAX(la.created_at) FROM login_audit la WHERE la.user_id = u.id) AS last_login
         FROM users u
         LEFT JOIN user_groups ug ON u.id = ug.user_id
             AND ug.group_id = (SELECT id FROM \`groups\` WHERE name = ?)
         ORDER BY u.username`,
            [Auth.adminGroupName],
        );

        this.ctx.sendJson(res, {
            users: rows.map((u) => {
                return {
                    id: u.id,
                    username: u.username,
                    displayName: u.display_name,
                    isAdmin: Boolean(u.is_admin),
                    lastLogin: u.last_login,
                    createdAt: u.created_at,
                    updatedAt: u.updated_at,
                };
            }),
        });
    };

    public async handleCreateUser(req: IncomingMessage, res: ServerResponse) {
        const authUser = this.ctx.getAuthUser(req);

        if (!authUser || !(await this.ctx.auth.isUserInAdminGroup(authUser.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const username = String(body.username ?? "").trim();
        const password = String(body.password ?? "");
        const displayName = String(body.displayName ?? username).trim();

        if (!username || !password) {
            this.ctx.sendError(res, "Username and password required");

            return;
        }

        if (username.length < 3) {
            this.ctx.sendError(res, "Username must be at least 3 characters");

            return;
        }

        if (password.length < 6) {
            this.ctx.sendError(res, "Password must be at least 6 characters");

            return;
        }

        const existing = await this.ctx.auth.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM users WHERE username = ?",
            [username],
        );

        if ((existing[0]?.cnt ?? 0) > 0) {
            this.ctx.sendError(res, "Username already exists");

            return;
        }

        const groupCollision = await this.ctx.auth.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM `groups` WHERE name = ?",
            [username],
        );

        if ((groupCollision[0]?.cnt ?? 0) > 0) {
            this.ctx.sendError(res, "A group with this name already exists");

            return;
        }

        const passwordHash = await Auth.hashPassword(password);
        const result = await this.ctx.auth.adapter.insertReturningId(
            `INSERT INTO users (username, password_hash, display_name)
         VALUES (?, ?, ?)`,
            [username, passwordHash, displayName],
        );

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
            "SELECT id, name, description, color, admin_id AS adminId," +
            " (password_hash IS NOT NULL) AS hasPassword," +
            " last_login AS lastLogin, created_at AS createdAt" +
            " FROM `groups` ORDER BY name",
        );

        this.ctx.sendJson(res, {
            groups: rows.map((g) => {
                return {
                    id: g.id,
                    name: g.name,
                    description: g.description,
                    color: g.color,
                    adminId: g.adminId,
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
        const color = typeof body.color === "string" && body.color
            ? body.color
            : this.ctx.randomGroupColor();
        const password = typeof body.password === "string" && body.password ? body.password : undefined;
        const adminId = body.adminId !== undefined ? Number(body.adminId) || null : null;

        if (!name) {
            this.ctx.sendError(res, "Group name required");

            return;
        }

        const userCollision = await this.ctx.auth.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM users WHERE username = ?",
            [name],
        );

        if ((userCollision[0]?.cnt ?? 0) > 0) {
            this.ctx.sendError(res, "A user with this name already exists");

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
            "INSERT INTO `groups` (name, description, color, password_hash, admin_id)" +
            " VALUES (?, ?, ?, ?, ?)",
            [name, description, color, passwordHash, adminId],
        );

        this.ctx.sendJson(res, { success: true, id: result.insertId, color });
    };

    public async handleUpdateGroup(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (id === undefined) {
            this.ctx.sendError(res, "id required");

            return;
        }

        const groupRow = await this.ctx.auth.adapter.query<{ admin_id: number | null; }>(
            "SELECT admin_id FROM `groups` WHERE id = ?",
            [id],
        );

        if (groupRow.length === 0) {
            this.ctx.sendError(res, "Group not found", 404);

            return;
        }

        const isGroupAdmin = groupRow[0].admin_id === user?.userId;

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
        const color = body.color !== undefined ? String(body.color) : undefined;
        const password = body.password !== undefined
            ? (typeof body.password === "string" && body.password ? body.password : null)
            : undefined;
        const adminId = body.adminId !== undefined ? (Number(body.adminId) || null) : undefined;

        if (adminId !== undefined) {
            if (!await this.ctx.auth.isUserInAdminGroup(user.userId)) {
                this.ctx.sendError(res, "Only admins can change the group owner.", 403);

                return;
            }
        }

        if (!name && description === undefined && color === undefined
            && password === undefined && adminId === undefined) {
            this.ctx.sendError(res, "No fields to update");

            return;
        }

        if (name) {
            const userCollision = await this.ctx.auth.adapter.query<{ cnt: number; }>(
                "SELECT COUNT(*) AS cnt FROM users WHERE username = ?",
                [name],
            );

            if ((userCollision[0]?.cnt ?? 0) > 0) {
                this.ctx.sendError(res, "A user with this name already exists");

                return;
            }
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

        if (color !== undefined) {
            updates.push("color = ?");
            params.push(color);
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

        await this.ctx.auth.adapter.execute("DELETE FROM `groups` WHERE id = ?", [id]);

        this.ctx.sendJson(res, { success: true });
    };

    public async handleAddUserToGroup(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        const body = await this.ctx.readJsonBody(req);
        const groupId = body.groupId !== undefined ? Number(body.groupId) : undefined;

        if (groupId === undefined) {
            return;
        }

        const groupRow = await this.ctx.auth.adapter.query<{ admin_id: number | null; }>(
            "SELECT admin_id FROM `groups` WHERE id = ?",
            [groupId],
        );
        const isGroupAdmin = groupRow[0]?.admin_id === user?.userId;

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

        const groupRow = await this.ctx.auth.adapter.query<{ admin_id: number | null; }>(
            "SELECT admin_id FROM `groups` WHERE id = ?",
            [groupId],
        );
        const isGroupAdmin = groupRow[0]?.admin_id === user?.userId;

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

        const groupRow = await this.ctx.auth.adapter.query<{ admin_id: number | null; }>(
            "SELECT admin_id FROM `groups` WHERE id = ?",
            [groupId],
        );
        const isGroupAdmin = groupRow[0]?.admin_id === authUser?.userId;

        if (!authUser || (!(await this.ctx.auth.isUserInAdminGroup(authUser.userId)) && !isGroupAdmin)) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const rows = await this.ctx.auth.adapter.query(
            `SELECT u.id, u.username, u.display_name
         FROM users u
         JOIN user_groups ug ON u.id = ug.user_id
         WHERE ug.group_id = ?
         ORDER BY u.username`,
            [groupId],
        );

        this.ctx.sendJson(res, {
            members: rows.map((u) => {
                return {
                    id: u.id,
                    username: u.username,
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

        if (!entityType || entityId === null) {
            this.ctx.sendError(res, "entityType and entityId required");

            return;
        }

        const isAdmin = await this.ctx.auth.isUserInAdminGroup(user.userId);
        const resolvedOwner = await this.ctx.auth.getExplicitOwner(entityType as EntityType, entityId);

        if (!isAdmin && resolvedOwner !== user.userId) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (body.ownerId !== undefined) {
            const newOwnerId = body.ownerId !== null ? Number(body.ownerId) : null;

            await this.ctx.auth.setOwner(entityType as EntityType, entityId, newOwnerId);
        }

        if (Array.isArray(body.addGroups)) {
            for (const g of body.addGroups as Array<{ groupId: number; writable: boolean; }>) {
                await this.ctx.auth.addEntityGroup(entityType as EntityType, entityId, g.groupId, g.writable);
            }
        }

        if (Array.isArray(body.removeGroups)) {
            for (const g of body.removeGroups as Array<{ groupId: number; }>) {
                await this.ctx.auth.removeEntityGroup(entityType as EntityType, entityId, g.groupId);
            }
        }

        this.ctx.sendJson(res, { success: true });
    };
}
