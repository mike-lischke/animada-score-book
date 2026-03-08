/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { Publisher } from "../core/Publisher.js";
import type { RealTime } from "../core/ScoreBookDataModel.js";
import type { ISubscribable } from "../core/types/general.js";
import type { PlayerPlayState } from "../player/ArrangementPlayer.js";

export interface IRealtimeProvider extends ISubscribable {
    get state(): PlayerPlayState;
    get currentTime(): RealTime;
}

export class AnimationEngine extends Publisher {
    private readonly animations: Array<(realTime: RealTime) => void> = [];
    private nextAnimationId = 0;

    public constructor(private readonly realtimeProvider: IRealtimeProvider) {
        super();

        realtimeProvider.subscribe(() => {
            if (realtimeProvider.state === "playing") {
                if (this.nextAnimationId === 0) {
                    this.start();
                }

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

    private start() {
        if (this.realtimeProvider.state === "playing") {
            this.publish();
            this.loop();
        }
    }

    private stop() {
        if (this.realtimeProvider.state === "stopped") {
            cancelAnimationFrame(this.nextAnimationId);
            this.nextAnimationId = 0;
            this.publish();
        }
    }

    private loop() {
        this.nextAnimationId = requestAnimationFrame(() => {
            this.animations.forEach((animation) => {
                animation(this.realtimeProvider.currentTime);
            });
            this.loop();
        });
    }
}
