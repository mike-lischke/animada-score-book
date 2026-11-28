/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { SystemTagKind, TagAccess, type ITagAccessContext, type ITagRow } from "../../src/server/TagAccess.js";

const demoTag: ITagRow = {
    id: 1, name: "Demo Score", colorIndex: 1, ownerUserId: null, ownerGroupId: null, systemKey: "demo",
};
const instrumentTag: ITagRow = {
    id: 2, name: "Caixa", colorIndex: 2, ownerUserId: null, ownerGroupId: null, systemKey: "instrument:5",
};
const administeredTag: ITagRow = {
    id: 3, name: "Set list", colorIndex: 4, ownerUserId: null, ownerGroupId: 10, systemKey: null,
};
const foreignTag: ITagRow = {
    id: 4, name: "Internal", colorIndex: 5, ownerUserId: null, ownerGroupId: 20, systemKey: null,
};
const personalTag: ITagRow = {
    id: 5, name: "Meins", colorIndex: 6, ownerUserId: 3, ownerGroupId: null, systemKey: null,
};
const unownedTag: ITagRow = {
    id: 6, name: "Wettkampf", colorIndex: 7, ownerUserId: null, ownerGroupId: null, systemKey: null,
};

const administrator: ITagAccessContext = {
    isSignedIn: true, userId: 1, isAdmin: true, memberGroupIds: [], adminGroupIds: [],
};
const groupAdmin: ITagAccessContext = {
    isSignedIn: true, userId: 2, isAdmin: false, memberGroupIds: [10], adminGroupIds: [10],
};
const member: ITagAccessContext = {
    isSignedIn: true, userId: 3, isAdmin: false, memberGroupIds: [20], adminGroupIds: [],
};
const visitor: ITagAccessContext = { isSignedIn: false, isAdmin: false, memberGroupIds: [], adminGroupIds: [] };

describe("TagAccess — system tags", () => {
    it("tells the kinds apart", () => {
        expect(TagAccess.systemKind(demoTag)).toBe(SystemTagKind.Demo);
        expect(TagAccess.systemKind(instrumentTag)).toBe(SystemTagKind.Instrument);
        expect(TagAccess.systemKind(administeredTag)).toBeUndefined();
    });

    it("names the instrument tag by its instrument type id", () => {
        expect(TagAccess.instrumentSystemKey("5")).toBe("instrument:5");
        expect(TagAccess.instrumentTypeId(instrumentTag)).toBe("5");
        expect(TagAccess.instrumentTypeId(demoTag)).toBeUndefined();
        expect(TagAccess.instrumentTypeId(administeredTag)).toBeUndefined();
    });
});

describe("TagAccess — usable tags", () => {
    it("gives a visitor without a session no tags", () => {
        expect(TagAccess.canUse(visitor, demoTag)).toBe(false);
        expect(TagAccess.canUse(visitor, instrumentTag)).toBe(false);
        expect(TagAccess.canUse(visitor, unownedTag)).toBe(false);
    });

    it("lets every signed-in user use the installation's vocabulary", () => {
        expect(TagAccess.canUse(administrator, demoTag)).toBe(true);
        expect(TagAccess.canUse(member, demoTag)).toBe(true);
        expect(TagAccess.canUse(groupAdmin, instrumentTag)).toBe(true);
        expect(TagAccess.canUse(member, unownedTag)).toBe(true);
    });

    it("keeps a group tag with the members of that group", () => {
        expect(TagAccess.canUse(member, foreignTag)).toBe(true);
        expect(TagAccess.canUse(member, administeredTag)).toBe(false);
        expect(TagAccess.canUse(groupAdmin, administeredTag)).toBe(true);
    });

    it("keeps a personal tag with its user", () => {
        expect(TagAccess.canUse(member, personalTag)).toBe(true);
        expect(TagAccess.canUse(groupAdmin, personalTag)).toBe(false);
    });

    it("lets an administrator reach every tag", () => {
        expect(TagAccess.canUse(administrator, foreignTag)).toBe(true);
        expect(TagAccess.canUse(administrator, personalTag)).toBe(true);
    });
});

describe("TagAccess — managing tags", () => {
    it("gives an administrator every tag", () => {
        expect(TagAccess.canManage(administrator, demoTag)).toBe(true);
        expect(TagAccess.canManage(administrator, administeredTag)).toBe(true);
        expect(TagAccess.canManage(administrator, personalTag)).toBe(true);
    });

    it("gives a member the tags of every group it belongs to, the owning group included", () => {
        expect(TagAccess.canManage(groupAdmin, administeredTag)).toBe(true);
        expect(TagAccess.canManage(member, foreignTag)).toBe(true);
        expect(TagAccess.canManage(member, administeredTag)).toBe(false);
    });

    it("gives nobody but the administrators an unowned tag", () => {
        expect(TagAccess.canManage(member, unownedTag)).toBe(false);
        expect(TagAccess.canManage(groupAdmin, instrumentTag)).toBe(false);
    });

    it("keeps a personal tag with its user", () => {
        expect(TagAccess.canManage(member, personalTag)).toBe(true);
        expect(TagAccess.canManage(groupAdmin, personalTag)).toBe(false);
    });
});

describe("TagAccess — creating tags", () => {
    it("allows creating tags to administrators only", () => {
        expect(TagAccess.canCreate(administrator)).toBe(true);
        expect(TagAccess.canCreate(groupAdmin)).toBe(false);
        expect(TagAccess.canCreate(member)).toBe(false);
        expect(TagAccess.canCreate(visitor)).toBe(false);
    });
});
