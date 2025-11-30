/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IPublisher, Subscription } from "./types/general.js";

export class Publisher implements IPublisher {
    private subscriptions: Array<Subscription | null> = [];

    public subscribe = (callback: Subscription): void => {
        this.subscriptions.push(callback);
    };

    public unsubscribe = (callbackToRemove: Subscription): void => {
        this.subscriptions.some((subscription, index) => {
            if (callbackToRemove === subscription) {
                this.subscriptions[index] = null;

                return true;
            }
        });
    };

    public publish(): void {
        this.subscriptions.forEach((callback) => {
            callback?.();
        });
    }
};
