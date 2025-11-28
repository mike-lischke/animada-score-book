/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createPublisher } from "./Publisher.js";
import type { TimeParams, Timing } from "./types/general.js";
import { calculateStepsPerBar } from "./utils.js";

export const createTimeParams = (
    timeSignature: string, tempo: number, length: number, pulse: string, stepResolution: number): TimeParams => {
    const publisher = createPublisher();
    const timings: Timing[] = [];

    // Whenever any params change, we generate the list of timings from scratch again
    const regenerateTimings = () => {
        timings.length = 0;
        const stepsPerBar = calculateStepsPerBar(timeSignature, stepResolution);

        for (let bar = 1; bar <= length; bar++) {
            for (let step = 1; step <= stepsPerBar; step++) {
                timings.push({ bar, step });
            }
        }
    };

    regenerateTimings();

    return {
        get timeSignature() {
            return timeSignature;
        },
        set timeSignature(newTimeSignature: string) {
            if (!validateTimeSignature(newTimeSignature)) {
                throw new Error("Invalid time signature");
            }
            if (newTimeSignature !== timeSignature) {
                timeSignature = newTimeSignature;
                regenerateTimings();
                publisher.publish();
            }
        },

        get tempo() {
            return tempo;
        },
        set tempo(newTempo: number) {
            if (!validateTempo(newTempo)) {
                throw new Error("Invalid tempo");
            }
            if (newTempo !== tempo) {
                tempo = newTempo;
                regenerateTimings();
                publisher.publish();
            }
        },

        get length() {
            return length;
        },
        set length(newLength: number) {
            if (!validateLength(newLength)) {
                throw new Error("Invalid length");
            }
            if (newLength !== length) {
                length = newLength;
                regenerateTimings();
                publisher.publish();
            }
        },

        get pulse() {
            return pulse;
        },
        set pulse(newPulse: string) {
            if (!validatePulse(newPulse)) {
                throw new Error("Invalid pulse");
            }
            if (newPulse !== pulse) {
                pulse = newPulse;
                regenerateTimings();
                publisher.publish();
            }
        },

        get stepResolution() {
            return stepResolution;
        },
        set stepResolution(newStepResolution: number) {
            if (!validateNoteValue(newStepResolution)) {
                throw new Error("Invalid pulse");
            }
            if (newStepResolution !== stepResolution) {
                stepResolution = newStepResolution;
                regenerateTimings();
                publisher.publish();
            }
        },

        subscribe: publisher.subscribe,
        unsubscribe: publisher.unsubscribe,

        isValid: ({ bar, step }: Timing) => {
            if (bar > length) {
                return false;
            } // timing falls outside the arrangement entirely

            const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value) => {
                return Number(value);
            });
            const stepsPerBeat = stepResolution / beatUnit;
            const stepsPerBar = stepsPerBeat * beatsPerBar;
            if (step > stepsPerBar) {
                return false;
            }

            return true;
        },
        timings
    };
};

const validateTimeSignature = (timeSignature: string): boolean => {
    const [beatsPerBar, beatUnit] = timeSignature.split("/").map((value: string) => {
        return Number(value);
    });
    if (!validateNaturalNumber(beatsPerBar)) {
        return false;
    }
    if (!validateNoteValue(beatUnit)) {
        return false;
    }

    return true;
};

// The only invalid tempos are negative... unless we want to play backwards!
// That's an idea for another time
const validateTempo = (tempo: number) => {
    if (isNaN(tempo) || tempo < 1) {
        return false;
    }

    return true;
};

// Lengths must be natural numbers for now
// Later we may want half-bar breaks, etc
const validateLength = (length: number) => {
    if (isNaN(length) || length <= 0) {
        return false;
    }
    if (length != Math.floor(length)) {
        return false;
    }

    return true;
};

// Pulses are natural numbers of kinds of notes (often 8ths)
// For example, 4/4 is usually beat = 8ths, 6/8 is beat = 3/8ths
const validatePulse = (pulse: string): boolean => {
    const [noteCount, noteResolution] = pulse.split("/").map((str) => {
        return Number(str);
    });
    if (!validateNoteValue(noteResolution)) {
        return false;
    }
    if (!validateNaturalNumber(noteCount)) {
        return false;
    }

    return true;
};

const validateNaturalNumber = (number: number): boolean => {
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
const validateNoteValue = (noteValue: number): boolean => {
    if (!validateNaturalNumber(noteValue)) {
        return false;
    }
    if (noteValue % 2 !== 0) {
        return false;
    }

    return true;
};
