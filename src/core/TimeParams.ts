/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import type { ITimeParams, ITiming } from "./types/general.js";
import { calculateStepsPerBar } from "./utils.js";

export class TimeParams extends Publisher implements ITimeParams {
    public readonly timings: ITiming[] = [];

    private resolution: number;
    private signature: string;
    private usedTempo: number;
    private usedLength: number;
    private usedPulse: string;

    public constructor(timeSignature: string, tempo: number, length: number, pulse: string, stepResolution: number) {
        super();

        this.signature = timeSignature;
        this.resolution = stepResolution;
        this.usedTempo = tempo;
        this.usedLength = length;
        this.usedPulse = pulse;
        this.regenerateTimings();
    }

    // Whenever any params change, we generate the list of timings from scratch again
    public regenerateTimings() {
        this.timings.length = 0;
        const stepsPerBar = calculateStepsPerBar(this.timeSignature, this.resolution);

        for (let bar = 1; bar <= this.usedLength; bar++) {
            for (let step = 1; step <= stepsPerBar; step++) {
                this.timings.push({ bar, step });
            }
        }
    };

    public get timeSignature() {
        return this.signature;
    };

    public set timeSignature(newTimeSignature: string) {
        if (!this.validateTimeSignature(newTimeSignature)) {
            throw new Error("Invalid time signature");
        }
        if (newTimeSignature !== this.signature) {
            this.signature = newTimeSignature;
            this.regenerateTimings();
            this.publish();
        }
    }

    public get tempo() {
        return this.usedTempo;
    }

    public set tempo(newTempo: number) {
        if (!this.validateTempo(newTempo)) {
            throw new Error("Invalid tempo");
        }
        if (newTempo !== this.usedTempo) {
            this.usedTempo = newTempo;
            this.regenerateTimings();
            this.publish();
        }
    }

    public get length() {
        return this.usedLength;
    }

    public set length(newLength: number) {
        if (!this.validateLength(newLength)) {
            throw new Error("Invalid length");
        }

        if (newLength !== this.usedLength) {
            this.usedLength = newLength;
            this.regenerateTimings();
            this.publish();
        }
    }

    public get pulse() {
        return this.usedPulse;
    }

    public set pulse(newPulse: string) {
        if (!this.validatePulse(newPulse)) {
            throw new Error("Invalid pulse");
        }
        if (newPulse !== this.usedPulse) {
            this.usedPulse = newPulse;
            this.regenerateTimings();
            this.publish();
        }
    }

    public get stepResolution() {
        return this.resolution;
    }

    public set stepResolution(newStepResolution: number) {
        if (!this.validateNoteValue(newStepResolution)) {
            throw new Error("Invalid pulse");
        }

        if (newStepResolution !== this.resolution) {
            this.resolution = newStepResolution;
            this.regenerateTimings();
            this.publish();
        }
    }

    public isValid({ bar, step }: ITiming) {
        if (bar > this.usedLength) {
            return false;
        } // timing falls outside the arrangement entirely

        const [beatsPerBar, beatUnit] = this.timeSignature.split("/").map((value) => {
            return Number(value);
        });
        const stepsPerBeat = this.resolution / beatUnit;
        const stepsPerBar = stepsPerBeat * beatsPerBar;
        if (step > stepsPerBar) {
            return false;
        }

        return true;
    }

    private validateTimeSignature = (timeSignature: string): boolean => {
        const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value: string) => {
            return Number(value);
        });
        if (!this.validateNaturalNumber(beatsPerBar)) {
            return false;
        }
        if (!this.validateNoteValue(beatUnit)) {
            return false;
        }

        return true;
    };

    // The only invalid tempos are negative... unless we want to play backwards!
    // That's an idea for another time
    private validateTempo(tempo: number) {
        if (isNaN(this.usedTempo) || tempo < 1) {
            return false;
        }

        return true;
    };

    // Lengths must be natural numbers for now
    // Later we may want half-bar breaks, etc
    private validateLength(length: number) {
        if (isNaN(this.usedLength) || this.usedLength <= 0) {
            return false;
        }

        if (this.usedLength != Math.floor(this.usedLength)) {
            return false;
        }

        return true;
    };

    // Pulses are natural numbers of kinds of notes (often 8ths)
    // For example, 4/4 is usually beat = 8ths, 6/8 is beat = 3/8ths
    private validatePulse(pulse: string): boolean {
        const [noteCount, noteResolution] = pulse.split("/").map((str) => {
            return Number(str);
        });

        if (!this.validateNoteValue(noteResolution)) {
            return false;
        }

        if (!this.validateNaturalNumber(noteCount)) {
            return false;
        }

        return true;
    };

    private validateNaturalNumber(number: number): boolean {
        if (isNaN(number)) {
            return false;
        }

        if (Math.floor(number) !== number) {
            return false;
        }

        if (number < 1) {
            return false;
        }

        return true;
    };

    // Note values are always powers of 2, meaning crotchets, quavers, minums... all that jazz
    private validateNoteValue(noteValue: number): boolean {
        if (!this.validateNaturalNumber(noteValue)) {
            return false;
        }

        if (noteValue % 2 !== 0) {
            return false;
        }

        return true;
    };
};
