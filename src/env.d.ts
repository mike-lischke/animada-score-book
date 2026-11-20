/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/// <reference types="vite/client" />

/** Injected by Vite at build time; holds the app version from package.json. */
declare const appVersion: string;

interface ImportMetaEnv {
    // Vite exposes only variables with this prefix.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    readonly VITE_BASE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

interface CSSStyleDeclaration {
    zoom: string;
}

interface Window {
    // A hook the end-to-end tests attach; the underscores keep it apart from the application's own globals.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __e2e?: {
        requisitions: {
            execute: (topic: string, parameter: unknown) => Promise<boolean>;
        };
    };
}
