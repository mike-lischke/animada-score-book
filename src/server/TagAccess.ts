/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type Auth, type ITokenPayload } from "./Auth.js";
import type { DbRow } from "./database.js";

/** A tag row, read with the column aliases the queries state. */
export interface ITagRow extends DbRow {
    id: number;
    name: string;

    /** The index of the tag's colour in the fixed palette. */
    colorIndex: number;

    /** The group that owns the tag, or null for a global tag (owned by the administrators). */
    groupId: number | null;

    /** Set only for system tags, which code uses instead of a name or id. */
    systemKey: string | null;
}

/** What distinguishes the system tags from the tags a user creates. */
export enum SystemTagKind {
    Instrument = "instrument",
    Demo = "demo",
}

/**
 * The tag rules of one caller, gathered once per request: which tags the caller can see, where they may create
 * tags, and which of the visible tags they own. Building it needs three queries, the checks themselves none.
 */
export interface ITagAccessContext {
    /** Visitors without a session get no tags at all. */
    isSignedIn: boolean;
    userId?: number;
    isAdmin: boolean;

    /** The groups the caller belongs to, which makes their tags usable. */
    memberGroupIds: number[];

    /** The groups the caller administers, which makes their tags usable and editable. */
    adminGroupIds: number[];
}

export class TagAccess {
    /** `system_key` of the tag that defines the demo catalog. */
    public static readonly demoSystemKey = "demo";

    /** Prefix of the `system_key` of an instrument tag; the instrument type id follows it. */
    public static readonly instrumentSystemKeyPrefix = "instrument:";

    /** Name of the owner scope of the global tags, which the tag row itself does not carry. */
    public static readonly globalScopeName = "Global";

    /** The longest name a tag may carry. The `name` column holds 100 characters, so there is headroom left. */
    public static readonly maxNameLength = 64;

    /**
     * @param typeId The instrument type id ("0"–"9", "a").
     *
     * @returns The `system_key` of the instrument tag for that type.
     */
    public static instrumentSystemKey(typeId: string): string {
        return `${TagAccess.instrumentSystemKeyPrefix}${typeId}`;
    }

    /**
     * @param tag The tag to classify.
     *
     * @returns The kind of system tag, or undefined for a tag a user created.
     */
    public static systemKind(tag: ITagRow): SystemTagKind | undefined {
        if (tag.systemKey === TagAccess.demoSystemKey) {
            return SystemTagKind.Demo;
        }

        if (tag.systemKey?.startsWith(TagAccess.instrumentSystemKeyPrefix)) {
            return SystemTagKind.Instrument;
        }

        return undefined;
    }

    /**
     * @param tag The tag to inspect.
     *
     * @returns The instrument type id an instrument tag stands for, so the client can map an instrument to its tag
     * without relying on the name.
     */
    public static instrumentTypeId(tag: ITagRow): string | undefined {
        if (!tag.systemKey?.startsWith(TagAccess.instrumentSystemKeyPrefix)) {
            return undefined;
        }

        return tag.systemKey.slice(TagAccess.instrumentSystemKeyPrefix.length);
    }

    /**
     * @param auth The authentication helper, used for the admin and group queries.
     * @param user The authenticated caller, or undefined for a visitor.
     *
     * @returns The rules that apply to this caller.
     */
    public static async contextFor(auth: Auth, user: ITokenPayload | undefined): Promise<ITagAccessContext> {
        if (!user) {
            return { isSignedIn: false, isAdmin: false, memberGroupIds: [], adminGroupIds: [] };
        }

        const isAdmin = await auth.isUserInAdminGroup(user.userId);

        let memberGroupIds: number[];
        if (user.authType === "group" && user.groupId !== undefined) {
            memberGroupIds = [user.groupId];
        } else {
            const rows = await auth.adapter.query<{ groupId: number; }>(
                "SELECT group_id AS groupId FROM user_groups WHERE user_id = ?", [user.userId],
            );
            memberGroupIds = rows.map((row) => {
                return row.groupId;
            });
        }

        const adminRows = await auth.adapter.query<{ id: number; }>(
            "SELECT id FROM `groups` WHERE admin_id = ?", [user.userId],
        );
        const adminGroupIds = adminRows.map((row) => {
            return row.id;
        });

        return { isSignedIn: true, userId: user.userId, isAdmin, memberGroupIds, adminGroupIds };
    }

    /**
     * @param context The rules of the caller.
     * @param tag The tag in question.
     *
     * @returns Whether the caller may see and use the tag. Everything else about a tag is invisible to a caller
     * who cannot use it: it stays out of the catalogue, the completions, a score's tag row and a filter.
     */
    public static canUse(context: ITagAccessContext, tag: ITagRow): boolean {
        if (!context.isSignedIn) {
            return false;
        }

        if (tag.groupId === null) {
            return true;
        }

        return context.memberGroupIds.includes(tag.groupId) || context.adminGroupIds.includes(tag.groupId);
    }

    /**
     * @param context The rules of the caller.
     * @param tag The tag in question.
     *
     * @returns Whether the caller owns the tag's scope, which is what editing and deleting a tag needs. Global
     * tags belong to the administrators together; a group tag belongs to that group, and administrators have no
     * extra rights on it.
     */
    public static owns(context: ITagAccessContext, tag: ITagRow): boolean {
        if (tag.groupId === null) {
            return context.isAdmin;
        }

        return context.adminGroupIds.includes(tag.groupId);
    }

    /**
     * @param context The rules of the caller.
     * @param groupId The owner scope in question; undefined names the global scope.
     *
     * @returns Whether the caller may create tags in the given owner scope.
     */
    public static canOwnScope(context: ITagAccessContext, groupId: number | undefined): boolean {
        if (groupId === undefined) {
            return context.isAdmin;
        }

        return context.adminGroupIds.includes(groupId);
    }

    /**
     * @param context The rules of the caller.
     * @param tag The tag in question.
     *
     * @returns Whether the caller may put the tag on a score. A tag is its own entity, so this follows the tag, not
     * the score: only the owners of its scope manage it, which makes a global tag an administrator's business and a
     * group tag the business of that group's administrator. `Demo Score` is global and follows the same rule.
     */
    public static canAssign(context: ITagAccessContext, tag: ITagRow): boolean {
        return TagAccess.owns(context, tag);
    }
}
