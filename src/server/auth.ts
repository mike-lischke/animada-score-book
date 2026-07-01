/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Authentication and authorisation helpers for the Animada Score Book backend.
 *
 * ## Authentication Flow
 *
 * 1. **Login**: Client sends username + password → server verifies via scrypt, returns a JWT access token.
 * 2. **Request**: Client sends `Authorization: Bearer <token>` header on every subsequent request.
 * 3. **Refresh**: When the access token expires, client calls `/api?action=refresh` with the refresh token
 *    cookie to get a new access token.
 *
 * ## Permission Model
 *
 * Each entity (score, folder) has an optional `permissions` row with:
 * - `owner_id` — the owning user (NULL = inherited from parent)
 *
 * Groups are assigned via the `entity_groups` junction table:
 * - `entity_type`, `entity_id`, `group_id` — composite PK
 * - `writable` — whether the group has write access (read is implicit)
 *
 * Inheritance:
 * - An entity without its own `permissions` row inherits the owner from its parent.
 * - An entity inherits ALL group assignments from its ancestors (additive).
 * - An entity can add its own group assignments on top of inherited ones.
 * - Group assignments can never be removed from ancestors — only added.
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
export interface IEntityGroupEntry {
    groupId: number;
    writable: boolean;
}

/** The fully resolved permission state for an entity (after inheritance). */
export interface IResolvedPermission {
    /** The effective owner id, or null if no owner is set anywhere in the chain. */
    ownerId: number | null;
    /** All group assignments, collected from the entity and all ancestors. */
    groupEntries: IEntityGroupEntry[];
}

export interface ITokenPayload {
    userId: number;
    username: string;
    isAdmin: boolean;

    /** "user" for normal login, "group" for group-shared login. */
    authType?: string;

    /** The authenticated group ID (only set for group login). */
    groupId?: number;
}

export interface IWhoamiResponse {
    authenticated: boolean;
    user?: {
        id: number;
        username: string;
        displayName: string;
        isAdmin: boolean;
    };

    /** Set when the user authenticated via a group password. */
    group?: {
        id: number;
        name: string;
    };

    capabilities: ICapabilities;
}

export interface ICapabilities {
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

/** Name of the built-in administrators group. */
export const adminGroupName = "Admins";

/** Name of the built-in world (public) group. */
export const worldGroupName = "World";

/** Entity types used in the permissions table. */
export const enum EntityType {
    Score = "score",
    Folder = "folder",
    Feature = "feature",
}

/**
 * Feature constants used with EntityType.Feature.
 * The entity_id is NULL for features — the entity_type alone identifies them.
 */
export const Feature = {
    InstrumentEditor: "instrument-editor",
    Mp3Export: "mp3-export",
    UserManagement: "user-management",
} as const;

const scryptKeyLen = 64;
const scryptOptions = { N: 16384, r: 8, p: 1 };

// The JWT secret must be set via the JWT_SECRET environment variable.
const jwtSecret = (() => {
    // eslint-disable-next-line no-restricted-syntax
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET environment variable is required. Set it before starting the server.");
    }

    return secret;
})();

const accessTokenExpiry = "15m";
export const refreshTokenExpirySeconds = 7 * 24 * 60 * 60; // 7 days

/**
 * Hashes a password using scrypt.
 *
 * The output format is: `$s0$<params>$<salt>$<hash>`
 *   $s0$        — magic prefix
 *   <params>    — hex-encoded JSON of scrypt options (N, r, p)
 *   <salt>      — hex-encoded random salt (32 bytes)
 *   <hash>      — hex-encoded derived key
 *
 * @param password The plaintext password.
 *
 * @returns The hashed password string.
 */
export const hashPassword = async (password: string): Promise<string> => {
    const salt = crypto.randomBytes(32);
    const paramsStr = Buffer.from(JSON.stringify(scryptOptions)).toString("hex");
    const key = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(password, salt, scryptKeyLen, scryptOptions, (err, derivedKey) => {
            if (err) {
                reject(err);

                return;
            }

            resolve(derivedKey);
        });
    });

    return `$s0$${paramsStr}$${salt.toString("hex")}$${key.toString("hex")}`;
};

/**
 * Verifies a password against a hash produced by {@link hashPassword}.
 *
 * @param password The plaintext password to verify.
 * @param hash     The stored hash string.
 *
 * @returns True if the password matches.
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    const parts = hash.split("$");

    if (parts.length !== 5 || parts[1] !== "s0") {
        return false;
    }

    try {
        const options = JSON.parse(Buffer.from(parts[2], "hex").toString("utf-8")) as {
            N: number; r: number; p: number;
        };

        const salt = Buffer.from(parts[3], "hex");
        const expectedKey = Buffer.from(parts[4], "hex");
        const derivedKey = await new Promise<Buffer>((resolve, reject) => {
            crypto.scrypt(password, salt, scryptKeyLen, options, (err, key) => {
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
};

/**
 * Creates an access token for the given user.
 *
 * @param payload The token payload.
 *
 * @returns The signed JWT string.
 */
export const createAccessToken = (payload: ITokenPayload): string => {
    return jwt.sign(payload, jwtSecret, { expiresIn: accessTokenExpiry });
};

/**
 * Creates a refresh token for the given user.
 * Generates a random token, returns both the raw token (for the cookie)
 * and its SHA-256 hash (to store in the database for rotation).
 *
 * @returns The raw token, its hash, and its max age in seconds.
 */
export const createRefreshToken = (): { raw: string; hash: string; maxAge: number; } => {
    const raw = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");

    return { raw, hash, maxAge: refreshTokenExpirySeconds };
};

/**
 * Verifies a refresh token against the stored hash and rotates it.
 * On success, stores a new hash and returns the userId and a new raw token
 * (to be sent back as a cookie). On failure, clears the stored hash.
 *
 * @param adapter  The database adapter.
 * @param rawToken The raw refresh token from the cookie.
 *
 * @returns The userId and new raw token if valid, or undefined.
 */
export const verifyAndRotateRefreshToken = async (adapter: IDatabaseAdapter,
    rawToken: string,): Promise<{
        userId: number; newRawToken: string; authType?: string; groupId?: number;
    } | undefined> => {
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const rows = await adapter.query<{
        id: number; auth_type: string | null; group_id: number | null;
    }>(
        "SELECT id, auth_type, group_id FROM users WHERE refresh_token_hash = ?",
        [hash],
    );

    if (rows.length === 0) {
        return undefined;
    }

    const { id: userId, auth_type: authType, group_id: groupId } = rows[0];
    const newRaw = crypto.randomBytes(32).toString("hex");
    const newHash = crypto.createHash("sha256").update(newRaw).digest("hex");

    await adapter.execute("UPDATE users SET refresh_token_hash = ? WHERE id = ?", [newHash, userId]);

    return {
        userId,
        newRawToken: newRaw,
        authType: authType ?? undefined,
        groupId: groupId ?? undefined,
    };
};

export enum LoginAuditEvent {
    Login = "login",
    GroupLogin = "group_login",
    Refresh = "refresh",
    Logout = "logout",
}

/**
 * Records a login audit event.
 *
 * @param adapter   The database adapter.
 * @param userId    The user ID.
 * @param event     The type of login event.
 * @param groupId   The group ID (only for group_login events).
 * @param ipAddress The client IP address (optional).
 */
export const recordLoginAudit = async (adapter: IDatabaseAdapter, userId: number, event: LoginAuditEvent,
    groupId?: number, ipAddress?: string): Promise<void> => {
    await adapter.execute(
        `INSERT INTO login_audit (user_id, event, group_id, ip_address)
         VALUES (?, ?, ?, ?)`,
        [userId, event, groupId ?? null, ipAddress ?? null],
    );
};

/**
 * Verifies a JWT access token and returns its payload.
 *
 * @param token The JWT string.
 *
 * @returns The decoded payload, or undefined if invalid/expired.
 */
export const verifyToken = (token: string): ITokenPayload | undefined => {
    try {
        const decoded = jwt.verify(token, jwtSecret) as ITokenPayload & { type?: string; };

        // Refresh tokens cannot be used as access tokens.
        if (decoded.type === "refresh") {
            return undefined;
        }

        return {
            userId: decoded.userId,
            username: decoded.username,
            isAdmin: decoded.isAdmin,
            authType: decoded.authType,
            groupId: decoded.groupId,
        };
    } catch {
        return undefined;
    }
};

/**
 * Checks whether a user is a member of the Admins group.
 *
 * @param adapter The database adapter.
 * @param userId  The user id.
 * @returns True if the user is in the Admins group.
 */
export const isUserInAdminGroup = async (adapter: IDatabaseAdapter, userId: number): Promise<boolean> => {
    const rows = await adapter.query<{ cnt: number; }>(
        `SELECT COUNT(*) AS cnt FROM user_groups ug
         JOIN \`groups\` g ON ug.group_id = g.id
         WHERE ug.user_id = ? AND g.name = ?`,
        [userId, adminGroupName],
    );

    return (rows[0]?.cnt ?? 0) > 0;
};

/**
 * Returns the ID of the World group.
 *
 * @param adapter The database adapter.
 * @returns The World group id, or undefined if it does not exist.
 */
export const getWorldGroupId = async (adapter: IDatabaseAdapter): Promise<number | undefined> => {
    const rows = await adapter.query<{ id: number; }>(
        "SELECT id FROM `groups` WHERE name = ?",
        [worldGroupName],
    );

    return rows[0]?.id;
};

/**
 * Returns the ID of the Admins group.
 *
 * @param adapter The database adapter.
 * @returns The Admins group id, or undefined if it does not exist.
 */
export const getAdminGroupId = async (adapter: IDatabaseAdapter): Promise<number | undefined> => {
    const rows = await adapter.query<{ id: number; }>(
        "SELECT id FROM `groups` WHERE name = ?",
        [adminGroupName],
    );

    return rows[0]?.id;
};

/**
 * Resolves the effective owner for an entity by walking up the tree.
 * Returns the first non-null owner_id found, or null if none exists.
 *
 * @param adapter    The database adapter.
 * @param entityType The type of entity.
 * @param entityId   The entity id.
 * @returns The resolved owner id, or null.
 */
const resolveOwner = async (adapter: IDatabaseAdapter, entityType: string,
    entityId: number): Promise<number | null> => {
    // Check for an explicit owner on this entity.
    const rows = await adapter.query<{ owner_id: number | null; }>(
        "SELECT owner_id FROM permissions WHERE entity_type = ? AND entity_id = ?",
        [entityType, entityId],
    );

    if (rows.length > 0 && rows[0].owner_id !== null) {
        return rows[0].owner_id;
    }

    // For scores, walk up to the parent folder.
    if ((entityType as EntityType) === EntityType.Score) {
        const scoreRows = await adapter.query<{ folderid: number | null; }>(
            "SELECT folderid FROM scores WHERE id = ?",
            [entityId],
        );

        if (scoreRows[0]?.folderid !== null) {
            return resolveOwner(adapter, EntityType.Folder, scoreRows[0].folderid);
        }
    }

    // For folders, walk up to the parent folder.
    if ((entityType as EntityType) === EntityType.Folder) {
        const folderRows = await adapter.query<{ parentid: number | null; }>(
            "SELECT parentid FROM folders WHERE id = ?",
            [entityId],
        );

        if (folderRows[0]?.parentid !== null) {
            return resolveOwner(adapter, EntityType.Folder, folderRows[0].parentid);
        }
    }

    return null;
};

/**
 * Collects all group assignments for an entity by walking up the tree.
 * Groups are additive: the entity inherits all groups from all ancestors
 * plus any explicitly assigned groups.
 *
 * @param adapter    The database adapter.
 * @param entityType The type of entity.
 * @param entityId   The entity id.
 * @param collected  Accumulator map (groupId → writable). Pass a new Map() on first call.
 * @returns A map of groupId → writable.
 */
const collectGroupEntries = async (adapter: IDatabaseAdapter, entityType: string, entityId: number,
    collected: Map<number, boolean>,): Promise<Map<number, boolean>> => {
    // Collect explicit group assignments for this entity.
    const rows = await adapter.query<{ group_id: number; writable: number; }>(
        "SELECT group_id, writable FROM entity_groups WHERE entity_type = ? AND entity_id = ?",
        [entityType, entityId],
    );

    for (const r of rows) {
        // Children can upgrade from read to write but never downgrade from write to read.
        const existing = collected.get(r.group_id);

        if (existing === undefined || (!existing && Boolean(r.writable))) {
            collected.set(r.group_id, Boolean(r.writable));
        }
    }

    // Walk up to the parent.
    if ((entityType as EntityType) === EntityType.Score) {
        const scoreRows = await adapter.query<{ folderid: number | null; }>(
            "SELECT folderid FROM scores WHERE id = ?",
            [entityId],
        );

        if (scoreRows[0]?.folderid !== null) {
            return collectGroupEntries(adapter, EntityType.Folder, scoreRows[0].folderid, collected);
        }
    }

    if ((entityType as EntityType) === EntityType.Folder) {
        const folderRows = await adapter.query<{ parentid: number | null; }>(
            "SELECT parentid FROM folders WHERE id = ?",
            [entityId],
        );

        if (folderRows[0]?.parentid !== null) {
            return collectGroupEntries(adapter, EntityType.Folder, folderRows[0].parentid, collected);
        }
    }

    return collected;
};

/**
 * Resolves the full effective permission state for an entity by combining
 * the inherited owner and the additive group assignments.
 *
 * @param adapter    The database adapter.
 * @param entityType The type of entity.
 * @param entityId   The entity id.
 * @returns The resolved permission state.
 */
const resolvePermission = async (adapter: IDatabaseAdapter, entityType: string,
    entityId: number): Promise<IResolvedPermission> => {
    const [ownerId, groupEntries] = await Promise.all([
        resolveOwner(adapter, entityType, entityId),
        collectGroupEntries(adapter, entityType, entityId, new Map()),
    ]);

    return {
        ownerId,
        groupEntries: Array.from(groupEntries.entries()).map(([groupId, writable]) => {
            return { groupId, writable };
        }),
    };
};

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
 * @param adapter      The database adapter.
 * @param user         The authenticated user, or undefined for anonymous.
 * @param entityType   The type of entity ("score", "folder", "feature").
 * @param entityId     The entity id, or null for features.
 * @param requiredLevel The required access level (Read or Write).
 * @returns True if the user has the required access.
 */
export const checkPermission = async (adapter: IDatabaseAdapter, user: ITokenPayload | undefined,
    entityType: string, entityId: number | null, requiredLevel: AccessLevel,): Promise<boolean> => {
    // Admin users always have full access.
    if (user && await isUserInAdminGroup(adapter, user.userId)) {
        return true;
    }

    // Features: currently only admins get access (features will be reworked separately).
    if ((entityType as EntityType) === EntityType.Feature) {
        return false;
    }

    if (entityId === null) {
        return false;
    }

    const resolved = await resolvePermission(adapter, entityType, entityId);

    // Owner always has full access.
    if (resolved.ownerId !== null && resolved.ownerId === user?.userId) {
        return true;
    }

    // Collect all group IDs the user belongs to.
    const userGroupIds = new Set<number>();

    if (user) {
        // Group login: user belongs only to the authenticated group.
        if (user.authType === "group" && user.groupId !== undefined) {
            userGroupIds.add(user.groupId);
        } else {
            // Normal login: collect all group memberships.
            const memberRows = await adapter.query<{ group_id: number; }>(
                "SELECT group_id FROM user_groups WHERE user_id = ?",
                [user.userId],
            );

            for (const r of memberRows) {
                userGroupIds.add(r.group_id);
            }
        }
    }

    // Also include the World group — everyone is a member.
    const worldId = await getWorldGroupId(adapter);

    if (worldId !== undefined) {
        userGroupIds.add(worldId);
    }

    // Check group assignments.
    for (const entry of resolved.groupEntries) {
        if (!userGroupIds.has(entry.groupId)) {
            continue;
        }

        // Read is always granted for any matching group.
        if (requiredLevel === AccessLevel.Read) {
            return true;
        }

        // Write requires the writable flag.
        if (entry.writable) {
            return true;
        }
    }

    return false;
};

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

/**
 * Computes a permission summary for a user on an entity.
 * Used by list endpoints that need to attach permission metadata to each returned row.
 *
 * @param adapter    The database adapter.
 * @param user       The authenticated user, or undefined for anonymous.
 * @param entityType The type of entity ("score", "folder").
 * @param entityId   The entity id.
 *
 * @returns A summary of the user's access.
 */
export const getPermissionSummary = async (adapter: IDatabaseAdapter, user: ITokenPayload | undefined,
    entityType: string, entityId: number): Promise<IPermissionSummary> => {
    const isAdmin = user ? await isUserInAdminGroup(adapter, user.userId) : false;

    const resolved = await resolvePermission(adapter, entityType, entityId);

    const isOwner = resolved.ownerId !== null && resolved.ownerId === user?.userId;

    // Collect user's group memberships.
    const userGroupIds = new Set<number>();

    if (user) {
        if (user.authType === "group" && user.groupId !== undefined) {
            userGroupIds.add(user.groupId);
        } else {
            const memberRows = await adapter.query<{ group_id: number; }>(
                "SELECT group_id FROM user_groups WHERE user_id = ?",
                [user.userId],
            );

            for (const r of memberRows) {
                userGroupIds.add(r.group_id);
            }
        }
    }

    const worldId = await getWorldGroupId(adapter);

    if (worldId !== undefined) {
        userGroupIds.add(worldId);
    }

    let canRead = isAdmin || isOwner;
    let canWrite = isAdmin || isOwner;

    const isWorld = worldId !== undefined
        && resolved.groupEntries.some((e) => {
            return e.groupId === worldId;
        });

    for (const entry of resolved.groupEntries) {
        if (!userGroupIds.has(entry.groupId)) {
            continue;
        }

        canRead = true;

        if (entry.writable) {
            canWrite = true;
        }
    }

    return {
        isOwner,
        canRead,
        canWrite,
        isWorld,
        groupIds: resolved.groupEntries.map((e) => {
            return e.groupId;
        }),
    };
};

/**
 * Sets the owner for an entity. An explicit NULL means "inherit from parent"
 * (the row is deleted, so the inheritance chain takes over).
 *
 * @param adapter    The database adapter.
 * @param entityType The entity type.
 * @param entityId   The entity id.
 * @param ownerId    The new owner id, or null to remove the explicit owner (inherit).
 */
export const setOwner = async (adapter: IDatabaseAdapter, entityType: string, entityId: number,
    ownerId: number | null): Promise<void> => {
    if (ownerId === null) {
        // Remove the explicit row — inheritance takes over.
        await adapter.execute(
            "DELETE FROM permissions WHERE entity_type = ? AND entity_id = ?",
            [entityType, entityId],
        );

        return;
    }

    // Upsert: set the owner.
    await adapter.execute(
        `INSERT INTO permissions (entity_type, entity_id, owner_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id)`,
        [entityType, entityId, ownerId],
    );
};

/**
 * Adds a group assignment to an entity. If the group is already assigned,
 * the writable flag is updated (only upgraded — never downgraded via this function).
 *
 * @param adapter    The database adapter.
 * @param entityType The entity type.
 * @param entityId   The entity id.
 * @param groupId    The group id.
 * @param writable   Whether the group has write access.
 */
export const addEntityGroup = async (adapter: IDatabaseAdapter, entityType: string, entityId: number,
    groupId: number, writable: boolean): Promise<void> => {
    await adapter.execute(
        `INSERT INTO entity_groups (entity_type, entity_id, group_id, writable)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE writable = GREATEST(writable, VALUES(writable))`,
        [entityType, entityId, groupId, writable ? 1 : 0],
    );
};

/**
 * Removes a group assignment from an entity.
 *
 * @param adapter    The database adapter.
 * @param entityType The entity type.
 * @param entityId   The entity id.
 * @param groupId    The group id.
 */
export const removeEntityGroup = async (adapter: IDatabaseAdapter, entityType: string, entityId: number,
    groupId: number): Promise<void> => {
    await adapter.execute(
        "DELETE FROM entity_groups WHERE entity_type = ? AND entity_id = ? AND group_id = ?",
        [entityType, entityId, groupId],
    );
};

/**
 * Returns the explicit group assignments for an entity (not inherited).
 *
 * @param adapter    The database adapter.
 * @param entityType The entity type.
 * @param entityId   The entity id.
 * @returns The list of group entries for this entity only.
 */
export const getExplicitEntityGroups = async (adapter: IDatabaseAdapter, entityType: string,
    entityId: number): Promise<IEntityGroupEntry[]> => {
    const rows = await adapter.query<{ group_id: number; writable: number; }>(
        "SELECT group_id, writable FROM entity_groups WHERE entity_type = ? AND entity_id = ?",
        [entityType, entityId],
    );

    return rows.map((r) => {
        return { groupId: r.group_id, writable: Boolean(r.writable) };
    });
};

/**
 * Returns the explicit owner for an entity (or null if inherited/deleted).
 *
 * @param adapter    The database adapter.
 * @param entityType The entity type.
 * @param entityId   The entity id.
 * @returns The owner id, or null.
 */
export const getExplicitOwner = async (adapter: IDatabaseAdapter, entityType: string,
    entityId: number): Promise<number | null> => {
    const rows = await adapter.query<{ owner_id: number | null; }>(
        "SELECT owner_id FROM permissions WHERE entity_type = ? AND entity_id = ?",
        [entityType, entityId],
    );

    return rows[0]?.owner_id ?? null;
};

/**
 * Builds the capabilities object for a user.
 * Currently a simple admin check. When per-feature permissions are seeded,
 * this will check individual feature permissions.
 *
 * @param adapter The database adapter.
 * @param user    The authenticated user, or undefined for anonymous.
 * @returns The capabilities object.
 */
export const buildCapabilities = async (adapter: IDatabaseAdapter, user: ITokenPayload | undefined,
): Promise<ICapabilities> => {
    if (user && await isUserInAdminGroup(adapter, user.userId)) {
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
};

/**
 * Checks whether any real (non-anonymous) users exist in the database.
 *
 * @param adapter The database adapter.
 * @returns True if at least one non-anonymous user exists.
 */
export const hasUsers = async (adapter: IDatabaseAdapter): Promise<boolean> => {
    const rows = await adapter.query<{ cnt: number; }>(
        "SELECT COUNT(*) AS cnt FROM users WHERE username != 'anonymous'",
    );

    return (rows[0]?.cnt ?? 0) > 0;
};
