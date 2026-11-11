/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntryHandoff, EntryMode } from "../../src/core/EntryHandoff.js";

/** The cookie a site writes before it opens the application. */
const entryCookieName = "asb-entry";

/** The origin a handover names, as the application sees it. */
const hostOrigin = `${window.location.origin}/`;

/**
 * @param value The raw cookie value a site wrote.
 */
const writeEntryCookie = (value: string): void => {
    document.cookie = `${entryCookieName}=${encodeURIComponent(value)}; path=/; max-age=60; samesite=lax`;
};

/**
 * @returns The raw handover cookie, if the browser still holds one.
 */
const entryCookie = (): string | undefined => {
    const prefix = `${entryCookieName}=`;
    const entry = document.cookie.split("; ").find((cookie) => {
        return cookie.startsWith(prefix);
    });

    return entry === undefined ? undefined : decodeURIComponent(entry.slice(prefix.length));
};

describe("EntryHandoff", { concurrent: false }, () => {
    beforeEach(() => {
        document.cookie = `${entryCookieName}=; path=/; max-age=0; samesite=lax`;
        sessionStorage.clear();
    });

    it("takes the handed-over mode and site and removes the cookie", () => {
        writeEntryCookie(`demo|${hostOrigin}`);

        expect(EntryHandoff.takeEntry()).toEqual({ mode: EntryMode.Demo, site: hostOrigin });
        expect(entryCookie()).toBeUndefined();
    });

    it("reports the session mode, so a normal start drops the demo mark of the tab", () => {
        EntryHandoff.rememberDemoTab();
        writeEntryCookie(`session|${hostOrigin}`);

        const entry = EntryHandoff.takeEntry();
        EntryHandoff.forgetDemoTab();

        expect(entry?.mode).toBe(EntryMode.Session);
        expect(EntryHandoff.isDemoTab()).toBe(false);
    });

    it("drops an origin that names another host", () => {
        writeEntryCookie("demo|https://example.com/");

        expect(EntryHandoff.takeEntry()).toEqual({ mode: EntryMode.Demo });
    });

    it("ignores an unknown mode, but still takes the cookie", () => {
        writeEntryCookie(`bogus|${hostOrigin}`);

        expect(EntryHandoff.takeEntry()).toBeUndefined();
        expect(entryCookie()).toBeUndefined();
    });

    it("keeps a demo tab across reloads", () => {
        EntryHandoff.rememberDemoTab();
        expect(EntryHandoff.isDemoTab()).toBe(true);

        EntryHandoff.forgetDemoTab();
        expect(EntryHandoff.isDemoTab()).toBe(false);
    });

    it("remembers the site of the tab and re-checks it on read", () => {
        EntryHandoff.rememberSiteOrigin(hostOrigin);
        expect(EntryHandoff.rememberedSiteOrigin()).toBe(hostOrigin);

        // A value that a visitor planted stays unused, because it names another host.
        sessionStorage.setItem("asb-site-origin", "https://example.com/");
        expect(EntryHandoff.rememberedSiteOrigin()).toBeUndefined();
    });

    it("names the site of a combined build from its base path", () => {
        vi.stubEnv("BASE_URL", "/app/");

        expect(EntryHandoff.derivedSiteOrigin()).toBe(hostOrigin);

        vi.unstubAllEnvs();
    });
});
