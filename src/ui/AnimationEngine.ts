/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import type { RealTime } from "../core/index.js";
import { createPublisher } from "../core/Publisher.js";
import type { EventEngine, EventEngineState } from "../player/types.js";
import type { AnimationEngine } from "./types.js";

// Currently this is just doing auto-scroll
// Potentially, we could make an optimisation
// We could toggle autofollow on and off by connecting and disconnecting the callback
// If there are no registered callbacks, the engine can just do nothing
// Instead, we are currently always running the callback, and the callback is deciding to do nothing

export function getAnimationEngine(eventEngine: EventEngine): AnimationEngine {
    const animations: Array<(realTime: RealTime) => void> = [];
    let state: EventEngineState = "stopped";
    let nextAnimationId: number;
    const publisher = createPublisher();

    eventEngine.subscribe(() => {
        if (eventEngine.state === "playing") {
            start();

            return;
        }
        stop();
    });

    return {
        connect(animation) {
            animations.push(animation);
        },
        disconnect(animation) {
            const animationIndex = animations.indexOf(animation);
            if (animationIndex !== -1) {
                animations.splice(animationIndex, 1);
            }
        },
        subscribe: publisher.subscribe, unsubscribe: publisher.unsubscribe,
        get state() {
            return state;
        }
    };

    function start() {
        if (state === "stopped") {
            state = "playing";
            publisher.publish();
            loop();
        }
    }

    function stop() {
        if (state === "playing") {
            cancelAnimationFrame(nextAnimationId);
            state = "stopped";
            publisher.publish();
        }
    }

    function loop() {
        nextAnimationId = requestAnimationFrame(() => {
            animations.forEach(animation => {
                animation(eventEngine.getTime());
            });
            loop();
        });
    }
}
