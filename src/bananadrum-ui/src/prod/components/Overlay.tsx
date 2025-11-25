/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { createContext } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import type { Subscribable } from "../../../../bananadrum-core/src/prod/index.js";
import { createPublisher } from "../../../../bananadrum-core/src/prod/Publisher.js";

export const OverlayStateContext = createContext<OverlayState | null>(null);

export function Overlay({ name, children }: { name: string, children: JSX.Element; }): JSX.Element {
    const [visibilityClass, setVisibilityClass] = useState("invisible hidden");
    const overlayState = useMemo(() => {
        return createOverlayState();
    }, []);

    useEffect(() => {
        const overlaySubscription = () => {
            if (overlayState.visible) {
                setVisibilityClass("invisible"); // First remove hidden class, so we remove display:none
                setTimeout(() => {
                    setVisibilityClass("visible");
                }, 0); // Then fade in
            } else {
                setVisibilityClass("invisible"); // hidden class will be set after animation ends
            }
        };

        overlayState.subscribe(overlaySubscription);
        overlayStates[name] = overlayState;

        return () => {
            overlayState.unsubscribe(overlaySubscription);
            delete overlayStates[name];
        };
    }, []);

    const className = `overlay ${visibilityClass}`;

    function handleTransitionEnd(event: TransitionEvent) {
        const elem = event.target as HTMLElement | null;

        // Only want to catch the overlay fading
        if (!elem?.classList.contains("overlay")) {
            return;
        }

        if (visibilityClass === "invisible") {
            setVisibilityClass("invisible hidden");
        }

        event.stopPropagation(); // Don't want to catch this if we have overlays within overlays... ee gads
    }

    return (
        <OverlayStateContext.Provider value={overlayState}>
            <div className={className} data-overlay-name={name} onTransitionEnd={handleTransitionEnd}>
                {children}
            </div>
        </OverlayStateContext.Provider>
    );
}

type OverlayState = Subscribable & { visible: boolean; };
function createOverlayState(): OverlayState {
    const publisher = createPublisher();
    let visible = false;

    return {
        get visible() {
            return visible;
        },
        set visible(newVisible) {
            if (visible !== newVisible) {
                visible = newVisible;
                publisher.publish();
            }
        },
        subscribe: publisher.subscribe,
        unsubscribe: publisher.unsubscribe
    };
}

const overlayStates: Record<string, OverlayState> = {};

export function toggleOverlay(name: string, mode: "toggle" | "show" | "hide" = "toggle"): void {
    const state = overlayStates[name] as OverlayState | undefined;
    if (state === undefined) {
        console.warn("Toggled an overlay that wasn't registered");

        return;
    }

    if (mode === "show" || (mode === "toggle" && !state.visible)) {
        closeAllOverlays();
        state.visible = true;
    } else {
        state.visible = false;
    }
}

export function closeAllOverlays(): void {
    for (const name in overlayStates) {
        overlayStates[name].visible = false;
    }
}
