/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { requisitions } from "../supplement/Requisitions.js";
import type { ISbDmTimeParams } from "./ScoreBookDataModel.js";

/**
 * Encapsulates timing parameters for an arrangement and publishes changes.
 *
 * The time parameters state the music itself — meter, tempo, length and pulse; everything a view derives from them
 * is that view's concern.
 */
export class TimeParams implements ISbDmTimeParams {
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
     */
    public constructor(timeSignature: string, tempo: number, length: number, pulse: string) {
        if (!this.validateTimeSignature(timeSignature)) {
            throw new Error("Invalid time signature");
        }

        this.signature = timeSignature;
        this.usedTempo = tempo;
        this.usedLength = length;
        this.usedPulse = pulse;
    }

    /**
     * Current time signature.
     *
     * @returns The time signature string, e.g., "4/4".
     */
    public get timeSignature() {
        return this.signature;
    };

    /**
     * Updates the time signature.
     *
     * @param newTimeSignature The new time signature string.
     */
    public set timeSignature(newTimeSignature: string) {
        if (!this.validateTimeSignature(newTimeSignature)) {
            throw new Error("Invalid time signature");
        }

        if (newTimeSignature !== this.signature) {
            this.signature = newTimeSignature;
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
     * Updates the tempo.
     *
     * @param newTempo The new tempo in BPM.
     */
    public set tempo(newTempo: number) {
        if (!this.validateTempo(newTempo)) {
            throw new Error("Invalid tempo");
        }

        if (newTempo !== this.usedTempo) {
            this.usedTempo = newTempo;
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
     * Updates the arrangement length.
     *
     * @param newLength The new number of bars.
     */
    public set length(newLength: number) {
        if (!this.validateLength(newLength)) {
            throw new Error("Invalid length");
        }

        if (newLength !== this.usedLength) {
            this.usedLength = newLength;
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
     * Updates the pulse.
     *
     * @param newPulse The new pulse string.
     */
    public set pulse(newPulse: string) {
        if (!this.validatePulse(newPulse)) {
            throw new Error("Invalid pulse");
        }

        if (newPulse !== this.usedPulse) {
            this.usedPulse = newPulse;
            void requisitions.execute("timeParamsChanged", undefined);
        }
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
};
