/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IFraction } from "../types/general.js";
import { conversionBase, urlCharacterToNumber } from "./constants.js";

// No negative numbers
export const urlDecodeNumber = (input: string): bigint => {
    let output = 0n;

    while (input.length > 0) {
        output = output * conversionBase;
        output = output + urlCharacterToNumber[input[0]];
        input = input.substring(1);
    }

    return output;
};

// Used for converting from a URL to a Track, so the output represents an array of notes
export const convertToBaseN = (input: bigint, base: bigint): number[] => {
    const output: number[] = [];

    do {
        const quotient = input / base;
        const remainder = input % base;

        output.unshift(Number(remainder));
        input = quotient;
    } while (input > 0n);

    return output;
};

export const reduceFraction = (numerator: number, denominator: number): { numerator: number; denominator: number; } => {
    const divisor = greatestCommonDivisor(Math.abs(numerator), Math.abs(denominator));

    return {
        numerator: numerator / divisor,
        denominator: denominator / divisor,
    };
};

export const addFractions = (left: IFraction, right: IFraction): IFraction => {
    return reduceFraction(
        (left.numerator * right.denominator) + (right.numerator * left.denominator),
        left.denominator * right.denominator,
    );
};

export const subtractFractions = (left: IFraction, right: IFraction): IFraction => {
    return reduceFraction(
        (left.numerator * right.denominator) - (right.numerator * left.denominator),
        left.denominator * right.denominator,
    );
};

export const multiplyFraction = (fraction: IFraction, multiplier: number): IFraction => {
    return reduceFraction(fraction.numerator * multiplier, fraction.denominator);
};

export const divideFraction = (fraction: IFraction, divisor: number): IFraction => {
    return reduceFraction(fraction.numerator, fraction.denominator * divisor);
};

export const compareFractions = (left: IFraction, right: IFraction): number => {
    return (left.numerator * right.denominator) - (right.numerator * left.denominator);
};

export const areSameFractions = (left: IFraction, right: IFraction): boolean => {
    return left.numerator === right.numerator && left.denominator === right.denominator;
};

export const greatestCommonDivisor = (left: number, right: number): number => {
    if (left === 0) {
        return right || 1;
    }

    if (right === 0) {
        return left;
    }

    let firstValue = left;
    let secondValue = right;
    while (secondValue !== 0) {
        const temp = secondValue;
        secondValue = firstValue % secondValue;
        firstValue = temp;
    }

    return firstValue;
};
