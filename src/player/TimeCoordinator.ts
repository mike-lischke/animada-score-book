/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../Core/Publisher.js";
import type { RealTime, ITimeParamsView, ITiming } from "../Core/types/general.js";
import { getEventEngine } from "./EventEngine.js";
import { IInterval, ILoopInterval, ITimeCoordinator } from "./types.js";

const eventEngine = getEventEngine();

// TimeCoordinator handles all maths that need to be done with TimeParams
// In the EventEngine, time always marches forward (except when paused)
// In music-related objects, times are always between 0 and the length of the section
// A TimeCoordinator adjust times from the EventEngine to make sense to music objects
export class TimeCoordinator extends Publisher implements ITimeCoordinator {

    public realTimeLength!: number;
    public secondsPerBar!: RealTime;
    public secondsPerStep!: RealTime;

    private offset: RealTime = 0;

    // Tempo and length changes incur offset changes
    private cachedTempo: number;
    private cachedLength: number;

    public constructor(private timeParams: ITimeParamsView) {
        super();

        this.setInternalParams(); // Sets the variables above

        this.cachedTempo = timeParams.tempo;
        this.cachedLength = timeParams.length;

        timeParams.subscribe(this.handleTimeParamsChange);
        eventEngine.subscribe(this.handlePlaybackChange);
    }

    // Converting is currently extremely easy, but will become more complicated with polyrhythms
    public convertToRealTime(timing: ITiming): RealTime {
        return (this.secondsPerBar * (timing.bar - 1)) + (this.secondsPerStep * (timing.step - 1));
    };

    // Takes an interval whose times may be beyond the end of the loop
    // And returns up to two intervals with times within the loop
    // The two new intervals will cover the same total amount of time
    public convertToLoopIntervals({ start, end }: IInterval): ILoopInterval[] {
        const offsetStart = start + this.offset;
        const offsetEnd = end + this.offset;
        const startLoopNumber = Math.floor(offsetStart / this.realTimeLength);
        const endLoopNumber = Math.floor(offsetEnd / this.realTimeLength);
        const adjustedStart = offsetStart % this.realTimeLength;
        const adjustedEnd = offsetEnd % this.realTimeLength;

        if (startLoopNumber === endLoopNumber) {
            return [
                {
                    loopNumber: startLoopNumber,
                    start: adjustedStart,
                    end: adjustedEnd
                }
            ];
        }

        // If the end-loop is different to the start-loop, this interval is overflowing the loopNumber
        // So we return a segment at the end of the loop, and a segment at the beginning
        // We're assuming at the moment that a note-request-interval is not longer than a loop
        return [
            {
                loopNumber: startLoopNumber,
                start: adjustedStart,
                end: this.realTimeLength
            },
            {
                loopNumber: endLoopNumber,
                start: 0,
                end: adjustedEnd
            }
        ];
    };

    public setInternalParams() {
        const view = this.calcNoteTimes(this.timeParams);
        this.secondsPerBar = view.secondsPerBar;
        this.secondsPerStep = view.secondsPerStep;

        this.realTimeLength = this.convertToRealTime({ bar: this.timeParams.length + 1, step: 1 });
    };

    // We must only ever have one timeParam change at a time
    public handleTimeParamsChange = () => {
        if (this.timeParams.tempo !== this.cachedTempo) {
            this.handleTempoChange();
        } else if (this.timeParams.length !== this.cachedLength) {// MUST call setInternalParams
            this.handleLengthChange();
        } else { // MUST call setInternalParams
            this.setInternalParams();
        }
        this.publish();
    };

    // A tempo change shrinks or stretches the whole piece across real time
    // The audio-time does not change, so we are jumped to a different point in the music
    // We use offset to move back to the correct point in the music
    public handleTempoChange() {
        this.setInternalParams();
        const oldTempo = this.cachedTempo;
        const newTempo = this.timeParams.tempo;
        const audioTime = eventEngine.getTime();
        const oldOffsetTime = audioTime + this.offset;
        const newOffsetTime = oldOffsetTime * (oldTempo / newTempo);
        this.offset = newOffsetTime - audioTime;
        this.cachedTempo = newTempo;
    };

    // Take a time relative to the start of a particular loop
    // And return a time relative to time zero
    public convertToAudioTime(realTime: number, loopNumber: number) {
        return realTime + (loopNumber * this.realTimeLength) - this.offset;
    };

    public convertToLoopProgress(realTime: number): RealTime {
        return ((realTime + this.offset) % this.realTimeLength) / this.realTimeLength;
    };

    public handlePlaybackChange = () => {
        if (eventEngine.state !== "playing") {
            this.offset = 0;
        }
    };

    // A length change means that audio time no longer lines up with the same loop, or bar within the loop
    // We use offset to move back to the correct loop and bar within it
    private handleLengthChange() {
        const oldRealTimeLength = this.realTimeLength;
        this.setInternalParams();

        const audioTime = eventEngine.getTime();
        const oldOffsetTime = audioTime + this.offset;

        const oldTimeWithinLoop = oldOffsetTime % oldRealTimeLength;
        const targetTimeWithinLoop = oldTimeWithinLoop % this.realTimeLength;
        let loopsFinished = Math.floor(oldOffsetTime / oldRealTimeLength);

        // Prevent moving earlier into the same loop, which, musically, we've already played
        if (targetTimeWithinLoop < oldTimeWithinLoop) {
            loopsFinished++;
        }

        const newOffsetTime = (loopsFinished * this.realTimeLength) + targetTimeWithinLoop;
        this.offset = newOffsetTime - audioTime;

        // Everything actually worked fine without this line, which suggests there's an optimisation we could make.
        this.cachedLength = this.timeParams.length;
    };

    private calcNoteTimes({ timeSignature, tempo, pulse, stepResolution }: ITimeParamsView) {
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

        // And produce our actually useful values
        const secondsPerStep = secondsPerPulse / stepsPerPulse;
        const secondsPerBar = secondsPerStep * stepsPerBar;

        return { secondsPerBar, secondsPerStep };
    }
};
