/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

const log: Record<string, unknown> = {};

export const set = (key: string, value: unknown) => {
    log[key] = value;

    return value;
};

export const get = <T>(key: string): T | undefined => {
    return log[key] as T;
};
