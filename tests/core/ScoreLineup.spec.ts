/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { ScoreLineupStatus } from "../../src/core/DatabaseTypes.js";
import { ScoreLineup } from "../../src/core/ScoreLineup.js";

/**
 * @param version The schema version of the packed arrangement.
 * @param tracks The packed tracks, each with its id, instrument type id and no measures.
 *
 * @returns Packed arrangement content as a score stores it.
 */
const packedContent = (version: number, tracks: Array<[number, string]>): string => {
    const packedTracks = tracks.map(([id, instrumentTypeId]) => {
        return [id, instrumentTypeId, []];
    });

    return JSON.stringify({ v: version, p: ["4/4", 110, 1, "q"], k: packedTracks });
};

describe("ScoreLineup", () => {
    it("reads the tracks of a current arrangement in score order", () => {
        const lineup = ScoreLineup.read(packedContent(7, [[1, "5"], [2, "7"], [3, "5"]]));

        expect(lineup).toEqual({
            status: ScoreLineupStatus.Ok,
            tracks: [
                { trackId: 1, instrumentTypeId: "5" },
                { trackId: 2, instrumentTypeId: "7" },
                { trackId: 3, instrumentTypeId: "5" },
            ],
        });
    });

    it("keeps two tracks of the same instrument apart", () => {
        const lineup = ScoreLineup.read(packedContent(7, [[4, "5"], [9, "5"]]));

        expect(lineup.tracks.map((track) => {
            return track.trackId;
        })).toEqual([4, 9]);
    });

    it("reads an older arrangement this build upgrades", () => {
        const lineup = ScoreLineup.read(packedContent(5, [[1, "2"]]));

        expect(lineup.status).toBe(ScoreLineupStatus.Ok);
        expect(lineup.tracks).toEqual([{ trackId: 1, instrumentTypeId: "2" }]);
    });

    it("reports an arrangement of a newer schema as unsupported", () => {
        const lineup = ScoreLineup.read(packedContent(99, [[1, "5"]]));

        expect(lineup).toEqual({ status: ScoreLineupStatus.Unsupported, tracks: [] });
    });

    it("reports content that is not a packed arrangement as unreadable", () => {
        const lineup = ScoreLineup.read("?v=1&t=Old%20Share%20Link");

        expect(lineup).toEqual({ status: ScoreLineupStatus.Unreadable, tracks: [] });
    });

    it("reports damaged JSON as unreadable", () => {
        const lineup = ScoreLineup.read("{\"v\":7,\"p\":[\"4");

        expect(lineup).toEqual({ status: ScoreLineupStatus.Unreadable, tracks: [] });
    });

    it("reports a track without an instrument as unreadable instead of a partial lineup", () => {
        const content = JSON.stringify({ v: 7, p: ["4/4", 110, 1, "q"], k: [[1, "5", []], [2, "", []]] });

        expect(ScoreLineup.read(content).status).toBe(ScoreLineupStatus.Unreadable);
    });

    it("reads an arrangement without tracks as an empty lineup", () => {
        const lineup = ScoreLineup.read(packedContent(7, []));

        expect(lineup).toEqual({ status: ScoreLineupStatus.Ok, tracks: [] });
    });
});
