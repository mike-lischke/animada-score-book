/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { Auth, type ITokenPayload, LoginAuditEvent } from "./Auth.js";
import { type RequestContext } from "./RequestContext.js";

export class AuthRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    public async handleLogin(req: IncomingMessage, res: ServerResponse) {
        const body = await this.ctx.readJsonBody(req);
        const username = String(body.username ?? "").trim();
        const password = String(body.password ?? "");

        if (!username || !password) {
            this.ctx.sendError(res, "Username and password required");

            return;
        }

        const rlKey = this.ctx.rateLimitKey(req, username);

        if (this.ctx.checkRateLimit(rlKey)) {
            this.ctx.sendError(res, "Too many attempts. Try again later.", 429);

            return;
        }

        const rows = await this.ctx.auth.adapter.query<{
            id: number; username: string; passwordHash: string;
            displayName: string;
        }>(
            "SELECT id, username, password_hash AS passwordHash, display_name AS displayName" +
            " FROM users WHERE username = ?",
            [username],
        );

        if (rows.length === 0) {
            this.ctx.recordFailedAttempt(rlKey);
            this.ctx.sendError(res, "Invalid username or password", 401);

            return;
        }

        const user = rows[0];
        const valid = await Auth.verifyPassword(password, user.passwordHash);

        if (!valid) {
            this.ctx.recordFailedAttempt(rlKey);
            this.ctx.sendError(res, "Invalid username or password", 401);

            return;
        }

        this.ctx.clearRateLimit(rlKey);

        const admin = await this.ctx.auth.isUserInAdminGroup(user.id);

        const payload: ITokenPayload = {
            userId: user.id,
            username: user.username,
            isAdmin: admin,
        };

        const accessToken = Auth.createAccessToken(payload);
        const refreshToken = Auth.createRefreshToken();

        await this.ctx.auth.adapter.execute(
            "UPDATE users SET refresh_token_hash = ?, auth_type = NULL, group_id = NULL WHERE id = ?",
            [refreshToken.hash, user.id],
        );

        await this.ctx.auth.recordLoginAudit(
            user.id, LoginAuditEvent.Login, undefined, this.ctx.getClientIp(req),
        );

        this.ctx.setRefreshTokenCookie(res, refreshToken.raw, refreshToken.maxAge);

        const capabilities = await this.ctx.auth.buildCapabilities(payload);

        this.ctx.sendJson(res, {
            token: accessToken,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                isAdmin: payload.isAdmin,
            },
            capabilities,
        });
    };

    public async handleGroupLogin(req: IncomingMessage, res: ServerResponse) {
        const body = await this.ctx.readJsonBody(req);
        const groupName = String(body.groupName ?? "").trim();
        const password = String(body.password ?? "");

        if (!groupName || !password) {
            this.ctx.sendError(res, "Group name and password required");

            return;
        }

        const rlKey = this.ctx.rateLimitKey(req, groupName);

        if (this.ctx.checkRateLimit(rlKey)) {
            this.ctx.sendError(res, "Too many attempts. Try again later.", 429);

            return;
        }

        const rows = await this.ctx.auth.adapter.query<{
            id: number; name: string; passwordHash: string | null;
        }>(
            "SELECT id, name, password_hash AS passwordHash FROM `groups` WHERE name = ?",
            [groupName],
        );

        const hash = rows[0]?.passwordHash;
        if (rows.length === 0 || !hash) {
            this.ctx.recordFailedAttempt(rlKey);
            this.ctx.sendError(res, "Invalid group name or password", 401);

            return;
        }

        const group = rows[0];
        const valid = await Auth.verifyPassword(password, hash);

        if (!valid) {
            this.ctx.recordFailedAttempt(rlKey);
            this.ctx.sendError(res, "Invalid group name or password", 401);

            return;
        }

        this.ctx.clearRateLimit(rlKey);

        const anonRows = await this.ctx.auth.adapter.query<{
            id: number; username: string; displayName: string;
        }>(
            "SELECT id, username, display_name AS displayName FROM users WHERE username = 'anonymous'",
        );

        if (anonRows.length === 0) {
            this.ctx.sendError(res, "Anonymous user not found", 500);

            return;
        }

        const anon = anonRows[0];

        const payload: ITokenPayload = {
            userId: anon.id,
            username: anon.username,
            isAdmin: false,
            authType: "group",
            groupId: group.id,
        };

        const accessToken = Auth.createAccessToken(payload);
        const refreshToken = Auth.createRefreshToken();

        await this.ctx.auth.adapter.execute(
            "UPDATE users SET refresh_token_hash = ?, auth_type = 'group', group_id = ? WHERE id = ?",
            [refreshToken.hash, group.id, anon.id],
        );

        await this.ctx.auth.recordLoginAudit(
            anon.id, LoginAuditEvent.GroupLogin, group.id, this.ctx.getClientIp(req),
        );

        await this.ctx.auth.adapter.execute(
            "UPDATE `groups` SET last_login = NOW() WHERE id = ?",
            [group.id],
        );

        this.ctx.setRefreshTokenCookie(res, refreshToken.raw, refreshToken.maxAge);

        const capabilities = await this.ctx.auth.buildCapabilities(payload);

        this.ctx.sendJson(res, {
            token: accessToken,
            user: {
                id: anon.id,
                username: anon.username,
                displayName: anon.displayName,
                isAdmin: false,
            },
            group: {
                id: group.id,
                name: group.name,
            },
            capabilities,
        });
    };

    public async handleRefresh(req: IncomingMessage, res: ServerResponse) {
        const rawToken = this.ctx.getCookie(req, "refreshToken");

        if (!rawToken) {
            this.ctx.sendError(res, "No refresh token", 401);

            return;
        }

        const result = await this.ctx.auth.verifyAndRotateRefreshToken(rawToken);

        if (!result) {
            this.ctx.clearRefreshTokenCookie(res);
            this.ctx.sendError(res, "Invalid or expired refresh token", 401);

            return;
        }

        const rows = await this.ctx.auth.adapter.query<{ id: number; username: string; }>(
            "SELECT id, username FROM users WHERE id = ?",
            [result.userId],
        );

        if (rows.length === 0) {
            this.ctx.clearRefreshTokenCookie(res);
            this.ctx.sendError(res, "User no longer exists", 401);

            return;
        }

        const user = rows[0];
        const admin = await this.ctx.auth.isUserInAdminGroup(user.id);

        const authType = result.authType;
        const groupId = result.groupId;

        const accessToken = Auth.createAccessToken({
            userId: user.id,
            username: user.username,
            isAdmin: admin,
            authType,
            groupId,
        });

        this.ctx.setRefreshTokenCookie(res, result.newRawToken, Auth.refreshTokenExpirySeconds);

        await this.ctx.auth.recordLoginAudit(
            user.id, LoginAuditEvent.Refresh, groupId, this.ctx.getClientIp(req),
        );

        this.ctx.sendJson(res, { token: accessToken });
    };

    public async handleLogout(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (user) {
            await this.ctx.auth.recordLoginAudit(
                user.userId, LoginAuditEvent.Logout, undefined, this.ctx.getClientIp(req),
            );
        }

        this.ctx.clearRefreshTokenCookie(res);
        this.ctx.sendJson(res, { success: true });
    };

    public async handleWhoAmI(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            const capabilities = await this.ctx.auth.buildCapabilities(undefined);

            this.ctx.sendJson(res, { authenticated: false, capabilities });

            return;
        }

        const rows = await this.ctx.auth.adapter.query<{
            id: number; username: string; displayName: string;
        }>(
            "SELECT id, username, display_name AS displayName FROM users WHERE id = ?",
            [user.userId],
        );

        if (rows.length === 0) {
            const capabilities = await this.ctx.auth.buildCapabilities(undefined);

            this.ctx.sendJson(res, { authenticated: false, capabilities });

            return;
        }

        const dbUser = rows[0];
        const admin = await this.ctx.auth.isUserInAdminGroup(dbUser.id);
        const payload: ITokenPayload = {
            userId: dbUser.id,
            username: dbUser.username,
            isAdmin: admin,
            authType: user.authType,
            groupId: user.groupId,
        };
        const capabilities = await this.ctx.auth.buildCapabilities(payload);

        let group: { id: number; name: string; } | undefined;
        if (user.authType === "group" && user.groupId !== undefined) {
            const groupRows = await this.ctx.auth.adapter.query<{ id: number; name: string; }>(
                "SELECT id, name FROM `groups` WHERE id = ?",
                [user.groupId],
            );

            if (groupRows.length > 0) {
                group = { id: groupRows[0].id, name: groupRows[0].name };
            }
        }

        this.ctx.sendJson(res, {
            authenticated: true,
            user: {
                id: dbUser.id,
                username: dbUser.username,
                displayName: dbUser.displayName,
                isAdmin: admin,
            },
            group,
            capabilities,
        });
    };

    public async handleCreateInitialAdmin(req: IncomingMessage, res: ServerResponse) {
        const usersExist = await this.ctx.auth.hasUsers();

        if (usersExist) {
            this.ctx.sendError(res, "Admin user already exists.", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const username = String(body.username ?? "").trim();
        const password = String(body.password ?? "");
        const displayName = String(body.displayName ?? username).trim();
        const groupName = String(body.groupName ?? "My first group").trim();

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

        const passwordHash = await Auth.hashPassword(password);
        const result = await this.ctx.auth.adapter.insertReturningId(
            `INSERT INTO users (username, password_hash, display_name)
         VALUES (?, ?, ?)`,
            [username, passwordHash, displayName],
        );

        const adminGroupResult = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO `groups` (name, description) VALUES (?, ?)",
            [Auth.adminGroupName, "System administrators with full access"],
        );

        await this.ctx.auth.adapter.execute(
            "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
            [result.insertId, adminGroupResult.insertId],
        );

        await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO `groups` (name, description, color) VALUES (?, ?, ?)",
            [Auth.worldGroupName, "Public access — everyone can read", "#808080"],
        );

        const defaultGroupRows = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM `groups` WHERE name = ?", [groupName],
        );

        let defaultGroupId: number;

        if (defaultGroupRows.length > 0) {
            defaultGroupId = defaultGroupRows[0].id;
        } else {
            const agResult = await this.ctx.auth.adapter.insertReturningId(
                "INSERT INTO `groups` (name, description, color) VALUES (?, ?, ?)",
                [groupName, "", "#2a9d8f"],
            );
            defaultGroupId = agResult.insertId;
        }

        const worldId = await this.ctx.auth.getWorldGroupId();

        const orphanFolders = await this.ctx.auth.adapter.query<{ id: number; }>(
            `SELECT f.id FROM folders f
         WHERE NOT EXISTS (
             SELECT 1 FROM permissions p
             WHERE p.entity_type = 'folder' AND p.entity_id = f.id
         )`,
        );

        for (const f of orphanFolders) {
            await this.ctx.auth.setOwner("folder", f.id, result.insertId);

            if (worldId !== undefined) {
                await this.ctx.auth.addEntityGroup("folder", f.id, worldId, false);
            }

            if (defaultGroupId) {
                await this.ctx.auth.addEntityGroup("folder", f.id, defaultGroupId, false);
            }
        }

        const orphanScores = await this.ctx.auth.adapter.query<{ id: number; }>(
            `SELECT s.id FROM scores s
         WHERE NOT EXISTS (
             SELECT 1 FROM permissions p
             WHERE p.entity_type = 'score' AND p.entity_id = s.id
         )`,
        );

        for (const s of orphanScores) {
            await this.ctx.auth.setOwner("score", s.id, result.insertId);

            if (worldId !== undefined) {
                await this.ctx.auth.addEntityGroup("score", s.id, worldId, false);
            }

            if (defaultGroupId) {
                await this.ctx.auth.addEntityGroup("score", s.id, defaultGroupId, false);
            }
        }

        console.log(
            `Assigned permissions: ${orphanFolders.length} folders, ${orphanScores.length} scores ` +
            `→ owner=${username}, group=${groupName}.`,
        );

        const payload: ITokenPayload = {
            userId: result.insertId,
            username,
            isAdmin: true,
        };

        const accessToken = Auth.createAccessToken(payload);
        const refreshToken = Auth.createRefreshToken();

        await this.ctx.auth.adapter.execute(
            "UPDATE users SET refresh_token_hash = ? WHERE id = ?",
            [refreshToken.hash, result.insertId],
        );

        this.ctx.setRefreshTokenCookie(res, refreshToken.raw, refreshToken.maxAge);

        const capabilities = await this.ctx.auth.buildCapabilities(payload);

        console.log(`Initial admin user created: id=${result.insertId}, username=${username}.`);

        this.ctx.sendJson(res, {
            token: accessToken,
            user: { id: result.insertId, username, displayName, isAdmin: true },
            capabilities,
        });
    };
}
