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

export function createScoreBookUi(bananaDrumPlayer: ScoreBookPlayer, wrapper: HTMLElement): IScoreBookUi {
    const services = initServices(bananaDrumPlayer);

    createRoot(wrapper).render(
        createElement(StrictMode, {},
            createElement(ScoreBookViewer, { bananaDrumPlayer, services })
        )
    );

    return { bananaDrumPlayer, wrapper };
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

    createKeyboardHandler(scoreBookPlayer.eventEngine, scoreBookPlayer.bananaDrum, selectionManager, modeManager);
    createMouseHandler(modeManager, selectionManager);
    initSessionRecovery(scoreBookPlayer.bananaDrum);

    return { animationEngine, selectionManager, modeManager };
}
