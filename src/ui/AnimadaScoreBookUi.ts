/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { createElement } from "preact";
import { StrictMode } from "preact/compat";
import { createRoot } from "preact/compat/client";

import { ScoreBookViewer } from "../components/ui/ScoreBookViewer.js";
import type { ScoreBookPlayer } from "../player/types.js";
import { AnimationEngine } from "./AnimationEngine.js";
import { createKeyboardHandler } from "./KeyboardHandler.js";
import { createModeManager, ModeManager } from "./ModeManager.js";
import { createMouseHandler } from "./MouseHandler.js";
import { createSelectionManager, SelectionManager } from "./SelectionManager.js";
import { initSessionRecovery } from "./session-recovery.js";
import { IScoreBookUi } from "./types.js";

export function createScoreBookUi(scoreBookPlayer: ScoreBookPlayer, wrapper: HTMLElement): IScoreBookUi {
    const services = initServices(scoreBookPlayer);

    createRoot(wrapper).render(
        createElement(StrictMode, {},
            createElement(ScoreBookViewer, { scoreBookPlayer: scoreBookPlayer, services })
        )
    );

    return { scoreBookPlayer, wrapper };
}

export interface ScoreBookUiServices {
    animationEngine: AnimationEngine;
    selectionManager: SelectionManager;
    modeManager: ModeManager;
}

function initServices(scoreBookPlayer: ScoreBookPlayer): ScoreBookUiServices {

    const animationEngine = new AnimationEngine(scoreBookPlayer.eventEngine);
    const selectionManager = createSelectionManager();
    const modeManager = createModeManager(selectionManager);

    createKeyboardHandler(scoreBookPlayer.eventEngine, scoreBookPlayer.scoreBook, selectionManager, modeManager);
    createMouseHandler(modeManager, selectionManager);
    initSessionRecovery(scoreBookPlayer.scoreBook);

    return { animationEngine, selectionManager, modeManager };
}
