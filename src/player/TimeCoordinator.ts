/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import type { ITiming, RealTime } from "../core/ScoreBookDataModel.js";
import type { ITimeParams } from "../core/types/general.js";
import type { IRealtimeProvider } from "../ui/AnimationEngine.js";
import { IInterval, ILoopInterval } from "./types.js";

/**
 * Timing details about the score, such as how long a bar is, or how many pulses there are in a bar.
 */
export interface IScoreMetrics {
    /**
     * The length of the full loop in seconds.
     * A loop is the full length of the music before it starts again.
     */
    realTimeLength: number,

    /** How many seconds is a bar long? */
    secondsPerBar: RealTime,

    /** How many seconds is a step long? */
    secondsPerStep: RealTime,

    /** How many bars are in the score? */
    bars: number,

    /** How many beats are in a bar? */
    beatsPerBar: number,

    /** How many pulses are in a bar? */
    pulsesPerBar: number,

    /** How many steps are in a bar? */
    stepsPerBar: number,

    /** How many steps are in a pulse? */
    stepsPerPulse: number,
}

/**
 * TimeCoordinator handles all maths that need to be done with TimeParams.
 * In the EventEngine, time always marches forward (except when paused).
 * In music-related objects, times are always between 0 and the length of the section.
 * A TimeCoordinator adjust times from the EventEngine to make sense to music objects.
 *
 * Terms used here:
 * - Real time: A time in seconds, relative to the start of the music.
 * - Loop interval: An interval with a loop number, and start and end times between 0 and the length of the loop.
 * - Loop progress: A number between 0 and 1 representing how far through the loop we are.
 *
 * - Bar: A subdivision of the music, defined by the time signature. Bars are numbered from 1.
 * - Pulse: A subdivision of a bar. Groups steps together. Usually corresponds to the beat (2 for 2/4, 4 for 4/4 etc.).
 *          Defined by the pulse setting.
 * - Step: The base unit of time in the music. Steps are numbered from 1, and there are `stepResolution` steps
 *         in a beat.
 */
export class TimeCoordinator extends Publisher {

    /**
     * Time offset used temporarily when there are changes to the time params that would cause the music to jump
     * to a different point and the music is currently playing.
     * This allows us to keep the music playing without jumps, while still updating the timing of future events to
     * match the new time params.
     */
    private internalOffset: RealTime = 0;

    // Tempo and length changes incur offset changes.
    private cachedTempo: number;

    #metrics: IScoreMetrics;

    public constructor(private timeParams: Readonly<ITimeParams>,
        private readonly realtimeProvider: IRealtimeProvider) {
        super();

        this.#metrics = this.computeMetrics();

        this.cachedTempo = timeParams.tempo;

        timeParams.subscribe(this.handleTimeParamsChange);
    }

    public get metrics(): IScoreMetrics {
        return this.#metrics;
    }

    /**
     * Converting is currently extremely easy, but will become more complicated with polyrhythms
     * and tempo changes.
     *
     * @param timing The timing to convert.
     * @returns The real time.
     */
    public convertToRealTime(timing: ITiming): RealTime {
        return (this.#metrics.secondsPerBar * (timing.bar - 1)) + (this.#metrics.secondsPerStep * (timing.step - 1));
    };

    /**
     * Takes an interval whose times may be beyond the end of the loop
     * and returns up to two intervals with times within the loop.
     * The two new intervals will cover the same total amount of time.
     *
     * @param param0 The interval to convert.
     * @param param0.start The start time.
     * @param param0.end The end time.
     *
     * @returns The converted intervals.
     */
    public convertToLoopIntervals({ start, end }: IInterval): ILoopInterval[] {
        const offsetStart = start + this.internalOffset;
        const offsetEnd = end + this.internalOffset;
        const startLoopNumber = Math.floor(offsetStart / this.#metrics.realTimeLength);
        const endLoopNumber = Math.floor(offsetEnd / this.#metrics.realTimeLength);
        const adjustedStart = offsetStart % this.#metrics.realTimeLength;
        const adjustedEnd = offsetEnd % this.#metrics.realTimeLength;

        if (startLoopNumber === endLoopNumber) {
            return [
                {
                    loopNumber: startLoopNumber,
                    start: adjustedStart,
                    end: adjustedEnd
                }
            ];
        }

        // If the end-loop is different to the start-loop, this interval is overflowing the loopNumber.
        // So we return a segment at the end of the loop, and a segment at the beginning.
        // We're assuming at the moment that a note-request-interval is not longer than a loop.
        return [
            {
                loopNumber: startLoopNumber,
                start: adjustedStart,
                end: this.#metrics.realTimeLength
            },
            {
                loopNumber: endLoopNumber,
                start: 0,
                end: adjustedEnd
            }
        ];
    };

    /**
     * Take a time relative to the start of a particular loop
     * And return a time relative to time zero
     *
     * @param realTime The time within the loop.
     * @param loopNumber The loop number.
     *
     * @returns The audio time.
     */
    public convertToAudioTime(realTime: number, loopNumber: number) {
        return realTime + (loopNumber * this.#metrics.realTimeLength) - this.internalOffset;
    };

    public convertToLoopProgress(realTime: number): RealTime {
        return ((realTime + this.internalOffset) % this.#metrics.realTimeLength) / this.#metrics.realTimeLength;
    };

    /**
     * Called when the current arrangement stopped playing.
     */
    public reset(): void {
        this.internalOffset = 0;
        this.cachedTempo = this.timeParams.tempo;
        this.#metrics = this.computeMetrics();
    }

    /**
     * We must only ever have one timeParam change at a time.
     */
    private handleTimeParamsChange = () => {
        if (this.timeParams.tempo !== this.cachedTempo) {
            this.handleTempoChange();
        } else if (this.timeParams.length !== this.metrics.bars) {
            this.handleLengthChange();
        } else {
            this.#metrics = this.computeMetrics();
        }

        this.publish();
    };

    /**
     * The audio-time does not change, so we are jumped to a different point in the music.
     * We use offset to move back to the correct point in the music.
     */
    private handleTempoChange() {
        this.#metrics = this.computeMetrics();

        const oldTempo = this.cachedTempo;
        const newTempo = this.timeParams.tempo;
        const audioTime = this.realtimeProvider.currentTime;
        if (audioTime > -1) {
            const oldOffsetTime = audioTime + this.internalOffset;
            const newOffsetTime = oldOffsetTime * (oldTempo / newTempo);
            this.internalOffset = newOffsetTime - audioTime;
            this.cachedTempo = newTempo;
        } else {
            this.internalOffset = 0;
            this.cachedTempo = newTempo;
        }
    };

    /**
     * A length change means that audio time no longer lines up with the same loop, or bar within the loop.
     * We use offset to move back to the correct loop and bar within it.
     */
    private handleLengthChange() {
        const oldRealTimeLength = this.#metrics.realTimeLength;
        this.#metrics = this.computeMetrics();

        const audioTime = this.realtimeProvider.currentTime;
        const oldOffsetTime = audioTime + this.internalOffset;

        const oldTimeWithinLoop = oldOffsetTime % oldRealTimeLength;
        const targetTimeWithinLoop = oldTimeWithinLoop % this.#metrics.realTimeLength;
        let loopsFinished = Math.floor(oldOffsetTime / oldRealTimeLength);

        // Prevent moving earlier into the same loop, which, musically, we've already played.
        if (targetTimeWithinLoop < oldTimeWithinLoop) {
            loopsFinished++;
        }

        const newOffsetTime = (loopsFinished * this.#metrics.realTimeLength) + targetTimeWithinLoop;
        this.internalOffset = newOffsetTime - audioTime;
    };

    private computeMetrics(): IScoreMetrics {
        const { timeSignature, tempo, pulse, stepResolution } = this.timeParams;
        const [beatsPerBar, beatUnit] = timeSignature.split("/").map((str) => {
            return Number(str);
        });
        const [pulseFrequency, pulseResolution] = pulse.split("/").map((str) => {
            return Number(str);
        });

        // Lay some ground work...
        const stepsPerBeat = stepResolution / beatUnit;
        const stepsPerBar = stepsPerBeat * beatsPerBar;
        const stepsPerPulse = stepResolution * pulseFrequency / pulseResolution;
        const secondsPerPulse = 60 / tempo;

        // And produce our actually useful values.
        const secondsPerStep = secondsPerPulse / stepsPerPulse;
        const secondsPerBar = secondsPerStep * stepsPerBar;

        return {
            realTimeLength: secondsPerBar * this.timeParams.length,
            secondsPerBar,
            secondsPerStep,
            bars: this.timeParams.length,
            pulsesPerBar: stepsPerBar / stepsPerPulse,
            beatsPerBar,
            stepsPerBar,
            stepsPerPulse,
        };
    }
};
