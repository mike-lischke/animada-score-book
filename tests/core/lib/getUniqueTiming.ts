/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Timing } from "../../../src/core/types/general.js";

let lastTiming: null | Timing = null;

// This is just going to sequentially return timings
// 1:1, 1:2, ..., 1:16, 2:1, 2:2, ...
export const getUniqueTiming = (): Timing => {
    const newTiming: Timing = getNewTiming(lastTiming);
    lastTiming = newTiming;

    return newTiming;
};

const getNewTiming = (lastTiming: Timing | null): Timing => {
    if (lastTiming === null) {
        return { bar: 1, step: 1 };
    }
    const { bar, step } = lastTiming;
    if (step === 16) {
        return { bar: bar + 1, step: 1 };
    } else {
        return { bar, step: step + 1 };
    }
};
