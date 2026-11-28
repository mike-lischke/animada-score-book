/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { TagCombination } from "../../src/core/TagCombination.js";
import { Auth, type ITokenPayload } from "../../src/server/Auth.js";
import { SetListAccess } from "../../src/server/SetListAccess.js";
import { TagFilter, TagFilterProblem } from "../../src/server/TagFilter.js";
import {
    FakeSetListDatabase, adminUserId, foreignGroupId, foreignUserId, globalTagId, memberGroupId, memberTagId,
    memberUserId, ownerUserId, unknownTagId,
} from "./set-list-fake-database.js";

const setup = (): { database: FakeSetListDatabase; auth: Auth; } => {
    const database = new FakeSetListDatabase();

    return { database, auth: new Auth(database) };
};

/**
 * @param userId The user to act as.
 * @param isAdmin Whether the token claims administrator rights; the database decides the real membership.
 *
 * @returns The caller the access rules evaluate.
 */
const callerOf = (userId: number, isAdmin = false): ITokenPayload => {
    return { userId, email: `user${userId}@example.com`, isAdmin };
};

describe("tag filter — reading a combination", () => {
    it("reads the AND groups and removes duplicate tags", () => {
        expect(TagFilter.readGroups([[5, 6, 5], [7]])).toEqual([[5, 6], [7]]);
    });

    it("drops groups that hold no condition", () => {
        expect(TagFilter.readGroups([[], [5]])).toEqual([[5]]);
    });

    it("rejects a value that is not a list of groups", () => {
        expect(TagFilter.readGroups("5")).toBeUndefined();
        expect(TagFilter.readGroups([5])).toBeUndefined();
        expect(TagFilter.readGroups(["5"])).toBeUndefined();
    });

    it("rejects ids that are not positive integers", () => {
        expect(TagFilter.readGroups([[0]])).toBeUndefined();
        expect(TagFilter.readGroups([[-1]])).toBeUndefined();
        expect(TagFilter.readGroups([[1.5]])).toBeUndefined();
        expect(TagFilter.readGroups([["abc"]])).toBeUndefined();
    });

    it("rejects a combination beyond the group limit", () => {
        const groups = Array.from({ length: TagCombination.maxGroups + 1 }, () => {
            return [5];
        });

        expect(TagFilter.readGroups(groups)).toBeUndefined();
    });

    it("rejects a group beyond the tag limit", () => {
        const group = Array.from({ length: TagCombination.maxTagsPerGroup + 1 }, (value, index) => {
            return index + 1;
        });

        expect(TagFilter.readGroups([group])).toBeUndefined();
    });
});

describe("tag filter — usable tags", () => {
    it("accepts a global tag for a signed-in user", async () => {
        const { auth } = setup();

        expect(await TagFilter.problem(auth, callerOf(memberUserId), [[globalTagId]])).toBeUndefined();
    });

    it("accepts a group tag for a member of that group", async () => {
        const { auth } = setup();

        expect(await TagFilter.problem(auth, callerOf(memberUserId), [[memberTagId]])).toBeUndefined();
    });

    it("rejects a group tag of another group", async () => {
        const { auth } = setup();

        const problem = await TagFilter.problem(auth, callerOf(foreignUserId), [[memberTagId]]);

        expect(problem).toBe(TagFilterProblem.NotUsable);
    });

    it("reports a tag that no longer exists", async () => {
        const { auth } = setup();

        const problem = await TagFilter.problem(auth, callerOf(adminUserId), [[unknownTagId]]);

        expect(problem).toBe(TagFilterProblem.UnavailableTag);
    });

    it("rejects every tag for a visitor", async () => {
        const { auth } = setup();

        const problem = await TagFilter.problem(auth, undefined, [[globalTagId]]);

        expect(problem).toBe(TagFilterProblem.NotUsable);
    });
});

describe("set list access — selecting and editing", () => {
    it("lets the owner read and change the list", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, ownerUserId);

        expect(await SetListAccess.canRead(auth, callerOf(ownerUserId), seeded.id)).toBe(true);
        expect(await SetListAccess.canEdit(auth, callerOf(ownerUserId), seeded.id)).toBe(true);
    });

    it("keeps a list private to its owner when no group is granted", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, ownerUserId);

        expect(await SetListAccess.canRead(auth, callerOf(memberUserId), seeded.id)).toBe(false);
        expect(await SetListAccess.canEdit(auth, callerOf(memberUserId), seeded.id)).toBe(false);
    });

    it("lets a group with read access select the list but not change it", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, ownerUserId, [memberGroupId]);

        expect(await SetListAccess.canRead(auth, callerOf(memberUserId), seeded.id)).toBe(true);
        expect(await SetListAccess.canEdit(auth, callerOf(memberUserId), seeded.id)).toBe(false);
    });

    it("does not let a group with write access change the list either", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, ownerUserId, [{ groupId: memberGroupId, writable: true }]);

        expect(await SetListAccess.canRead(auth, callerOf(memberUserId), seeded.id)).toBe(true);
        expect(await SetListAccess.canEdit(auth, callerOf(memberUserId), seeded.id)).toBe(false);
    });

    it("lets the administrators reach a list nobody shared", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, ownerUserId);

        expect(await SetListAccess.canRead(auth, callerOf(adminUserId), seeded.id)).toBe(true);
        expect(await SetListAccess.canEdit(auth, callerOf(adminUserId), seeded.id)).toBe(true);
    });

    it("grants no reading to a visitor, even when the list is granted to a group", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, null, [foreignGroupId]);

        expect(await SetListAccess.canRead(auth, undefined, seeded.id)).toBe(false);
        expect(await SetListAccess.canEdit(auth, undefined, seeded.id)).toBe(false);
    });

    it("reaches a list through a granted group only", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, ownerUserId, [foreignGroupId]);

        expect(await SetListAccess.canRead(auth, callerOf(foreignUserId), seeded.id)).toBe(true);
        expect(await SetListAccess.canRead(auth, callerOf(memberUserId), seeded.id)).toBe(false);
    });

    it("finds a list by its tag and reports the tag ids of all lists", async () => {
        const { database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);

        const list = await SetListAccess.forTag(database, seeded.tagId);
        expect(list?.id).toBe(seeded.id);

        const ids = await SetListAccess.listIdsByTag(database);
        expect(ids.get(seeded.tagId)).toBe(seeded.id);
    });

    it("reads the tag and the group grants of a stored list", async () => {
        const { auth, database } = setup();
        const seeded = database.seedSetList("Auftritt", memberGroupId);
        database.seedGrants("setlist", seeded.id, null, [{ groupId: foreignGroupId, writable: true }]);

        const entry = await SetListAccess.load(database, seeded.id);

        expect(entry?.tag.name).toBe("Auftritt");
        expect(await SetListAccess.sharedGroups(auth, seeded.id))
            .toEqual([{ groupId: foreignGroupId, writable: true }]);
    });
});
