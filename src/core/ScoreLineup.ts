/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ScoreLineupStatus, type IScoreLineup, type IScoreLineupTrack } from "./DatabaseTypes.js";
import { isPackedArrangement } from "./serialisation/snapshot-packing.js";
import { isNaturalNumber, isReadableSnapshotVersion } from "./serialisation/snapshots.js";

/**
 * Derives the lineup a score card shows from a score's content: its tracks in order, each with its instrument. It
 * reads only the content, so a card never needs the whole arrangement, and it leaves instrument tags alone.
 */
export class ScoreLineup {
    /**
     * @param content The stored score content.
     *
     * @returns The lineup, or the reason it holds none.
     */
    public static read(content: string): IScoreLineup {
        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch {
            return ScoreLineup.unavailable(ScoreLineupStatus.Unreadable);
        }

        if (typeof parsed !== "object" || parsed === null) {
            return ScoreLineup.unavailable(ScoreLineupStatus.Unreadable);
        }

        const { v: version } = parsed as { v?: unknown; };
        if (isNaturalNumber(version) && !isReadableSnapshotVersion(version)) {
            return ScoreLineup.unavailable(ScoreLineupStatus.Unsupported);
        }

        if (!isPackedArrangement(parsed)) {
            return ScoreLineup.unavailable(ScoreLineupStatus.Unreadable);
        }

        const tracks: IScoreLineupTrack[] = [];
        for (const track of parsed.k) {
            const entry = ScoreLineup.readTrack(track);

            if (entry === undefined) {
                // A track this build cannot read makes the whole lineup doubtful, so no partial one is reported.
                return ScoreLineup.unavailable(ScoreLineupStatus.Unreadable);
            }

            tracks.push(entry);
        }

        return { status: ScoreLineupStatus.Ok, tracks };
    }

    /**
     * @param track One packed track, which holds its id and its instrument type id first.
     *
     * @returns The track entry, or undefined when the packed track does not hold both.
     */
    private static readTrack(track: unknown): IScoreLineupTrack | undefined {
        if (!Array.isArray(track)) {
            return undefined;
        }

        const [trackId, instrumentTypeId] = track as unknown[];
        if (typeof trackId !== "number" || !Number.isInteger(trackId)) {
            return undefined;
        }

        if (typeof instrumentTypeId !== "string" || instrumentTypeId.length === 0) {
            return undefined;
        }

        return { trackId, instrumentTypeId };
    }

    private static unavailable(status: ScoreLineupStatus): IScoreLineup {
        return { status, tracks: [] };
    }
}
