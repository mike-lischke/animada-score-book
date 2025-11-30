/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ScoreBookPlayer } from "../player/types.js";

export interface IScoreBookUi {
    scoreBookPlayer: ScoreBookPlayer;
    wrapper: HTMLElement;
}
