/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ITag } from "../components/ui/framework/TagInput.js";
import type { ITagInfo } from "../core/types/tags.js";

/** Turns tag ids into the badges a tag list displays. */
export class TagBadges {
    /**
     * @param ids The tag ids to resolve.
     * @param catalogue The tags the current user can use.
     *
     * @returns The badges of those ids, without the ids the catalogue does not hold.
     */
    public static resolve(ids: readonly number[], catalogue: readonly ITagInfo[]): ITag[] {
        const byId = new Map(catalogue.map((tag) => {
            return [tag.id, tag] as [number, ITagInfo];
        }));

        return ids.map((id) => {
            return byId.get(id);
        }).filter((tag): tag is ITagInfo => {
            return tag !== undefined;
        }).map((tag) => {
            return { id: tag.id, caption: tag.name, colorIndex: tag.colorIndex };
        });
    }
}
