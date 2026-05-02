/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionSettingsPrefix = "asb-ui-settings-session-";
const sessionMetaPrefix = "asb-ui-settings-session-meta-";
const legacySessionIdKey = "asb-session-id";
const globalSettingsKey = "asb-ui-settings";
const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;

const importFreshAppStorage = async (prepare?: () => void) => {
    vi.resetModules();
    prepare?.();

    const module = await import("../../src/core/AppStorage.js");

    return module.AppStorage;
};

const getSessionSettingsKeys = (): string[] => {
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(sessionSettingsPrefix) || key.startsWith(sessionMetaPrefix)) {
            continue;
        }

        keys.push(key);
    }

    return keys;
};

describe.sequential("AppStorage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses history.state session id and removes legacy global session key on init", async () => {
        const AppStorage = await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "history-session" }, "");
            localStorage.setItem(legacySessionIdKey, "legacy-session");
        });

        expect(AppStorage.sessionId).toBe("history-session");
        expect(localStorage.getItem(legacySessionIdKey)).toBeNull();
        expect(sessionStorage.getItem(legacySessionIdKey)).toBe("history-session");
        expect((window.history.state as { sessionId?: string; }).sessionId).toBe("history-session");
    });

    it("falls back to sessionStorage session id when history.state is empty", async () => {
        const AppStorage = await importFreshAppStorage(() => {
            sessionStorage.setItem(legacySessionIdKey, "session-storage-id");
        });

        expect(AppStorage.sessionId).toBe("session-storage-id");
    });

    it("splits global and session-scoped settings on save", async () => {
        const AppStorage = await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "split-session" }, "");
        });

        AppStorage.saveUISettings({
            theme: "Dark+",
            metronome: true,
            currentScore: "snapshot",
            viewSettings: { arrangementViewSettings: { zoomLevel: 130 } },
        });

        expect(localStorage.getItem(globalSettingsKey)).toBe(JSON.stringify({
            theme: "Dark+",
            metronome: true,
        }));

        expect(localStorage.getItem(`${sessionSettingsPrefix}split-session`)).toBe(JSON.stringify({
            currentScore: "snapshot",
            viewSettings: { arrangementViewSettings: { zoomLevel: 130 } },
        }));

        expect(localStorage.getItem(`${sessionMetaPrefix}split-session`)).not.toBeNull();
    });

    it("merges global and session settings on load", async () => {
        const AppStorage = await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "merge-session" }, "");
            localStorage.setItem(globalSettingsKey, JSON.stringify({ theme: "Light+", loop: true }));
            localStorage.setItem(`${sessionSettingsPrefix}merge-session`, JSON.stringify({
                currentScore: "abc",
                viewSettings: { arrangementViewSettings: { displayMode: "grid" } },
            }));
        });
        const loaded = AppStorage.loadUISettings();

        expect(loaded).toEqual({
            theme: "Light+",
            loop: true,
            currentScore: "abc",
            viewSettings: { arrangementViewSettings: { displayMode: "grid" } },
        });
    });

    it("migrates legacy mixed settings from global key into session key", async () => {
        const AppStorage = await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "migrate-session" }, "");
            localStorage.setItem(globalSettingsKey, JSON.stringify({
                theme: "Solarized Light",
                currentScore: "legacy-score",
                viewSettings: { arrangementViewSettings: { markerPosition: 7 } },
                metronome: false,
            }));
        });
        const loaded = AppStorage.loadUISettings();

        expect(loaded).toEqual({
            theme: "Solarized Light",
            metronome: false,
            currentScore: "legacy-score",
            viewSettings: { arrangementViewSettings: { markerPosition: 7 } },
        });
        expect(localStorage.getItem(globalSettingsKey)).toBe(JSON.stringify({
            theme: "Solarized Light",
            metronome: false,
        }));
        expect(localStorage.getItem(`${sessionSettingsPrefix}migrate-session`)).toBe(JSON.stringify({
            currentScore: "legacy-score",
            viewSettings: { arrangementViewSettings: { markerPosition: 7 } },
        }));
    });

    it("saveSetting updates and removes individual keys", async () => {
        const AppStorage = await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "setting-session" }, "");
        });

        AppStorage.saveSetting("theme", "Quiet Light");
        AppStorage.saveSetting("currentScore", "score-a");
        AppStorage.saveSetting("currentScore", undefined);

        expect(localStorage.getItem(globalSettingsKey)).toBe(JSON.stringify({ theme: "Quiet Light" }));
        expect(localStorage.getItem(`${sessionSettingsPrefix}setting-session`)).toBe(JSON.stringify({}));
    });

    it("clearUISettings removes global and active session records", async () => {
        const AppStorage = await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "clear-session" }, "");
        });

        AppStorage.saveUISettings({ theme: "Dark+", currentScore: "score" });
        AppStorage.clearUISettings();

        expect(localStorage.getItem(globalSettingsKey)).toBeNull();
        expect(localStorage.getItem(`${sessionSettingsPrefix}clear-session`)).toBeNull();
        expect(localStorage.getItem(`${sessionMetaPrefix}clear-session`)).toBeNull();
    });

    it("cleanup removes expired session records but keeps active session", async () => {
        const now = Date.now();

        await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "active" }, "");
            localStorage.setItem(`${sessionSettingsPrefix}active`, JSON.stringify({ currentScore: "keep" }));
            localStorage.setItem(`${sessionMetaPrefix}active`, String(now));
            localStorage.setItem(`${sessionSettingsPrefix}stale`, JSON.stringify({ currentScore: "old" }));
            localStorage.setItem(`${sessionMetaPrefix}stale`, String(now - sessionTtlMs - 1));
        });

        expect(localStorage.getItem(`${sessionSettingsPrefix}active`)).not.toBeNull();
        expect(localStorage.getItem(`${sessionMetaPrefix}active`)).not.toBeNull();
        expect(localStorage.getItem(`${sessionSettingsPrefix}stale`)).toBeNull();
        expect(localStorage.getItem(`${sessionMetaPrefix}stale`)).toBeNull();
    });

    it("cleanup enforces maximum retained session records", async () => {
        const now = Date.now();

        await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "session-24" }, "");

            for (let i = 0; i < 25; i++) {
                const id = `session-${i}`;
                localStorage.setItem(`${sessionSettingsPrefix}${id}`, JSON.stringify({ currentScore: id }));
                localStorage.setItem(`${sessionMetaPrefix}${id}`, String(now - i));
            }
        });

        const sessionKeys = getSessionSettingsKeys();
        expect(sessionKeys.length).toBe(20);
        expect(localStorage.getItem(`${sessionSettingsPrefix}session-24`)).not.toBeNull();
    });

    it("returns null when parsing stored settings fails", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
            // Expected parse error path.
        });

        const AppStorage = await importFreshAppStorage(() => {
            window.history.replaceState({ sessionId: "broken-json" }, "");
            localStorage.setItem(globalSettingsKey, "not-json");
        });

        expect(AppStorage.loadUISettings()).toBeNull();
        expect(errorSpy).toHaveBeenCalled();
    });
});
