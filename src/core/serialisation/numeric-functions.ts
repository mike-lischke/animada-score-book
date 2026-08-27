/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IFraction } from "../types/general.js";
import { conversionBase, urlCharacterToNumber } from "./constants.js";

/**
 * Decodes a compact URL-encoded integer (base `conversionBase`) into a bigint.
 *
 * @param input Encoded digit string using `urlCharacterToNumber` as alphabet.
 * @returns Decoded non-negative bigint value.
 */
export const urlDecodeNumber = (input: string): bigint => {
    let output = 0n;

    while (input.length > 0) {
        output = output * conversionBase;
        output = output + urlCharacterToNumber[input[0]];
        input = input.substring(1);
    }

    return output;
};

/**
 * Converts a bigint into an array of digits in the given base.
 *
 * Used by URL import/migration logic where the resulting digits are interpreted
 * as compact note/event payload values.
 *
 * @param input Non-negative integer to convert.
 * @param base Target base for the digit array.
 * @returns Digit array in most-significant to least-significant order.
 */
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

/**
 * Reduces a fraction to lowest terms using the greatest common divisor.
 *
 * @param numerator Numerator value.
 * @param denominator Denominator value.
 * @returns Reduced fraction with the same numeric value.
 */
export const reduceFraction = (numerator: number, denominator: number): { numerator: number; denominator: number; } => {
    const divisor = greatestCommonDivisor(Math.abs(numerator), Math.abs(denominator));

    return {
        numerator: numerator / divisor,
        denominator: denominator / divisor,
    };
};

/**
 * Adds two fractions and returns the reduced result.
 *
 * @param left Left operand.
 * @param right Right operand.
 * @returns Reduced sum fraction.
 */
export const addFractions = (left: IFraction, right: IFraction): IFraction => {
    return reduceFraction(
        (left.numerator * right.denominator) + (right.numerator * left.denominator),
        left.denominator * right.denominator,
    );
};

/**
 * Subtracts one fraction from another and returns the reduced result.
 *
 * @param left Minuend.
 * @param right Subtrahend.
 * @returns Reduced difference fraction.
 */
export const subtractFractions = (left: IFraction, right: IFraction): IFraction => {
    return reduceFraction(
        (left.numerator * right.denominator) - (right.numerator * left.denominator),
        left.denominator * right.denominator,
    );
};

/**
 * Multiplies a fraction by an integer scalar and reduces the result.
 *
 * @param fraction Source fraction.
 * @param multiplier Integer factor.
 * @returns Reduced product fraction.
 */
export const multiplyFraction = (fraction: IFraction, multiplier: number): IFraction => {
    return reduceFraction(fraction.numerator * multiplier, fraction.denominator);
};

/**
 * Divides a fraction by an integer scalar and reduces the result.
 *
 * @param fraction Source fraction.
 * @param divisor Integer divisor.
 * @returns Reduced quotient fraction.
 */
export const divideFraction = (fraction: IFraction, divisor: number): IFraction => {
    return reduceFraction(fraction.numerator, fraction.denominator * divisor);
};

/**
 * Compares two fractions using cross multiplication.
 *
 * @param left Left operand.
 * @param right Right operand.
 * @returns Negative if left < right, zero if equal, positive if left > right.
 */
export const compareFractions = (left: IFraction, right: IFraction): number => {
    return (left.numerator * right.denominator) - (right.numerator * left.denominator);
};

/**
 * Checks if two fractions are identical by raw numerator/denominator equality.
 *
 * Note: this does not normalize fractions first. For example, 1/2 and 2/4 are
 * considered different by this function.
 *
 * @param left Left fraction.
 * @param right Right fraction.
 * @returns True when both numerator and denominator match exactly.
 */
export const areSameFractions = (left: IFraction, right: IFraction): boolean => {
    return left.numerator === right.numerator && left.denominator === right.denominator;
};

/**
 * Formats a fraction as a "numerator/denominator" string for use in data attributes.
 *
 * @param fraction The fraction to format.
 * @returns The "n/d" string representation.
 */
export const formatFraction = (fraction: IFraction): string => {
    return `${fraction.numerator}/${fraction.denominator}`;
};

/**
 * Parses a "numerator/denominator" string back into a fraction.
 *
 * @param value The string to parse.
 * @returns The parsed fraction, or undefined when the string is malformed.
 */
export const parseFraction = (value: string): IFraction | undefined => {
    const parts = value.split("/");
    if (parts.length !== 2) {
        return undefined;
    }

    const numerator = Number(parts[0]);
    const denominator = Number(parts[1]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return undefined;
    }

    return { numerator, denominator };
};

/**
 * Computes the greatest common divisor (GCD) via the Euclidean algorithm.
 *
 * @param left First integer.
 * @param right Second integer.
 * @returns Greatest common divisor. Returns 1 for (0, 0) to avoid zero division.
 */
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

/**
 * Computes the least common multiple (LCM) of two integers.
 *
 * @param a First integer.
 * @param b Second integer.
 * @returns Least common multiple, or 0 if either input is 0.
 */
export const leastCommonMultiple = (a: number, b: number): number => {
    if (a === 0 || b === 0) {
        return 0;
    }

    return Math.abs(a * b) / greatestCommonDivisor(a, b);
};

/**
 * Checks whether a positive integer is an exact power of two.
 *
 * @param value Integer to test.
 * @returns True when value is 1, 2, 4, 8, ...
 */
export const isPowerOfTwo = (value: number): boolean => {
    return value > 0 && (value & (value - 1)) === 0;
};
