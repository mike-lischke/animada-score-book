/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IPublisher, Subscription } from "./types/general.js";

export const createPublisher = (): IPublisher => {
    const subscriptions: Array<Subscription | null> = [];

    return {
        subscribe: (callback: Subscription) => {
            subscriptions.push(callback);
        },
        unsubscribe: (callbackToRemove: Subscription) => {
            subscriptions.some((subscription, index) => {
                if (callbackToRemove === subscription) {
                    subscriptions[index] = null;

                    return true;
                }
            });
        },
        publish: () => {
            subscriptions.forEach((callback) => {
                callback?.();
            });
        }
    };
};
