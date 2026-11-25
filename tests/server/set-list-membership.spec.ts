/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Auth, EntityType, type ITokenPayload } from "../../src/server/Auth.js";
import { SetListMembership } from "../../src/server/SetListMembership.js";
import {
    FakeSetListDatabase, foreignUserId, memberTagId, otherScoreId, ownerUserId, scoreId, setListTagId,
} from "./set-list-fake-database.js";

const caller: ITokenPayload = { userId: ownerUserId, email: "owner@example.com", isAdmin: false };

const setup = (): { database: FakeSetListDatabase; auth: Auth; } => {
    const database = new FakeSetListDatabase();
    database.seedGrants(EntityType.Score, scoreId, ownerUserId);
    database.seedGrants(EntityType.Score, otherScoreId, ownerUserId);
    database.scoreTags.push({ scoreId, tagId: setListTagId }, { scoreId: otherScoreId, tagId: setListTagId });

    return { database, auth: new Auth(database) };
};

describe("set list membership — the list's tag", () => {
    it("holds exactly the scores that carry the tag, in the saved order", async () => {
        const { auth } = setup();

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], setListTagId, []);

        expect(membership.canonical).toEqual([otherScoreId, scoreId]);
        expect(membership.visible).toEqual([otherScoreId, scoreId]);
    });

    it("leaves out a score that does not carry the tag", async () => {
        const { auth } = setup();

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], memberTagId, []);

        expect(membership.canonical).toEqual([]);
        expect(membership.visible).toEqual([]);
    });

    it("appends a newly tagged score after the known ones, the same way for every caller", async () => {
        const { database, auth } = setup();
        database.scores.push({ id: 3, name: "Coco" });
        database.scoreTags.push({ scoreId: 3, tagId: setListTagId });
        database.seedGrants(EntityType.Score, 3, ownerUserId);

        const first = await SetListMembership.resolve(auth, caller, [otherScoreId], setListTagId, []);
        const second = await SetListMembership.resolve(auth, caller, [otherScoreId], setListTagId, []);

        expect(first.canonical).toEqual([otherScoreId, 3, scoreId]);
        expect(second.canonical).toEqual(first.canonical);
        expect(first.visible).toEqual([otherScoreId, 3, scoreId]);
    });

    it("drops a score that lost the tag, including a stale saved position", async () => {
        const { database, auth } = setup();
        database.scoreTags.splice(database.scoreTags.findIndex((entry) => {
            return entry.scoreId === scoreId && entry.tagId === setListTagId;
        }), 1);

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], setListTagId, []);

        expect(membership.canonical).toEqual([otherScoreId]);
        expect(membership.visible).toEqual([otherScoreId]);
    });

    it("keeps a member the caller cannot read in its place without showing it", async () => {
        const { database, auth } = setup();
        database.seedGrants(EntityType.Score, otherScoreId, foreignUserId);

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], setListTagId, []);

        expect(membership.canonical).toEqual([otherScoreId, scoreId]);
        expect(membership.visible).toEqual([scoreId]);
    });
});

describe("set list membership — manual filter", () => {
    it("narrows the members to the intersection with the manual filter", async () => {
        const { database, auth } = setup();
        database.scoreTags.push({ scoreId, tagId: memberTagId });

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], setListTagId,
            [[memberTagId]]);

        expect(membership.visible).toEqual([scoreId]);
    });

    it("returns every readable member for an empty manual filter", async () => {
        const { auth } = setup();

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], setListTagId, []);

        expect(membership.visible).toEqual([otherScoreId, scoreId]);
    });

    it("keeps an unreadable member out of the visible set even when the filter matches", async () => {
        const { database, auth } = setup();
        database.scoreTags.push({ scoreId: otherScoreId, tagId: memberTagId });
        database.seedGrants(EntityType.Score, otherScoreId, foreignUserId);

        const membership = await SetListMembership.resolve(auth, caller, [otherScoreId, scoreId], setListTagId,
            [[memberTagId]]);

        expect(membership.canonical).toEqual([otherScoreId]);
        expect(membership.visible).toEqual([]);
    });
});
