/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect } from "vitest";

import {
    convertToBaseN, interpretAsBaseN, urlDecodeNumber, urlEncodeNumber
} from "../../src/Core1/serialisation/numeric_functions.js";

describe("URL encoding numbers", () => {
    it("decodes up to 100000 back to the same number", () => {
        const limit = 100000n;

        for (let integer = 0n; integer < limit; integer += 1n) {
            const encoded = urlEncodeNumber(integer);
            const decoded = urlDecodeNumber(encoded);
            expect(decoded, `${integer} -> ${encoded} -> ${decoded}`).toEqual(integer);
        }
    });
});

describe("Base N conversion", () => {
    it("Encodes/decodes random numbers", () => {
        for (let testCase = 0; testCase < 20; ++testCase) {
            const { digits: originalDigits, base } = generateRandomBaseNNumber();
            const numberAsBigInt = interpretAsBaseN(originalDigits, base);
            const convertedDigits = convertToBaseN(numberAsBigInt, base);

            // Add leading zeroes to make arrays the same length
            while (convertedDigits.length < originalDigits.length) {
                convertedDigits.unshift(0);
            }

            convertedDigits.forEach((convertedDigit, index) => {
                expect(BigInt(convertedDigit), `Base ${base} conversion failed on digit ${index}. Expected ` +
                    `${originalDigits[index]} but got ${convertedDigit}. BigInt number: ${numberAsBigInt}. ` +
                    `Original array:\n ${originalDigits}\n Converted array:\n ${convertedDigits}`
                ).toEqual(originalDigits[index]);
            });
        }
    });
});

describe("URL encoding base-N numbers", () => {
    it("Encodes/decodes random numbers", () => {
        for (let testCase = 0; testCase < 20; ++testCase) {
            const { digits: originalDigits, base } = generateRandomBaseNNumber();
            const numberAsBigInt = interpretAsBaseN(originalDigits, base);
            const numberAsUrl = urlEncodeNumber(numberAsBigInt);
            const convertedUrl = urlDecodeNumber(numberAsUrl);
            const convertedDigits = convertToBaseN(convertedUrl, base);

            // Add leading zeroes to make arrays the same length
            while (convertedDigits.length < originalDigits.length) {
                convertedDigits.unshift(0);
            }

            convertedDigits.forEach((convertedDigit, index) => {
                expect(BigInt(convertedDigit), `Base ${base} conversion failed on digit ${index}. Expected ` +
                    `${originalDigits[index]} but got ${convertedDigit}.\nBigInt number:\n${numberAsBigInt}.\n ` +
                    `Original array:\n ${originalDigits}\n Converted array:\n ${convertedDigits}`
                    + `URL: ${numberAsUrl}\nURL into number: ${convertedUrl}`
                ).toEqual(originalDigits[index]);
            });
        }
    });
});

const generateRandomBaseNNumber = () => {
    const base = randomInt(2n, 20n);
    const numColumns = randomInt(4n, 200n);
    const digits: bigint[] = new Array(numColumns);
    for (let column = 0; column < numColumns; column++) {
        digits[column] = randomInt(0n, base);
    }

    return { digits, base };
};

const randomInt = (min: bigint, max: bigint): bigint => {
    const range = max - min;
    const randomNumber = BigInt(Math.floor(Math.random() * Number(range)));

    return randomNumber + min;
};
