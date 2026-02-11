/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IPublisher, Subscription } from "./types/general.js";

export class Publisher implements IPublisher {
    private subscriptions: Subscription[] = [];

    public subscribe = (callback: Subscription): () => void => {
        const index = this.subscriptions.indexOf(callback);
        if (index === -1) {
            this.subscriptions.push(callback);
        }

        return () => {
            this.unsubscribe(callback);
        };
    };

    public unsubscribe = (callbackToRemove: Subscription): void => {
        const index = this.subscriptions.indexOf(callbackToRemove);
        if (index !== -1) {
            this.subscriptions.splice(index, 1);
        }
    };

    public publish(): void {
        this.subscriptions.forEach((callback) => {
            callback();
        });
    }
};
