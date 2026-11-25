/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** What distinguishes the system tags from the tags a user creates. */
export enum SystemTagKind {
    Instrument = "instrument",
    Demo = "demo",
}

/** The caption the UI shows for a global tag, which belongs to the administrators together. */
export const globalTagOwnerCaption = "Global";

/**
 * A tag as the backend describes it. A tag belongs either to a group or - without `groupId` - to the
 * administrators together, which makes it global and usable by every signed-in user.
 */
export interface ITagInfo {
    readonly id: number;
    readonly name: string;

    /** The index of the tag's colour in the fixed palette, which `TagPalette` resolves. */
    readonly colorIndex: number;

    /** The owning group; undefined for a global tag. */
    readonly groupId?: number;

    /** The name of the owning group; undefined for a global tag. */
    readonly groupName?: string;

    /** Set for the system tags, which code recognises instead of relying on a name. */
    readonly systemKind?: SystemTagKind;

    /** The instrument type id; set for instrument tags only, which map an instrument to its tag. */
    readonly instrumentTypeId?: string;

    /** The set list this tag defines; absent for an ordinary metadata tag. */
    readonly setListId?: number;

    /** The current user owns the tag's scope, so they may rename, recolour and delete it. */
    readonly editable: boolean;

    /** The current user may put the tag on a score. */
    readonly assignable: boolean;

    /** How many scores the current user can read carry the tag. */
    readonly usageCount: number;
}

/** An owner scope a user may create tags in; without `groupId` it is the global scope. */
export interface ITagOwnerScope {
    readonly groupId?: number;
    readonly name: string;
}

/**
 * A tag filter: an OR of AND groups, so `[[a, b], [c]]` means `(a AND b) OR c`. It is stored exactly as it is, so
 * a favourite restores what the user picked.
 */
export interface ITagCombination {
    groups: number[][];
}
