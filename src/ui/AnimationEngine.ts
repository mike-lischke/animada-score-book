/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { requisitions } from "../supplement/Requisitions.js";
import type { RealTime } from "../core/ScoreBookDataModel.js";
import { PlayerPlayState } from "../player/ArrangementPlayer.js";

export interface IRealtimeProvider {
    get state(): PlayerPlayState;
    get currentTime(): RealTime;
}

export class AnimationEngine {
    private readonly animations: Array<(realTime: RealTime) => void> = [];
    private nextAnimationId = 0;

    public constructor(private readonly realtimeProvider: IRealtimeProvider) {
        requisitions.register("playerStateChanged", () => {
            if (realtimeProvider.state === PlayerPlayState.Playing) {
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
        if (this.realtimeProvider.state === PlayerPlayState.Playing) {
            void requisitions.execute("animationStateChanged", PlayerPlayState.Playing);
            this.runAnimations();
        }
    }

    private stop() {
        if (this.realtimeProvider.state === PlayerPlayState.Stopped) {
            cancelAnimationFrame(this.nextAnimationId);
            this.nextAnimationId = 0;
            void requisitions.execute("animationStateChanged", PlayerPlayState.Stopped);
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
