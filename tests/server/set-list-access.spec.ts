/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { TagCombination } from "../../src/core/TagCombination.js";
import { Auth, EntityType } from "../../src/server/Auth.js";
import { SetListAccess, SetListFilterProblem } from "../../src/server/SetListAccess.js";
import {
    FakeSetListDatabase, foreignGroupId, globalTagId, memberGroupId, memberTagId, ownerUserId, unknownTagId,
    worldGroupId,
} from "./set-list-fake-database.js";

const setup = (): { database: FakeSetListDatabase; auth: Auth; } => {
    const database = new FakeSetListDatabase();

    return { database, auth: new Auth(database) };
};

const privateAudience = { groupIds: [], isWorld: false };

describe("set list access — reading a combination", () => {
    it("reads the AND groups and removes duplicate tags", () => {
        expect(SetListAccess.readGroups([[5, 6, 5], [7]])).toEqual([[5, 6], [7]]);
    });

    it("drops groups that hold no condition", () => {
        expect(SetListAccess.readGroups([[], [5]])).toEqual([[5]]);
    });

    it("rejects a value that is not a list of groups", () => {
        expect(SetListAccess.readGroups("5")).toBeUndefined();
        expect(SetListAccess.readGroups([5])).toBeUndefined();
        expect(SetListAccess.readGroups(["5"])).toBeUndefined();
    });

    it("rejects ids that are not positive integers", () => {
        expect(SetListAccess.readGroups([[0]])).toBeUndefined();
        expect(SetListAccess.readGroups([[-1]])).toBeUndefined();
        expect(SetListAccess.readGroups([[1.5]])).toBeUndefined();
        expect(SetListAccess.readGroups([["abc"]])).toBeUndefined();
    });

    it("rejects a combination beyond the group limit", () => {
        const groups = Array.from({ length: TagCombination.maxGroups + 1 }, () => {
            return [5];
        });

        expect(SetListAccess.readGroups(groups)).toBeUndefined();
    });

    it("rejects a group beyond the tag limit", () => {
        const group = Array.from({ length: TagCombination.maxTagsPerGroup + 1 }, (value, index) => {
            return index + 1;
        });

        expect(SetListAccess.readGroups([group])).toBeUndefined();
    });
});

describe("set list access — tags and audiences", () => {
    it("allows a global tag wherever the list is visible", async () => {
        const { auth } = setup();

        const problem = await SetListAccess.filterProblem(auth, [[globalTagId]],
            { groupIds: [], isWorld: true }, ownerUserId);

        expect(problem).toBeUndefined();
    });

    it("allows a group tag in a list only its owner can see", async () => {
        const { auth } = setup();

        const problem = await SetListAccess.filterProblem(auth, [[memberTagId]], privateAudience, ownerUserId);

        expect(problem).toBeUndefined();
    });

    it("refuses a group tag in a list everybody can read", async () => {
        const { auth } = setup();

        const problem = await SetListAccess.filterProblem(auth, [[memberTagId]],
            { groupIds: [], isWorld: true }, ownerUserId);

        expect(problem).toBe(SetListFilterProblem.TagScope);
    });

    it("refuses a group tag in a list that another group can read", async () => {
        const { auth } = setup();

        const problem = await SetListAccess.filterProblem(auth, [[memberTagId]],
            { groupIds: [memberGroupId, foreignGroupId], isWorld: false }, ownerUserId);

        expect(problem).toBe(SetListFilterProblem.TagScope);
    });

    it("allows a group tag in a list shared with exactly that group", async () => {
        const { auth } = setup();

        const problem = await SetListAccess.filterProblem(auth, [[memberTagId]],
            { groupIds: [memberGroupId], isWorld: false }, ownerUserId);

        expect(problem).toBeUndefined();
    });

    it("refuses a group tag whose group does not hold the owner", async () => {
        const { auth } = setup();

        const problem = await SetListAccess.filterProblem(auth, [[memberTagId]], privateAudience,
            ownerUserId + 100);

        expect(problem).toBe(SetListFilterProblem.TagScope);
    });

    it("reports a tag that no longer exists", async () => {
        const { auth } = setup();

        const problem = await SetListAccess.filterProblem(auth, [[unknownTagId]], privateAudience, ownerUserId);

        expect(problem).toBe(SetListFilterProblem.UnavailableTag);
    });

    it("splits the audience of a list into World and groups", async () => {
        const { auth, database } = setup();
        database.seedGrants(EntityType.SetList, 42, ownerUserId, [memberGroupId, worldGroupId]);

        expect(await SetListAccess.audience(auth, 42)).toEqual({ groupIds: [memberGroupId], isWorld: true });
    });

    it("plans the audience of a change without touching the stored grants", async () => {
        const { auth, database } = setup();
        database.seedGrants(EntityType.SetList, 42, ownerUserId, [memberGroupId]);

        const planned = await SetListAccess.plannedAudience(auth, 42, [worldGroupId], [memberGroupId]);

        expect(planned).toEqual({ groupIds: [], isWorld: true });
        expect(await SetListAccess.audience(auth, 42)).toEqual({ groupIds: [memberGroupId], isWorld: false });
    });
});
