/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import {
    addFractions, compareFractions, multiplyFraction, reduceFraction, subtractFractions,
} from "./serialisation/numeric-functions.js";
import type { IFraction } from "./types/general.js";

/**
 * Standard rhythmic note values as powers of two. The enum order encodes the note value:
 * Whole = 1, Half = 2, Quarter = 4, Eighth = 8 and so on.
 */
export enum NoteLength {
    Whole,
    Half,
    Quarter,
    Eighth,
    Sixteenth,
    ThirtySecond,
}

/**
 * Returns the note value denominator of a note length (whole = 1, half = 2, ...).
 *
 * @param length The note length to resolve.
 *
 * @returns The denominator of the note value as a fraction of a whole note.
 */
export const noteLengthDenominator = (length: NoteLength): number => {
    switch (length) {
        case NoteLength.Whole: {
            return 1;
        }

        case NoteLength.Half: {
            return 2;
        }

        case NoteLength.Quarter: {
            return 4;
        }

        case NoteLength.Eighth: {
            return 8;
        }

        case NoteLength.Sixteenth: {
            return 16;
        }

        case NoteLength.ThirtySecond: {
            return 32;
        }
    }
};

/**
 * Resolves the plain note length for a duration expressed in grid steps.
 *
 * @param steps The note duration in grid steps.
 * @param stepsPerWholeNote The number of grid steps in a whole note.
 *
 * @returns The matching note length, or undefined for dotted or tuplet durations.
 */
export const noteLengthForSteps = (steps: number, stepsPerWholeNote: number): NoteLength | undefined => {
    const units = (steps * 32) / stepsPerWholeNote;

    switch (units) {
        case 32: {
            return NoteLength.Whole;
        }

        case 16: {
            return NoteLength.Half;
        }

        case 8: {
            return NoteLength.Quarter;
        }

        case 4: {
            return NoteLength.Eighth;
        }

        case 2: {
            return NoteLength.Sixteenth;
        }

        case 1: {
            return NoteLength.ThirtySecond;
        }

        default: {
            return undefined;
        }
    }
};

/**
 * Standard note values as fractions of a whole note, in descending order. A rest in the score
 * data must always be one of these values (or a subdivision slot duration), so the staff view can
 * render it with a single glyph.
 */
const standardNoteValues: ReadonlyArray<readonly [number, number]> = [
    [1, 1],   // whole
    [3, 4],   // dotted half
    [1, 2],   // half
    [3, 8],   // dotted quarter
    [1, 4],   // quarter
    [3, 16],  // dotted eighth
    [1, 8],   // eighth
    [3, 32],  // dotted sixteenth
    [1, 16],  // sixteenth
    [1, 32],  // thirty-second
];

/**
 * Returns the grid-aligned standard note values as integer step counts, largest first. Values
 * that do not land on a whole grid step are omitted, because the grid view cannot represent them.
 *
 * @param stepsPerBar The measure's step resolution.
 *
 * @returns The standard step counts in descending order.
 */
export const standardRestSteps = (stepsPerBar: number): number[] => {
    const steps: number[] = [];

    for (const [numerator, denominator] of standardNoteValues) {
        const value = (numerator * stepsPerBar) / denominator;
        if (Number.isInteger(value) && value >= 1) {
            steps.push(value);
        }
    }

    return steps;
};

/** The standard note values as bar fractions, in descending order. */
export const standardNoteValueFractions: readonly IFraction[] = standardNoteValues.map(([numerator, denominator]) => {
    return reduceFraction(numerator, denominator);
});

/**
 * Converts the pulse into an integer step count.
 *
 * @param pulse The pulse as a fraction.
 * @param stepsPerBar The measure's step resolution.
 *
 * @returns The pulse width in steps.
 */
export const pulseStepCount = (pulse: IFraction, stepsPerBar: number): number => {
    return (pulse.numerator * stepsPerBar) / pulse.denominator;
};

/**
 * Divides one fraction by another, reduced. Used to relate a duration to the pulse.
 *
 * @param value The fraction to divide.
 * @param divisor The fraction to divide by.
 *
 * @returns The reduced quotient.
 */
const fractionRatio = (value: IFraction, divisor: IFraction): IFraction => {
    return reduceFraction(value.numerator * divisor.denominator, value.denominator * divisor.numerator);
};

/**
 * Decomposes a rest span into standard note values aligned to the pulse. The span is split at pulse
 * boundaries; each pulse-aligned segment is then represented with the largest standard value that
 * fits. Everything is expressed in bar fractions, so no grid resolution is needed — grid callers
 * restrict {@link values} to the values their step resolution can represent.
 *
 * @param start The rest start as a fraction of the bar (inclusive).
 * @param end The rest end as a fraction of the bar (exclusive).
 * @param pulse The rhythmic pulse as a fraction of the bar.
 * @param values The allowed standard values as bar fractions, largest first.
 *
 * @returns The durations of the decomposed rest, in display order.
 */
export const decomposeRestSpan = (start: IFraction, end: IFraction, pulse: IFraction,
    values: readonly IFraction[]): IFraction[] => {
    const result: IFraction[] = [];
    let position = { ...start };

    const fillGreedy = (span: IFraction): IFraction[] => {
        const parts: IFraction[] = [];
        let remaining = { ...span };

        for (const value of values) {
            while (compareFractions(remaining, value) >= 0) {
                parts.push({ ...value });
                remaining = subtractFractions(remaining, value);
            }
        }

        if (remaining.numerator > 0) {
            // A span no standard value can express (e.g. a subdivision slot) keeps its length.
            parts.push(remaining);
        }

        return parts;
    };

    while (compareFractions(position, end) < 0) {
        const remaining = subtractFractions(end, position);
        const pulses = fractionRatio(position, pulse);
        const offset = subtractFractions(position,
            multiplyFraction(pulse, Math.floor(pulses.numerator / pulses.denominator)));
        const isPulseAligned = offset.numerator === 0;

        if (!isPulseAligned || compareFractions(remaining, pulse) < 0) {
            const boundary = addFractions(position, subtractFractions(pulse, offset));
            const chunkEnd = isPulseAligned || compareFractions(boundary, end) > 0 ? end : boundary;

            result.push(...fillGreedy(subtractFractions(chunkEnd, position)));
            position = chunkEnd;

            continue;
        }

        // Pulse aligned with at least one full pulse left: prefer a value spanning whole pulses.
        const chosen = values.find((value) => {
            return fractionRatio(value, pulse).denominator === 1 && compareFractions(value, remaining) <= 0;
        });

        if (chosen === undefined) {
            result.push(...fillGreedy(remaining));

            break;
        }

        result.push({ ...chosen });
        position = addFractions(position, chosen);
    }

    return result;
};

/**
 * Decomposes a grid-aligned rest span into standard note values aligned to the pulse; the step
 * based counterpart of {@link decomposeRestSpan}, limited to the values the grid can represent.
 *
 * @param startStep The first step of the rest (inclusive).
 * @param endStep The step after the rest (exclusive).
 * @param pulseSteps The pulse width in steps.
 * @param stepsPerBar The measure's step resolution.
 *
 * @returns The step counts of the decomposed rest, in display order.
 */
export const decomposeRestSteps = (startStep: number, endStep: number, pulseSteps: number,
    stepsPerBar: number): number[] => {
    const values = standardRestSteps(stepsPerBar).map((steps) => {
        return reduceFraction(steps, stepsPerBar);
    });
    const parts = decomposeRestSpan(reduceFraction(startStep, stepsPerBar),
        reduceFraction(endStep, stepsPerBar), reduceFraction(pulseSteps, stepsPerBar), values);

    return parts.map((part) => {
        return (part.numerator * stepsPerBar) / part.denominator;
    });
};
