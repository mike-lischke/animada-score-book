/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { BananaDrum } from "../core/index.js";
import { createArrangementPlayer } from "./ArrangementPlayer.js";
import { getEventEngine } from "./EventEngine.js";
import type { BananaDrumPlayer } from "./types.js";

export const createBananaDrumPlayer = (bananaDrum: BananaDrum): BananaDrumPlayer => {
    const eventEngine = getEventEngine();
    const arrangementPlayer = createArrangementPlayer(bananaDrum.arrangement);
    eventEngine.connect(arrangementPlayer);

    return { bananaDrum, eventEngine, arrangementPlayer };
};
