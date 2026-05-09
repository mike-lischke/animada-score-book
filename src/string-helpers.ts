/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Converts a given string from snake case to camel case.
 *
 * @param str The string to convert.
 * @returns The converted string.
 */
export const convertSnakeToCamelCase = (str: string): string => {
    if (str.includes("_") || str.includes("-")) {
        return str.toLowerCase().replace(/([-_][a-z])/g, (group): string => {
            return group
                .toUpperCase()
                .replace("-", "")
                .replace("_", "");
        });
    } else {
        return str;
    }
};

/**
 * Generates a random UUID using Math.random.
 * We don't need cryptographic quality here, so this approach is fine.
 *
 * @returns The generated UUID.
 */
export const uuid = (): string => {
    let d = new Date().getTime();
    let d2 = performance.now() * 1000;

    // cspell: ignore yxxx
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        let r = Math.random() * 16;
        if (d > 0) {
            r = (d + r) % 16 | 0;
            d = Math.floor(d / 16);
        } else {
            r = (d2 + r) % 16 | 0;
            d2 = Math.floor(d2 / 16);
        }

        return (c === "x" ? r : ((r & 0x7) | 0x8)).toString(16);
    });
};
