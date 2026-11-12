/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { AppStorage } from "./AppStorage.js";

/** The mode a handover asks the application to start in. */
export enum EntryMode {
    /** Continue with the session this browser holds, if there is one. */
    Session,

    /** Start in the demo, whatever session this browser holds. */
    Demo,
}

/** What a handover told the application when it opened the document. */
export interface IEntryState {
    /** The mode the application starts in. */
    mode: EntryMode;

    /** The origin that owns the accounts, if the handover named this host over http or https. */
    site?: string;
}

/** One-shot cookie a site writes before it opens the application. Its value is `<mode>|<origin>`. */
const entryCookieName = "asb-entry";

/** Session storage key that keeps a tab in the demo across reloads. */
const demoTabKey = "asb-demo-tab";

/** Session storage key that keeps the origin that handed this tab over, so a reload still knows it. */
const siteKey = "asb-site-origin";

/** The cookie values that name a mode. */
const entryModes = new Map<string, EntryMode>([
    ["demo", EntryMode.Demo],
    ["session", EntryMode.Session],
]);

/**
 * Carries an entry over into the application: which mode to start in and which origin owns the accounts, so that
 * signing in and out can leave for it. The handover arrives as one short-lived cookie that the application consumes
 * and deletes on startup, so neither value appears as a parameter of the application URL. Without a handover the
 * application knows no account origin and keeps its own dialog.
 */
export class EntryHandoff {
    /**
     * Reads the handover and removes the cookie, so a reload starts from the address alone.
     *
     * @returns The entry state, or undefined when this document was opened directly.
     */
    public static takeEntry(): IEntryState | undefined {
        const value = EntryHandoff.#cookieValue();
        EntryHandoff.#deleteCookie();

        const [modeName, siteName] = (value ?? "").split("|");
        const mode = entryModes.get(modeName);
        if (mode === undefined) {
            return undefined;
        }

        const state: IEntryState = { mode };
        const site = EntryHandoff.#siteOriginFrom(siteName);
        if (site !== undefined) {
            state.site = site;
        }

        return state;
    }

    /**
     * Remembers that this tab runs in the demo, so a reload does not fall back to a session the browser may hold.
     */
    public static rememberDemoTab(): void {
        AppStorage.sessionStore?.setItem(demoTabKey, "1");
    }

    /**
     * @returns Whether this tab was handed over to the demo.
     */
    public static isDemoTab(): boolean {
        return AppStorage.sessionStore?.getItem(demoTabKey) === "1";
    }

    /** Drops the demo mark, once a session took over. */
    public static forgetDemoTab(): void {
        AppStorage.sessionStore?.removeItem(demoTabKey);
    }

    /**
     * Remembers the origin that handed this tab over, so a reload still returns there for signing in.
     *
     * @param origin The origin that owns the accounts.
     */
    public static rememberSiteOrigin(origin: string): void {
        AppStorage.sessionStore?.setItem(siteKey, origin);
    }

    /**
     * @returns The origin that handed this tab over, if it was remembered and still names this host.
     */
    public static rememberedSiteOrigin(): string | undefined {
        return EntryHandoff.#siteOriginFrom(AppStorage.sessionStore?.getItem(siteKey) ?? undefined);
    }

    /**
     * @returns The account origin the build implies for a document opened without a handover: the combined package
     * serves the application under `/app/`, so its site sits at the root of the same origin.
     */
    public static derivedSiteOrigin(): string | undefined {
        return import.meta.env.BASE_URL === "/app/" ? `${window.location.origin}/` : undefined;
    }

    /**
     * @returns The raw value of the handover cookie, if the browser holds one.
     */
    static #cookieValue(): string | undefined {
        const prefix = `${entryCookieName}=`;
        const entry = document.cookie.split("; ").find((cookie) => {
            return cookie.startsWith(prefix);
        });

        return entry === undefined ? undefined : decodeURIComponent(entry.slice(prefix.length));
    }

    /** Removes the handover cookie, so the entry is taken exactly once. */
    static #deleteCookie(): void {
        document.cookie = `${entryCookieName}=; path=/; max-age=0; samesite=lax`;
    }

    /**
     * @param value The origin a handover named.
     *
     * @returns That origin, if it names this host over http or https.
     */
    static #siteOriginFrom(value: string | undefined): string | undefined {
        if (value === undefined || value === "") {
            return undefined;
        }

        try {
            const url = new URL(value);
            const isWeb = url.protocol === "https:" || url.protocol === "http:";

            return isWeb && url.hostname === window.location.hostname ? `${url.origin}/` : undefined;
        } catch {
            return undefined;
        }
    }
}
