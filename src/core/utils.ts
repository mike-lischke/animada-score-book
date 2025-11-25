/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { Timing } from "./types/general.js";

// Comparing timings is easy, but long winded and mistake-prone
export const isSameTiming = (timing1: Timing, timing2: Timing): boolean => {
    return (timing1.bar === timing2.bar) && (timing1.step === timing2.step);
};

// Returns false for null, undefined
export const exists = <T>(value: T | undefined | null): value is T => {
    return value === (value ?? !value);
};

export const rangeArray = <T>(itemCount: number, mapIndexToItem: (index: number) => T): T[] => {
    return Array.from(Array(itemCount)).map((_, index) => {
        return mapIndexToItem(index);
    });
};

let id = 0;

export const getNewId = (): number => {
    id++;

    return id;
};

export const calculateStepsPerBar = (timeSignature: string, stepResolution: number): number => {
    const [beatsPerBar, beatNoteValue] = timeSignature.split("/").map((value: string) => {
        return Number(value);
    });
    const stepsPerBeat = stepResolution / beatNoteValue;

    return stepsPerBeat * beatsPerBar;
};
