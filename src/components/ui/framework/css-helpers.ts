/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Escapes the given string to be used as a CSS identifier.
 *
 * @param input The string to escape.
 * @returns The escaped string.
 */
export const escapeCssIdent = (input: string): string => {
    return input
        .replace(/^\d/, (match) => {
            return `\\3${match} `;
        })
        .replace(/[^a-zA-Z0-9_-]/g, (ch) => {
            return `\\${ch}`;
        });
};
