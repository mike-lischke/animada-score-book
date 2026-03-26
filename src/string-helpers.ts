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
