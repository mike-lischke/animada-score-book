/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Authentication and authorisation helpers for the Animada Score Book backend.
 *
 * ## Authentication Flow
 *
 * 1. **Login**: Client sends email + password → server verifies via scrypt, returns a JWT access token.
 * 2. **Request**: Client sends `Authorization: Bearer <token>` header on every subsequent request.
 * 3. **Refresh**: When the access token expires, client calls `/api?action=refresh` with the refresh token
 *    cookie to get a new access token.
 *
 * Every account starts unconfirmed: registration and the initial admin send a mail with a link, and only opening
 * that link creates (or enables) the account. See `Mailer`.
 *
 * ## Permission Model
 *
 * Each entity (a score, a feature) has an optional `permissions` row with:
 * - `owner_id` — the owning user (NULL = no owner)
 *
 * Groups are assigned via the `entity_groups` junction table:
 * - `entity_type`, `entity_id`, `group_id` — composite PK
 * - `writable` — whether the group has write access (read is implicit)
 *
 * Permissions are flat: an entity's access comes from its own rows only.
 *
 * Special groups:
 * - **Admins**: Members bypass all permission checks. The group always exists, is editable (name, members),
 *   but not deletable. At least one admin must always exist.
 * - **World**: Members are all users (and anonymous visitors). The group always exists, is not editable,
 *   but can be removed from entity assignments. Removing it makes the entity non-public.
 *
 * ## Token Storage
 *
 * - Access token: stored in memory on the client (never in localStorage).
 * - Refresh token: httpOnly cookie set by the server.
 */

import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import type { IDatabaseAdapter } from "./database.js";

/** A single group assignment on an entity (from entity_groups). */
interface IEntityGroupEntry {
    groupId: number;
    writable: boolean;
}

/** The fully resolved permission state for an entity. */
interface IResolvedPermission {
    /** The owner id, or null if the entity has no owner. */
    ownerId: number | null;

    /** All group assignments of the entity (groupId → writable). */
    groupEntries: Map<number, boolean>;

    /** The World group id, or undefined if the group does not exist. */
    worldGroupId?: number;
}

export interface ITokenPayload {
    userId: number;
    email: string;
    isAdmin: boolean;

    /** "user" for normal login, "group" for group-shared login. */
    authType?: string;

    /** The authenticated group ID (only set for group login). */
    groupId?: number;
}

interface ICapabilities {
    canEditScores: boolean;
    canManageUsers: boolean;
    canManageInstruments: boolean;
    canExportMP3: boolean;
}

/** Access level for permission checks. */
export const enum AccessLevel {
    Read = 1,
    Write = 2,
}

/** Entity types used in the permissions table. */
export enum EntityType {
    Score = "score",
    Feature = "feature",
}

const entityTypeValues = Object.values(EntityType) as string[];

/**
 * Type guard: checks whether a string is a valid {@link EntityType} value.
 *
 * @param value The string to check.
 * @returns True if the value is a valid EntityType.
 */
export const isValidEntityType = (value: string): value is EntityType => {
    return entityTypeValues.includes(value);
};

export enum LoginAuditEvent {
    Login = "login",
    GroupLogin = "group_login",
    Refresh = "refresh",
    Logout = "logout",
}

/** Summary of a user's relationship to an entity's permissions. */
export interface IPermissionSummary {
    isOwner: boolean;
    canRead: boolean;
    canWrite: boolean;

    /** Whether the entity is assigned to the World group (publicly readable). */
    isWorld: boolean;

    /** Group IDs that the entity is assigned to. */
    groupIds: number[];
}

export class Auth {
    /** Name of the built-in administrators group. */
    public static readonly adminGroupName = "Admins";

    /** Name of the built-in world (public) group. */
    public static readonly worldGroupName = "World";

    public static readonly refreshTokenExpirySeconds = 7 * 24 * 60 * 60; // 7 days

    /** How long a confirmation link stays usable. */
    public static readonly emailVerificationExpiryHours = 24;

    /** Address of the system account a group login runs as. It is never a deliverable address. */
    public static readonly anonymousEmail = "anonymous@system.invalid";

    private static readonly accessTokenExpiry = "15m";

    private static readonly scryptKeyLen = 64;
    private static readonly scryptOptions = { N: 16384, r: 8, p: 1 };

    private static jwtSecret: string = (() => {
        // eslint-disable-next-line no-restricted-syntax
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error("JWT_SECRET environment variable is required.");
        }

        return secret;
    })();

    private currentAdapter: IDatabaseAdapter;

    public constructor(adapter: IDatabaseAdapter) {
        this.currentAdapter = adapter;
    }

    public get adapter(): IDatabaseAdapter {
        return this.currentAdapter;
    }

    public set adapter(adapter: IDatabaseAdapter) {
        this.currentAdapter = adapter;
    }

    public static async hashPassword(password: string): Promise<string> {
        const salt = crypto.randomBytes(32);
        const paramsStr = Buffer.from(JSON.stringify(Auth.scryptOptions)).toString("hex");
        const key = await new Promise<Buffer>((resolve, reject) => {
            crypto.scrypt(password, salt, Auth.scryptKeyLen, Auth.scryptOptions, (err, derivedKey) => {
                if (err) {
                    reject(err);

                    return;
                }

                resolve(derivedKey);
            });
        });

        return `$s0$${paramsStr}$${salt.toString("hex")}$${key.toString("hex")}`;
    }

    public static async verifyPassword(password: string, hash: string): Promise<boolean> {
        const parts = hash.split("$");
        if (parts.length !== 5 || parts[1] !== "s0") {
            return false;
        }

        try {
            const raw: unknown = JSON.parse(Buffer.from(parts[2], "hex").toString("utf-8"));
            if (typeof raw !== "object" || raw === null) {
                return false;
            }

            const opts = raw as Record<string, unknown>;
            if (typeof opts.N !== "number" || typeof opts.r !== "number" || typeof opts.p !== "number") {
                return false;
            }

            // The options come from the stored hash record and keep Node's `ScryptOptions` names.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const options = opts as { N: number; r: number; p: number; };

            const salt = Buffer.from(parts[3], "hex");
            const expectedKey = Buffer.from(parts[4], "hex");
            const derivedKey = await new Promise<Buffer>((resolve, reject) => {
                crypto.scrypt(password, salt, Auth.scryptKeyLen, options, (err, key) => {
                    if (err) {
                        reject(err);

                        return;
                    }

                    resolve(key);
                });
            });

            return crypto.timingSafeEqual(derivedKey, expectedKey);
        } catch {
            return false;
        }
    }

    public static createAccessToken(payload: ITokenPayload): string {
        return jwt.sign(payload, Auth.jwtSecret, { expiresIn: Auth.accessTokenExpiry });
    }

    /**
     * @param value The address as a visitor typed it.
     *
     * @returns The address as it is stored and compared: trimmed and lower case.
     */
    public static normalizeEmail(value: string): string {
        return value.trim().toLowerCase();
    }

    /**
     * @param value The address to check.
     *
     * @returns Whether the value has the shape of an e-mail address.
     */
    public static isValidEmail(value: string): boolean {
        return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    /**
     * Creates the secret of a confirmation link. Only its hash is stored, so reading the table does not allow
     * confirming an address.
     *
     * @returns The token to place in the link and the hash to store.
     */
    public static createEmailVerificationToken(): { raw: string; hash: string; } {
        const raw = crypto.randomBytes(32).toString("hex");

        return { raw, hash: Auth.hashVerificationToken(raw) };
    }

    /**
     * @param raw The token from a confirmation link.
     *
     * @returns The hash under which the token is stored.
     */
    public static hashVerificationToken(raw: string): string {
        return crypto.createHash("sha256").update(raw).digest("hex");
    }

    public static createRefreshToken(): { raw: string; hash: string; maxAge: number; } {
        const raw = crypto.randomBytes(32).toString("hex");
        const hash = crypto.createHash("sha256").update(raw).digest("hex");

        return { raw, hash, maxAge: Auth.refreshTokenExpirySeconds };
    }

    public static verifyToken(token: string): ITokenPayload | undefined {
        try {
            const decoded = jwt.verify(token, Auth.jwtSecret);
            if (typeof decoded !== "object") {
                return undefined;
            }

            const payload = decoded as unknown as Record<string, unknown>;
            if (payload.type === "refresh"
                || typeof payload.userId !== "number"
                || typeof payload.email !== "string"
                || typeof payload.isAdmin !== "boolean") {
                return undefined;
            }

            return {
                userId: payload.userId,
                email: payload.email,
                isAdmin: payload.isAdmin,
                authType: typeof payload.authType === "string" ? payload.authType : undefined,
                groupId: typeof payload.groupId === "number" ? payload.groupId : undefined,
            };
        } catch {
            return undefined;
        }
    }

    /**
     * Checks whether any real (non-anonymous) users exist in the database.
     *
     * @returns True if at least one non-anonymous user exists.
     */
    public async hasUsers(): Promise<boolean> {
        const rows = await this.adapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM users WHERE email != ?", [Auth.anonymousEmail],
        );

        return (rows[0]?.cnt ?? 0) > 0;
    }

    /**
     * Builds the capabilities object for a user.
     * Currently a simple admin check. When per-feature permissions are seeded,
     * this will check individual feature permissions.
     *
     * @param user The authenticated user, or undefined for anonymous.
     *
     * @returns The capabilities object.
     */
    public async buildCapabilities(user: ITokenPayload | undefined): Promise<ICapabilities> {
        if (user && await this.isUserInAdminGroup(user.userId)) {
            return {
                canEditScores: true,
                canManageUsers: true,
                canManageInstruments: true,
                canExportMP3: true,
            };
        }

        return {
            canEditScores: false,
            canManageUsers: false,
            canManageInstruments: false,
            canExportMP3: false,
        };
    }

    /**
     * Checks whether a user has the required access level on an entity.
     *
     * Permission check order:
     * 1. Admin users always have full access.
     * 2. Owner always has full access.
     * 3. Check group assignments for the required access level.
     * 4. Access denied.
     *
     * For features without explicit permissions, only admins have access.
     *
     * @param user The authenticated user, or undefined for anonymous.
     * @param entityType The type of entity ("score", "feature").
     * @param entityId The entity id, or null for features.
     * @param requiredLevel The required access level (Read or Write).
     * @param isAdmin Optional. If true, skips the admin group DB query.
     *
     * @returns True if the user has the required access.
     */
    public async checkPermission(user: ITokenPayload | undefined, entityType: EntityType,
        entityId: number | null, requiredLevel: AccessLevel, isAdmin?: boolean,): Promise<boolean> {
        // Admin users always have full access.
        const admin = isAdmin ?? (user ? await this.isUserInAdminGroup(user.userId) : false);
        if (admin) {
            return true;
        }

        // Features: currently only admins get access (features will be reworked separately).
        if (entityType === EntityType.Feature) {
            return false;
        }

        if (entityId === null) {
            return false;
        }

        const resolved = await this.resolvePermission(entityType, entityId);

        // Owner always has full access.
        if (resolved.ownerId !== null && resolved.ownerId === user?.userId) {
            return true;
        }

        const userGroupIds = await this.memberGroupIds(user);

        // Check group assignments.
        for (const [groupId, writable] of resolved.groupEntries) {
            if (!userGroupIds.has(groupId)) {
                continue;
            }

            // Read is always granted for any matching group.
            if (requiredLevel === AccessLevel.Read) {
                return true;
            }

            // Write requires the writable flag.
            if (writable) {
                return true;
            }
        }

        return false;
    }

    /**
     * Computes a permission summary for a user on an entity.
     * Used by endpoints that need to attach permission metadata to a single row.
     *
     * @param user The authenticated user, or undefined for anonymous.
     * @param entityType The type of entity ("score").
     * @param entityId The entity id.
     * @param isAdmin Optional. If true, skips the admin group DB query.
     *
     * @returns A summary of the user's access.
     */
    public async getPermissionSummary(user: ITokenPayload | undefined, entityType: EntityType,
        entityId: number, isAdmin?: boolean,): Promise<IPermissionSummary> {
        const summaries = await this.getPermissionSummaries(user, entityType, [entityId], isAdmin);

        return summaries.get(entityId)!;
    }

    /**
     * Computes the permission summaries of a user for several entities of the same type, with one query per table
     * instead of one query per entity.
     *
     * @param user The authenticated user, or undefined for anonymous.
     * @param entityType The type of entity ("score", "feature").
     * @param entityIds The entity ids to summarise.
     * @param isAdmin Optional. If true, skips the admin group DB query.
     *
     * @returns The summary of every requested entity, keyed by its id.
     */
    public async getPermissionSummaries(user: ITokenPayload | undefined, entityType: EntityType,
        entityIds: number[], isAdmin?: boolean,): Promise<Map<number, IPermissionSummary>> {
        const summaries = new Map<number, IPermissionSummary>();

        if (entityIds.length === 0) {
            return summaries;
        }

        const admin = isAdmin ?? (user ? await this.isUserInAdminGroup(user.userId) : false);
        const placeholders = entityIds.map(() => {
            return "?";
        }).join(", ");

        const [ownerRows, groupRows, worldGroupId] = await Promise.all([
            this.adapter.query<{ entityId: number; ownerId: number | null; }>(
                `SELECT entity_id AS entityId, owner_id AS ownerId FROM permissions WHERE entity_type = ? ` +
                `AND entity_id IN (${placeholders})`, [entityType, ...entityIds],
            ),
            this.adapter.query<{ entityId: number; groupId: number; writable: number; }>(
                `SELECT entity_id AS entityId, group_id AS groupId, writable FROM entity_groups ` +
                `WHERE entity_type = ? AND entity_id IN (${placeholders})`, [entityType, ...entityIds],
            ),
            this.getWorldGroupId(),
        ]);

        const owners = new Map<number, number | null>();
        for (const row of ownerRows) {
            owners.set(row.entityId, row.ownerId);
        }

        const groupEntries = new Map<number, Map<number, boolean>>();
        for (const row of groupRows) {
            const entityId = row.entityId;
            const entries = groupEntries.get(entityId) ?? new Map<number, boolean>();
            entries.set(row.groupId, Boolean(row.writable));
            groupEntries.set(entityId, entries);
        }

        const userGroupIds = await this.memberGroupIds(user);

        for (const entityId of entityIds) {
            const entries = groupEntries.get(entityId) ?? new Map<number, boolean>();
            summaries.set(entityId, Auth.summarize(owners.get(entityId) ?? null, entries, worldGroupId, userGroupIds,
                user, admin));
        }

        return summaries;
    }

    /**
     * Sets the owner for an entity. An explicit NULL removes the owner row.
     *
     * @param entityType The entity type.
     * @param entityId The entity id.
     * @param ownerId The new owner id, or null to remove the owner.
     */
    public async setOwner(entityType: EntityType, entityId: number,
        ownerId: number | null): Promise<void> {
        if (ownerId === null) {
            await this.adapter.execute("DELETE FROM permissions WHERE entity_type = ? AND entity_id = ?",
                [entityType, entityId]);

            return;
        }

        // Upsert: set the owner.
        await this.adapter.execute(`INSERT INTO permissions (entity_type, entity_id, owner_id) VALUES (?, ?, ?) ` +
            `ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id)`, [entityType, entityId, ownerId],
        );
    }

    /**
     * Adds a group assignment to an entity. If the group is already assigned,
     * the writable flag is updated (only upgraded — never downgraded via this function).
     * The World group always stays read-only, so a write grant for it is stored as read.
     *
     * @param entityType The entity type.
     * @param entityId The entity id.
     * @param groupId The group id.
     * @param writable Whether the group has write access.
     */
    public async addEntityGroup(entityType: EntityType, entityId: number,
        groupId: number, writable: boolean): Promise<void> {
        const worldGroupId = await this.getWorldGroupId();

        if (groupId === worldGroupId) {
            await this.adapter.execute(
                `INSERT INTO entity_groups (entity_type, entity_id, group_id, writable) VALUES (?, ?, ?, 0) ` +
                `ON DUPLICATE KEY UPDATE writable = 0`,
                [entityType, entityId, groupId],
            );

            return;
        }

        await this.adapter.execute(
            `INSERT INTO entity_groups (entity_type, entity_id, group_id, writable) ` +
            `VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE writable = GREATEST(writable, VALUES(writable))`,
            [entityType, entityId, groupId, writable ? 1 : 0],
        );
    }

    /**
     * Removes a group assignment from an entity.
     *
     * @param entityType The entity type.
     * @param entityId The entity id.
     * @param groupId The group id.
     */
    public async removeEntityGroup(entityType: EntityType, entityId: number,
        groupId: number): Promise<void> {
        await this.adapter.execute(
            "DELETE FROM entity_groups WHERE entity_type = ? AND entity_id = ? AND group_id = ?",
            [entityType, entityId, groupId],
        );
    }

    /**
     * @returns the explicit group assignments for an entity (not inherited).
     *
     * @param entityType The entity type.
     * @param entityId The entity id.
     */
    public async getExplicitEntityGroups(entityType: EntityType,
        entityId: number): Promise<IEntityGroupEntry[]> {
        const rows = await this.adapter.query<{ groupId: number; writable: number; }>(
            "SELECT group_id AS groupId, writable FROM entity_groups WHERE entity_type = ? AND entity_id = ?",
            [entityType, entityId],
        );

        return rows.map((r) => {
            return { groupId: r.groupId, writable: Boolean(r.writable) };
        });
    }

    /**
     * Returns the explicit owner for an entity.
     *
     * @param entityType The entity type.
     * @param entityId The entity id.
     *
     * @returns The owner id, or null when the entity has no owner.
     */
    public async getExplicitOwner(entityType: EntityType,
        entityId: number): Promise<number | null> {
        const rows = await this.adapter.query<{ ownerId: number | null; }>(
            "SELECT owner_id AS ownerId FROM permissions WHERE entity_type = ? AND entity_id = ?",
            [entityType, entityId],
        );

        return rows[0]?.ownerId ?? null;
    }

    /**
     * Records a login audit event.
     *
     * @param userId    The user ID.
     * @param event     The type of login event.
     * @param groupId   The group ID (only for group_login events).
     * @param ipAddress The client IP address (optional).
     */
    public async recordLoginAudit(userId: number, event: LoginAuditEvent, groupId?: number,
        ipAddress?: string): Promise<void> {
        await this.adapter.execute(`INSERT INTO login_audit (user_id, event, group_id, ip_address) VALUES (?, ?, ?, ?)`,
            [userId, event, groupId ?? null, ipAddress ?? null],
        );
    }

    /**
     * Checks whether a user is a member of the Admins group.
     *
     * @param userId  The user id.
     * @returns True if the user is in the Admins group.
     */
    public async isUserInAdminGroup(userId: number): Promise<boolean> {
        const rows = await this.adapter.query<{ cnt: number; }>(
            `SELECT COUNT(*) AS cnt FROM user_groups ug JOIN \`groups\` g ON ug.group_id = g.id WHERE ug.user_id = ? ` +
            `AND g.name = ?`, [userId, Auth.adminGroupName],
        );

        return (rows[0]?.cnt ?? 0) > 0;
    }

    /**
     * Returns the ID of the World group.
     *
     * @returns The World group id, or undefined if it does not exist.
     */
    public async getWorldGroupId(): Promise<number | undefined> {
        return this.firstMatchingGroupId(Auth.worldGroupName);
    }

    /**
     * Returns the ID of the Admins group.
     *
     * @returns The Admins group id, or undefined if it does not exist.
     */
    public async getAdminGroupId(): Promise<number | undefined> {
        return this.firstMatchingGroupId(Auth.adminGroupName);
    }

    /**
     * Verifies a refresh token against the stored hash and rotates it.
     * On success, stores a new hash and returns the userId and a new raw token
     * (to be sent back as a cookie). On failure, clears the stored hash.
     *
     * @param rawToken The raw refresh token from the cookie.
     *
     * @returns The userId and new raw token if valid, or undefined.
     */
    public async verifyAndRotateRefreshToken(rawToken: string,): Promise<{
        userId: number; newRawToken: string; authType?: string; groupId?: number;
    } | undefined> {
        const hash = crypto.createHash("sha256").update(rawToken).digest("hex");

        const rows = await this.adapter.query<{
            userId: number; authType: string | null; groupId: number | null;
        }>("SELECT id AS userId, auth_type AS authType, group_id AS groupId FROM users WHERE refresh_token_hash = ?",
            [hash]);

        if (rows.length === 0) {
            return undefined;
        }

        const { userId, authType, groupId } = rows[0];
        const newRaw = crypto.randomBytes(32).toString("hex");
        const newHash = crypto.createHash("sha256").update(newRaw).digest("hex");

        await this.adapter.execute("UPDATE users SET refresh_token_hash = ? WHERE id = ?", [newHash, userId]);

        return {
            userId,
            newRawToken: newRaw,
            authType: authType ?? undefined,
            groupId: groupId ?? undefined,
        };
    }

    /**
     * @param ownerId The owner of the entity, or null.
     * @param groupEntries The entity's group assignments.
     * @param worldGroupId The World group id, or undefined when the group does not exist.
     * @param memberGroupIds The groups the user belongs to.
     * @param user The authenticated user, or undefined for anonymous.
     * @param isAdmin Whether the user is an administrator.
     *
     * @returns The permission summary for that entity.
     */
    private static summarize(ownerId: number | null, groupEntries: Map<number, boolean>,
        worldGroupId: number | undefined, memberGroupIds: Set<number>, user: ITokenPayload | undefined,
        isAdmin: boolean): IPermissionSummary {
        const isOwner = ownerId !== null && ownerId === user?.userId;
        const isWorld = worldGroupId !== undefined && groupEntries.has(worldGroupId);

        let canRead = isAdmin || isOwner;
        let canWrite = isAdmin || isOwner;

        for (const [groupId, writable] of groupEntries) {
            if (!memberGroupIds.has(groupId)) {
                continue;
            }

            canRead = true;

            // Everybody is a member of World, so a write grant there would open the entity to the public.
            if (writable && groupId !== worldGroupId) {
                canWrite = true;
            }
        }

        return {
            isOwner,
            canRead,
            canWrite,
            isWorld,
            groupIds: Array.from(groupEntries.keys()),
        };
    }

    /**
     * Resolves the permission state of an entity from its own rows.
     *
     * @param entityType The type of entity.
     * @param entityId The entity id.
     *
     * @returns The resolved permission state.
     */
    private async resolvePermission(entityType: EntityType, entityId: number): Promise<IResolvedPermission> {
        const [ownerRows, groupRows, worldGroupId] = await Promise.all([
            this.adapter.query<{ ownerId: number | null; }>(
                "SELECT owner_id AS ownerId FROM permissions WHERE entity_type = ? AND entity_id = ?",
                [entityType, entityId],
            ),
            this.adapter.query<{ groupId: number; writable: number; }>(
                "SELECT group_id AS groupId, writable FROM entity_groups WHERE entity_type = ? AND entity_id = ?",
                [entityType, entityId],
            ),
            this.getWorldGroupId(),
        ]);

        const groupEntries = new Map<number, boolean>();
        for (const row of groupRows) {
            groupEntries.set(row.groupId, Boolean(row.writable));
        }

        // Everybody is a member of the World group, so a write grant there would open the entity to the public.
        if (worldGroupId !== undefined && groupEntries.has(worldGroupId)) {
            groupEntries.set(worldGroupId, false);
        }

        return {
            ownerId: ownerRows[0]?.ownerId ?? null,
            groupEntries,
            worldGroupId,
        };
    }

    /**
     * @param user The authenticated user, or undefined for anonymous.
     *
     * @returns The ids of the groups the user belongs to, including World, which counts as a membership for
     * everybody. The result does not grant anything by itself; it is set against an entity's group assignments.
     */
    private async memberGroupIds(user: ITokenPayload | undefined): Promise<Set<number>> {
        const groupIds = new Set<number>();

        if (user) {
            // Group login: the user belongs only to the authenticated group.
            if (user.authType === "group" && user.groupId !== undefined) {
                groupIds.add(user.groupId);
            } else {
                const memberRows = await this.getUserGroups(user.userId);

                for (const row of memberRows) {
                    groupIds.add(row.groupId);
                }
            }
        }

        const worldGroupId = await this.getWorldGroupId();
        if (worldGroupId !== undefined) {
            groupIds.add(worldGroupId);
        }

        return groupIds;
    }

    private async getUserGroups(userId: number): Promise<Array<{ groupId: number; }>> {
        return this.adapter.query<{ groupId: number; }>(
            "SELECT group_id AS groupId FROM user_groups WHERE user_id = ?",
            [userId],
        );
    }

    private async firstMatchingGroupId(groupName: string): Promise<number | undefined> {
        const rows = await this.adapter.query<{ id: number; }>("SELECT id FROM `groups` WHERE name = ?",
            [groupName]);

        return rows[0]?.id;
    }

}
