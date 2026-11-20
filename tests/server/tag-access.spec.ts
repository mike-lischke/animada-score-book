/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { SystemTagKind, TagAccess, type ITagAccessContext, type ITagRow } from "../../src/server/TagAccess.js";

const demoTag: ITagRow = { id: 1, name: "Demo Score", colorIndex: 1, groupId: null, systemKey: "demo" };
const instrumentTag: ITagRow = {
    id: 2, name: "Caixa", colorIndex: 2, groupId: null, systemKey: "instrument:5",
};
const administeredTag: ITagRow = { id: 3, name: "Set list", colorIndex: 4, groupId: 10, systemKey: null };
const foreignTag: ITagRow = { id: 4, name: "Internal", colorIndex: 5, groupId: 20, systemKey: null };

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
    });

    it("lets every signed-in user use a global tag", () => {
        expect(TagAccess.canUse(administrator, demoTag)).toBe(true);
        expect(TagAccess.canUse(member, demoTag)).toBe(true);
        expect(TagAccess.canUse(groupAdmin, instrumentTag)).toBe(true);
    });

    it("keeps a group tag with the members of that group", () => {
        expect(TagAccess.canUse(member, foreignTag)).toBe(true);
        expect(TagAccess.canUse(member, administeredTag)).toBe(false);
        expect(TagAccess.canUse(groupAdmin, administeredTag)).toBe(true);
    });

    it("hides a tag of a foreign group from an administrator", () => {
        expect(TagAccess.canUse(administrator, foreignTag)).toBe(false);
    });
});

describe("TagAccess — owners", () => {
    it("gives the administrators the global tags together", () => {
        expect(TagAccess.owns(administrator, demoTag)).toBe(true);
        expect(TagAccess.owns(member, demoTag)).toBe(false);
    });

    it("gives a group admin its group's tags", () => {
        expect(TagAccess.owns(groupAdmin, administeredTag)).toBe(true);
        expect(TagAccess.owns(groupAdmin, foreignTag)).toBe(false);
        expect(TagAccess.owns(member, foreignTag)).toBe(false);
    });

    it("gives an administrator no extra rights on a group tag", () => {
        expect(TagAccess.owns(administrator, administeredTag)).toBe(false);
    });

    it("allows creating tags only in an owned scope", () => {
        expect(TagAccess.canOwnScope(administrator, undefined)).toBe(true);
        expect(TagAccess.canOwnScope(member, undefined)).toBe(false);
        expect(TagAccess.canOwnScope(groupAdmin, 10)).toBe(true);
        expect(TagAccess.canOwnScope(groupAdmin, 20)).toBe(false);
    });
});

describe("TagAccess — assigning", () => {
    it("keeps the demo tag with the administrators", () => {
        expect(TagAccess.canAssign(administrator, demoTag)).toBe(true);
        expect(TagAccess.canAssign(member, demoTag)).toBe(false);
    });

    it("lets a member assign an instrument tag it can use", () => {
        expect(TagAccess.canAssign(member, instrumentTag)).toBe(true);
    });

    it("refuses a tag the caller cannot use", () => {
        expect(TagAccess.canAssign(member, administeredTag)).toBe(false);
    });
});
