/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { Auth, type ITokenPayload, LoginAuditEvent, EntityType } from "./Auth.js";
import { EmailConfirmation, type IPendingConfirmation } from "./EmailConfirmation.js";
import { ConfirmationReason, Mailer } from "./Mailer.js";
import { type RequestContext } from "./RequestContext.js";

/** The account a confirmation produced, or the reason it was refused. */
type IConfirmationOutcome = { payload: ITokenPayload; } | { error: string; };

export class AuthRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    public async handleLogin(req: IncomingMessage, res: ServerResponse) {
        const body = await this.ctx.readJsonBody(req);
        const email = Auth.normalizeEmail(String(body.email ?? ""));
        const password = String(body.password ?? "");

        if (!email || !password) {
            this.ctx.sendError(res, "Email address and password required");

            return;
        }

        const rlKey = this.ctx.rateLimitKey(req, email);

        if (this.ctx.checkRateLimit(rlKey)) {
            this.ctx.sendError(res, "Too many attempts. Try again later.", 429);

            return;
        }

        const rows = await this.ctx.auth.adapter.query<{
            id: number; email: string; passwordHash: string;
            displayName: string; emailVerified: number | boolean;
        }>(
            "SELECT id, email, password_hash AS passwordHash, display_name AS displayName," +
            " email_verified AS emailVerified FROM users WHERE email = ?",
            [email],
        );

        if (rows.length === 0) {
            this.ctx.recordFailedAttempt(rlKey);
            this.ctx.sendError(res, "Invalid email address or password", 401);

            return;
        }

        const user = rows[0];
        const valid = await Auth.verifyPassword(password, user.passwordHash);

        if (!valid) {
            this.ctx.recordFailedAttempt(rlKey);
            this.ctx.sendError(res, "Invalid email address or password", 401);

            return;
        }

        if (!user.emailVerified) {
            this.ctx.sendError(
                res,
                "This email address is not confirmed yet. Open the link in the mail we sent you.",
                403,
                "unverified",
            );

            return;
        }

        this.ctx.clearRateLimit(rlKey);

        const admin = await this.ctx.auth.isUserInAdminGroup(user.id);

        const payload: ITokenPayload = {
            userId: user.id,
            email: user.email,
            isAdmin: admin,
        };

        const accessToken = await this.startSession(req, res, payload, LoginAuditEvent.Login);

        const [capabilities, groupIds] = await Promise.all([
            this.ctx.auth.buildCapabilities(payload),
            this.groupIdsOf(user.id),
        ]);

        this.ctx.sendJson(res, {
            token: accessToken,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                isAdmin: payload.isAdmin,
                groupIds,
            },
            capabilities,
        });
    };

    /**
     * Starts a registration for a visitor. The account itself is created when the visitor opens the link in the mail
     * this action sends, so an address that is never confirmed leaves no account behind. The new account starts
     * without group membership and therefore without capabilities; the backend decides that, never the client.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleRegister(req: IncomingMessage, res: ServerResponse) {
        if (!this.ctx.config.registration.enabled) {
            this.ctx.sendError(res, "Registration is disabled on this installation.", 403, "registrationDisabled");

            return;
        }

        if (!EmailConfirmation.isAvailable(this.ctx)) {
            this.ctx.sendError(
                res,
                "Registration is not available: this installation has no mail account to confirm addresses.",
                403,
                "mailMissing",
            );

            return;
        }

        const rlKey = this.ctx.rateLimitKey(req, "#register");

        if (this.ctx.checkRateLimit(rlKey)) {
            this.ctx.sendError(res, "Too many attempts. Try again later.", 429);

            return;
        }

        // Every attempt counts, so one client cannot send confirmation mails in a loop. The attempt that reaches
        // the threshold is answered as blocked.
        if (this.ctx.recordFailedAttempt(rlKey)) {
            this.ctx.sendError(res, "Too many attempts. Try again later.", 429);

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
            this.ctx.sendError(res, "The password needs at least 6 characters.");

            return;
        }

        const users = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM users WHERE email = ?",
            [email],
        );

        if (users.length > 0) {
            this.ctx.sendError(res, "That email address is already registered.", 409);

            return;
        }

        const sent = await EmailConfirmation.request(this.ctx, req, {
            email,
            purpose: ConfirmationReason.Registration,
            passwordHash: await Auth.hashPassword(password),
            displayName,
        });

        if (!sent) {
            this.ctx.sendError(res, "The confirmation mail could not be sent. Please try again later.", 502);

            return;
        }

        this.ctx.sendJson(res, { pending: true, email }, 202);
    };

    /**
     * Opens the link of a confirmation mail. The account behind the link is created, or marked as confirmed, and the
     * response leads the browser back to the site that asked for the confirmation, with a session cookie set.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleConfirmRegistration(req: IncomingMessage, res: ServerResponse) {
        const url = this.ctx.getRequestUrl(req);
        const token = url.searchParams.get("token") ?? "";
        const oldest = new Date(Date.now() - (Auth.emailVerificationExpiryHours * 60 * 60 * 1000));

        const rows = await this.ctx.auth.adapter.query<{
            email: string; purpose: ConfirmationReason; passwordHash: string | null;
            displayName: string | null; groupName: string | null; siteOrigin: string | null;
        }>(
            "SELECT email, purpose, password_hash AS passwordHash, display_name AS displayName," +
            " group_name AS groupName, site_origin AS siteOrigin" +
            " FROM email_verifications WHERE token_hash = ? AND created_at > ?",
            [Auth.hashVerificationToken(token), oldest],
        );

        if (rows.length === 0) {
            this.sendConfirmationPage(res, 410, "This link is no longer valid",
                "The confirmation link was already used or has expired. Start the registration again to get a "
                + "new one.");

            return;
        }

        const row = rows[0];
        const pending: IPendingConfirmation = {
            email: row.email,
            purpose: row.purpose,
            passwordHash: row.passwordHash ?? undefined,
            displayName: row.displayName ?? undefined,
            groupName: row.groupName ?? undefined,
        };

        const outcome = await this.confirmAccount(pending);
        if ("error" in outcome) {
            this.sendConfirmationPage(res, 403, "The address could not be confirmed", outcome.error);

            return;
        }

        await this.ctx.auth.adapter.execute("DELETE FROM email_verifications WHERE email = ?", [pending.email]);
        await this.startSession(req, res, outcome.payload, LoginAuditEvent.Login);

        // The page hands the refresh cookie to the application, which exchanges it for an access token on start.
        const siteOrigin = row.siteOrigin ?? url.origin;
        this.sendConfirmationPage(res, 200, "Your address is confirmed",
            "You are signed in now. The score book opens in a moment.", `${siteOrigin}/`);
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
            id: number; email: string; displayName: string;
        }>(
            "SELECT id, email, display_name AS displayName FROM users WHERE email = ?",
            [Auth.anonymousEmail],
        );

        if (anonRows.length === 0) {
            this.ctx.sendError(res, "Anonymous user not found", 500);

            return;
        }

        const anon = anonRows[0];

        const payload: ITokenPayload = {
            userId: anon.id,
            email: anon.email,
            isAdmin: false,
            authType: "group",
            groupId: group.id,
        };

        const accessToken = await this.startSession(req, res, payload, LoginAuditEvent.GroupLogin);

        await this.ctx.auth.adapter.execute(
            "UPDATE `groups` SET last_login = NOW() WHERE id = ?",
            [group.id],
        );

        const capabilities = await this.ctx.auth.buildCapabilities(payload);

        this.ctx.sendJson(res, {
            token: accessToken,
            user: {
                id: anon.id,
                email: anon.email,
                displayName: anon.displayName,
                isAdmin: false,
                groupIds: [group.id],
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

        const rows = await this.ctx.auth.adapter.query<{ id: number; email: string; }>(
            "SELECT id, email FROM users WHERE id = ?",
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
            email: user.email,
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
            // Clearing the stored hash ends the session even if the cookie was captured before.
            await this.ctx.auth.adapter.execute(
                "UPDATE users SET refresh_token_hash = NULL WHERE id = ?",
                [user.userId],
            );

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
            id: number; email: string; displayName: string;
        }>(
            "SELECT id, email, display_name AS displayName FROM users WHERE id = ?",
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
            email: dbUser.email,
            isAdmin: admin,
            authType: user.authType,
            groupId: user.groupId,
        };
        const [capabilities, groupIds] = await Promise.all([
            this.ctx.auth.buildCapabilities(payload),
            this.groupIdsOf(dbUser.id, user.authType === "group" ? user.groupId : undefined),
        ]);

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
                email: dbUser.email,
                displayName: dbUser.displayName,
                isAdmin: admin,
                groupIds,
            },
            group,
            capabilities,
        });
    };

    /**
     * Starts the initial administrator of a fresh installation. Like every other account, the administrator only
     * comes into existence when the link in the confirmation mail is opened, so the backend needs a mail account
     * before an installation can be finished.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleCreateInitialAdmin(req: IncomingMessage, res: ServerResponse) {
        const usersExist = await this.ctx.auth.hasUsers();

        if (usersExist) {
            this.ctx.sendError(res, "Admin user already exists.", 403);

            return;
        }

        if (!EmailConfirmation.isAvailable(this.ctx)) {
            this.ctx.sendError(
                res,
                "Finishing the installation needs a mail account. Add the mail settings to backend-config.json "
                + "and restart the backend.",
                503,
                "mailMissing",
            );

            return;
        }

        const rlKey = this.ctx.rateLimitKey(req, "#setup");

        if (this.ctx.checkRateLimit(rlKey) || this.ctx.recordFailedAttempt(rlKey)) {
            this.ctx.sendError(res, "Too many attempts. Try again later.", 429);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const email = Auth.normalizeEmail(String(body.email ?? ""));
        const password = String(body.password ?? "");
        const displayName = String(body.displayName ?? "").trim() || email;
        const groupName = String(body.groupName ?? "My first group").trim() || "My first group";

        if (!Auth.isValidEmail(email)) {
            this.ctx.sendError(res, "Please enter a valid email address.");

            return;
        }

        if (password.length < 6) {
            this.ctx.sendError(res, "Password must be at least 6 characters");

            return;
        }

        const sent = await EmailConfirmation.request(this.ctx, req, {
            email,
            purpose: ConfirmationReason.InitialAdmin,
            passwordHash: await Auth.hashPassword(password),
            displayName,
            groupName,
        });

        if (!sent) {
            this.ctx.sendError(res, "The confirmation mail could not be sent. Please try again later.", 502);

            return;
        }

        this.ctx.clearRateLimit(rlKey);
        this.ctx.sendJson(res, { pending: true, email }, 202);
    };

    /**
     * @param pending The stored confirmation.
     *
     * @returns The session payload of the account it belongs to, or the reason the confirmation is refused.
     */
    private async confirmAccount(pending: IPendingConfirmation): Promise<IConfirmationOutcome> {
        switch (pending.purpose) {
            case ConfirmationReason.Activation: {
                return this.confirmAdminCreatedAccount(pending.email);
            }

            case ConfirmationReason.Registration: {
                return this.confirmRegistration(pending);
            }

            case ConfirmationReason.InitialAdmin: {
                return this.confirmInitialAdmin(pending);
            }

            default: {
                return { error: "This link does not belong to a known confirmation." };
            }
        }
    }

    /**
     * @param email The address of the account an administrator created.
     *
     * @returns The session payload of the now confirmed account, or the reason it cannot be confirmed.
     */
    private async confirmAdminCreatedAccount(email: string): Promise<IConfirmationOutcome> {
        const rows = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM users WHERE email = ?",
            [email],
        );

        if (rows.length === 0) {
            return { error: "The account this link belongs to does not exist any more." };
        }

        const userId = rows[0].id;

        await this.ctx.auth.adapter.execute(
            "UPDATE users SET email_verified = 1, email_verified_at = CURRENT_TIMESTAMP WHERE id = ?",
            [userId],
        );

        return { payload: { userId, email, isAdmin: await this.ctx.auth.isUserInAdminGroup(userId) } };
    }

    /**
     * @param pending The stored registration.
     *
     * @returns The session payload of the created account, or the reason the registration cannot be completed.
     */
    private async confirmRegistration(pending: IPendingConfirmation): Promise<IConfirmationOutcome> {
        if (pending.passwordHash === undefined) {
            return { error: "The registration this link belongs to is incomplete." };
        }

        const existing = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM users WHERE email = ?",
            [pending.email],
        );

        if (existing.length > 0) {
            return { error: "That email address is already registered." };
        }

        const created = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO users (email, password_hash, display_name, email_verified, email_verified_at)" +
            " VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)",
            [pending.email, pending.passwordHash, pending.displayName ?? pending.email],
        );

        return { payload: { userId: created.insertId, email: pending.email, isAdmin: false } };
    }

    /**
     * @param pending The stored initial administrator.
     *
     * @returns The session payload of the administrator, or the reason the installation cannot be finished.
     */
    private async confirmInitialAdmin(pending: IPendingConfirmation): Promise<IConfirmationOutcome> {
        if (pending.passwordHash === undefined) {
            return { error: "The installation this link belongs to is incomplete." };
        }

        if (await this.ctx.auth.hasUsers()) {
            return { error: "An administrator account already exists on this installation." };
        }

        const userId = await this.createInitialAdminAccount(
            pending.email,
            pending.passwordHash,
            pending.displayName ?? pending.email,
            pending.groupName ?? "My first group",
        );

        return { payload: { userId, email: pending.email, isAdmin: true } };
    }

    /**
     * Creates the first account of an installation: the administrator, the built-in Admins and World groups, the
     * initial group, and ownership of every entity that has none yet.
     *
     * @param email The address of the administrator.
     * @param passwordHash The already hashed password.
     * @param displayName The name shown for the administrator.
     * @param groupName The group the installation starts with.
     *
     * @returns The id of the created administrator.
     */
    private async createInitialAdminAccount(email: string, passwordHash: string, displayName: string,
        groupName: string): Promise<number> {
        const result = await this.ctx.auth.adapter.insertReturningId(
            `INSERT INTO users (email, password_hash, display_name, email_verified, email_verified_at)
         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [email, passwordHash, displayName],
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

        const orphanFolders = await this.ctx.auth.adapter.query<{ id: number; }>(
            `SELECT f.id FROM folders f
         WHERE NOT EXISTS (
             SELECT 1 FROM permissions p
             WHERE p.entity_type = 'folder' AND p.entity_id = f.id
         )`,
        );

        for (const f of orphanFolders) {
            await this.ctx.auth.setOwner(EntityType.Folder, f.id, result.insertId);

            if (defaultGroupId) {
                await this.ctx.auth.addEntityGroup(EntityType.Folder, f.id, defaultGroupId, false);
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
            await this.ctx.auth.setOwner(EntityType.Score, s.id, result.insertId);

            if (defaultGroupId) {
                await this.ctx.auth.addEntityGroup(EntityType.Score, s.id, defaultGroupId, false);
            }
        }

        console.log(
            `Assigned permissions: ${orphanFolders.length} folders, ${orphanScores.length} scores ` +
            `→ owner=${email}, group=${groupName}.`,
        );
        console.log(`Initial admin user created: id=${result.insertId}, email=${email}.`);

        return result.insertId;
    }

    /**
     * Writes the page a confirmation link ends on. On success it carries a redirect to the site the confirmation
     * came from, so the visitor lands in the score book without another click.
     *
     * @param res The response to write to.
     * @param status The HTTP status code.
     * @param heading The headline of the page.
     * @param message The sentence that explains the outcome.
     * @param continueUrl Where the page leads on, if anywhere.
     */
    private sendConfirmationPage(res: ServerResponse, status: number, heading: string, message: string,
        continueUrl?: string): void {
        const escapedUrl = continueUrl === undefined ? undefined : Mailer.escapeHtml(continueUrl);
        const redirect = escapedUrl === undefined
            ? ""
            : `<meta http-equiv="refresh" content="2;url=${escapedUrl}">`;
        const link = escapedUrl === undefined
            ? ""
            : `<p class="link"><a href="${escapedUrl}">Open the score book</a></p>`;

        res.writeHead(status, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
        });

        res.end([
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
            redirect,
            "<title>Animada Score Book</title>",
            "<style>",
            "html{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f1ea;color:#1f1d1a}",
            "main{max-width:520px;margin:12vh auto;padding:32px;background:#fffdf8;",
            "border:1px solid #ded7c8;border-radius:8px}",
            "h1{margin:0 0 12px;font-size:24px}p{line-height:1.5;margin:0 0 16px}",
            ".link a{color:#17657f;font-weight:600}",
            "</style></head><body><main>",
            `<h1>${Mailer.escapeHtml(heading)}</h1>`,
            `<p>${Mailer.escapeHtml(message)}</p>`,
            link,
            "</main></body></html>",
        ].join(""));
    }

    /**
     * Stores the refresh token of a session, records the login and sets the cookie.
     *
     * @param req The incoming HTTP request.
     * @param res The response to set the cookie on.
     * @param payload The account the session belongs to.
     * @param event The audit event the session start is recorded as.
     *
     * @returns The access token of the new session.
     */
    private async startSession(req: IncomingMessage, res: ServerResponse, payload: ITokenPayload,
        event: LoginAuditEvent): Promise<string> {
        const refreshToken = Auth.createRefreshToken();

        await this.ctx.auth.adapter.execute(
            "UPDATE users SET refresh_token_hash = ?, auth_type = ?, group_id = ? WHERE id = ?",
            [refreshToken.hash, payload.authType ?? null, payload.groupId ?? null, payload.userId],
        );

        await this.ctx.auth.recordLoginAudit(
            payload.userId, event, payload.groupId, this.ctx.getClientIp(req),
        );

        this.ctx.setRefreshTokenCookie(res, refreshToken.raw, refreshToken.maxAge);

        return Auth.createAccessToken(payload);
    }

    /**
     * @param userId The user whose memberships are collected.
     * @param sessionGroupId The group a group-password session logged in through, if there is one.
     *
     * @returns The ids of the groups the session belongs to.
     */
    private async groupIdsOf(userId: number, sessionGroupId?: number): Promise<number[]> {
        // A group session carries only the group it logged in through, not the memberships of its account.
        if (sessionGroupId !== undefined) {
            return [sessionGroupId];
        }

        const rows = await this.ctx.auth.adapter.query<{ group_id: number; }>(
            "SELECT group_id FROM user_groups WHERE user_id = ?",
            [userId],
        );

        return rows.map((row) => {
            return row.group_id;
        });
    }
}
