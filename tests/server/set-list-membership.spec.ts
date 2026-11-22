/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { TagCombination } from "../../src/core/TagCombination.js";
import { Auth, EntityType, type ITokenPayload } from "../../src/server/Auth.js";
import { SetListMembership } from "../../src/server/SetListMembership.js";
import {
    FakeSetListDatabase, foreignUserId, globalTagId, memberTagId, otherScoreId, ownerUserId, scoreId,
} from "./set-list-fake-database.js";

const caller: ITokenPayload = { userId: ownerUserId, email: "owner@example.com", isAdmin: false };

const setup = (): { database: FakeSetListDatabase; auth: Auth; } => {
    const database = new FakeSetListDatabase();
    database.seedGrants(EntityType.Score, scoreId, ownerUserId);
    database.seedGrants(EntityType.Score, otherScoreId, ownerUserId);

    return { database, auth: new Auth(database) };
};

describe("set list membership — order", () => {
    it("keeps every readable score for the empty combination, in the stored order", async () => {
        const { auth } = setup();

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], []);

        expect(membership.canonical).toEqual([otherScoreId, scoreId]);
        expect(membership.visible).toEqual([otherScoreId, scoreId]);
    });

    it("appends new matches after the known scores, the same way for every caller", async () => {
        const { database, auth } = setup();
        database.scores.push({ id: 3, name: "Coco" });
        database.scoreTags.push({ scoreId: 3, tagId: globalTagId });
        database.seedGrants(EntityType.Score, 3, ownerUserId);

        const first = await SetListMembership.resolve(auth, caller, [otherScoreId], [[globalTagId]]);
        const second = await SetListMembership.resolve(auth, caller, [otherScoreId], [[globalTagId]]);

        expect(first.canonical).toEqual([otherScoreId, 3, scoreId]);
        expect(second.canonical).toEqual(first.canonical);
        expect(first.visible).toEqual([otherScoreId, 3, scoreId]);
    });

    it("returns a score that stopped matching to its place", async () => {
        const { database, auth } = setup();
        const stored = [otherScoreId, scoreId];

        database.scoreTags.splice(database.scoreTags.findIndex((entry) => {
            return entry.scoreId === scoreId;
        }), 1);
        const withoutMatch = await SetListMembership.resolve(auth, caller, stored, [[globalTagId]]);

        database.scoreTags.push({ scoreId, tagId: globalTagId });
        const withMatch = await SetListMembership.resolve(auth, caller, stored, [[globalTagId]]);

        expect(withoutMatch.canonical).toEqual(stored);
        expect(withoutMatch.visible).toEqual([otherScoreId]);
        expect(withMatch.visible).toEqual([otherScoreId, scoreId]);
    });

    it("keeps a score the caller cannot read in its place without showing it", async () => {
        const { database, auth } = setup();
        database.seedGrants(EntityType.Score, otherScoreId, foreignUserId);

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], [[globalTagId]]);

        expect(membership.canonical).toEqual([otherScoreId, scoreId]);
        expect(membership.visible).toEqual([scoreId]);
    });
});

describe("set list membership — combination", () => {
    it("returns the exact intersection of the saved and the extra filter", async () => {
        const { database, auth } = setup();
        database.scoreTags.push({ scoreId, tagId: memberTagId });
        const saved = { groups: [[globalTagId], [memberTagId]] };
        const extra = { groups: [[memberTagId]] };

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId],
            TagCombination.combine(saved, extra).groups);

        expect(membership.visible).toEqual([scoreId]);
    });

    it("leaves membership unchanged for an empty extra filter", async () => {
        const { auth } = setup();
        const saved = { groups: [[globalTagId]] };

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId],
            TagCombination.combine(saved, TagCombination.empty).groups);

        expect(membership.visible).toEqual([otherScoreId, scoreId]);
    });
});
