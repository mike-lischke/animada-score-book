/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

export interface IArrangementViewSettings {
    /** The scroll position of the arrangement in its viewer. */
    scrollPosition: number;

    /** The zoom level of the arrangement in its viewer (currently unused). */
    zoomLevel: number;

    /** The position of the current play range in the arrangement. */
    playRangePosition: number;

    /** The position of the play beam in the arrangement. */
    markerPosition: number;
}

/** UI element specific settings */
export interface IViewSettings {
    /** Settings related to the arrangement player. Only taken into account when an initial score is loaded. */
    arrangementViewSettings: IArrangementViewSettings;
}

export interface IUISettings {
    /** Theme selection for the user interface (not implemented yet). */
    theme: "light" | "dark";

    /**
     * Initial score to load when the application starts.
     * Undefined means start with an empty score. A string means to load the score from the given URL.
     * If the string is empty, the application will try to load the last opened score from localStorage, if available.
     */
    initialScore?: string;

    /** UI element specific settings. */
    viewSettings: IViewSettings;
}

/**
 * This class takes care for saving and loading settings and the like to and from localStorage.
 * It will also take over session recovery, once that is implemented (see session-recovery.ts).
 */
export class Storage {
    static #settingsKey = "asb-ui-settings";

    public static saveUISettings(settings: IUISettings): void {
        localStorage.setItem(this.#settingsKey, JSON.stringify(settings));
    }

    public static loadUISettings(): IUISettings | null {
        const settingsString = localStorage.getItem(this.#settingsKey);
        if (settingsString) {
            try {
                return JSON.parse(settingsString) as IUISettings;
            } catch (e) {
                console.error("Failed to parse UI settings from localStorage:", e);

                return null;
            }
        }

        return null;
    }
}
