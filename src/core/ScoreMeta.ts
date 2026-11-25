/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IScoreMeta } from "./DatabaseTypes.js";
import { isPackedArrangement } from "./serialisation/snapshot-packing.js";
import { isNaturalNumber, isReadableSnapshotVersion } from "./serialisation/snapshots.js";

/**
 * Derives the metadata a score card shows from a score's content: tempo, meter, bar count and the length of the
 * written bars. It reads only the content, so a card never needs the whole arrangement, and it reports nothing rather
 * than a guess when the content cannot be read.
 */
export class ScoreMeta {
    /**
     * @param content The stored score content.
     *
     * @returns The metadata the content states, with the fields it cannot provide left out.
     */
    public static read(content: string): IScoreMeta {
        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch {
            return {};
        }

        if (typeof parsed !== "object" || parsed === null) {
            return {};
        }

        const { v: version } = parsed as { v?: unknown; };
        if (isNaturalNumber(version) && !isReadableSnapshotVersion(version)) {
            return {};
        }

        if (!isPackedArrangement(parsed)) {
            return {};
        }

        const [timeSignature, tempo, barCount, pulse] = parsed.p;
        if (typeof timeSignature !== "string" || typeof pulse !== "string"
            || typeof tempo !== "number" || typeof barCount !== "number") {
            return {};
        }

        const meta: IScoreMeta = { timeSignature };

        if (Number.isFinite(tempo) && tempo > 0) {
            meta.bpm = Math.round(tempo);
        }

        if (Number.isInteger(barCount) && barCount > 0) {
            meta.barCount = barCount;
        }

        const durationSeconds = ScoreMeta.durationOf(timeSignature, pulse, tempo, barCount);
        if (durationSeconds !== undefined) {
            meta.durationSeconds = durationSeconds;
        }

        return meta;
    }

    /**
     * @param timeSignature The meter, as `beatsPerBar/beatUnit`.
     * @param pulse The rhythmic pulse, as `count/unit`; the tempo counts pulses.
     * @param tempo The tempo in pulses per minute.
     * @param barCount How many bars the score is written with.
     *
     * @returns The length of the written bars in seconds, or undefined when a value does not allow the computation.
     */
    private static durationOf(timeSignature: string, pulse: string, tempo: number, barCount: number): number |
        undefined {
        const [beatsPerBar, beatUnit] = ScoreMeta.numbersOf(timeSignature);
        const [pulseCount, pulseUnit] = ScoreMeta.numbersOf(pulse);

        if (beatsPerBar <= 0 || beatUnit <= 0 || pulseCount <= 0 || pulseUnit <= 0 || tempo <= 0 || barCount <= 0) {
            return undefined;
        }

        // The same maths the player uses: a bar holds this many pulses, and one pulse lasts 60/tempo seconds.
        const pulsesPerBar = (beatsPerBar * pulseUnit) / (beatUnit * pulseCount);

        return Math.round((60 / tempo) * pulsesPerBar * barCount);
    }

    /**
     * @param value A pair written as `left/right`, for example `4/4`.
     *
     * @returns Both numbers, or zeroes when the value is not such a pair.
     */
    private static numbersOf(value: string): [number, number] {
        const parts = value.split("/");
        if (parts.length !== 2) {
            return [0, 0];
        }

        const left = Number(parts[0]);
        const right = Number(parts[1]);

        return [Number.isFinite(left) ? left : 0, Number.isFinite(right) ? right : 0];
    }
}
