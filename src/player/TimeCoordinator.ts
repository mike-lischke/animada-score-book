/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { RealTime } from "../core/ScoreBookDataModel.js";
import type { ITimeParamsBase } from "../core/types/general.js";
import type { IRealtimeProvider } from "../ui/AnimationEngine.js";

/**
 * Timing details about the score, such as how long a bar is, or how many pulses there are in a bar.
 */
export interface IScoreMetrics {
    /**
     * The length of the full performance in seconds: the music as written, played in the order the repeat bar lines
     * state. This is the length the transport loops over.
     */
    realTimeLength: number,

    /** How many seconds is a bar long? */
    secondsPerBar: RealTime,

    /** How many bars are in the score? */
    bars: number,

    /** How many bars are played? Repeats make this more than {@link bars}. */
    performedBars: number,

    /** How many beats are in a bar? */
    beatsPerBar: number,

    /** What note value represents one beat? (e.g. 4 for 4/4, 8 for 6/8 etc.) */
    beatUnit: number,

    /** How many pulses are in a bar? A pulse is what the tempo counts, e.g. 4 in 4/4. */
    pulsesPerBar: number,
}

/**
 * TimeCoordinator handles all maths that need to be done with TimeParams.
 * In the EventEngine, time always marches forward (except when paused).
 * In music-related objects, times are always between 0 and the length of the section.
 * A TimeCoordinator adjust times from the EventEngine to make sense to music objects.
 *
 * Terms used here:
 * - Real time: A time in seconds, relative to the start of the music.
 * - Loop progress: A number between 0 and 1 representing how far through the loop we are.
 *
 * - Bar: A subdivision of the music, defined by the time signature. Bars are numbered from 1.
 * - Pulse: A subdivision of a bar. Groups steps together. Usually corresponds to the beat (2 for 2/4, 4 for 4/4 etc.).
 *          Defined by the pulse setting.
 * - Step: The base unit of time in the music. Steps are numbered from 1, and there are as many steps per bar
 *         as the meter's step grid states.
 */
export class TimeCoordinator {

    /**
     * Time offset used temporarily when there are changes to the time params that would cause the music to jump
     * to a different point and the music is currently playing.
     * This allows us to keep the music playing without jumps, while still updating the timing of future events to
     * match the new time params.
     */
    private internalOffset: RealTime = 0;

    #metrics: IScoreMetrics;

    /** How many bars the arrangement plays, which is what its length is measured in. */
    #performedBars: number;

    public constructor(private timeParams: Readonly<ITimeParamsBase>,
        private readonly realtimeProvider: IRealtimeProvider) {
        this.#performedBars = timeParams.length;
        this.#metrics = this.computeMetrics();
    }

    public get metrics(): IScoreMetrics {
        return this.#metrics;
    }

    public convertToLoopProgress(realTime: number): RealTime {
        return ((realTime + this.internalOffset) % this.#metrics.realTimeLength) / this.#metrics.realTimeLength;
    };

    /**
     * States how many bars the arrangement plays, which is what its length is measured in. The repeat bar lines
     * decide it; a performance without repeats plays as many bars as the arrangement has.
     *
     * @param count The number of bars in the performance.
     */
    public setPerformedBars(count: number): void {
        if (count === this.#performedBars) {
            return;
        }

        this.#performedBars = count;
        this.recomputeMetrics();
    }

    /**
     * Called when the current arrangement stopped playing.
     */
    public reset(): void {
        this.internalOffset = 0;
        this.#metrics = this.computeMetrics();
    }

    /**
     * Recomputes cached metrics when time parameters (e.g. tempo) change during playback.
     * Publishes so that subscribers (e.g. TrackPlayer) can rebuild their event caches.
     */
    public recomputeMetrics(): void {
        this.#metrics = this.computeMetrics();
    }

    private computeMetrics(): IScoreMetrics {
        const { timeSignature, tempo, pulse } = this.timeParams;
        const [beatsPerBar, beatUnit] = timeSignature.split("/").map((str) => {
            return Number(str);
        });
        const [pulseCount, pulseUnit] = pulse.split("/").map((str) => {
            return Number(str);
        });

        // A bar holds `beatsPerBar / beatUnit` whole notes and a pulse `pulseCount / pulseUnit` of one, so their
        // quotient is the number of pulses the bar holds.
        const pulsesPerBar = (beatsPerBar * pulseUnit) / (beatUnit * pulseCount);
        const secondsPerPulse = 60 / tempo;
        const secondsPerBar = secondsPerPulse * pulsesPerBar;

        return {
            realTimeLength: secondsPerBar * this.#performedBars,
            secondsPerBar,
            bars: this.timeParams.length,
            performedBars: this.#performedBars,
            beatsPerBar,
            beatUnit,
            pulsesPerBar,
        };
    }
};
