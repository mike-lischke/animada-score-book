/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import {
    compareFractions, reduceFraction, subtractFractions,
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
 * A note value as the length toolbar and the measure editors handle it: a plain note length plus
 * the augmentation dot, which lengthens the value by half.
 */
export interface INoteValue {
    length: NoteLength;
    dotted: boolean;
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
 * The note values a single glyph can express, as 32nd-note units (whole note = 32), largest first.
 * A dotted whole note would exceed a whole note, so it is not offered. A dotted 32nd note is the
 * shortest value and the only one below a 32nd-note unit: it halves the 32nd note, hence 1.5 units.
 */
const noteValueUnits: ReadonlyArray<readonly [number, INoteValue]> = [
    [32, { length: NoteLength.Whole, dotted: false }],
    [24, { length: NoteLength.Half, dotted: true }],
    [16, { length: NoteLength.Half, dotted: false }],
    [12, { length: NoteLength.Quarter, dotted: true }],
    [8, { length: NoteLength.Quarter, dotted: false }],
    [6, { length: NoteLength.Eighth, dotted: true }],
    [4, { length: NoteLength.Eighth, dotted: false }],
    [3, { length: NoteLength.Sixteenth, dotted: true }],
    [2, { length: NoteLength.Sixteenth, dotted: false }],
    [1.5, { length: NoteLength.ThirtySecond, dotted: true }],
    [1, { length: NoteLength.ThirtySecond, dotted: false }],
];

/**
 * Resolves the note value of a duration expressed in 32nd-note units.
 *
 * @param units The duration as a multiple of a 32nd note (whole note = 32).
 *
 * @returns The matching note value, or undefined for a duration no single value can express.
 */
export const noteValueForUnits = (units: number): INoteValue | undefined => {
    return noteValueUnits.find(([valueUnits]) => {
        return valueUnits === units;
    })?.[1];
};

/**
 * Returns the note value a subdivision slot is notated with when its exact duration matches no
 * value. A tuplet replaces notes of one value, so the slot is drawn with that value: a top-level
 * subdivision stands for eighths, a subdivision nested in it for sixteenths.
 *
 * @param depth The subdivision nesting depth, 1 for a slot of a top-level subdivision.
 *
 * @returns The note value the slot is drawn with.
 */
const subdivisionSlotValue = (depth: number): INoteValue => {
    if (depth <= 1) {
        return { length: NoteLength.Eighth, dotted: false };
    }

    if (depth === 2) {
        return { length: NoteLength.Sixteenth, dotted: false };
    }

    return { length: NoteLength.ThirtySecond, dotted: false };
};

/**
 * Resolves the note value an event is drawn with. The exact duration wins when a single value can
 * express it, so a plain 2:1 split of a step keeps its thirty-seconds. A slot of a real subdivision
 * has a duration no single value expresses and falls back to the value of its subdivision.
 *
 * @param duration The event's duration as a fraction of the measure.
 * @param depth The subdivision nesting depth; 0 for an event outside any subdivision.
 * @param stepsPerBar The number of base-grid steps in one bar.
 * @param stepsPerPulse The number of base-grid steps in one pulse.
 *
 * @returns The note value the event is drawn with, or undefined when its duration has no value.
 */
export const noteValueForEvent = (duration: IFraction, depth: number, stepsPerBar: number,
    stepsPerPulse: number): INoteValue | undefined => {
    const units = duration.denominator > 0 ? (duration.numerator * 32) / duration.denominator : 0;

    if (depth > 0) {
        return noteValueForUnits(units) ?? subdivisionSlotValue(depth);
    }

    if (stepsPerBar <= 0) {
        return undefined;
    }

    const lengthSteps = (duration.numerator * stepsPerBar) / duration.denominator;

    // A ternary pulse fills three steps, and a single step of it stands for an eighth.
    if (stepsPerPulse > 0 && stepsPerPulse % 3 === 0 && lengthSteps * 3 === stepsPerPulse
        && duration.numerator * stepsPerBar === duration.denominator) {
        return { length: NoteLength.Eighth, dotted: false };
    }

    // A twelfth of a bar is a quarter-note triplet slot, which stands for an eighth.
    if (duration.numerator * 12 === duration.denominator) {
        return { length: NoteLength.Eighth, dotted: false };
    }

    return noteValueForUnits(units);
};

/**
 * Returns the duration of a note value as a fraction of a whole note, with the augmentation dot
 * applied.
 *
 * @param value The note value to convert.
 *
 * @returns The duration of the value as a fraction of a whole note.
 */
export const noteValueFraction = (value: INoteValue): IFraction => {
    const denominator = noteLengthDenominator(value.length);

    return value.dotted
        ? reduceFraction(3, denominator * 2)
        : reduceFraction(1, denominator);
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
    [3, 64],  // dotted thirty-second
    [1, 32],  // thirty-second
];

/** The standard note values as bar fractions, in descending order. */
export const standardNoteValueFractions: readonly IFraction[] = standardNoteValues.map(([numerator, denominator]) => {
    return reduceFraction(numerator, denominator);
});

/**
 * Decomposes a rest span into the standard note values, largest first. Only the span decides the
 * split: the staff view places rests freely, so a dotted value may stand wherever its length fits
 * — a dotted quarter rest is never split into a quarter plus an eighth rest.
 *
 * @param span The rest length as a bar fraction.
 *
 * @returns The durations of the decomposed rest, in display order.
 */
export const decomposeRestSpan = (span: IFraction): IFraction[] => {
    const parts: IFraction[] = [];
    let remaining = { ...span };

    for (const value of standardNoteValueFractions) {
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
