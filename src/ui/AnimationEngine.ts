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

export interface IAnimationFrameStats {
    readonly framesPerSecond: number;
    readonly averageFrameIntervalMs: number;
    readonly maximumFrameIntervalMs: number;
    readonly averageAnimationDurationMs: number;
    readonly maximumAnimationDurationMs: number;
    readonly missedFrameCount: number;
    readonly averageVisualDeltaPx: number;
    readonly maximumVisualDeltaPx: number;
}

export class AnimationEngine {
    private readonly animations: Array<(realTime: RealTime) => void> = [];
    private readonly frameStatsListeners = new Set<(stats: IAnimationFrameStats) => void>();
    private frameWindowStart?: DOMHighResTimeStamp;
    private previousFrameTimestamp?: DOMHighResTimeStamp;
    private frameIntervals: number[] = [];
    private animationDurations: number[] = [];
    private previousVisualPosition?: number;
    private visualPositionDeltas: number[] = [];
    private currentFrameStats: IAnimationFrameStats = {
        framesPerSecond: 0,
        averageFrameIntervalMs: 0,
        maximumFrameIntervalMs: 0,
        averageAnimationDurationMs: 0,
        maximumAnimationDurationMs: 0,
        missedFrameCount: 0,
        averageVisualDeltaPx: 0,
        maximumVisualDeltaPx: 0,
    };
    private nextAnimationId = 0;

    public constructor(private readonly realtimeProvider: IRealtimeProvider) {
        requisitions.register("playerStateChanged", this.handlePlayerStateChanged);
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

    public get frameStats(): IAnimationFrameStats {
        return this.currentFrameStats;
    }

    public get isCollectingFrameStats(): boolean {
        return this.frameStatsListeners.size > 0;
    }

    public recordVisualPosition(position: number): void {
        if (!this.isCollectingFrameStats) {
            return;
        }

        if (this.previousVisualPosition !== undefined) {
            this.visualPositionDeltas.push(Math.abs(position - this.previousVisualPosition));
        }

        this.previousVisualPosition = position;
    }

    public subscribeFrameStats(listener: (stats: IAnimationFrameStats) => void): () => void {
        this.frameStatsListeners.add(listener);
        listener(this.currentFrameStats);

        return () => {
            this.frameStatsListeners.delete(listener);
        };
    }

    /**
     * Drops the subscription to the player and ends a running animation. A player disposes its engine when it is
     * replaced, so an engine must not react to the playback of the player that replaced it.
     */
    public dispose(): void {
        requisitions.unregister("playerStateChanged", this.handlePlayerStateChanged);
        cancelAnimationFrame(this.nextAnimationId);
        this.nextAnimationId = 0;
        this.frameStatsListeners.clear();

        // No animation runs any more, which the viewer reads as the end of playback.
        void requisitions.execute("animationStateChanged", PlayerPlayState.Stopped);
    }

    private handlePlayerStateChanged = (): Promise<boolean> => {
        const { realtimeProvider } = this;

        if (realtimeProvider.state === PlayerPlayState.Playing) {
            if (this.nextAnimationId === 0) {
                this.start();
            }

            return Promise.resolve(true);
        }

        this.stop();

        return Promise.resolve(true);
    };

    private start() {
        if (this.realtimeProvider.state === PlayerPlayState.Playing) {
            void requisitions.execute("animationStateChanged", PlayerPlayState.Playing);
            this.resetFrameStats();
            this.runAnimations(performance.now());
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
        this.nextAnimationId = requestAnimationFrame(this.runAnimations);
    }

    private runAnimations = (frameTimestamp: DOMHighResTimeStamp): void => {
        const collectStats = this.frameStatsListeners.size > 0;
        const animationStart = collectStats ? performance.now() : 0;
        const realTime = this.realtimeProvider.currentTime;
        this.animations.forEach((animation) => {
            animation(realTime);
        });

        if (collectStats) {
            this.collectFrameStats(frameTimestamp, performance.now() - animationStart);
        }

        this.loop();
    };

    private collectFrameStats(frameTimestamp: DOMHighResTimeStamp, animationDuration: number): void {
        const frameWindowStart = this.frameWindowStart ??= frameTimestamp;

        if (this.previousFrameTimestamp !== undefined) {
            this.frameIntervals.push(frameTimestamp - this.previousFrameTimestamp);
        }

        this.previousFrameTimestamp = frameTimestamp;
        this.animationDurations.push(animationDuration);

        const elapsed = frameTimestamp - frameWindowStart;
        if (elapsed < 1000 || this.frameIntervals.length === 0) {
            return;
        }

        const sortedIntervals = [...this.frameIntervals].sort((left, right) => {
            return left - right;
        });
        const targetInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
        const totalInterval = this.frameIntervals.reduce((sum, interval) => {
            return sum + interval;
        }, 0);
        const totalAnimationDuration = this.animationDurations.reduce((sum, duration) => {
            return sum + duration;
        }, 0);
        const maximumFrameInterval = Math.max(...this.frameIntervals);
        const maximumAnimationDuration = Math.max(...this.animationDurations);
        const totalVisualDelta = this.visualPositionDeltas.reduce((sum, delta) => {
            return sum + delta;
        }, 0);
        const maximumVisualDelta = this.visualPositionDeltas.length === 0
            ? 0
            : Math.max(...this.visualPositionDeltas);
        const missedFrameCount = this.frameIntervals.reduce((count, interval) => {
            return count + Math.max(0, Math.round(interval / targetInterval) - 1);
        }, 0);

        this.currentFrameStats = {
            framesPerSecond: this.frameIntervals.length * 1000 / elapsed,
            averageFrameIntervalMs: totalInterval / this.frameIntervals.length,
            maximumFrameIntervalMs: maximumFrameInterval,
            averageAnimationDurationMs: totalAnimationDuration / this.animationDurations.length,
            maximumAnimationDurationMs: maximumAnimationDuration,
            missedFrameCount,
            averageVisualDeltaPx: this.visualPositionDeltas.length === 0
                ? 0
                : totalVisualDelta / this.visualPositionDeltas.length,
            maximumVisualDeltaPx: maximumVisualDelta,
        };

        for (const listener of this.frameStatsListeners) {
            listener(this.currentFrameStats);
        }

        this.frameWindowStart = frameTimestamp;
        this.frameIntervals = [];
        this.animationDurations = [];
    }

    private resetFrameStats(): void {
        this.frameWindowStart = undefined;
        this.previousFrameTimestamp = undefined;
        this.frameIntervals = [];
        this.animationDurations = [];
        this.previousVisualPosition = undefined;
        this.visualPositionDeltas = [];
    }
}
