/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { RealTime } from "../core/ScoreBookDataModel.js";
import type { TimeCoordinator } from "./TimeCoordinator.js";
import type { Event, IEventSource, IInterval, IMetronomeEvent } from "./types.js";

export class Metronome implements IEventSource {
    private disposed = false;

    public constructor(private readonly timeCoordinator: TimeCoordinator) {
    }

    public onStop = (): void => { /**/ };

    public dispose() {
        this.disposed = true;
    }

    public getEvents(interval: IInterval): Event[] {
        const events: IMetronomeEvent[] = [];
        if (this.disposed || interval.end <= interval.start) {
            return events;
        }

        const { secondsPerBar, stepsPerBar, stepsPerPulse, beatsPerBar, } = this.timeCoordinator.metrics;
        const pulsesPerBar = stepsPerBar / stepsPerPulse;
        const secondsPerPulse = secondsPerBar / pulsesPerBar;
        const { start, end } = interval;
        const tolerance = Math.max(secondsPerPulse * 1e-9, Number.EPSILON);

        // Keep [start, end) semantics stable under floating-point rounding.
        const firstPulseIndex = Math.ceil((start - tolerance) / secondsPerPulse);
        const lastPulseIndex = Math.floor((end - tolerance) / secondsPerPulse);

        for (let pulseIndex = firstPulseIndex; pulseIndex <= lastPulseIndex; pulseIndex++) {
            const realTime: RealTime = pulseIndex * secondsPerPulse;
            const beatInBar = pulseIndex % beatsPerBar;
            const isAccent = beatInBar === 0;

            events.push({
                kind: "metronome",
                realTime,
                beatInBar,
                isAccent,
            });
        }

        return events;
    }
}
