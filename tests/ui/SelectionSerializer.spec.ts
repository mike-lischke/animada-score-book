/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import {
    SelectionGranularity, SelectionSerializer, type ISelectionEntry, type ISerialisedSelectionEntry,
} from "../../src/ui/SelectionSerializer.js";
import { createInstrument } from "../unit-test-helpers.js";

describe("selection serialisation", () => {
    it("stores coordinates only and resolves the model objects again", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument, instrument]);
        const [first] = arrangement.tracks;
        first.measures[0].events[0] = {
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 4 },
            noteStyleId: "1",
        };
        const event = first.measures[0].events[0];

        const entries: ISelectionEntry[] = [
            { granularity: SelectionGranularity.Track, bar: 0, trackId: first.id },
            {
                granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: first.id,
                target: { granularity: SelectionGranularity.TrackPiece, track: first, measure: first.measures[0] },
            },
            {
                granularity: SelectionGranularity.Note, bar: 1, trackId: first.id, startStep: 0, endStep: 0,
                target: { granularity: SelectionGranularity.Note, measure: first.measures[0], event },
            },
        ];

        const stored = SelectionSerializer.serialise(entries);
        expect(JSON.stringify(stored)).not.toContain("target");
        expect(stored.map((entry) => {
            return entry.trackId;
        })).toEqual([first.id, first.id, first.id]);

        const restored = SelectionSerializer.deserialise(arrangement, JSON.parse(JSON.stringify(stored)) as
            ISerialisedSelectionEntry[]);

        expect(restored).toHaveLength(3);
        expect(restored[0].target).toEqual({ granularity: SelectionGranularity.Track, track: first });
        expect(restored[1].target).toEqual({
            granularity: SelectionGranularity.TrackPiece, track: first, measure: first.measures[0],
        });
        expect(restored[2].target).toEqual({
            granularity: SelectionGranularity.Note, measure: first.measures[0], event,
        });
    });

    it("leaves entries without a target when the arrangement no longer contains them", () => {
        const instrument = createInstrument("0", 0, 0);
        const arrangement = Arrangement.emptyArrangementWithInstruments([instrument]);

        const restored = SelectionSerializer.deserialise(arrangement, [{
            granularity: SelectionGranularity.Note,
            bar: 4,
            trackId: arrangement.tracks[0].id,
            startStep: 0,
        }]);

        expect(restored).toHaveLength(1);
        expect(restored[0].target).toBeUndefined();
    });
});
