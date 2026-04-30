/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import type { ITimeParams, Subscription } from "../../src/core/types/general.js";
import { Metronome } from "../../src/player/Metronome.js";
import { TimeCoordinator } from "../../src/player/TimeCoordinator.js";

const makeSubscribable = () => {
    const subs: Subscription[] = [];

    return {
        subscribe: (cb: Subscription) => {
            subs.push(cb);

            return () => {
                const i = subs.indexOf(cb);
                if (i !== -1) {
                    subs.splice(i, 1);
                }
            };
        },
        unsubscribe: (cb: Subscription) => {
            const i = subs.indexOf(cb);
            if (i !== -1) {
                subs.splice(i, 1);
            }
        }
    };
};

const makeTimeCoordinator = (): TimeCoordinator => {
    const timeParams: ITimeParams = {
        timeSignature: "4/4",
        tempo: 60,
        length: 2,
        pulse: "2/8",
        stepResolution: 16,
        timings: [],
        isValid: () => {
            return true;
        },
        ...makeSubscribable(),
    };

    const realtimeProvider = {
        state: "stopped" as const,
        currentTime: -1,
        ...makeSubscribable(),
    };

    return new TimeCoordinator(timeParams, realtimeProvider);
};

describe("Metronome", () => {
    it("keeps interval end exclusive on bar boundary", () => {
        const tc = makeTimeCoordinator();
        const metronome = new Metronome(tc);

        // At 60 bpm and 4/4 with pulse 2/8, pulses are at 0,1,2,3,4,... seconds.
        // End is just above 4.0 due to floating-point drift, but the 4.0 pulse still belongs to the next interval.
        const events = metronome.getEvents({ start: 0, end: 4 + 1e-12 });
        const pulseTimes = events.map((e) => {
            return Object.is(e.realTime, -0) ? 0 : e.realTime;
        });

        expect(pulseTimes).toEqual([0, 1, 2, 3]);
    });

    it("keeps interval start inclusive near bar boundary", () => {
        const tc = makeTimeCoordinator();
        const metronome = new Metronome(tc);

        // Start is just above 4.0 due to floating-point drift and should still include
        // the first pulse of this interval to avoid a dropped beat at low tempos.
        const events = metronome.getEvents({ start: 4 + 1e-12, end: 5 });

        expect(events.map((e) => {
            return e.realTime;
        })).toEqual([4]);
    });

    it("schedules a boundary pulse exactly once across 0.25s look-ahead chunks", () => {
        const tc = makeTimeCoordinator();
        const metronome = new Metronome(tc);

        // Simulate ArrangementPlayer look-ahead chunks around a pulse at 1.0s.
        const firstChunkEvents = metronome.getEvents({ start: 0.75, end: 1.0 });
        const secondChunkEvents = metronome.getEvents({ start: 1.0, end: 1.25 });

        const firstTimes = firstChunkEvents.map((e) => {
            return Object.is(e.realTime, -0) ? 0 : e.realTime;
        });
        const secondTimes = secondChunkEvents.map((e) => {
            return Object.is(e.realTime, -0) ? 0 : e.realTime;
        });

        expect(firstTimes).toEqual([]);
        expect(secondTimes).toEqual([1]);

        const merged = [...firstTimes, ...secondTimes];
        expect(merged.filter((t) => {
            return t === 1;
        })).toHaveLength(1);
    });
});
