/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

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
 * ## Permission Model (Linux-style rwx)
 *
 * Each entity (score, folder, feature) has one `permissions` row with:
 * - `owner_id`   — the owning user (NULL for world-only entities)
 * - `group_id`   — the owning group (NULL for no group access)
 * - `perm_bits`  — 9-bit mask: `OOOGGGWWW` where each triple is rwx (4=read, 2=write, 1=execute)
 *
 * - Admin users bypass all permission checks.
 * - Scores inherit permissions from their parent folder when no explicit permission entry exists.
 * - Folders inherit from their parent folder.
 * - Anonymous users only get world bits.
 *
 * ## Token Storage
 *
 * - Access token: stored in memory on the client (never in localStorage).
 * - Refresh token: httpOnly cookie set by the server.
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import type { IDatabaseAdapter } from "./database.js";

// ---------- Types ----------

export interface IUserRow {
    id: number;
    username: string;
    password_hash: string;
    display_name: string;
    is_admin: boolean;
}

export interface IGroupRow {
    id: number;
    name: string;
    description: string;
}

export interface IPermissionRow {
    id: number;
    entity_type: string;
    entity_id: number | null;
    owner_id: number | null;
    group_id: number | null;
    perm_bits: number;
}

export interface ITokenPayload {
    userId: number;
    username: string;
    isAdmin: boolean;
}

export interface IWhoamiResponse {
    authenticated: boolean;
    user?: {
        id: number;
        username: string;
        displayName: string;
        isAdmin: boolean;
    };
    capabilities: ICapabilities;
}

export interface ICapabilities {
    canEditScores: boolean;
    canManageUsers: boolean;
    canManageInstruments: boolean;
    canExportMP3: boolean;
}

/** Permission bit constants (r=4, w=2, x=1). */
export const enum Perm {
    None = 0,
    X = 1,
    W = 2,
    WX = 3,
    R = 4,
    RX = 5,
    RW = 6,
    RWX = 7,
}

/** Bit shifts for the three triples in a 9-bit permission mask. */
const worldShift = 0;
const groupShift = 3;
const ownerShift = 6;

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

// Hard-coded JWT secret for development. In production this should come from an environment variable.
const jwtSecret = process.env.jwtSecret ?? "animada-score-book-dev-secret-change-in-production";
const accessTokenExpiry = "15m";
const refreshTokenExpirySeconds = 7 * 24 * 60 * 60; // 7 days

// ---------- Password Hashing ----------

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
 * @returns True if the password matches.
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    const parts = hash.split("$");

    if (parts.length !== 5 || parts[1] !== "s0") {
        return false;
    }

    const options = JSON.parse(Buffer.from(parts[2], "hex").toString("utf-8")) as {
        N: number; r: number; p: number;
    };
    const salt = Buffer.from(parts[3], "hex");
    const expectedKey = Buffer.from(parts[4], "hex");

    try {
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

// ---------- JWT ----------

/**
 * Creates an access token for the given user.
 *
 * @param payload The token payload.
 * @returns The signed JWT string.
 */
export const createAccessToken = (payload: ITokenPayload): string => {
    return jwt.sign(payload, jwtSecret, { expiresIn: accessTokenExpiry });
};

/**
 * Creates a refresh token for the given user.
 * Refresh tokens have a longer lifetime and are stored in an httpOnly cookie.
 *
 * @param payload The token payload.
 * @returns The signed JWT string and its expiry time in seconds.
 */
export const createRefreshToken = (payload: ITokenPayload): { token: string; maxAge: number; } => {
    const token = jwt.sign(
        { ...payload, type: "refresh" },
        jwtSecret,
        { expiresIn: refreshTokenExpirySeconds },
    );

    return { token, maxAge: refreshTokenExpirySeconds };
};

/**
 * Verifies a JWT token and returns its payload.
 *
 * @param token The JWT string.
 * @returns The decoded payload, or undefined if invalid/expired.
 */
export const verifyToken = (token: string): ITokenPayload | undefined => {
    try {
        const decoded = jwt.verify(token, jwtSecret) as ITokenPayload & { type?: string; };

        // Refresh tokens cannot be used as access tokens.
        if (decoded.type === "refresh") {
            return undefined;
        }

        return { userId: decoded.userId, username: decoded.username, isAdmin: decoded.isAdmin };
    } catch {
        return undefined;
    }
};

/**
 * Verifies a refresh token.
 *
 * @param token The refresh token string.
 * @returns The decoded payload, or undefined if invalid/expired.
 */
export const verifyRefreshToken = (token: string): ITokenPayload | undefined => {
    try {
        const decoded = jwt.verify(token, jwtSecret) as ITokenPayload & { type?: string; };

        if (decoded.type !== "refresh") {
            return undefined;
        }

        return { userId: decoded.userId, username: decoded.username, isAdmin: decoded.isAdmin };
    } catch {
        return undefined;
    }
};

// ---------- Permission Checking ----------

/**
 * Extracts the permission bits for a specific role from a 9-bit permission mask.
 *
 * @param permBits The full 9-bit permission mask.
 * @param shift    The bit shift for the role (worldShift, groupShift, or ownerShift).
 * @returns The 3-bit permission value (0-7).
 */
const getRolePerm = (permBits: number, shift: number): number => {
    return (permBits >> shift) & 0x7;
};

/**
 * Checks whether a user has the required permission on an entity.
 *
 * Permission check order:
 * 1. Admin users always have full access.
 * 2. If the user is the owner, check owner bits.
 * 3. If the user is a member of the entity's group, check group bits.
 * 4. Otherwise, check world bits.
 * 5. Anonymous users only get world bits.
 *
 * For scores without explicit permissions, permissions are inherited from the parent folder.
 *
 * @param adapter      The database adapter.
 * @param user         The authenticated user, or undefined for anonymous.
 * @param entityType   The type of entity ("score", "folder", "feature").
 * @param entityId     The entity id, or null for features.
 * @param requiredPerm The required permission bit(s) (e.g. Perm.R | Perm.W).
 * @returns True if the user has the required permission.
 */
export const checkPermission = async (
    adapter: IDatabaseAdapter,
    user: ITokenPayload | undefined,
    entityType: string,
    entityId: number | null,
    requiredPerm: number,
): Promise<boolean> => {
    // Admin users always have full access.
    if (user?.isAdmin) {
        return true;
    }

    const permRow = await resolvePermission(adapter, entityType, entityId);

    // No permission row exists — deny access for safety.
    if (!permRow) {
        return false;
    }

    // Check owner bits.
    if (permRow.owner_id === user?.userId) {
        return (getRolePerm(permRow.perm_bits, ownerShift) & requiredPerm) === requiredPerm;
    }

    // Check group bits if the user belongs to the entity's group.
    if (user && permRow.group_id !== null) {
        const memberRows = await adapter.query<{ user_id: number; }>(
            "SELECT user_id FROM user_groups WHERE group_id = ? AND user_id = ?",
            [permRow.group_id, user.userId],
        );

        if (memberRows.length > 0) {
            return (getRolePerm(permRow.perm_bits, groupShift) & requiredPerm) === requiredPerm;
        }
    }

    // Fall back to world bits (also used for anonymous users).
    return (getRolePerm(permRow.perm_bits, worldShift) & requiredPerm) === requiredPerm;
};

/**
 * Resolves the effective permission row for an entity, following the inheritance chain.
 *
 * - For features: looks up the exact row.
 * - For folders: looks up the exact row; if none exists, inherits from parent folder.
 * - For scores: looks up the exact row; if none exists, inherits from the score's folder.
 *
 * @param adapter    The database adapter.
 * @param entityType The type of entity.
 * @param entityId   The entity id, or null for features.
 * @returns The resolved permission row, or undefined if no permission could be resolved.
 */
const resolvePermission = async (
    adapter: IDatabaseAdapter,
    entityType: string,
    entityId: number | null,
): Promise<IPermissionRow | undefined> => {
    // Look for an explicit permission entry.
    const rows = await adapter.query(
        "SELECT * FROM permissions WHERE entity_type = ? AND entity_id <=> ?",
        [entityType, entityId],
    );

    if (rows.length > 0) {
        const r = rows[0];

        return {
            id: Number(r.id),
            entity_type: String(r.entity_type),
            entity_id: r.entity_id !== null ? Number(r.entity_id) : null,
            owner_id: r.owner_id !== null ? Number(r.owner_id) : null,
            group_id: r.group_id !== null ? Number(r.group_id) : null,
            perm_bits: Number(r.perm_bits),
        };
    }

    // For scores, inherit from the parent folder.
    if (entityType === "score" && entityId !== null) {
        const scoreRows = await adapter.query<{ folderid: number | null; }>(
            "SELECT folderid FROM scores WHERE id = ?",
            [entityId],
        );

        const folderId = scoreRows[0]?.folderid ?? null;

        if (folderId !== null) {
            return resolvePermission(adapter, "folder", folderId);
        }

        // Score at root — look for root folder permissions or return undefined.
        return undefined;
    }

    // For folders, inherit from the parent folder.
    if (entityType === "folder" && entityId !== null) {
        const folderRows = await adapter.query<{ parentid: number | null; }>(
            "SELECT parentid FROM folders WHERE id = ?",
            [entityId],
        );

        const parentId = folderRows[0]?.parentid ?? null;

        if (parentId !== null) {
            return resolvePermission(adapter, "folder", parentId);
        }

        // Root folder — no inheritance, return undefined.
        return undefined;
    }

    // Features without explicit permissions are denied.
    return undefined;
};

/**
 * Sets or updates permissions for an entity.
 * Uses INSERT … ON DUPLICATE KEY UPDATE (MySQL) / INSERT … ON CONFLICT (Postgres) semantics.
 *
 * @param adapter    The database adapter.
 * @param entityType The entity type.
 * @param entityId   The entity id, or null for features.
 * @param ownerId    The owning user id, or null.
 * @param groupId    The owning group id, or null.
 * @param permBits   The 9-bit permission mask.
 */
export const setPermissions = async (
    adapter: IDatabaseAdapter,
    entityType: string,
    entityId: number | null,
    ownerId: number | null,
    groupId: number | null,
    permBits: number,
): Promise<void> => {
    // Delete any existing row for this entity first.
    await adapter.execute(
        "DELETE FROM permissions WHERE entity_type = ? AND entity_id <=> ?",
        [entityType, entityId],
    );

    // Insert new row.
    await adapter.execute(
        `INSERT INTO permissions (entity_type, entity_id, owner_id, group_id, perm_bits)
         VALUES (?, ?, ?, ?, ?)`,
        [entityType, entityId, ownerId, groupId, permBits],
    );
};

/**
 * Computes a 9-bit permission mask from individual owner, group, and world permission values.
 *
 * @param ownerPerm The owner permission bits (0-7).
 * @param groupPerm The group permission bits (0-7).
 * @param worldPerm The world permission bits (0-7).
 * @returns The combined 9-bit mask.
 */
export const makePermBits = (ownerPerm: number, groupPerm: number, worldPerm: number): number => {
    return (ownerPerm << ownerShift) | (groupPerm << groupShift) | (worldPerm << worldShift);
};

/**
 * Builds the capabilities object for a user.
 *
 * @param adapter The database adapter.
 * @param user    The authenticated user, or undefined for anonymous.
 * @returns The capabilities object.
 */
export const buildCapabilities = async (
    adapter: IDatabaseAdapter,
    user: ITokenPayload | undefined,
): Promise<ICapabilities> => {
    const canEditScores = await checkPermission(adapter, user, "feature", null, Perm.W);
    // Feature-based capabilities — currently always fall through to admin-only.
    // Once per-feature permissions are seeded, these checks will take effect.
    const canManageInstruments = await checkPermission(
        adapter, user, "feature", null, Perm.W,
    );
    const canExportMP3 = await checkPermission(adapter, user, "feature", null, Perm.X);

    return {
        canEditScores: user?.isAdmin ?? canEditScores,
        canManageUsers: user?.isAdmin ?? false,
        canManageInstruments: user?.isAdmin ?? canManageInstruments,
        canExportMP3: user?.isAdmin ?? canExportMP3,
    };
};

/**
 * Checks whether any users exist in the database.
 *
 * @param adapter The database adapter.
 * @returns True if at least one user exists.
 */
export const hasUsers = async (adapter: IDatabaseAdapter): Promise<boolean> => {
    const rows = await adapter.query<{ cnt: number; }>("SELECT COUNT(*) AS cnt FROM users");

    return (rows[0]?.cnt ?? 0) > 0;
};
