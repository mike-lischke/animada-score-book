/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { createElement } from "preact";
import { StrictMode } from "preact/compat";
import { createRoot } from "preact/compat/client";

import type { BananaDrumPlayer } from "../../../bananadrum-player/src/prod/types.js";
import { getAnimationEngine } from "./AnimationEngine.js";
import { BananaDrumViewer } from "./components/BananaDrumViewer.js";
import { createKeyboardHandler } from "./KeyboardHandler.js";
import { createModeManager, ModeManager } from "./ModeManager.js";
import { createMouseHandler } from "./MouseHandler.js";
import { createSelectionManager, SelectionManager } from "./SelectionManager.js";
import { initSessionRecovery } from "./session-recovery.js";
import { AnimationEngine, BananaDrumUi } from "./types.js";

export function createBananaDrumUi(bananaDrumPlayer: BananaDrumPlayer, wrapper: HTMLElement): BananaDrumUi {
    const services = initServices(bananaDrumPlayer);

    createRoot(wrapper).render(
        createElement(StrictMode, {},
            createElement(BananaDrumViewer, { bananaDrumPlayer, services })
        )
    );

    return { bananaDrumPlayer, wrapper };
}

export interface BananaDrumUiServices {
    animationEngine: AnimationEngine;
    selectionManager: SelectionManager;
    modeManager: ModeManager;
}

function initServices(bananaDrumPlayer: BananaDrumPlayer): BananaDrumUiServices {

    const animationEngine = getAnimationEngine(bananaDrumPlayer.eventEngine);
    const selectionManager = createSelectionManager();
    const modeManager = createModeManager(selectionManager);

    createKeyboardHandler(bananaDrumPlayer.eventEngine, bananaDrumPlayer.bananaDrum, selectionManager, modeManager);
    createMouseHandler(modeManager, selectionManager);
    initSessionRecovery(bananaDrumPlayer.bananaDrum);

    return { animationEngine, selectionManager, modeManager };
}
