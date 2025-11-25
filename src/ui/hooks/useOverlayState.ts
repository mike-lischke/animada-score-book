/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useContext } from "preact/hooks";
import { OverlayStateContext } from "../../components/ui/Overlay.js";
import { useSubscription } from "./useSubscription.js";

interface OverlayCallbacks {
    onOpen?: () => void;
    onClose?: () => void;
}

export function useOverlayState({ onOpen, onClose }: OverlayCallbacks) {
    const overlayState = useContext(OverlayStateContext)!;

    useSubscription(overlayState, () => {
        if (overlayState.visible) {
            onOpen?.();
        } else {
            onClose?.();
        }
    }, [overlayState]); // In theory, if the overlayState object in context changes, we need to rejig the subscription
}
