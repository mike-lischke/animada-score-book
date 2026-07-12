/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { AccessLevel, EntityType, isValidEntityType } from "./Auth.js";
import { type RequestContext } from "./RequestContext.js";

export class ScoreRoutes {
    public constructor(private readonly ctx: RequestContext) { }

    public async handleListScoreFolderContent(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const parentId = body.parentid !== undefined ? Number(body.parentid) : null;

        const folderParams: unknown[] = [];
        let folderWhere: string;

        if (parentId === null || parentId === -1) {
            folderWhere = "parentid IS NULL";
        } else {
            folderWhere = "parentid = ?";
            folderParams.push(parentId);
        }

        const folders = await this.ctx.auth.adapter.query(
            `SELECT f.*, (
            EXISTS(SELECT 1 FROM folders cf WHERE cf.parentid = f.id LIMIT 1)
            OR EXISTS(SELECT 1 FROM scores cs WHERE cs.folderid = f.id LIMIT 1)
        ) AS hasChildren
        FROM folders f
        WHERE ${folderWhere}
        ORDER BY f.name`,
            folderParams,
        );

        for (const f of folders) {
            if (f.parentid === null) {
                f.parentid = -1;
            }

            f.hasChildren = Boolean(f.hasChildren);
        }

        const scoreParams: unknown[] = [];
        let scoreWhere: string;

        if (parentId === null || parentId === -1) {
            scoreWhere = "folderid IS NULL";
        } else {
            scoreWhere = "folderid = ?";
            scoreParams.push(parentId);
        }

        const scores = await this.ctx.auth.adapter.query(
            `SELECT * FROM scores WHERE ${scoreWhere} ORDER BY name`,
            scoreParams,
        );

        const readableFolders: Array<Record<string, unknown>> = [];
        for (const f of folders) {
            const summary = await this.ctx.auth.getPermissionSummary(user, EntityType.Folder, f.id as number);

            if (summary.canRead) {
                readableFolders.push({
                    ...f,
                    perm: {
                        isOwner: summary.isOwner, canRead: summary.canRead, canWrite: summary.canWrite,
                        isWorld: summary.isWorld, groupIds: summary.groupIds,
                    },
                });
            }
        }

        const readableScores: Array<Record<string, unknown>> = [];
        for (const s of scores) {
            const summary = await this.ctx.auth.getPermissionSummary(user, EntityType.Score, s.id as number);

            if (summary.canRead) {
                readableScores.push({
                    ...s,
                    perm: {
                        isOwner: summary.isOwner, canRead: summary.canRead, canWrite: summary.canWrite,
                        isWorld: summary.isWorld, groupIds: summary.groupIds,
                    },
                });
            }
        }

        this.ctx.sendJson(res, { folders: readableFolders, scores: readableScores });
    };

    public async handleGetScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const url = this.ctx.getRequestUrl(req);
        const idStr = url.searchParams.get("id");
        const id = idStr !== null ? Number(idStr) : null;

        if (id === null || isNaN(id)) {
            this.ctx.sendError(res, "Score id required");

            return;
        }

        const rows = await this.ctx.auth.adapter.query(
            "SELECT id, folderid, name, content FROM scores WHERE id = ?",
            [id],
        );

        if (rows.length === 0) {
            this.ctx.sendError(res, "Score not found", 404);

            return;
        }

        const score = rows[0];
        const summary = await this.ctx.auth.getPermissionSummary(user, EntityType.Score, score.id as number);

        if (!summary.canRead) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        this.ctx.sendJson(res, {
            id: score.id,
            folderid: score.folderid,
            name: score.name,
            content: score.content,
            perm: {
                isOwner: summary.isOwner,
                canRead: summary.canRead,
                canWrite: summary.canWrite,
                isWorld: summary.isWorld,
                groupIds: summary.groupIds,
            },
        });
    };

    public async handleResetChildPermissions(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const folderId = body.folderId !== undefined ? Number(body.folderId) : null;

        if (folderId === null) {
            this.ctx.sendError(res, "folderId required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.Folder, folderId, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const childFolderIds: number[] = [];
        const childScoreIds: number[] = [];

        const collectChildren = async (parentId: number): Promise<void> => {
            const subFolders = await this.ctx.auth.adapter.query<{ id: number; }>(
                "SELECT id FROM folders WHERE parentid = ?", [parentId],
            );

            for (const f of subFolders) {
                childFolderIds.push(f.id);
                await collectChildren(f.id);
            }

            const scores = await this.ctx.auth.adapter.query<{ id: number; }>(
                "SELECT id FROM scores WHERE folderid = ?", [parentId],
            );

            for (const s of scores) {
                childScoreIds.push(s.id);
            }
        };

        await collectChildren(folderId);

        const allEntityIds = [
            ...childFolderIds.map((id) => {
                return { type: "folder", id };
            }),
            ...childScoreIds.map((id) => {
                return { type: "score", id };
            }),
        ];

        for (const entity of allEntityIds) {
            await this.ctx.auth.adapter.execute(
                "DELETE FROM permissions WHERE entity_type = ? AND entity_id = ?",
                [entity.type, entity.id],
            );
            await this.ctx.auth.adapter.execute(
                "DELETE FROM entity_groups WHERE entity_type = ? AND entity_id = ?",
                [entity.type, entity.id],
            );
        }

        this.ctx.sendJson(res, {
            success: true,
            resetFolders: childFolderIds.length,
            resetScores: childScoreIds.length,
        });
    };

    public async handleAddScoreFolder(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const name = String(body.name ?? "").trim();
        const parentId = body.parentid !== undefined ? Number(body.parentid) : null;

        if (!name) {
            this.ctx.sendError(res, "Name required");

            return;
        }

        if (parentId !== null && parentId !== -1) {
            const allowed = await this.ctx.auth.checkPermission(user, EntityType.Folder, parentId, AccessLevel.Write);

            if (!allowed) {
                this.ctx.sendError(res, "Forbidden", 403);

                return;
            }
        } else if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const result = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO folders (parentid, name) VALUES (?, ?)",
            [parentId === -1 ? null : parentId, name],
        );

        if (user && (parentId === null || parentId === -1)) {
            await this.ctx.auth.setOwner(EntityType.Folder, result.insertId, user.userId);

            const worldId = await this.ctx.auth.getWorldGroupId();

            if (worldId !== undefined) {
                await this.ctx.auth.addEntityGroup(EntityType.Folder, result.insertId, worldId, false);
            }
        }

        this.ctx.sendJson(res, { success: true, id: result.insertId });
    };

    public async handleAddScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const folderId = body.folderId !== undefined ? Number(body.folderId) : null;
        const name = String(body.name ?? "").trim();
        const content = String(body.content ?? "");

        if (!name) {
            this.ctx.sendError(res, "Name required");

            return;
        }

        if (folderId !== null && folderId !== -1) {
            const allowed = await this.ctx.auth.checkPermission(user, EntityType.Folder, folderId, AccessLevel.Write);

            if (!allowed) {
                this.ctx.sendError(res, "Forbidden", 403);

                return;
            }
        } else if (!user) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const result = await this.ctx.auth.adapter.insertReturningId(
            "INSERT INTO scores (folderid, name, content) VALUES (?, ?, ?)",
            [folderId === -1 ? null : folderId, name, content],
        );

        if (user && (folderId === null || folderId === -1)) {
            await this.ctx.auth.setOwner(EntityType.Score, result.insertId, user.userId);

            const worldId = await this.ctx.auth.getWorldGroupId();

            if (worldId !== undefined) {
                await this.ctx.auth.addEntityGroup(EntityType.Score, result.insertId, worldId, false);
            }
        }

        this.ctx.sendJson(res, { success: true, id: result.insertId });
    };

    public async handleRenameEntry(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const type = body.type as string | undefined;
        const id = body.id !== undefined ? Number(body.id) : undefined;
        const name = String(body.name ?? "").trim();

        if (!type || id === undefined || !name) {
            this.ctx.sendError(res, "type, id and name required");

            return;
        }

        if (type !== "folder" && type !== "score") {
            this.ctx.sendError(res, "Invalid type (folder|score)");

            return;
        }

        const entityType = type as EntityType;

        const allowed = await this.ctx.auth.checkPermission(user, entityType, id, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        const table = type === "folder" ? "folders" : "scores";

        await this.ctx.auth.adapter.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id]);

        this.ctx.sendJson(res, { success: true });
    };

    public async handleUpdateScore(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const id = body.id !== undefined ? Number(body.id) : undefined;
        const content = body.content as string | undefined;

        if (id === undefined || content === undefined) {
            this.ctx.sendError(res, "id and content required");

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, EntityType.Score, id, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        await this.ctx.auth.adapter.execute("UPDATE scores SET content = ? WHERE id = ?", [content, id]);

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

        if (!isValidEntityType(type)) {
            this.ctx.sendError(res, `Invalid type: ${type}`);

            return;
        }

        const allowed = await this.ctx.auth.checkPermission(user, type, id, AccessLevel.Write);

        if (!allowed) {
            this.ctx.sendError(res, "Forbidden", 403);

            return;
        }

        if (type === EntityType.Score) {
            await this.ctx.auth.adapter.execute("DELETE FROM scores WHERE id = ?", [id]);
            await this.ctx.auth.adapter.execute(
                "DELETE FROM permissions WHERE entity_type = 'score' AND entity_id = ?", [id],
            );
            await this.ctx.auth.adapter.execute(
                "DELETE FROM entity_groups WHERE entity_type = 'score' AND entity_id = ?", [id],
            );
            this.ctx.sendJson(res, { success: true });

            return;
        }

        if (type === EntityType.Folder) {
            const folders = await this.ctx.auth.adapter.query<{ parentid: number | null; }>(
                "SELECT parentid FROM folders WHERE id = ?", [id],
            );

            if (folders.length === 0) {
                this.ctx.sendError(res, "Folder not found", 404);

                return;
            }

            const parentId = folders[0].parentid;

            await this.ctx.auth.adapter.execute(
                "UPDATE scores SET folderid = ? WHERE folderid = ?", [parentId, id],
            );

            await this.ctx.auth.adapter.execute(
                "UPDATE folders SET parentid = ? WHERE parentid = ?", [parentId, id],
            );

            await this.ctx.auth.adapter.execute("DELETE FROM folders WHERE id = ?", [id]);
            await this.ctx.auth.adapter.execute(
                "DELETE FROM permissions WHERE entity_type = 'folder' AND entity_id = ?", [id],
            );
            await this.ctx.auth.adapter.execute(
                "DELETE FROM entity_groups WHERE entity_type = 'folder' AND entity_id = ?", [id],
            );

            this.ctx.sendJson(res, { success: true });

            return;
        }

        this.ctx.sendError(res, "Invalid type (folder|score)");
    };

    public async handleMove(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);
        const body = await this.ctx.readJsonBody(req);
        const type = body.type as string | undefined;
        const id = body.id !== undefined ? Number(body.id) : undefined;

        if (type === "folder") {
            const newParentId = body.newParentId !== undefined ? Number(body.newParentId) : undefined;

            if (id === undefined || newParentId === undefined) {
                this.ctx.sendError(res, "id and newParentId required");

                return;
            }

            const entityType = type as EntityType;

            const allowed = await this.ctx.auth.checkPermission(user, entityType, id, AccessLevel.Write);

            if (!allowed) {
                this.ctx.sendError(res, "Forbidden", 403);

                return;
            }

            if (newParentId !== -1) {
                const targetAllowed = await this.ctx.auth.checkPermission(
                    user, EntityType.Folder, newParentId, AccessLevel.Write,
                );

                if (!targetAllowed) {
                    this.ctx.sendError(res, "Forbidden", 403);

                    return;
                }
            }

            await this.ctx.auth.adapter.execute("UPDATE folders SET parentid = ? WHERE id = ?", [
                newParentId === -1 ? null : newParentId, id,
            ]);
            this.ctx.sendJson(res, { success: true });

            return;
        }

        if (type === EntityType.Score) {
            const newFolderId = body.newFolderId !== undefined ? Number(body.newFolderId) : undefined;

            if (id === undefined || newFolderId === undefined) {
                this.ctx.sendError(res, "id and newFolderId required");

                return;
            }

            const allowed = await this.ctx.auth.checkPermission(user, EntityType.Score, id, AccessLevel.Write);

            if (!allowed) {
                this.ctx.sendError(res, "Forbidden", 403);

                return;
            }

            if (newFolderId !== -1) {
                const targetAllowed = await this.ctx.auth.checkPermission(
                    user, EntityType.Folder, newFolderId, AccessLevel.Write,
                );

                if (!targetAllowed) {
                    this.ctx.sendError(res, "Forbidden", 403);

                    return;
                }
            }

            await this.ctx.auth.adapter.execute("UPDATE scores SET folderid = ? WHERE id = ?", [
                newFolderId === -1 ? null : newFolderId, id,
            ]);
            this.ctx.sendJson(res, { success: true });

            return;
        }

        this.ctx.sendError(res, "Invalid type (folder|score)");
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
        await this.ctx.auth.adapter.execute("DELETE FROM folders");

        this.ctx.sendJson(res, { success: true });
    };
}
