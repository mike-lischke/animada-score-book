/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ITiming } from "./types/general.js";

// Comparing timings is easy, but long winded and mistake-prone
export const isSameTiming = (timing1: ITiming, timing2: ITiming): boolean => {
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

/**
 * Converts an optional value to a string expression for use in CSS.
 *
 * @param value The value to convert. If it is a string, it's taken over as is.
 * @param numericUnit Only used for numeric values, with which it is combined to form a simple value,
 *                    for example "10px" or "1em".
 *
 * @returns A CSS value.
 */
export const convertPropValue = (value?: number | string, numericUnit = "px"): string | undefined => {
    if (value == null) {
        return undefined;
    }

    if (typeof value === "number") {
        return `${value}${numericUnit}`;
    }

    return value;
};

/**
 * @returns the path to use for the REST API script as string. It differs between local
 *          development and production.
 */
export const getApiBase = (): string => {
    const origin = window.location.origin;

    // For local development use the test server.
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return "http://samba.soft-gems.net";
    }

    // In production: use the same server as the app is served from.
    return "";
};
