/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

export interface IArrangementViewSettings {
    /** The scroll position of the arrangement in its viewer. */
    scrollPosition?: number;

    /** The zoom level of the arrangement in its viewer (in percentage). */
    zoomLevel?: number;

    /** The position of the current play range in the arrangement. */
    playRangePosition?: number;

    /** The position of the play beam in the arrangement. */
    markerPosition?: number;
}

/** UI element specific settings */
export interface IViewSettings {
    /** Settings related to the arrangement viewer. */
    arrangementViewSettings?: IArrangementViewSettings;
}

export interface IUISettings {
    /** Theme selection for the user interface. */
    theme?: string;

    /**
     * The score the user has currently opened - stored as snapshot.
     */
    currentScore?: string;

    /** UI element specific settings. */
    viewSettings?: IViewSettings;

    /** Whether to loop playback of arrangements. */
    loop?: boolean;

    /** The master volume for the arrangement player, from 0 to 100. */
    masterVolume?: number;

    /** Whether to use the metronome during arrangement playback. */
    metronome?: boolean;

    /** Whether to use a count-in before starting arrangement playback. */
    countIn?: boolean;
}

/**
 * This class takes care for saving and loading settings and the like to and from localStorage.
 * It will also take over session recovery, once that is implemented (see session-recovery.ts).
 */
export class AppStorage {
    static #settingsKey = "asb-ui-settings";

    static #hasLocalStorage: boolean = (() => {
        if ("setItem" in window.localStorage) {
            try {
                const testKey = "__asb-test__";
                window.localStorage.setItem(testKey, "1");
                window.localStorage.removeItem(testKey);

                return true;
            } catch (e) {
                console.warn("LocalStorage is not available:", e);

                return false;
            }
        } else {
            console.warn("LocalStorage is not available.");

            return false;
        }
    })();

    public static saveUISettings(settings: IUISettings): void {
        localStorage.setItem(this.#settingsKey, JSON.stringify(settings));
    }

    public static loadUISettings(): IUISettings | null {
        if (!this.#hasLocalStorage) {
            console.warn("LocalStorage is not available. UI settings cannot be loaded.");

            return null;
        }

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

    public static clearUISettings(): void {
        localStorage.removeItem(this.#settingsKey);
    }

    public static saveSetting<T extends keyof IUISettings>(key: T, value: IUISettings[T]): void {
        const settings = this.loadUISettings() ?? {};
        if (value === undefined) {
            delete settings[key];
        } else {
            settings[key] = value;
        }
        this.saveUISettings(settings);
    }
}
