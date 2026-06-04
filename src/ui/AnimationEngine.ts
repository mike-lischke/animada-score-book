/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { requisitions } from "../supplement/Requisitions.js";
import type { RealTime } from "../core/ScoreBookDataModel.js";
import type { PlayerPlayState } from "../player/ArrangementPlayer.js";

export interface IRealtimeProvider {
    get state(): PlayerPlayState;
    get currentTime(): RealTime;
}

export class AnimationEngine {
    private readonly animations: Array<(realTime: RealTime) => void> = [];
    private nextAnimationId = 0;

    public constructor(private readonly realtimeProvider: IRealtimeProvider) {
        requisitions.register("playerStateChanged", () => {
            if (realtimeProvider.state === "playing") {
                if (this.nextAnimationId === 0) {
                    this.start();
                }

                return Promise.resolve(true);
            }
            this.stop();

            return Promise.resolve(true);
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

    private start() {
        if (this.realtimeProvider.state === "playing") {
            void requisitions.execute("animationStateChanged", "playing");
            this.runAnimations();
        }
    }

    private stop() {
        if (this.realtimeProvider.state === "stopped") {
            cancelAnimationFrame(this.nextAnimationId);
            this.nextAnimationId = 0;
            void requisitions.execute("animationStateChanged", "stopped");
        }
    }

    private loop() {
        this.nextAnimationId = requestAnimationFrame(() => {
            this.runAnimations();
        });
    }

    private runAnimations() {
        const realTime = this.realtimeProvider.currentTime;
        this.animations.forEach((animation) => {
            animation(realTime);
        });
        this.loop();
    }
}
