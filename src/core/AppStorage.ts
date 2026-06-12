/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { uuid } from "../string-helpers.js";

export interface IArrangementViewSettings {
    /** The scroll position of the arrangement in its viewer. */
    scrollPosition?: number;

    /** The zoom level of the arrangement in its viewer (in percentage). */
    zoomLevel?: number;

    /** The current note display mode of the arrangement viewer. */
    displayMode?: "grid" | "staff";

    /** Whether to animate transitions when toggling between grid and staff mode. */
    animateModeTransitions?: boolean;

    /** The position of the current play range in the arrangement. */
    playRangePosition?: number;

    /** The position of the play beam in the arrangement. */
    markerPosition?: number;
}

/** UI element specific settings */
export interface IViewSettings {
    /** Settings related to the arrangement viewer. */
    arrangementViewSettings?: IArrangementViewSettings;

    /**
     * Serialised selection state for the current arrangement, stored as a JSON string.
     * Maintained by the SelectionManager so the selection survives page reloads.
     */
    selectionState?: string;
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
 */
export class AppStorage {
    /** Local storage key for global UI settings shared across sessions. */
    static #settingsKey = "asb-ui-settings";

    /** Session storage key used to persist the active tab session identifier. */
    static #sessionStorageKey = "asb-session-id";

    /** Prefix for per-session UI settings records in localStorage. */
    static #sessionSettingsKeyPrefix = "asb-ui-settings-session-";

    /** Prefix for per-session metadata records in localStorage. */
    static #sessionMetaKeyPrefix = "asb-ui-settings-session-meta-";

    /** Maximum number of stored session records to keep. */
    static #maxStoredSessions = 20;

    /** Session records older than this are removed during cleanup. */
    static #sessionTtlMs = 1000 * 60 * 60 * 24 * 14; // 14 days

    /** Top-level UI settings that should be isolated per session/tab. */
    static #sessionScopedKeys = new Set<keyof IUISettings>([
        "currentScore",
        "viewSettings",
    ]);

    /** Active session identifier used for session-scoped storage keys. */
    static #sessionId = "";

    /**
     * Whether localStorage is available and writable in the current environment.
     * This check is done once at class initialization time.
     */
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

    static {
        if (this.#hasLocalStorage) {
            // Remove legacy global session id key from old implementations.
            localStorage.removeItem(this.#sessionStorageKey);
            this.#sessionId = this.#resolveInitialSessionId();
            this.#persistSessionId();
            this.#touchSession(this.#sessionId);
            this.#cleanupSessions();
        } else {
            this.#sessionId = uuid();
        }
    }

    /**
     * The current storage session identifier.
     *
     * @returns The active session id used for session-scoped settings.
     */
    public static get sessionId(): string {
        return this.#sessionId;
    }

    /**
     * Starts a new storage session or switches to a desired existing session id.
     *
     * @param desiredSessionId Optional explicit session id to activate.
     */
    public static resetSession(desiredSessionId?: string): void {
        this.#sessionId = desiredSessionId ?? this.#generateSessionId();
        this.#persistSessionId();
        this.#touchSession(this.#sessionId);
        this.#cleanupSessions();
    }

    /**
     * Persists UI settings by splitting them into global and session-scoped storage records.
     *
     * @param settings The UI settings object to persist.
     */
    public static saveUISettings(settings: IUISettings): void {
        if (!this.#hasLocalStorage) {
            console.warn("LocalStorage is not available. UI settings cannot be saved.");

            return;
        }

        const globalSettings = this.#pickSettings(settings, false);
        const sessionSettings = this.#pickSettings(settings, true);

        localStorage.setItem(this.#settingsKey, JSON.stringify(globalSettings));
        localStorage.setItem(this.#getSessionSettingsKey(), JSON.stringify(sessionSettings));
        this.#touchSession(this.#sessionId);
        this.#cleanupSessions();
    }

    /**
     * Loads UI settings by combining global and current-session records.
     * Performs lazy migration of old mixed records when needed.
     *
     * @returns The merged settings object, or null if nothing is stored.
     */
    public static loadUISettings(): IUISettings | null {
        if (!this.#hasLocalStorage) {
            console.warn("LocalStorage is not available. UI settings cannot be loaded.");

            return null;
        }

        const globalSettings = this.#loadSettingsByKey(this.#settingsKey);
        const sessionSettings = this.#loadSessionSettings(globalSettings);

        if (!globalSettings && !sessionSettings) {
            return null;
        }

        return {
            ...globalSettings,
            ...sessionSettings,
        };
    }

    /**
     * Clears persisted UI settings for both global and active session scopes.
     */
    public static clearUISettings(): void {
        if (!this.#hasLocalStorage) {
            return;
        }

        localStorage.removeItem(this.#settingsKey);
        localStorage.removeItem(this.#getSessionSettingsKey());
        localStorage.removeItem(this.#getSessionMetaKey(this.#sessionId));
    }

    /**
     * Updates a single top-level UI setting and persists the resulting settings object.
     *
     * @param key The setting key to update.
     * @param value The new value. Use undefined to remove the key.
     */
    public static saveSetting<T extends keyof IUISettings>(key: T, value: IUISettings[T]): void {
        const settings = this.loadUISettings() ?? {};
        if (value === undefined) {
            delete settings[key];
        } else {
            settings[key] = value;
        }
        this.saveUISettings(settings);
    }

    /**
     * Resolves an existing session id from tab-local browser state.
     *
     * Uses only tab-bound sources to avoid cross-tab session id reuse.
     *
     * @returns An existing session id if one can be found, otherwise undefined.
     */
    static #resolveExistingSessionId(): string | undefined {
        if ("state" in window.history && window.history.state) {
            const state = window.history.state as { sessionId?: string; };
            if (state.sessionId) {
                return state.sessionId;
            }
        }

        return sessionStorage.getItem(this.#sessionStorageKey)
            ?? undefined;
    }

    /**
     * Resolves the initial session for the current tab.
     *
     * - Reuses the tab's existing session, if available.
     * - Otherwise clones the newest known session into a new session id.
     * - Creates a new session only if no prior session exists.
     *
     * @returns The session id to use for this tab.
     */
    static #resolveInitialSessionId(): string {
        const existingSessionId = this.#resolveExistingSessionId();
        if (existingSessionId) {
            return existingSessionId;
        }

        const latestSessionId = this.#findLatestSessionId();
        if (!latestSessionId) {
            return this.#generateSessionId();
        }

        const newSessionId = this.#generateSessionId();
        this.#cloneSessionSettings(latestSessionId, newSessionId);

        return newSessionId;
    }

    /**
     * Finds the most recently used stored session id.
     *
     * @returns The latest session id, or undefined if no stored session exists.
     */
    static #findLatestSessionId(): string | undefined {
        let latest: { id: string; updatedAt: number; } | undefined;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(this.#sessionSettingsKeyPrefix)
                || key.startsWith(this.#sessionMetaKeyPrefix)) {
                continue;
            }

            const id = key.slice(this.#sessionSettingsKeyPrefix.length);
            if (!id) {
                continue;
            }

            const updatedAtRaw = localStorage.getItem(this.#getSessionMetaKey(id));
            const updatedAtParsed = Number(updatedAtRaw);
            const updatedAt = Number.isFinite(updatedAtParsed) ? updatedAtParsed : 0;

            if (!latest || updatedAt > latest.updatedAt) {
                latest = { id, updatedAt };
            }
        }

        return latest?.id;
    }

    /**
     * Clones session-scoped settings from one session id to another.
     *
     * @param sourceSessionId The source session id.
     * @param targetSessionId The target session id.
     */
    static #cloneSessionSettings(sourceSessionId: string, targetSessionId: string): void {
        const sourceKey = `${this.#sessionSettingsKeyPrefix}${sourceSessionId}`;
        const targetKey = `${this.#sessionSettingsKeyPrefix}${targetSessionId}`;
        const sourceSettings = this.#loadSettingsByKey(sourceKey) ?? {};

        localStorage.setItem(targetKey, JSON.stringify(sourceSettings));
        localStorage.setItem(this.#getSessionMetaKey(targetSessionId), String(Date.now()));
    }

    /**
     * Persists the active session id to tab-local browser state.
     */
    static #persistSessionId(): void {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: this.#sessionId }, "");
        sessionStorage.setItem(this.#sessionStorageKey, this.#sessionId);
    }

    /**
     * Creates a new unique session identifier.
     *
     * @returns A generated session id that does not collide with existing session setting keys.
     */
    static #generateSessionId(): string {
        let id = uuid();

        for (let i = 0; localStorage.getItem(`${this.#sessionSettingsKeyPrefix}${id}`) && i < 100; i++) {
            id = id + "-";
        }

        return id;
    }

    /**
     * Builds the localStorage key for the active session settings record.
     *
     * @returns The full localStorage key for session-scoped settings.
     */
    static #getSessionSettingsKey(): string {
        return `${this.#sessionSettingsKeyPrefix}${this.#sessionId}`;
    }

    /**
     * Builds the localStorage key for metadata of a specific session.
     *
     * @param sessionId The session id for which to build the metadata key.
     * @returns The full localStorage key for session metadata.
     */
    static #getSessionMetaKey(sessionId: string): string {
        return `${this.#sessionMetaKeyPrefix}${sessionId}`;
    }

    /**
     * Loads and parses a settings object from localStorage.
     *
     * @param key The localStorage key to read.
     * @returns Parsed UI settings, or null if missing or invalid JSON.
     */
    static #loadSettingsByKey(key: string): IUISettings | null {
        const settingsString = localStorage.getItem(key);
        if (!settingsString) {
            return null;
        }

        try {
            return JSON.parse(settingsString) as IUISettings;
        } catch (e) {
            console.error(`Failed to parse UI settings from localStorage (${key}):`, e);

            return null;
        }
    }

    /**
     * Extracts either global or session-scoped entries from a settings object.
     *
     * @param settings Source settings object.
     * @param sessionScoped True to extract session-scoped keys, false for global keys.
     * @returns A filtered settings object.
     */
    static #pickSettings(settings: IUISettings, sessionScoped: boolean): IUISettings {
        const result: Partial<IUISettings> = {};

        for (const key of Object.keys(settings) as Array<keyof IUISettings>) {
            if (this.#sessionScopedKeys.has(key) !== sessionScoped) {
                continue;
            }

            const value = settings[key];
            if (value !== undefined) {
                (result as Record<keyof IUISettings, IUISettings[keyof IUISettings]>)[key] = value;
            }
        }

        return result as IUISettings;
    }

    /**
     * Loads current session settings and migrates old mixed settings when needed.
     *
     * @param globalSettings Already-loaded global settings.
     * @returns Session settings for the active session, or null if none exist.
     */
    static #loadSessionSettings(globalSettings: IUISettings | null): IUISettings | null {
        const sessionSettingsKey = this.#getSessionSettingsKey();
        const existingSessionSettings = this.#loadSettingsByKey(sessionSettingsKey);
        if (existingSessionSettings) {
            this.#touchSession(this.#sessionId);

            return existingSessionSettings;
        }

        if (!globalSettings) {
            return null;
        }

        const migrated = this.#pickSettings(globalSettings, true);
        if (Object.keys(migrated).length === 0) {
            return null;
        }

        const cleanedGlobal = this.#pickSettings(globalSettings, false);
        localStorage.setItem(this.#settingsKey, JSON.stringify(cleanedGlobal));
        localStorage.setItem(sessionSettingsKey, JSON.stringify(migrated));
        this.#touchSession(this.#sessionId);

        return migrated;
    }

    /**
     * Updates the last-used timestamp for a session.
     *
     * @param sessionId The session id whose metadata should be updated.
     */
    static #touchSession(sessionId: string): void {
        localStorage.setItem(this.#getSessionMetaKey(sessionId), String(Date.now()));
    }

    /**
     * Removes stale and excessive per-session records from localStorage.
     *
     * Keeps the active session and removes sessions older than the configured TTL.
     * If too many sessions remain, keeps the most recently used ones.
     */
    static #cleanupSessions(): void {
        const now = Date.now();
        const sessions: Array<{ id: string; updatedAt: number; }> = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(this.#sessionSettingsKeyPrefix)
                || key.startsWith(this.#sessionMetaKeyPrefix)) {
                continue;
            }

            const id = key.slice(this.#sessionSettingsKeyPrefix.length);
            if (!id) {
                continue;
            }

            const updatedAtRaw = localStorage.getItem(this.#getSessionMetaKey(id));
            const updatedAtParsed = Number(updatedAtRaw);
            const updatedAt = Number.isFinite(updatedAtParsed) ? updatedAtParsed : now;

            sessions.push({ id, updatedAt });
        }

        const expired = sessions.filter((session) => {
            return session.id !== this.#sessionId && (now - session.updatedAt) > this.#sessionTtlMs;
        });
        for (const session of expired) {
            this.#deleteSession(session.id);
        }

        const remaining = sessions
            .filter((session) => {
                return !expired.some((removed) => {
                    return removed.id === session.id;
                });
            })
            .sort((a, b) => {
                return b.updatedAt - a.updatedAt;
            });

        if (remaining.length <= this.#maxStoredSessions) {
            return;
        }

        const removeCandidates = remaining.slice(this.#maxStoredSessions)
            .filter((session) => {
                return session.id !== this.#sessionId;
            });

        for (const session of removeCandidates) {
            this.#deleteSession(session.id);
        }
    }

    /**
     * Deletes all localStorage entries belonging to a session.
     *
     * @param sessionId The session id to remove.
     */
    static #deleteSession(sessionId: string): void {
        localStorage.removeItem(`${this.#sessionSettingsKeyPrefix}${sessionId}`);
        localStorage.removeItem(this.#getSessionMetaKey(sessionId));
    }
}
