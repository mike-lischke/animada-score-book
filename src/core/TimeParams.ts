/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { requisitions } from "../supplement/Requisitions.js";
import type { ISbDmTimeParams, ITiming } from "./ScoreBookDataModel.js";

/**
 * Encapsulates timing parameters for an arrangement and publishes changes.
 *
 * Maintains a derived list of `timings` covering every step of every bar,
 * updated whenever any parameter changes (time signature, tempo, length, pulse, resolution).
 */
export class TimeParams implements ISbDmTimeParams {
    /** All valid timings for the current configuration (bar/step pairs). */
    public readonly timings: ITiming[] = [];

    private resolution: number;
    private signature: string;
    private usedTempo: number;
    private usedLength: number;
    private usedPulse: string;

    /**
     * Creates a new `TimeParams` instance.
     *
     * @param timeSignature The meter in the form "beatsPerBar/beatUnit" (e.g., "4/4").
     * @param tempo The tempo in BPM.
     * @param length The number of bars in the arrangement.
     * @param pulse The rhythmic pulse as "count/unit" (e.g., "1/4" or "3/8").
     * @param stepResolution The granularity per whole note (power of two), e.g., 8 for sixteenths.
     */
    public constructor(timeSignature: string, tempo: number, length: number, pulse: string, stepResolution: number) {
        if (!this.validateTimeSignature(timeSignature)) {
            throw new Error("Invalid time signature");
        }

        if (!this.validateStepGridCompatibility(timeSignature, stepResolution)) {
            throw new Error("Incompatible time signature and step resolution");
        }

        this.signature = timeSignature;
        this.resolution = stepResolution;
        this.usedTempo = tempo;
        this.usedLength = length;
        this.usedPulse = pulse;
        this.regenerateTimings();
    }

    /**
     * Rebuilds the `timings` list from the current parameters.
     * Called whenever any parameter changes to keep derived state consistent.
     */
    public regenerateTimings() {
        this.timings.length = 0;
        const stepsPerBar = this.calculateStepsPerBar(this.timeSignature, this.resolution);

        for (let bar = 1; bar <= this.usedLength; bar++) {
            for (let step = 1; step <= stepsPerBar; step++) {
                this.timings.push({ bar, step });
            }
        }
    };

    /**
     * Current time signature.
     *
     * @returns The time signature string, e.g., "4/4".
     */
    public get timeSignature() {
        return this.signature;
    };

    /**
     * Updates the time signature and regenerates timings.
     *
     * @param newTimeSignature The new time signature string.
     */
    public set timeSignature(newTimeSignature: string) {
        if (!this.validateTimeSignature(newTimeSignature)) {
            throw new Error("Invalid time signature");
        }

        if (!this.validateStepGridCompatibility(newTimeSignature, this.resolution)) {
            throw new Error("Incompatible time signature and step resolution");
        }

        if (newTimeSignature !== this.signature) {
            this.signature = newTimeSignature;
            this.regenerateTimings();
            void requisitions.execute("timeParamsChanged", undefined);
        }
    }

    /**
     * Current tempo in BPM.
     *
     * @returns The tempo value.
     */
    public get tempo() {
        return this.usedTempo;
    }

    /**
     * Updates the tempo and regenerates timings.
     *
     * @param newTempo The new tempo in BPM.
     */
    public set tempo(newTempo: number) {
        if (!this.validateTempo(newTempo)) {
            throw new Error("Invalid tempo");
        }

        if (newTempo !== this.usedTempo) {
            this.usedTempo = newTempo;
            this.regenerateTimings();
            void requisitions.execute("timeParamsChanged", undefined);
        }
    }

    /**
     * Current arrangement length in bars.
     *
     * @returns The total bar count.
     */
    public get length() {
        return this.usedLength;
    }

    /**
     * Updates the arrangement length and regenerates timings.
     *
     * @param newLength The new number of bars.
     */
    public set length(newLength: number) {
        if (!this.validateLength(newLength)) {
            throw new Error("Invalid length");
        }

        if (newLength !== this.usedLength) {
            this.usedLength = newLength;
            this.regenerateTimings();
            void requisitions.execute("timeParamsChanged", undefined);
        }
    }

    /**
     * Current rhythmic pulse, e.g., "1/4" or "3/8".
     *
     * @returns The pulse string.
     */
    public get pulse() {
        return this.usedPulse;
    }

    /**
     * Updates the pulse and regenerates timings.
     *
     * @param newPulse The new pulse string.
     */
    public set pulse(newPulse: string) {
        if (!this.validatePulse(newPulse)) {
            throw new Error("Invalid pulse");
        }
        if (newPulse !== this.usedPulse) {
            this.usedPulse = newPulse;
            this.regenerateTimings();
            void requisitions.execute("timeParamsChanged", undefined);
        }
    }

    /**
     * Current step resolution (granularity per whole note).
     *
     * @returns The resolution value.
     */
    public get stepResolution() {
        return this.resolution;
    }

    /**
     * Updates the step resolution and regenerates timings.
     *
     * @param newStepResolution The new resolution (power of two).
     */
    public set stepResolution(newStepResolution: number) {
        if (!this.validateNoteValue(newStepResolution)) {
            throw new Error("Invalid step resolution");
        }

        if (!this.validateStepGridCompatibility(this.signature, newStepResolution)) {
            throw new Error("Incompatible time signature and step resolution");
        }

        if (newStepResolution !== this.resolution) {
            this.resolution = newStepResolution;
            this.regenerateTimings();
            void requisitions.execute("timeParamsChanged", undefined);
        }
    }

    /**
     * Validates whether a timing falls within the current arrangement.
     *
     * @param timing The timing to validate.
     * @param timing.bar 1-based bar index.
     * @param timing.step 1-based step index within the bar.
     * @returns True if the timing is within bounds for the current configuration.
     */
    public isValid({ bar, step }: ITiming) {
        if (bar > this.usedLength) {
            return false;
        } // timing falls outside the arrangement entirely

        const stepsPerBar = this.calculateStepsPerBar(this.timeSignature, this.resolution);
        if (step > stepsPerBar) {
            return false;
        }

        return true;
    }

    /**
     * Checks that a time signature string is valid.
     *
     * @param timeSignature The signature to check (e.g., "4/4").
     * @returns True if valid.
     */
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

    /**
     * Validates tempo.
     *
     * The only invalid tempos are non-numeric or less than 1.
     *
     * @param tempo The tempo in BPM.
     * @returns True if valid.
     */
    private validateTempo(tempo: number) {
        if (isNaN(tempo) || tempo < 1) {
            return false;
        }

        return true;
    };

    /**
     * Validates arrangement length (bars).
     *
     * Must be a natural number greater than 0. Later we may allow partial bars.
     *
     * @param length The bar count.
     * @returns True if valid.
     */
    private validateLength(length: number) {
        if (isNaN(length) || length <= 0) {
            return false;
        }

        if (length !== Math.floor(length)) {
            return false;
        }

        return true;
    };

    /**
     * Validates the rhythmic pulse (e.g., "1/4" or "3/8").
     *
     * Pulses are natural counts of a note value (often 8ths).
     * For example, 4/4 often has beat = 1/4, 6/8 often has beat = 3/8.
     *
     * @param pulse The pulse string.
     * @returns True if valid.
     */
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

    /**
     * Validates that a value is a natural number (1, 2, 3, ...).
     *
     * @param number The value to check.
     * @returns True if the value is a natural number.
     */
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

    /**
     * Validates note values (powers of two), e.g., 1, 2, 4, 8, ...
     *
     * @param noteValue The note value to check.
     * @returns True if valid.
     */
    private validateNoteValue(noteValue: number): boolean {
        if (!this.validateNaturalNumber(noteValue)) {
            return false;
        }

        if (noteValue % 2 !== 0) {
            return false;
        }

        return true;
    };

    /**
     * Validates that a time signature and step resolution produce a natural number of steps per bar.
     *
     * @param timeSignature The time signature to validate.
     * @param stepResolution The step resolution to validate.
     * @returns True if the combination defines a valid step grid.
     */
    private validateStepGridCompatibility(timeSignature: string, stepResolution: number): boolean {
        try {
            this.calculateStepsPerBar(timeSignature, stepResolution);

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Calculates the number of steps per bar for a given signature/resolution combination.
     *
     * @param timeSignature The time signature in the form beats/unit.
     * @param stepResolution The step resolution.
     * @returns The number of steps per bar.
     */
    private calculateStepsPerBar(timeSignature: string, stepResolution: number): number {
        const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value) => {
            return Number(value);
        });

        const stepsPerBeat = stepResolution / beatUnit;
        const stepsPerBar = stepsPerBeat * beatsPerBar;
        if (!Number.isInteger(stepsPerBar) || stepsPerBar < 1) {
            throw new Error(`Incompatible time grid: ${timeSignature} with step resolution ${stepResolution}`);
        }

        return stepsPerBar;
    }
};
