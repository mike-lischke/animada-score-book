/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { requisitions } from "../supplement/Requisitions.js";
import type { SelectionManager } from "./SelectionManager.js";

// The really useful thing about a mode-manager would be the ability enforce mutual exclusivity of different modes
// We can avoid UI bugs just by having delete-polyrhythm-mode and select-mode never simultaneous
// All selection controls would appear/disappear based on mode.
// There could be a select-mode cleanup function, so if we change mode, we deselect all
// It introduces a single-source-of-truth problem, as modeManager.selectMode is equivalent
// to `selectionManager.selections.size`.
// For now, since there's only two modes, not a priority. We just have to be meticulous about avoiding bugs.

/**
 * Tracks UI modes and publishes changes so the UI can react.
 *
 * Modes are currently:
 * - deletePolyrhythmMode: toggles polyrhythm deletion affordances
 * - mobileSelectionMode: shows selection UI optimized for touch
 * - selectByMouseOverMode: enables selection via mouseover during drag
 *
 * The manager subscribes to `SelectionManager` to enforce mutual exclusivity where needed: when a selection exists
 * it disables delete-polyrhythm mode; when the selection is cleared it disables mobile selection mode.
 */
export class ModeManager {
    private _deletePolyrhythmMode = false;
    private _mobileSelectionMode = false;
    private _selectByMouseOverMode = false;

    /**
     * Creates a new mode manager and wires selection interactions.
     *
     * @param selectionManager The selection manager to observe for state changes.
     */
    public constructor(selectionManager: SelectionManager) {
        requisitions.register("selectionChanged", (_delta) => {
            if (selectionManager.currentTrackSelections.size) {
                this.deletePolyrhythmMode = false;
            } else {
                this.mobileSelectionMode = false;
            }

            return Promise.resolve(true);
        });
    }

    /**
     * Whether polyrhythm delete mode is active.
     *
     * @returns True when delete mode is enabled.
     */
    public get deletePolyrhythmMode(): boolean {
        return this._deletePolyrhythmMode;
    }

    public set deletePolyrhythmMode(newValue: boolean) {
        if (newValue !== this._deletePolyrhythmMode) {
            this._deletePolyrhythmMode = newValue;
            void requisitions.execute("modeChanged", undefined);
        }
    }

    /**
     * Whether mobile selection mode is active.
     *
     * @returns True when mobile selection mode is enabled.
     */
    public get mobileSelectionMode(): boolean {
        return this._mobileSelectionMode;
    }

    public set mobileSelectionMode(newValue: boolean) {
        if (newValue !== this._mobileSelectionMode) {
            this._mobileSelectionMode = newValue;
            void requisitions.execute("modeChanged", undefined);
        }
    }

    /**
     * Whether select-by-mouseover mode is active.
     *
     * @returns True when select-by-mouseover mode is enabled.
     */
    public get selectByMouseOverMode(): boolean {
        return this._selectByMouseOverMode;
    }

    public set selectByMouseOverMode(newValue: boolean) {
        if (newValue !== this._selectByMouseOverMode) {
            this._selectByMouseOverMode = newValue;
            void requisitions.execute("modeChanged", undefined);
        }
    }
}
