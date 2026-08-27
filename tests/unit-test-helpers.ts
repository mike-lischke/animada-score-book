/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Arrangement } from "../src/core/Arrangement.js";
import { SbDmEntityType, type ISbDmInstrument } from "../src/core/ScoreBookDataModel.js";
import type { ITrackSnapshot } from "../src/core/types/general.js";
import { TimeCoordinator } from "../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../src/player/TrackPlayer.js";

/**
 * Creates a minimal instrument for tests.
 *
 * @param typeId The instrument type id.
 * @param id The numeric instrument id.
 * @param displayOrder The display order; defaults to the id.
 *
 * @returns A fully constructed instrument.
 */
export const createInstrument = (typeId: string, id: number, displayOrder = id): ISbDmInstrument => {
    return {
        type: SbDmEntityType.Instrument,
        id,
        typeId,
        displayOrder,
        displayName: `Instrument ${typeId}`,
        image: { type: SbDmEntityType.InstrumentImage, id: id + 1000, filePath: "" },
        color: "",
        range: [0, 0],
        state: {
            initialized: true,
            isLeaf: true,
            expanded: false,
            expandedOnce: false,
        },
        noteStyles: {},
    };
};

/**
 * Materializes measure events for every track by running the tracks through a `TrackPlayer`.
 *
 * @param arrangement The arrangement whose tracks should be hydrated.
 */
export const hydrateMeasureEvents = (arrangement: Arrangement): void => {
    const timeCoordinator = new TimeCoordinator(arrangement.timeParams, {
        state: "stopped",
        get currentTime() {
            return -1;
        },
    });

    const players = arrangement.tracks.map((track) => {
        return new TrackPlayer(track, timeCoordinator);
    });

    players.forEach((player) => {
        player.dispose();
    });
};

/**
 * Builds a minimal track snapshot with a single empty measure.
 *
 * @param id The track id.
 * @param instrumentId The instrument type id.
 * @param stepsPerBar Steps per bar for the measure; defaults to 16.
 *
 * @returns A minimal track snapshot.
 */
export const emptyMeasureTrack = (id: number, instrumentId: string, stepsPerBar = 16): ITrackSnapshot => {
    return {
        id,
        instrumentId,
        measures: [{
            number: 1,
            meter: {
                beats: stepsPerBar,
                beatUnits: 4,
                stepResolution: stepsPerBar,
                beatGroups: Array.from({ length: stepsPerBar }, () => {
                    return 1;
                }),
            },
            events: [{
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 1, denominator: 1 },
            }],
            subdivisions: [],
        }],
    };
};
