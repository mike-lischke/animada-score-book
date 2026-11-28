/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";

import { NameText } from "../core/NameText.js";
import { AccessLevel, EntityType, isValidEntityType } from "./Auth.js";
import { InstrumentTags } from "./InstrumentTags.js";
import { type RequestContext } from "./RequestContext.js";
import { ScoreLock } from "./ScoreLock.js";
import { TagRights } from "./TagRights.js";
import { TagAccess, type ITagRow } from "./TagAccess.js";

const tokenBytes = 32;

/** The longest name a score may carry; the `name` column holds exactly this many characters. */
const maxNameLength = 255;

export class ScoreRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    public async handleGetScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const url = this.ctx.getRequestUrl(req);
        const idStr = url.searchParams.get("id");
        const id = idStr !== null ? Number(idStr) : null;

        if (id === null || isNaN(id)) {
            this.ctx.sendError(res, "Score id required");

            return;
        }

        const rows = await this.ctx.auth.adapter.query<{ id: number; name: string; content: string; }>(
            "SELECT id, name, content FROM scores WHERE id = ?",
            [id],
        );

        if (rows.length === 0) {
            this.ctx.sendError(res, "Score not found", 404);

            return;
        }

        const score = rows[0];
        const isDemoScore = await this.isDemoScore(score.id);
        const summary = await this.ctx.auth.getPermissionSummary(user, EntityType.Score, score.id);

        // A score in the demo catalog is readable without a session, whatever the permission rows say.
        if (!summary.canRead && !isDemoScore) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const tagIds = (await TagRights.readable(this.ctx.auth, user, await this.tagsOfScore(score.id)))
            .map((tag) => {
                return tag.id;
            });

        this.ctx.sendJson(res, {
            id: score.id,
            name: score.name,
            content: score.content,
            tagIds,
            perm: summary,
        });
    };

    /**
     * Lists the scores of the demo catalog, which are the ones carrying the `Demo Score` tag. The answer is the same
     * for every caller, so no session can widen or narrow the catalog.
     *
     * @param req The incoming HTTP request.
     * @param res The response to write to.
     */
    public async handleListDemoScores(req: IncomingMessage, res: ServerResponse) {
        const rows = await this.ctx.auth.adapter.query<{ id: number; name: string; }>(
            `SELECT s.id, s.name FROM scores s WHERE s.id IN (
                SELECT st.score_id FROM score_tags st JOIN tags t ON t.id = st.tag_id WHERE t.system_key = ?
            )`, [TagAccess.demoSystemKey],
        );

        // The first entry is the score a demo opens, so the order has to be the one every score list uses.
        rows.sort((left, right) => {
            return NameText.compare(left.name, right.name);
        });

        this.ctx.sendJson(res, {
            scores: rows.map((row) => {
                return { id: row.id, name: row.name };
            }),
        });
    };

    public async handleAddScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const name = this.storableName(res, body.name);
        const content = String(body.content ?? "");

        if (name === undefined) {
            return;
        }

        if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const result = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO scores (name, content) VALUES (?, ?)",
            [name, content],
        );
        const scoreId = result.insertId;

        // A new score is private: sharing it is a deliberate act, so nothing is granted to World here.
        await this.ctx.auth.setOwner(EntityType.Score, scoreId, user.userId);
        await InstrumentTags.sync(this.ctx.auth.adapter, scoreId, content);

        this.ctx.sendJson(res, { success: true, id: scoreId });
    };

    public async handleRenameEntry(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (id === undefined) {
            this.ctx.sendError(res, "id required");

            return;
        }

        const name = this.storableName(res, body.name);
        if (name === undefined) {
            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.Score, id, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        await this.ctx.auth.adapter.execute("UPDATE scores SET name = ? WHERE id = ?", [name, id]);

        this.ctx.sendJson(res, { success: true });
    };

    public async handleUpdateScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;
        const content = body.content as string | undefined;
        const token = body.token as string | undefined;

        if (id === undefined || content === undefined || content.length === 0) {
            this.ctx.sendError(res, "id and content required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.Score, id, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (token) {
            const locks = await this.ctx.auth.adapter.query<{ lockToken: string; }>(
                "SELECT lock_token AS lockToken FROM score_locks WHERE score_id = ?",
                [id],
            );

            if (locks.length === 0 || locks[0].lockToken !== token) {
                this.ctx.sendError(res, "Score is locked by another user. Refresh and try again.", 409);

                return;
            }
        }

        const result = await this.ctx.auth.adapter.execute("UPDATE scores SET content = ? WHERE id = ?", [content, id]);

        if (result.affectedRows === 0) {
            this.ctx.sendError(res, "Score not found", 404);

            return;
        }

        await InstrumentTags.sync(this.ctx.auth.adapter, id, content);

        this.ctx.sendJson(res, { success: true });
    };

    public async handleDelete(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const type = body.type as string | undefined;
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (!type || id === undefined) {
            this.ctx.sendError(res, "type and id required");

            return;
        }

        if (!isValidEntityType(type) || type !== EntityType.Score) {
            this.ctx.sendError(res, `Invalid type: ${type}`);

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.Score, id, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        await this.ctx.auth.adapter.execute("DELETE FROM scores WHERE id = ?", [id]);
        await this.ctx.auth.adapter.execute(
            "DELETE FROM permissions WHERE entity_type = 'score' AND entity_id = ?", [id],
        );
        await this.ctx.auth.adapter.execute(
            "DELETE FROM entity_groups WHERE entity_type = 'score' AND entity_id = ?", [id],
        );

        this.ctx.sendJson(res, { success: true });
    };

    public async handleClearAll(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user || !(await this.ctx.auth.isUserInAdminGroup(user.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (!this.ctx.auth.adapter.isInitialized()) {
            this.ctx.sendError(res, "Database not initialised.", 500);

            return;
        }

        await this.ctx.auth.adapter.execute("DELETE FROM scores");

        this.ctx.sendJson(res, { success: true });
    };

    public async handleLockScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Authentication required.", 401);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const scoreId = body.scoreId !== undefined ? Number(body.scoreId) : undefined;
        const prevToken = body.prevToken as string | undefined;

        if (scoreId === undefined) {
            this.ctx.sendError(res, "scoreId required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.Score, scoreId, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const scoreExists = await this.ctx.auth.adapter.query<{ id: number; }>(
            "SELECT id FROM scores WHERE id = ?",
            [scoreId],
        );

        if (scoreExists.length === 0) {
            this.ctx.sendError(res, "Score not found", 404);

            return;
        }

        const locks = await this.ctx.auth.adapter.query<{
            userId: number; email: string; lockToken: string; lockedAt: string;
        }>(
            "SELECT user_id AS userId, email, lock_token AS lockToken, locked_at AS lockedAt "
            + "FROM score_locks WHERE score_id = ?",
            [scoreId],
        );

        if (locks.length > 0) {
            const lock = locks[0];
            const isExpired = ScoreLock.isExpired(lock.lockedAt);

            // Same user reclaiming their own lock — always allowed, even if not expired.
            if (lock.userId === user.userId) {
                const token = randomBytes(tokenBytes).toString("hex");

                await this.ctx.auth.adapter.execute(
                    "UPDATE score_locks SET lock_token = ?, locked_at = CURRENT_TIMESTAMP WHERE score_id = ?",
                    [token, scoreId],
                );

                this.ctx.sendJson(res, { success: true, token });

                return;
            }

            // Different user's lock — renew with prevToken only if expired.
            if (isExpired && prevToken && prevToken === lock.lockToken) {
                await this.ctx.auth.adapter.execute(
                    "UPDATE score_locks SET locked_at = CURRENT_TIMESTAMP WHERE score_id = ?",
                    [scoreId],
                );

                this.ctx.sendJson(res, { success: true, token: lock.lockToken, renewed: true });

                return;
            }

            if (!isExpired) {
                this.ctx.sendJson(res, {
                    success: false,
                    locked: true,
                    email: lock.email,
                    lockedAt: lock.lockedAt,
                }, 409);

                return;
            }

            await this.ctx.auth.adapter.execute("DELETE FROM score_locks WHERE score_id = ?", [scoreId]);
        }

        const token = randomBytes(tokenBytes).toString("hex");
        const email = user.email;

        await this.ctx.auth.adapter.execute(
            "INSERT INTO score_locks (score_id, user_id, email, lock_token) VALUES (?, ?, ?, ?)",
            [scoreId, user.userId, email, token],
        );

        this.ctx.sendJson(res, { success: true, token });
    };

    public async handleUnlockScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user) {
            this.ctx.sendError(res, "Authentication required.", 401);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const scoreId = body.scoreId !== undefined ? Number(body.scoreId) : undefined;
        const token = body.token as string | undefined;

        if (scoreId === undefined || !token) {
            this.ctx.sendError(res, "scoreId and token required");

            return;
        }

        const locks = await this.ctx.auth.adapter.query<{ lockToken: string; }>(
            "SELECT lock_token AS lockToken FROM score_locks WHERE score_id = ?",
            [scoreId],
        );

        if (locks.length === 0) {
            this.ctx.sendJson(res, { success: true });

            return;
        }

        if (locks[0].lockToken !== token) {
            this.ctx.sendError(res, "Invalid token", 403);

            return;
        }

        await this.ctx.auth.adapter.execute("DELETE FROM score_locks WHERE score_id = ?", [scoreId]);

        this.ctx.sendJson(res, { success: true });
    };

    public async handleForceUnlockScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        if (!user || !(await this.ctx.auth.isUserInAdminGroup(user.userId))) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const body = await this.ctx.readJsonBody(req);
        const scoreId = body.scoreId !== undefined ? Number(body.scoreId) : undefined;

        if (scoreId === undefined) {
            this.ctx.sendError(res, "scoreId required");

            return;
        }

        await this.ctx.auth.adapter.execute("DELETE FROM score_locks WHERE score_id = ?", [scoreId]);

        this.ctx.sendJson(res, { success: true });
    };

    /**
     * @param scoreId The score in question.
     *
     * @returns Whether the score carries the `Demo Score` tag, which publishes it to visitors without a session.
     */
    private async isDemoScore(scoreId: number): Promise<boolean> {
        const rows = await this.ctx.auth.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM score_tags st JOIN tags t ON t.id = st.tag_id " +
            "WHERE st.score_id = ? AND t.system_key = ?", [scoreId, TagAccess.demoSystemKey],
        );

        return (rows[0]?.cnt ?? 0) > 0;
    }

    /**
     * @param scoreId The score in question.
     *
     * @returns All tags of the score, whoever may see them.
     */
    private async tagsOfScore(scoreId: number): Promise<ITagRow[]> {
        return this.ctx.auth.adapter.query<ITagRow>(
            "SELECT t.id, t.name, t.color_index AS colorIndex, t.owner_user_id AS ownerUserId, "
            + "t.owner_group_id AS ownerGroupId, t.system_key AS systemKey FROM score_tags st " +
            "JOIN tags t ON t.id = st.tag_id WHERE st.score_id = ?", [scoreId],
        );
    }

    /**
     * Reads a score name from a request and checks every rule a stored name has to meet. Writes the error response
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
            this.ctx.sendError(res, "A score name must be valid Unicode.");

            return undefined;
        }

        if (NameText.codePointCount(name) > maxNameLength) {
            this.ctx.sendError(res, `A score name may hold at most ${maxNameLength} characters.`);

            return undefined;
        }

        return name;
    }
}
