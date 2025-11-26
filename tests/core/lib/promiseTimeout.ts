/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export const promiseTimeout = (callback: () => void, time: number) => {
    return new Promise<void>(resolve => {
        return setTimeout(() => {
            callback();
            resolve();
        }, time);
    });
};
