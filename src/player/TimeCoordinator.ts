/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import type { ISbDmNoteEvent, ITiming, RealTime } from "../core/ScoreBookDataModel.js";
import type { ITimeParamsBase } from "../core/types/general.js";
import type { IRealtimeProvider } from "../ui/AnimationEngine.js";

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

    /** What note value represents one beat? (e.g. 4 for 4/4, 8 for 6/8 etc.) */
    beatUnit: number,

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

    public constructor(private timeParams: Readonly<ITimeParamsBase>,
        private readonly realtimeProvider: IRealtimeProvider) {
        super();

        this.#metrics = this.computeMetrics();

        this.cachedTempo = timeParams.tempo;

        // XXX: convert to requisition.
        // timeParams.subscribe(this.handleTimeParamsChange);
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
     * Converts a fractional measure event position to real time.
     *
     * @param event The note event to convert.
     * @returns The real-time position.
     */
    public convertEventToRealTime(event: ISbDmNoteEvent): RealTime {
        const { measureNumber, start } = event;

        return this.#metrics.secondsPerBar * ((measureNumber - 1) + (start.numerator / start.denominator));
    }

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
        if (!Number.isInteger(stepsPerBar) || stepsPerBar < 1) {
            throw new Error(`Incompatible time grid: ${timeSignature} with step resolution ${stepResolution}`);
        }
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
            beatUnit,
            stepsPerBar,
            stepsPerPulse,
        };
    }
};
