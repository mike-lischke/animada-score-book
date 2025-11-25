/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useEffect } from "preact/hooks";

export function useMouseEvent(target: EventTarget, eventName: string, callback: (event: MouseEvent) => void) {
    useEffect(() => {
        target.addEventListener(eventName, callback as EventListener);

        return () => {
            target.removeEventListener(eventName, callback as EventListener);
        };
    });
}
