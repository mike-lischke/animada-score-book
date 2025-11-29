/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { Overlay } from "../components/ui/Overlay.js";
import type { IAnimadaScoreBook } from "../core/index.js";
import type { EventEngine } from "../player/types.js";
import { ModeManager } from "./ModeManager.js";
import { SelectionManager } from "./SelectionManager.js";

export function createKeyboardHandler(eventEngine: EventEngine, bananaDrum: IAnimadaScoreBook,
    selectionManager: SelectionManager, modeManager: ModeManager) {
    window.addEventListener("keydown", (event) => {
        handleKeyDown(event);
    });
    window.addEventListener("keyup", (event) => {
        handleKeyUp(event);
    });

    function handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case "Escape":
                Overlay.closeAllOverlays();
                selectionManager.deselectAll();
                modeManager.deletePolyrhythmMode = false;
                break;
            case " ":
                if (eventEngine.state === "stopped") {
                    void eventEngine.play();
                } else {
                    eventEngine.stop();
                }
                event.preventDefault(); // This is to prevent spaces getting written in number inputs
                break;
            case "Alt":
                modeManager.deletePolyrhythmMode = true;
                event.preventDefault();
                break;
            case "Backspace":
            case "Delete":
                if (!(event.target instanceof HTMLInputElement)) {
                    bananaDrum.edit({
                        type: "EditCommand_ArrangementClearSelection",
                        arrangement: bananaDrum.arrangement,
                        clearSelection: selectionManager.selections
                    });
                    selectionManager.deselectAll();
                }
                break;

            // Undo/Redo: We have different conventions between Mac and Windows
            // Windows: ctrl+z / ctrl+y
            // Mac: command+z / command+shift+z
            // We allow overlap for maximum cross-browser consistency, except where it actually causes confusion
            case "z":
                if (event.ctrlKey || event.metaKey) {
                    if (event.shiftKey) {
                        bananaDrum.redo();
                    } else {
                        // Standard redo on Mac, and no problem to allow it on Windows
                        bananaDrum.undo();
                    } // With ctrl, this doesn't even trigger on Mac. Seems harmless to include it anyway.
                }
                break;
            case "y":
                // We do not allow command+y to redo on Mac
                // On Chrome, Firefox, and Safari, it triggers browser things, and so is very confusing to also redo
                if (event.ctrlKey) {
                    bananaDrum.redo();
                }
                break;
        }
    }

    function handleKeyUp(event: KeyboardEvent): void {
        if (event.key === "Alt") {
            modeManager.deletePolyrhythmMode = false;
        }
    }
}
