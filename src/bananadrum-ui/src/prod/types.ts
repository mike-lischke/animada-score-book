/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { RealTime, Subscribable } from "../../../bananadrum-core/src/prod/index.js";
import type { BananaDrumPlayer, EventEngineState } from "../../../bananadrum-player/src/prod/types.js";

export interface BananaDrumUi {
    bananaDrumPlayer: BananaDrumPlayer;
    wrapper: HTMLElement;
}

export interface AnimationEngine extends Subscribable {
    connect(animation: (realTime: RealTime) => void): void;
    disconnect(animation: (realTime: RealTime) => void): void;
    get state(): EventEngineState;
}
