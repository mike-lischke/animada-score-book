/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useEffect } from "preact/hooks";

import type { Subscribable } from "../../core/types/general.js";

export function useSubscription(subscribable: Subscribable, callback: () => void,
    dependencyList: unknown[] = []) {
    useEffect(() => {
        subscribable.subscribe(callback);

        return () => {
            subscribable.unsubscribe(callback);
        };
    }, dependencyList);
}

export function useSubscription2(subscribable: Subscribable, callback: () => void,
    dependencyList: unknown[] = []) {
    subscribable.subscribe(callback);

    return () => {
        subscribable.unsubscribe(callback);
    };
}
