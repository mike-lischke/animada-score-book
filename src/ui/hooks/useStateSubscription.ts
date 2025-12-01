/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useState } from "preact/hooks";

import type { ISubscribable } from "../../core/types/general.js";
import { useSubscription } from "./useSubscription.js";

export function useStateSubscription<T extends ISubscribable, Y>(subscribable: T,
    extractState: (subscribable: T) => Y) {
    const [state, setState] = useState(extractState(subscribable));
    useSubscription(subscribable, () => {
        setState(extractState(subscribable));
    });

    return state;
}
