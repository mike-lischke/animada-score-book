/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { greatestCommonDivisor } from "./serialisation/numeric-functions.js";
import type { IMeterSnapshot } from "./types/general.js";
import { primeFactors } from "./utils.js";

/**
 * Resolves the natural subdivision basis of a meter. Binary meters use {2}, ternary meters use
 * {3}, and irregular meters have an empty basis.
 *
 * @param meter The meter to inspect.
 *
 * @returns The set of prime factors allowed for natural subdivisions.
 */
export const meterBasis = (meter: IMeterSnapshot): Set<number> => {
    const { beats, beatUnits } = meter;

    if (![2, 3, 4, 6, 9, 12].includes(beats)) {
        return new Set<number>();
    }

    if (beatUnits >= 8 && beats >= 6 && beats % 3 === 0) {
        return new Set([3]);
    }

    return new Set([2]);
};

/**
 * Computes whether an actual:normal ratio is a tuplet. A subdivision is a tuplet when either
 * side of the reduced ratio has a prime factor that is not part of the meter's natural basis.
 *
 * @param actual The number of notes in the stream.
 * @param normal The number of original steps the subdivision replaces.
 * @param meter The meter defining the natural subdivision basis.
 *
 * @returns True when the ratio is a tuplet.
 */
export const computeIsTuplet = (actual: number, normal: number, meter: IMeterSnapshot): boolean => {
    const basis = meterBasis(meter);
    const divisor = greatestCommonDivisor(actual, normal);
    const reducedActual = divisor > 0 ? actual / divisor : actual;
    const reducedNormal = divisor > 0 ? normal / divisor : normal;

    return [...primeFactors(reducedActual), ...primeFactors(reducedNormal)].some((factor) => {
        return !basis.has(factor);
    });
};
