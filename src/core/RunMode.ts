/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** The mode the application runs in, which decides what it may do and where it keeps its data. */
export enum AppMode {
    /** No session: the app edits one local score and offers nothing that needs an account. */
    Demo,

    /** A session is established and the score library is available. */
    Normal,
}

/**
 * Owns the mode the application runs in. The UI, the commands and the storage ask here instead of carrying a flag of
 * their own, so a mode is decided once.
 */
export class RunMode {
    /** Demo until a session proves otherwise, so a page that has not decided stays out of the session records. */
    static #mode = AppMode.Demo;

    /**
     * @returns The mode the application runs in.
     */
    public static get current(): AppMode {
        return RunMode.#mode;
    }

    /**
     * @returns Whether the application runs in the demo, which works locally and stores no settings.
     */
    public static get isDemo(): boolean {
        return RunMode.#mode === AppMode.Demo;
    }

    /**
     * Switches the mode. The storage follows it with its next read or write.
     *
     * @param mode The mode to run in.
     */
    public static enter(mode: AppMode): void {
        RunMode.#mode = mode;
    }
}
