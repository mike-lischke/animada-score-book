/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useEffect } from "preact/hooks";

import type { ISubscribable } from "../../Core1/types/general.js";

export function useSubscription(subscribable: ISubscribable, callback: () => void,
    dependencyList: unknown[] = []) {
    useEffect(() => {
        subscribable.subscribe(callback);

        return () => {
            subscribable.unsubscribe(callback);
        };
    }, dependencyList);
}
