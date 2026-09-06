/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IFraction } from "./types/general.js";

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
 * Decomposes a grid-aligned rest span into standard note values aligned to the pulse. The span is
 * split at pulse boundaries; each pulse-aligned segment is then represented with the largest
 * standard value that fits.
 *
 * @param startStep The first step of the rest (inclusive).
 * @param endStep The step after the rest (exclusive).
 * @param pulseSteps The pulse width in steps.
 * @param values The standard step counts, largest first.
 *
 * @returns The step counts of the decomposed rest, in display order.
 */
export const decomposeRestSteps = (startStep: number, endStep: number, pulseSteps: number,
    values: number[]): number[] => {
    const result: number[] = [];
    let position = startStep;

    const decomposeGreedy = (count: number): number[] => {
        const parts: number[] = [];
        let remaining = count;

        for (const value of values) {
            while (remaining >= value) {
                parts.push(value);
                remaining -= value;
            }
        }

        return parts;
    };

    while (position < endStep) {
        const remainingSpan = endStep - position;
        const remainder = pulseSteps > 0 ? position % pulseSteps : 0;

        if (remainder !== 0 || remainingSpan < pulseSteps) {
            const chunkEnd = remainder !== 0
                ? Math.min(position + (pulseSteps - remainder), endStep)
                : endStep;
            result.push(...decomposeGreedy(chunkEnd - position));
            position = chunkEnd;

            continue;
        }

        let chosen = 0;
        for (const value of values) {
            if (value % pulseSteps === 0 && value <= remainingSpan) {
                chosen = value;
                break;
            }
        }

        if (chosen === 0) {
            result.push(...decomposeGreedy(remainingSpan));
            break;
        }

        result.push(chosen);
        position += chosen;
    }

    return result;
};
