/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { conversionBase, urlCharacterToNumber, urlNumberToCharacter } from "./constants.js";

// No negative numbers
export const urlEncodeNumber = (input: bigint): string => {
    let output = "";

    do {
        const quotient = input / conversionBase;
        const remainder = input % conversionBase;

        output = urlNumberToCharacter[Number(remainder)] + output;
        input = quotient;
    } while (input > 0n);

    return output;
};

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

export const interpretAsBaseN = (inputDigits: bigint[], base: bigint): bigint => {
    let multiplier = 1n;
    let total = 0n;

    for (let column = inputDigits.length - 1; column >= 0; column--) {
        const digit = inputDigits[column];
        total = total + (digit * multiplier);
        multiplier = multiplier * base;
    }

    return total;
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
