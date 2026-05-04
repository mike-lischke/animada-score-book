/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** Current internal arrangement snapshot schema version. */
export const arrangementSnapshotVersion = 1;

export const isNaturalNumber = (value: unknown): value is number => {
    return typeof value === "number" && Number.isInteger(value) && value >= 1;
};
