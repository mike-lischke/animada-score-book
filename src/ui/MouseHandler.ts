/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* no file-level eslint disables required */

import { isMobile } from "./index.js";
import type { ModeManager } from "./ModeManager.js";
import type { SelectionManager } from "./SelectionManager.js";

/**
 * Handles global mouse interactions for selection and mode switching in the UI.
 *
 * - Click anywhere to clear a selection (with exceptions)
 * - Enter/exit select-by-mouseover mode based on drag distance with primary button
 * - Resets mode when mouse is released or when focus changes
 */
export class MouseHandler {
    private readonly onClick: (e: MouseEvent) => void;
    private onMouseDown?: (e: MouseEvent) => void;
    private onMouseMove?: (e: MouseEvent) => void;
    private onMouseUp?: (e: MouseEvent) => void;
    private onBodyMouseEnter?: (e: MouseEvent) => void;

    /**
     * Creates a global mouse handler and attaches all relevant listeners.
     *
     * @param modeManager Provides/selects UI modes like select-by-mouseover.
     * @param selectionManager Provides current selection, allows clearing.
     */
    public constructor(private readonly modeManager: ModeManager, private readonly selectionManager: SelectionManager) {
        // We want clicking anywhere to clear the selection, with some extra criteria...
        this.onClick = (event: MouseEvent) => {
            if (
                this.selectionManager.selections.size
                // mouseup might be the end of selecting notes, but will fire a click event
                && !this.modeManager.selectByMouseOverMode
                && !this.onSelectionButtonsOrPolyrhythmControls(event)
                && !event.shiftKey
            ) {
                this.selectionManager.deselectAll();
            }
        };

        window.addEventListener("click", this.onClick);

        if (!isMobile) {
            this.addSelectByMousemoveEvents();
        }
    }

    /**
     * Detaches all event listeners installed by this handler.
     */
    public dispose(): void {
        window.removeEventListener("click", this.onClick);

        if (!isMobile) {
            if (this.onMouseDown) {
                window.removeEventListener("mousedown", this.onMouseDown);
            }
            if (this.onMouseMove) {
                window.removeEventListener("mousemove", this.onMouseMove);
            }
            if (this.onMouseUp) {
                window.removeEventListener("mouseup", this.onMouseUp);
            }
            if (this.onBodyMouseEnter) {
                document.body.removeEventListener("mouseenter", this.onBodyMouseEnter);
            }
        }
    }

    private addSelectByMousemoveEvents(): void {
        let startX: number | null = null;
        let startY: number | null = null;

        this.onMouseDown = (event: MouseEvent) => {
            if (event.target instanceof HTMLElement && event.target.closest(".note-viewer")) {
                startX = event.pageX;
                startY = event.pageY;
            }
        };

        // We need to decide when to enter select-by-mouseover mode
        this.onMouseMove = (event: MouseEvent) => {
            if (
                // No point if we're already in the mode
                !this.modeManager.selectByMouseOverMode
                // Only interested if the user has the primary mouse button down
                && event.buttons === 1
                // ...and if this movement is on a note
                && event.target instanceof HTMLElement && event.target.closest(".note-viewer")
                && (
                    // Now we check whether the mouse has moved far enough from the mousedown point
                    (startX !== null && Math.abs(event.pageX - startX) > 17)
                    || (startY !== null && Math.abs(event.pageY - startY) > 17)
                )
            ) {
                this.modeManager.selectByMouseOverMode = true;

                // Might not be necessary to set these back to null, but seems safer
                startX = null;
                startY = null;
            }
        };

        // When the mousebutton goes back up, we leave select-by-mouseover mode
        this.onMouseUp = () => {
            // We need to handle click events first, so we setTimeout to delay this reaction
            setTimeout(() => {
                this.modeManager.selectByMouseOverMode = false;
                startX = null;
                startY = null;
            }, 0);
        };

        // If we don't catch the mouseup because the window defocused, we can still look for a mouseenter
        this.onBodyMouseEnter = (event: MouseEvent) => {
            if (this.modeManager.selectByMouseOverMode && event.buttons !== 1) {
                // Primary button not held down, so we leave select mode
                this.modeManager.selectByMouseOverMode = false;
                startX = null;
                startY = null;
            }
        };

        window.addEventListener("mousedown", this.onMouseDown);
        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);
        document.body.addEventListener("mouseenter", this.onBodyMouseEnter);
    }

    private onSelectionButtonsOrPolyrhythmControls(event: MouseEvent): boolean {
        if (!(event.target instanceof HTMLElement)) {
            return false;
        }

        // Anywhere outside the selection-controls overlay is definitely wrong
        const selectionControlsOverlay = event.target.closest('.overlay[data-overlay-name="selection_controls"');
        if (!selectionControlsOverlay) {
            return false;
        }

        // Any button inside selection controls is ok
        if (event.target instanceof HTMLButtonElement) {
            return true;
        }

        // We allow clicking anywhere in the overlay if we're adding a polyrhythm. It just feels right.
        return selectionControlsOverlay.querySelector(".selection-controls.adding-polyrhythm") !== null;
    }
}
