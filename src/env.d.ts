/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/// <reference types="vite/client" />

/** Injected by Vite at build time; holds the app version from package.json. */
declare const appVersion: string;

interface ImportMetaEnv {
    readonly VITE_BASE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

interface CSSStyleDeclaration {
    zoom: string;
}

interface Window {
    __e2e?: {
        requisitions: {
            execute: (topic: string, parameter: unknown) => Promise<boolean>;
        };
    };
}
