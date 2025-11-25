/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { useCallback, useRef } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import { isMobile } from "../../ui/isMobile.js";

export function TouchHoldDetector(
    { callback, holdLength, children }: { callback: () => void, holdLength: number, children: JSX.Element; }
): JSX.Element {
    const timeoutIdRef = useRef<number>(null);
    const onTouchStart = useCallback(() => {
        return timeoutIdRef.current = setTimeout(callback, holdLength);
    }, []);
    const cancel = useCallback(() => {
        clearTimeout(timeoutIdRef.current!);
    }, []);

    return (
        <div
            className="hold-detector"
            onTouchStart={onTouchStart}
            onTouchMove={cancel}
            onTouchEnd={cancel}
            onContextMenu={preventDefault}
            // This may not work well in some cases. The approach can be changed if not.
            style={{ width: "100%", height: "100%" }}
        >
            {children}
        </div>
    );
}

function preventDefault(event: MouseEvent) {
    if (isMobile) {
        event.preventDefault();
    }
}
