/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { Publisher } from "../core/Publisher.js";
import type { RealTime } from "../core/ScoreBookDataModel.js";
import type { ISubscribable } from "../core/types/general.js";
import type { EventEngine } from "../player/EventEngine.js";
import type { EventEngineState } from "../player/types.js";

export class AnimationEngine implements ISubscribable {
    public state: EventEngineState = "stopped";

    private readonly animations: Array<(realTime: RealTime) => void> = [];
    private nextAnimationId = 0;
    private readonly publisher = new Publisher();

    public constructor(private eventEngine: EventEngine) {
        eventEngine.subscribe(() => {
            if (eventEngine.state === "playing") {
                this.start();

                return;
            }
            this.stop();
        });
    }

    public connect(animation: (realTime: number) => void) {
        this.animations.push(animation);
    }

    public disconnect(animation: (realTime: number) => void) {
        const animationIndex = this.animations.indexOf(animation);
        if (animationIndex !== -1) {
            this.animations.splice(animationIndex, 1);
        }
    }

    public get subscribe() {
        return this.publisher.subscribe;
    }

    public get unsubscribe() {
        return this.publisher.unsubscribe;
    }

    private start() {
        if (this.state === "stopped") {
            this.state = "playing";
            this.publisher.publish();
            this.loop();
        }
    }

    private stop() {
        if (this.state === "playing") {
            cancelAnimationFrame(this.nextAnimationId);
            this.state = "stopped";
            this.publisher.publish();
        }
    }

    private loop() {
        this.nextAnimationId = requestAnimationFrame(() => {
            this.animations.forEach((animation) => {
                animation(this.eventEngine.getTime());
            });
            this.loop();
        });
    }
}
