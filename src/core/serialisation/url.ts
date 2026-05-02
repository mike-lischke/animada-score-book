/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IArrangementSnapshot, ISerialisedArrangement } from "../types/general.js";
import { baseUrl } from "./constants.js";
import { serialiseArrangementSnapshot } from "./serialisers.js";

// We generate a share link from a snapshot so we can generate it from the undo-redo stack
export const getShareLink = (arrangementSnapshot: IArrangementSnapshot): string => {
    const serialisedArrangement = serialiseArrangementSnapshot(arrangementSnapshot);
    const compositionParam = `a${serialisedArrangement.version}=${serialisedArrangement.composition}`;

    if (serialisedArrangement.title) {
        return `${baseUrl}?t=${encodeURIComponent(serialisedArrangement.title)}&${compositionParam}`;
    }

    return `${baseUrl}?${compositionParam}`;
};

export const getSerialisedArrangementFromParams = (
    searchParams: URLSearchParams): ISerialisedArrangement | undefined => {
    const title = searchParams.get("t") ?? undefined;

    if (searchParams.get("a2")) {
        return { composition: searchParams.get("a2")!, version: 2, title };
    }

    if (searchParams.get("a")) {
        return { composition: searchParams.get("a")!, version: 1, title };
    }

    return undefined;
};
