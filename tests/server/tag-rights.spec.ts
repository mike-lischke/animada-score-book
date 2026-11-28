/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Auth, EntityType, type ITokenPayload } from "../../src/server/Auth.js";
import type { ITagRow } from "../../src/server/TagAccess.js";
import { TagRights } from "../../src/server/TagRights.js";
import {
    FakeSetListDatabase, adminUserId, foreignGroupId, foreignUserId, memberGroupId, memberUserId, ownerUserId,
} from "./set-list-fake-database.js";

const setup = (): { database: FakeSetListDatabase; auth: Auth; } => {
    const database = new FakeSetListDatabase();

    return { database, auth: new Auth(database) };
};

/**
 * @param userId The user to act as.
 *
 * @returns The caller the tag rules evaluate.
 */
const callerOf = (userId: number): ITokenPayload => {
    return { userId, email: `user${userId}@example.com`, isAdmin: false };
};

/**
 * @param id The tag id.
 * @param name Its name.
 *
 * @returns A tag row as the queries hand it over.
 */
const tagRow = (id: number, name: string): ITagRow => {
    return { id, name, colorIndex: 0, ownerUserId: null, ownerGroupId: null, systemKey: null };
};

describe("TagRights — sharing", () => {
    it("grants a tag to the members of the group it is shared with", async () => {
        const { database, auth } = setup();
        const tag: ITagRow = { ...tagRow(70, "Wettkampf"), ownerUserId: ownerUserId };
        database.seedGrants(EntityType.Tag, tag.id, ownerUserId, [memberGroupId]);

        const members = await TagRights.of(auth, callerOf(memberUserId), [tag]);
        expect(members.get(tag.id)?.readable).toBe(true);

        // Sharing grants reading, never changing the tag itself.
        expect(members.get(tag.id)?.editable).toBe(false);

        const strangers = await TagRights.of(auth, callerOf(foreignUserId), [tag]);
        expect(strangers.get(tag.id)).toBeUndefined();
    });

    it("keeps a personal tag with its user until it is shared", async () => {
        const { database, auth } = setup();
        const tag: ITagRow = { ...tagRow(71, "Meins"), ownerUserId: ownerUserId };

        expect((await TagRights.of(auth, callerOf(ownerUserId), [tag])).get(tag.id)?.editable).toBe(true);
        expect((await TagRights.of(auth, callerOf(foreignUserId), [tag])).get(tag.id)).toBeUndefined();

        database.seedGrants(EntityType.Tag, tag.id, ownerUserId, [foreignGroupId]);
        expect((await TagRights.of(auth, callerOf(foreignUserId), [tag])).get(tag.id)?.readable).toBe(true);
    });

    it("lets a member of the owning group change the tag", async () => {
        const { auth } = setup();
        const tag: ITagRow = { ...tagRow(72, "Bateria Vokabular"), ownerGroupId: memberGroupId };

        const rights = (await TagRights.of(auth, callerOf(memberUserId), [tag])).get(tag.id);
        expect(rights?.readable).toBe(true);
        expect(rights?.editable).toBe(true);
    });

    it("gives an administrator every tag without a grant", async () => {
        const { auth } = setup();
        const tag: ITagRow = { ...tagRow(73, "Fremd"), ownerGroupId: foreignGroupId };

        const rights = (await TagRights.of(auth, callerOf(adminUserId), [tag])).get(tag.id);
        expect(rights?.readable).toBe(true);
        expect(rights?.editable).toBe(true);
    });
});

describe("TagRights — set-list tags", () => {
    it("follows the list instead of the tag's own owner", async () => {
        const { database, auth } = setup();
        const seeded = database.seedSetList("Auftritt", undefined, 1, ownerUserId);
        database.seedGrants(EntityType.SetList, seeded.id, ownerUserId, [memberGroupId]);

        const tag = database.tags.find((entry) => {
            return entry.id === seeded.tagId;
        })!;

        // A member of a group the list is shared with reaches the tag, but cannot change it.
        const members = (await TagRights.of(auth, callerOf(memberUserId), [tag])).get(tag.id);
        expect(members?.readable).toBe(true);
        expect(members?.editable).toBe(false);

        const owner = (await TagRights.of(auth, callerOf(ownerUserId), [tag])).get(tag.id);
        expect(owner?.editable).toBe(true);

        const strangers = await TagRights.of(auth, callerOf(foreignUserId), [tag]);
        expect(strangers.get(tag.id)).toBeUndefined();
    });
});
