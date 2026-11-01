/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IMeterSnapshot, ITimeParamsBase } from "./types/general.js";

/** The number of steps in a whole note for a meter that subdivides its beat into sixteenths. */
const sixteenthGrid = 16;

/** The number of steps in a whole note for a meter that counts eighths. */
const eighthGrid = 8;

/** The grid of one meter, as the notation rules work with it: the bar's step count and its pulse boundaries. */
export interface INotationGrid {
    /** How many base-grid steps one bar holds. */
    stepsPerBar: number;

    /** Pulse boundaries as step counts, summing to {@link stepsPerBar}. */
    beatGroups: number[];
}

/**
 * The step grid of a meter: how many steps a bar holds and how those steps group into pulses. The grid is
 * derived from the meter, so no score stores it.
 *
 * A regular meter with a beat unit of a quarter or longer counts sixteenths (4/4 has 16 steps, 3/4 has 12),
 * every other meter counts its own beat unit at most: eighths (6/8 has 6, 7/8 has 7) and irregular meters
 * (5/4 has 10) included.
 */
export class StepGrid {
    /**
     * Resolves the number of steps a whole note holds in the given meter.
     *
     * @param timeSignature The meter in the form "beatsPerBar/beatUnit".
     *
     * @returns The number of steps in one whole note.
     */
    public static resolutionOf(timeSignature: string): number {
        const [beats, beatUnit] = StepGrid.partsOf(timeSignature);

        return StepGrid.resolutionOfParts(beats, beatUnit);
    }

    /**
     * Resolves how many steps one bar of the given meter holds.
     *
     * @param timeSignature The meter in the form "beatsPerBar/beatUnit".
     *
     * @returns The number of steps in one bar.
     */
    public static stepsPerBarOf(timeSignature: string): number {
        const [beats, beatUnit] = StepGrid.partsOf(timeSignature);

        return StepGrid.stepsPerBarOfParts(beats, beatUnit);
    }

    /**
     * Resolves how many steps one bar holds, as the meter of a measure states it.
     *
     * @param meter The meter of a measure.
     *
     * @returns The number of steps in one bar.
     */
    public static stepsPerBarOfMeter(meter: Readonly<IMeterSnapshot>): number {
        return StepGrid.stepsPerBarOfParts(meter.beats, meter.beatUnits);
    }

    /**
     * Builds the pulse groups of the given meter.
     *
     * @param timeSignature The meter in the form "beatsPerBar/beatUnit".
     *
     * @returns The pulse sizes in steps, summing to {@link stepsPerBarOf}.
     */
    public static beatGroupsOf(timeSignature: string): number[] {
        const [beats, beatUnit] = StepGrid.partsOf(timeSignature);

        return StepGrid.beatGroupsFor(beats, beatUnit, StepGrid.stepsPerBarOfParts(beats, beatUnit));
    }

    /**
     * Builds the pulse groups of a measure's meter.
     *
     * @param meter The meter of a measure.
     *
     * @returns The pulse sizes in steps, summing to {@link stepsPerBarOfMeter}.
     */
    public static beatGroupsOfMeter(meter: Readonly<IMeterSnapshot>): number[] {
        return StepGrid.beatGroupsFor(meter.beats, meter.beatUnits, StepGrid.stepsPerBarOfMeter(meter));
    }

    /**
     * Builds the grid a measure is written on.
     *
     * @param meter The meter of a measure.
     *
     * @returns The bar's step count and its pulse boundaries.
     */
    public static gridOfMeter(meter: Readonly<IMeterSnapshot>): INotationGrid {
        return {
            stepsPerBar: StepGrid.stepsPerBarOfMeter(meter),
            beatGroups: StepGrid.beatGroupsOfMeter(meter),
        };
    }

    /**
     * Builds pulse group sizes from meter components and the bar's step count.
     *
     * Each entry is the number of steps belonging to one pulse. The array sums to `stepsPerBar`: 4/4 with
     * 16 steps produces `[4, 4, 4, 4]`, 7/8 with 7 steps `[1, 1, 1, 1, 1, 1, 1]` and 6/8 with 6 steps `[3, 3]`.
     * Complex and irregular numerators (5, 7) alternate ceil/floor to distribute the steps as evenly as
     * possible while keeping the accent pattern (strong-weak).
     *
     * @param numerator Beats per bar (e.g. 4 from "4/4").
     * @param denominator Beat unit (e.g. 4 from "4/4").
     * @param stepsPerBar Total grid steps in the bar.
     *
     * @returns Beat group sizes summing to `stepsPerBar`.
     */
    public static beatGroupsFor(numerator: number, denominator: number, stepsPerBar: number): number[] {
        if (numerator <= 0 || denominator <= 0 || stepsPerBar <= 0 || denominator % 2 !== 0) {
            return [stepsPerBar];
        }

        switch (denominator) {
            case 4: {
                switch (numerator) {
                    case 2: case 4: case 8:
                        return Array.from({ length: numerator }, () => {
                            return stepsPerBar / 4;
                        });

                    case 3: case 6:
                        return Array.from({ length: numerator }, () => {
                            return stepsPerBar / 3;
                        });

                    case 5: case 7: {
                        const spb = stepsPerBar / numerator;

                        return Array.from({ length: numerator }, (_, beat) => {
                            return beat % 2 === 0 ? Math.ceil(spb) : Math.floor(spb);
                        });
                    }

                    default:
                        return [stepsPerBar];
                }
            }

            case 8: {
                switch (numerator) {
                    case 6: return Array.from({ length: 2 }, () => {
                        return stepsPerBar / 2;
                    });

                    case 7: {
                        const spb = stepsPerBar / numerator;

                        return Array.from({ length: numerator }, (_, beat) => {
                            return beat % 2 === 0 ? Math.ceil(spb) : Math.floor(spb);
                        });
                    }

                    case 9: return Array.from({ length: 3 }, () => {
                        return stepsPerBar / 3;
                    });

                    case 12: return Array.from({ length: 4 }, () => {
                        return stepsPerBar / 4;
                    });

                    default:
                        return [stepsPerBar];
                }
            }

            default:
                return [stepsPerBar];
        }
    }

    /**
     * Resolves how many steps one pulse holds.
     *
     * @param timeParams The time parameters stating the meter and the pulse.
     *
     * @returns The number of steps in one pulse.
     */
    public static stepsPerPulseOf(timeParams: Readonly<ITimeParamsBase>): number {
        const [pulseFrequency, pulseResolution] = timeParams.pulse.split("/").map((part) => {
            return Number(part);
        });

        return StepGrid.resolutionOf(timeParams.timeSignature) * pulseFrequency / pulseResolution;
    }

    /**
     * Determines the parity class for alternating beat shading in the grid.
     *
     * @param bar The 1-based bar number.
     * @param step The 1-based step within the bar.
     * @param timeSignature The meter in the form "beatsPerBar/beatUnit".
     *
     * @returns "even-beat" or "odd-beat".
     */
    public static parityClassOf(bar: number, step: number, timeSignature: string): string {
        const [beatsPerBar] = StepGrid.partsOf(timeSignature);
        const resolution = StepGrid.resolutionOf(timeSignature);
        const stepsPerBar = StepGrid.stepsPerBarOf(timeSignature);

        if (timeSignature === "4/4" && resolution === sixteenthGrid) {
            const beat = Math.floor((step - 1) / 4) + 1;

            return beat % 2 === 0 ? "even-beat" : "odd-beat";
        }

        if (timeSignature === "6/8" && resolution === eighthGrid) {
            const beat = Math.floor((step - 1) / 3) + 1;

            return beat % 2 === 0 ? "even-beat" : "odd-beat";
        }

        if (timeSignature === "5/4" && resolution === eighthGrid) {
            const beat = Math.floor((step - 1) / 2) + 1;
            let beatIsEven = beat % 2 === 0;
            if (bar % 2 === 0) {
                beatIsEven = !beatIsEven;
            }

            return beatIsEven ? "even-beat" : "odd-beat";
        }

        if (timeSignature === "7/8" && resolution === eighthGrid) {
            return (step === 1 || step === 3 || step === 5) ? "odd-beat" : "even-beat";
        }

        const stepsPerBeat = stepsPerBar / beatsPerBar;
        if (stepsPerBeat > 1) {
            const beat = Math.floor((step - 1) / stepsPerBeat) + 1;
            let beatIsEven = beat % 2 === 0;
            if (beatsPerBar % 2 === 1 && bar % 2 === 0) {
                beatIsEven = !beatIsEven;
            }

            return beatIsEven ? "even-beat" : "odd-beat";
        }

        return "even-beat";
    }

    private static resolutionOfParts(beats: number, beatUnit: number): number {
        const regular = beats % 2 === 0 || beats % 3 === 0;

        return regular && beatUnit <= 4 ? sixteenthGrid : Math.max(eighthGrid, beatUnit);
    }

    private static stepsPerBarOfParts(beats: number, beatUnit: number): number {
        return StepGrid.resolutionOfParts(beats, beatUnit) * beats / beatUnit;
    }

    private static partsOf(timeSignature: string): [number, number] {
        const [beats, beatUnit] = timeSignature.split("/").map((part) => {
            return Number(part);
        });

        return [beats, beatUnit];
    }
}
